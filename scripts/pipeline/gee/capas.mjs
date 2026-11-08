#!/usr/bin/env node
// Capas sociales/ambientales de GEE — REQUIERE GEE_SA_JSON; NO ejecutado donde se escribió (sin credenciales).
// IDs verificados el 2026-11-08 en el catálogo STAC público de Earth Engine:
//   3.4 NO₂   COPERNICUS/S5P/OFFL/L3_NO2           2018-06 → hoy (≈5,5×3,5 km: útil por departamento/ciudad grande, NO intra-urbano)
//   3.6 Hansen UMD/hansen/global_forest_change_2024_v1_12  2000–2024, CC-BY-4.0
//   3.7 Agua  JRC/GSW1_4/MonthlyHistory            1984-03 → 2022-01 (el producto TERMINA en 2022-01)
// Uso: GEE_SA_JSON=... node scripts/pipeline/gee/capas.mjs [--capa=no2,hansen,agua] [--prioridad-max=2] [--desde=..] [--hasta=..]
// Antes de la primera corrida: gee_bench.mjs y una prueba corta (--prioridad-max=0). Nombres de banda de
// salida (…_mean, …_count) se buscan por sufijo en zonal.mjs; si GEE los nombra distinto, el valor queda null y se verá en verificar.
import { cargarZonas } from '../lib/zonas.mjs';
import { guardarIndicador, mensualAMapa, mapaAMensual, anualDesdeMensual, mesIdx, mesStr, parseMes, redondear, construirManifest } from '../lib/series-io.mjs';
import { cargarCuenta } from './gee.mjs';
import { arr, c, inv } from './composites.mjs';
import { cargarGeometrias, estadisticasLote } from './zonal.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const CAPAS = String(args.capa ?? 'no2,hansen,agua').split(',');
const img = (v) => inv('Image.constant', { value: c(v) });
const mes = (y, m) => inv('Filter.and', { filters: arr([
  inv('Filter.gte', { leftField: c('system:time_start'), rightValue: c(Date.UTC(y, m - 1, 1)) }),
  inv('Filter.lt', { leftField: c('system:time_start'), rightValue: c(Date.UTC(y, m, 1)) })]) });
const cargar = (id, f) => inv('Collection.filter', { collection: inv('ImageCollection.load', { id: c(id) }), filter: f });
const sel = (input, b) => inv('Image.select', { input, bandSelectors: c([b]) });

/** NO₂ troposférico medio del mes, µmol/m² (×1e6 de mol/m²). */
function no2(y, m) {
  const col = cargar('COPERNICUS/S5P/OFFL/L3_NO2', mes(y, m));
  const media = sel(inv('ImageCollection.reduce', { collection: col, reducer: inv('Reducer.mean', {}) }), 'tropospheric_NO2_column_number_density_mean');
  const n = sel(inv('ImageCollection.reduce', { collection: col, reducer: inv('Reducer.count', {}) }), 'tropospheric_NO2_column_number_density_count');
  return { image: inv('Image.addBands', { dstImg: inv('Image.multiply', { image1: media, image2: img(1e6) }), srcImg: n }),
    values: {}, banda: 'tropospheric_NO2_column_number_density_mean', bandaN: 'tropospheric_NO2_column_number_density_count' };
}
/** Fracción de píxeles con agua (valor 2) entre los observados (valor >0) en el mes, en %. */
function agua(y, m) {
  const mos = inv('ImageCollection.mosaic', { collection: cargar('JRC/GSW1_4/MonthlyHistory', mes(y, m)) });
  const b = sel(mos, 'water');
  const pct = inv('Image.multiply', { image1: inv('Image.updateMask', { image: inv('Image.eq', { image1: b, image2: img(2) }), mask: inv('Image.gt', { image1: b, image2: img(0) }) }), image2: img(100) });
  return { image: inv('Image.addBands', { dstImg: pct, srcImg: inv('Image.updateMask', { image: img(1), mask: inv('Image.gt', { image1: b, image2: img(0) }) }) }),
    values: {}, banda: 'water', bandaN: 'constant' };
}
/** % de la cobertura arbórea del año 2000 (≥30 %) perdida en el año y. */
function hansen(y) {
  const h = inv('Image.load', { id: c('UMD/hansen/global_forest_change_2024_v1_12') });
  const bosque = inv('Image.gte', { image1: sel(h, 'treecover2000'), image2: img(30) });
  const perdida = inv('Image.updateMask', { image: inv('Image.multiply', { image1: inv('Image.eq', { image1: sel(h, 'lossyear'), image2: img(y - 2000) }), image2: img(100) }), mask: bosque });
  return { image: inv('Image.addBands', { dstImg: perdida, srcImg: inv('Image.updateMask', { image: img(1), mask: bosque }) }),
    values: {}, banda: 'lossyear', bandaN: 'constant' };
}

const sa = cargarCuenta();
const { zonas: todas, origen } = cargarZonas();
const geoms = cargarGeometrias();
const zonas = todas.filter((z) => z.prioridad <= Number(args['prioridad-max'] ?? 2) && geoms.has(z.id))
  .map((z) => ({ id: z.id, geometry: geoms.get(z.id), escala: z.prioridad === 2 ? 100 : 250 }));
if (!zonas.length) throw new Error('Sin geometrías (public/zonas/*.geojson).');
const ahora = new Date(); const ult = mesIdx(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1) - 2;

const CFG = {
  no2:    { id: 'no2-s5p',          mensual: true,  desde: '2018-07', hasta: () => ult, comp: (i) => no2(Math.floor(i / 12), (i % 12) + 1), dec: 3, agg: 'media' },
  agua:   { id: 'agua-superficial-jrc', mensual: true, desde: '1984-03', hasta: () => parseMes('2022-01'), comp: (i) => agua(Math.floor(i / 12), (i % 12) + 1), dec: 2, agg: 'media' },
};
for (const k of CAPAS) {
  if (k === 'hansen') {
    for (let y = 2001; y <= 2024; y++) {
      const r = await estadisticasLote(sa, hansen(y), zonas);
      for (const [zid, v] of r) {
        const z = (await import('../lib/series-io.mjs')).leerZona(zid);
        const ind = z.indicadores['perdida-forestal-hansen'] ??= {};
        const a = ind.anual ?? { inicio: 2001, v: [], n: [] };
        a.v[y - 2001] = v.pixeles > 0 ? redondear(v.media, 3) : null; a.n[y - 2001] = v.pixeles;
        ind.anual = a;
        (await import('../lib/series-io.mjs')).escribirZona(z);
      }
      console.log(`[hansen] ${y}`);
    }
    continue;
  }
  const cfg = CFG[k]; if (!cfg) throw new Error(`capa desconocida: ${k}`);
  for (let i = parseMes(args.desde ?? cfg.desde); i <= (args.hasta ? parseMes(args.hasta) : cfg.hasta()); i++) {
    const comp = cfg.comp(i);
    for (let j = 0; j < zonas.length; j += 10) {
      const r = await estadisticasLote(sa, comp, zonas.slice(j, j + 10));
      for (const [zid, v] of r) {
        const { leerZona, nuevaZona, escribirZona } = await import('../lib/series-io.mjs');
        const z = leerZona(zid) ?? nuevaZona(zid);
        const ind = z.indicadores[cfg.id] ??= {};
        const mp = mensualAMapa(ind.mensual); mp.set(i, { v: v.pixeles > 0 ? redondear(v.media, cfg.dec) : null, n: v.obs });
        ind.mensual = mapaAMensual(mp); ind.anual = anualDesdeMensual(ind.mensual, { agregacion: cfg.agg, decimales: cfg.dec, minMeses: 9 });
        escribirZona(z);
      }
    }
    console.log(`[${k}] ${mesStr(i)}`);
  }
}
construirManifest({ zonasEsperadas: todas.map((z) => z.id), origenZonas: origen });
