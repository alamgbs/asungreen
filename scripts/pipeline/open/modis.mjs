// ORNL DAAC MODIS Web Service (sin clave): subsets puntuales de MOD13Q1 (NDVI) y MOD11A2 (LST).
// Verificado el 2026-11-08: máx. 10 fechas por pedido; /dates lista las fechas disponibles
// (MOD13Q1: 614 compuestos 2000-02-18…; MOD11A2: 1224 compuestos). Fechas iguales para todos los puntos del tile.
import { getJson, sleep } from '../lib/http.mjs';
import { redondear } from '../lib/series-io.mjs';
import { mesIdx } from '../lib/series-io.mjs';

const BASE = 'https://modis.ornl.gov/rst/api/v1';

export const PRODUCTOS = {
  'ndvi-modis': { producto: 'MOD13Q1', banda: '250m_16_days_NDVI', km: 1, valido: (x) => x >= -2000 && x <= 10000, conv: (x) => x * 0.0001, dec: 3 },
  // LST_Day_1km: escala 0,02 K; 0 = sin dato (nube). Se pasa a °C.
  'lst-modis':  { producto: 'MOD11A2', banda: 'LST_Day_1km',       km: 1, valido: (x) => x > 0,                 conv: (x) => x * 0.02 - 273.15, dec: 2 },
};

const cacheFechas = new Map();
export async function fechasProducto(producto, lat, lon) {
  if (cacheFechas.has(producto)) return cacheFechas.get(producto);
  const { res, json } = await getJson(`${BASE}/${producto}/dates?latitude=${lat}&longitude=${lon}`);
  if (!res.ok || !json?.dates) throw new Error(`MODIS dates ${producto}: HTTP ${res.status}`);
  cacheFechas.set(producto, json.dates);
  return json.dates;
}

/** Descarga una zona completa (lista de fechas ≥ desdeISO) con concurrencia limitada. */
export async function descargarZona(def, lat, lon, desdeISO, { concurrencia = 4 } = {}) {
  const fechas = (await fechasProducto(def.producto, lat, lon)).filter((d) => d.calendar_date >= desdeISO);
  const lotes = [];
  for (let i = 0; i < fechas.length; i += 10) lotes.push(fechas.slice(i, i + 10));
  const porMes = new Map(); // idx → valores de compuesto
  let k = 0;
  async function worker() {
    while (k < lotes.length) {
      const lote = lotes[k++];
      const url = `${BASE}/${def.producto}/subset?latitude=${lat}&longitude=${lon}&band=${def.banda}` +
        `&startDate=${lote[0].modis_date}&endDate=${lote.at(-1).modis_date}&kmAboveBelow=${def.km}&kmLeftRight=${def.km}`;
      const { res, json } = await getJson(url, { reintentos: 5 });
      if (!res.ok || !json?.subset) {
        if (res.status === 429) { await sleep(5000); k--; continue; } // reintenta el lote
        throw new Error(`MODIS ${def.producto} ${lote[0].modis_date}: HTTP ${res.status} ${String(json).slice(0, 100)}`);
      }
      for (const s of json.subset) {
        const ok = s.data.filter(def.valido);
        if (!ok.length) continue; // compuesto sin píxeles válidos (nube): no cuenta
        const v = def.conv(ok.reduce((p, c) => p + c, 0) / ok.length);
        const i = mesIdx(+s.calendar_date.slice(0, 4), +s.calendar_date.slice(5, 7));
        (porMes.get(i) ?? porMes.set(i, []).get(i)).push(v);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrencia }, worker));
  // Meses cubiertos por alguna fecha del producto (aunque todos fueran nubes → null explícito, n=0).
  const out = new Map();
  for (const d of fechas) {
    const i = mesIdx(+d.calendar_date.slice(0, 4), +d.calendar_date.slice(5, 7));
    if (!out.has(i)) out.set(i, { v: null, n: 0 });
  }
  for (const [i, vals] of porMes) out.set(i, { v: redondear(vals.reduce((p, c) => p + c, 0) / vals.length, def.dec), n: vals.length });
  return out;
}
