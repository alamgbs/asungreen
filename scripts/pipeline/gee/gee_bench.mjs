#!/usr/bin/env node
// Medición de cuota/latencia de GEE (Tarea 1.0). NO ejecutado donde se escribió: no había credenciales.
// Uso: GEE_SA_JSON="$(cat service-account.json)" node scripts/pipeline/gee/gee_bench.mjs [geojson] [N=10]
//   geojson: FeatureCollection de zonas (por defecto public/zonas/distritos.geojson o el de pruebas).
// Mide: (a) 1 zona, (b) N zonas en un lote, (c) composite LST, (d) 20 tiles simultáneos (umbral de 429).
// Para EECU-s reales usar el panel de cuota del proyecto en Cloud Console (Monitoring → earthengine.googleapis.com/project/eecu/usage_time)
// antes y después de la corrida; value:compute no devuelve el perfil. Pegar la tabla resultante en
// docs/superpowers/specs/2026-11-08-precompute-vs-ondemand.md §4 reemplazando las filas [ESTIMADO].
import { readFileSync, existsSync } from 'node:fs';
import { cargarCuenta, post, compute, token, GEE_V1 } from './gee.mjs';
import { compositeMes, inv, c } from './composites.mjs';
import { estadisticasLote } from './zonal.mjs';

const sa = cargarCuenta();
const cand = [process.argv[2], 'public/zonas/distritos.geojson', 'public/zonas/adm2.geojson', '/tmp/asu-bench/adm2_simp.geojson'].filter(Boolean);
const ruta = cand.find((p) => existsSync(p));
if (!ruta) throw new Error('No encuentro un GeoJSON de zonas; pasalo como primer argumento.');
const N = Number(process.argv[3] ?? 10);
const feats = JSON.parse(readFileSync(ruta, 'utf8')).features.slice(0, N);
const zonas = feats.map((f, i) => ({ id: f.properties?.id ?? `z${i}`, geometry: f.geometry, escala: 100 }));
const fila = (...x) => console.log(x.join(' | '));
fila('prueba', 'estado', 'ms');

const medir = async (nombre, fn) => { const t = performance.now(); try { await fn(); fila(nombre, 'ok', Math.round(performance.now() - t)); } catch (e) { fila(nombre, `ERROR ${e.message.slice(0, 120)}`, Math.round(performance.now() - t)); } };

const ndvi = compositeMes('ndvi', 2024, 3);
const lst = compositeMes('lst', 2024, 3);
await medir('NDVI S2 mar-2024, 1 zona @100m', () => estadisticasLote(sa, ndvi, zonas.slice(0, 1)));
await medir(`NDVI S2 mar-2024, ${zonas.length} zonas @100m`, () => estadisticasLote(sa, ndvi, zonas));
await medir('LST L8/9 mar-2024, 1 zona @100m', () => estadisticasLote(sa, lst, zonas.slice(0, 1)));
await medir(`LST L8/9 mar-2024, ${zonas.length} zonas @100m`, () => estadisticasLote(sa, lst, zonas));

// (d) umbral de 429 con 20 tiles simultáneos de un mapa real
const r = await post(sa, 'maps', { fileFormat: 'PNG', expression: { result: 'r', values: { ...ndvi.values, r: inv('Image.visualize', {
  image: inv('Image.select', { input: ndvi.image, bandSelectors: c(['nd_median']) }), min: c(-0.2), max: c(0.8), palette: c(['ff2d78', 'ffe600', '004d22']) }) } } });
if (r.ok) {
  const id = r.json.name.split('/').pop(); const tk = await token(sa);
  const t = performance.now();
  const resp = await Promise.all(Array.from({ length: 20 }, (_, i) => fetch(`${GEE_V1}/projects/${sa.project_id}/maps/${id}/tiles/12/${2900 + (i % 5)}/${4560 + Math.floor(i / 5)}`, { headers: { Authorization: `Bearer ${tk}` } }).then((x) => x.status)));
  const cuenta = resp.reduce((a, s) => ((a[s] = (a[s] ?? 0) + 1), a), {});
  fila('20 tiles simultáneos z12', JSON.stringify(cuenta), Math.round(performance.now() - t));
} else fila('maps', `ERROR ${r.status} ${r.texto.slice(0, 120)}`, 0);
void compute;
