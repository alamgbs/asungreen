#!/usr/bin/env node
// Relative Wealth Index (Meta, HDX) — CC BY-NC 4.0 (solo uso NO comercial). Corte único 2021, celdas de 2,4 km.
// Valor relativo DENTRO de cada país: no comparable entre países. Cubre PY (y AR/BR/MX/PA para ciudades; aquí sólo PY).
// Por zona: promedio simple de las celdas cuyo centro cae dentro; null si ninguna (no se inventa el valor).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../lib/zonas.mjs';
import { cargarPoligonos, indiceZonas } from '../lib/geo.mjs';
import { guardarIndicador, redondear } from '../lib/series-io.mjs';

const URL = 'https://data.humdata.org/dataset/76f2a2ea-ba50-40f5-b79c-db95d668b843/resource/5f22d510-21fe-4778-b29c-b1a3c1467a87/download/pry_relative_wealth_index.csv';
const dir = join(ROOT, 'scripts', 'pipeline', '.cache'); mkdirSync(dir, { recursive: true });
const f = join(dir, 'pry_rwi.csv');
if (!existsSync(f)) writeFileSync(f, Buffer.from(await (await fetch(URL, { redirect: 'follow' })).arrayBuffer()));
const [cab, ...filas] = readFileSync(f, 'utf8').trim().split('\n');
const cols = cab.split(',');
const iLat = cols.indexOf('latitude'), iLon = cols.indexOf('longitude'), iRwi = cols.indexOf('rwi');
if ([iLat, iLon, iRwi].includes(-1)) throw new Error(`cabecera RWI inesperada: ${cab}`);

const zonas = cargarPoligonos(['pais', 'departamento', 'distrito']);
const idx = indiceZonas(zonas);
const acc = new Map();
for (const l of filas) {
  const c = l.split(','); const lat = +c[iLat], lon = +c[iLon], v = +c[iRwi];
  if (!Number.isFinite(v)) continue;
  for (const z of idx(lon, lat)) { const a = acc.get(z.id) ?? acc.set(z.id, { s: 0, n: 0 }).get(z.id); a.s += v; a.n++; }
}
let ok = 0;
for (const z of zonas) {
  const a = acc.get(z.id);
  guardarIndicador(z.id, 'rwi', { anual: { inicio: 2021, v: [a ? redondear(a.s / a.n, 3) : null], n: [a?.n ?? 0] } });
  if (a) ok++;
}
console.log(`[rwi] ${filas.length} celdas; ${ok}/${zonas.length} zonas con valor (el resto null: ninguna celda de 2,4 km con centro dentro)`);
