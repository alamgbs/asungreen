#!/usr/bin/env node
// Incendios: NASA FIRMS, archivos anuales públicos por país (SIN clave): VIIRS S-NPP 375 m, desde 2012.
//   https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/{año}/viirs-snpp_{año}_Paraguay.csv
// Verificado 2026-11-08: 2012–2025 existen; el año en curso NO (404) y la API casi en tiempo real exige MAP_KEY
// (variable de entorno FIRMS_MAP_KEY, opcional: si existe se usa para completar el año en curso).
// Filtro: confianza 'n' o 'h' (se descarta 'l'), type=0 (vegetación). Por zona-mes: nº de detecciones (valor)
// y FRP total en MW (indicador aparte). Sólo zonas de Paraguay. Detecciones ≠ hectáreas quemadas.
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ROOT } from '../lib/zonas.mjs';
import { cargarPoligonos, indiceZonas } from '../lib/geo.mjs';
import { guardarIndicador, mesIdx, mapaAMensual, anualDesdeMensual, redondear } from '../lib/series-io.mjs';

const dir = join(ROOT, 'scripts', 'pipeline', '.cache', 'firms'); mkdirSync(dir, { recursive: true });
const hasta = new Date().getUTCFullYear() - 1;
const idx = indiceZonas(cargarPoligonos(['pais', 'departamento', 'distrito']));
const cnt = new Map(), frp = new Map(); // zona → Map(idxMes → valor)
const sumar = (m, z, i, v) => { const x = m.get(z) ?? m.set(z, new Map()).get(z); x.set(i, (x.get(i) ?? 0) + v); };

for (let y = 2012; y <= hasta; y++) {
  const f = join(dir, `${y}.csv`);
  if (!existsSync(f) || statSync(f).size < 1000) {
    const r = await fetch(`https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/${y}/viirs-snpp_${y}_Paraguay.csv`);
    if (!r.ok) { console.warn(`[firms] ${y}: HTTP ${r.status}, se omite`); continue; }
    await pipeline(Readable.fromWeb(r.body), createWriteStream(f));
  }
  const [cab, ...ls] = readFileSync(f, 'utf8').trim().split('\n');
  const c = cab.split(','), iLat = c.indexOf('latitude'), iLon = c.indexOf('longitude'), iD = c.indexOf('acq_date'),
    iConf = c.indexOf('confidence'), iFrp = c.indexOf('frp'), iT = c.indexOf('type');
  let n = 0;
  for (const l of ls) {
    const p = l.split(',');
    if (p[iConf] === 'l' || (iT >= 0 && p[iT] !== '0')) continue;
    const i = mesIdx(+p[iD].slice(0, 4), +p[iD].slice(5, 7)), fr = +p[iFrp] || 0;
    for (const z of idx(+p[iLon], +p[iLat])) { sumar(cnt, z.id, i, 1); sumar(frp, z.id, i, fr); }
    n++;
  }
  console.log(`[firms] ${y}: ${n} detecciones válidas`);
}
const i0 = mesIdx(2012, 1), i1 = mesIdx(hasta, 12);
const serie = (m, dec) => { // meses sin detección = 0 real (hay cobertura satelital todo el período)
  const mp = new Map(); for (let i = i0; i <= i1; i++) mp.set(i, { v: redondear(m?.get(i) ?? 0, dec), n: 1 });
  return mapaAMensual(mp);
};
let k = 0;
for (const z of idx(-57.6, -25.3).length ? cargarPoligonos(['pais', 'departamento', 'distrito']) : []) {
  const a = serie(cnt.get(z.id), 0), b = serie(frp.get(z.id), 1);
  guardarIndicador(z.id, 'incendios-viirs', { mensual: a, anual: anualDesdeMensual(a, { agregacion: 'suma', decimales: 0 }) });
  guardarIndicador(z.id, 'incendios-frp-viirs', { mensual: b, anual: anualDesdeMensual(b, { agregacion: 'suma', decimales: 1 }) });
  k++;
}
console.log(`[firms] ${k} zonas escritas (${2012}-${hasta})`);
