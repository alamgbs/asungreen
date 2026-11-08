// Open-Meteo Historical Weather API (ERA5, malla 0,25°) → series mensuales.
// Límites gratuitos (verificados con cabeceras reales el 2026-11-08): 600 "llamadas"/min,
// 5000/h y 10000/día; el costo se pondera: 3 variables × 12.784 días (1991–2025) ≈ 274 llamadas.
// Un backfill 1991→hoy cuesta ~274 por celda: ~36 celdas/día. Por eso es reanudable.
import { getJson, sleep } from '../lib/http.mjs';
import { diasEnMes, mesIdx, redondear } from '../lib/series-io.mjs';

export class CuotaError extends Error {
  constructor(tipo, msg) { super(msg); this.tipo = tipo; } // 'minuto' | 'hora' | 'dia'
}

const URL_BASE = 'https://archive-api.open-meteo.com/v1/archive';
let restante = 600, reinicioEn = 0; // estado de la ventana de 60 s (cabeceras X-RateLimit-*)

/** Ajusta lat/lon a la malla ERA5 de 0,25° (verificado: las respuestas devuelven múltiplos de 0,25). */
export const celda = (lat, lon) => ({ lat: Math.round(lat * 4) / 4, lon: Math.round(lon * 4) / 4 });
export const claveCelda = (c) => `${c.lat.toFixed(2)},${c.lon.toFixed(2)}`;

export async function descargarDiario(c, desde, hasta, { maxEsperaHoraMin = 0 } = {}) {
  const dias = (Date.parse(hasta) - Date.parse(desde)) / 864e5 + 1;
  const costo = Math.max(1, (3 * dias) / 140);
  const url = `${URL_BASE}?latitude=${c.lat}&longitude=${c.lon}&start_date=${desde}&end_date=${hasta}` +
    `&daily=temperature_2m_mean,temperature_2m_max,precipitation_sum&models=era5&timezone=auto`;
  for (let intento = 0; intento < 6; intento++) {
    if (Date.now() < reinicioEn && restante < costo) await sleep(reinicioEn - Date.now() + 1000);
    const { res, json } = await getJson(url);
    const rem = Number(res.headers.get('x-ratelimit-remaining'));
    if (!Number.isNaN(rem)) { restante = rem; reinicioEn = Number(res.headers.get('x-ratelimit-reset') ?? 0) * 1000; }
    if (res.ok && json?.daily) return json.daily;
    const motivo = String(json?.reason ?? `HTTP ${res.status}`);
    if (res.status === 429 || /limit/i.test(motivo)) {
      if (/minutely/i.test(motivo)) { await sleep(62000); continue; }
      if (/hourly/i.test(motivo)) {
        if (maxEsperaHoraMin <= 0) throw new CuotaError('hora', motivo);
        const ms = (60 - new Date().getMinutes()) * 60000 + 30000;
        if (ms > maxEsperaHoraMin * 60000) throw new CuotaError('hora', motivo);
        console.log(`  [open-meteo] límite horario; espero ${Math.round(ms / 60000)} min…`);
        await sleep(ms); continue;
      }
      throw new CuotaError('dia', motivo);
    }
    throw new Error(`Open-Meteo ${res.status}: ${motivo}`);
  }
  throw new Error('Open-Meteo: demasiados reintentos');
}

/**
 * Diario → mensual. Un mes cuenta solo si tiene ≥90% de sus días; si no, valor null (n queda
 * registrado para trazabilidad). Esto descarta el mes en curso, cuyo ERA5 tiene ~5 días de retraso.
 * Devuelve { indicador: Map(idxMes → {v, n}) }.
 */
export function mensualDesdeDiario(d) {
  const acc = new Map();
  d.time.forEach((fecha, k) => {
    const i = mesIdx(+fecha.slice(0, 4), +fecha.slice(5, 7));
    const a = acc.get(i) ?? { n: 0, sm: 0, nx: 0, sx: 0, np: 0, sp: 0, d35: 0 };
    const tm = d.temperature_2m_mean[k], tx = d.temperature_2m_max[k], p = d.precipitation_sum[k];
    if (tm != null) { a.n++; a.sm += tm; }
    if (tx != null) { a.nx++; a.sx += tx; if (tx >= 35) a.d35++; }
    if (p != null) { a.np++; a.sp += p; }
    acc.set(i, a);
  });
  const out = { 'temp-aire': new Map(), 'temp-max-aire': new Map(), 'precipitacion': new Map(), 'dias-35c': new Map() };
  const ok = (n, i) => n >= Math.ceil(0.9 * diasEnMes(i));
  for (const [i, a] of acc) {
    out['temp-aire'].set(i, { v: ok(a.n, i) ? redondear(a.sm / a.n, 2) : null, n: a.n });
    out['temp-max-aire'].set(i, { v: ok(a.nx, i) ? redondear(a.sx / a.nx, 2) : null, n: a.nx });
    out['precipitacion'].set(i, { v: ok(a.np, i) ? redondear(a.sp, 1) : null, n: a.np });
    out['dias-35c'].set(i, { v: ok(a.nx, i) ? a.d35 : null, n: a.nx });
  }
  return out;
}
