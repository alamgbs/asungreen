#!/usr/bin/env node
// Pipeline GEE (REQUIERE GEE_SA_JSON; en CI solo corre si el secreto existe). NO se pudo ejecutar
// donde se escribió (sin credenciales): primera corrida real = Tarea 1.0 → correr gee_bench.mjs antes.
//
// Uso: GEE_SA_JSON=... node scripts/pipeline/gee/run.mjs [--ind=ndvi,lst] [--desde=2017-03] [--hasta=2026-10]
//        [--prioridad-max=2] [--lote=10] [--max-meses=N] [--forzar]
// Salida: mismo formato que el pipeline abierto → data/series/{zona}.json (indicadores 'ndvi' y 'lst'),
//   n = nº medio de observaciones válidas por píxel en el mes (redondeado); valor null si no hubo píxeles válidos.
// Reanudable: data/series/.estado.json registra (indicador, mes) completados para esta PIPELINE_VERSION.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cargarZonas } from '../lib/zonas.mjs';
import {
  SERIES_DIR, leerZona, nuevaZona, escribirZona, validarZona, construirManifest, mensualAMapa, mapaAMensual,
  anualDesdeMensual, mesIdx, mesStr, parseMes, redondear,
} from '../lib/series-io.mjs';
import { PIPELINE_VERSION } from '../lib/version.mjs';
import { CATALOGO } from '../lib/catalogo.mjs';
import { cargarCuenta, stats } from './gee.mjs';
import { compositeMes, INICIO } from './composites.mjs';
import { cargarGeometrias, estadisticasLote } from './zonal.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const INDS = String(args.ind ?? 'ndvi,lst').split(',');
const LOTE = Number(args.lote ?? 10);
const PRIORIDAD_MAX = Number(args['prioridad-max'] ?? 2);
const hoy = new Date(); const refer = new Date(hoy.getTime() - 7 * 864e5);
const ULTIMO = mesIdx(refer.getUTCFullYear(), refer.getUTCMonth() + 1) - 1;

// Catálogo para el manifest (ids 'ndvi'/'lst' coinciden con lib/indicadores.ts)
CATALOGO.ndvi ??= { unidad: 'índice', agregacion: 'media', decimales: 3, fuente: 'Sentinel-2 SR Harmonized + Cloud Score+ (mediana mensual, 100 m)', url: 'https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED', licencia: 'Copernicus Sentinel data (libre con atribución)', nota: 'n = observaciones válidas medias por píxel.' };
CATALOGO.lst ??= { unidad: '°C', agregacion: 'media', decimales: 2, fuente: 'Landsat 8/9 C2 L2 ST_B10 (mediana mensual, 100 m)', url: 'https://developers.google.com/earth-engine/datasets/catalog/LANDSAT_LC08_C02_T1_L2', licencia: 'Dominio público (USGS/NASA)', nota: 'n = observaciones válidas medias por píxel.' };

const sa = cargarCuenta();
const { zonas: todas, origen } = cargarZonas();
const geoms = cargarGeometrias();
const zonas = todas.filter((z) => z.prioridad <= PRIORIDAD_MAX && geoms.has(z.id)).map((z) => ({
  id: z.id, geometry: geoms.get(z.id), escala: z.prioridad === 2 ? 30 : 100, // ciudades 30 m, resto 100 m
}));
if (!zonas.length) throw new Error('Sin geometrías: falta public/zonas/*.geojson (lo genera el pipeline de zonas).');
console.log(`[gee] ${zonas.length} zonas con geometría (origen ${origen}); último mes completo ${mesStr(ULTIMO)}`);

const estadoPath = join(SERIES_DIR, '.estado.json');
let estado = existsSync(estadoPath) ? JSON.parse(readFileSync(estadoPath, 'utf8')) : {};
if (estado.version !== PIPELINE_VERSION || args.forzar) estado = { version: PIPELINE_VERSION, hechos: {} };
const guardarEstado = () => writeFileSync(estadoPath, JSON.stringify(estado) + '\n');

let meses = 0;
for (const ind of INDS) {
  const i0 = parseMes(args.desde ?? INICIO[ind]), i1 = args.hasta ? parseMes(args.hasta) : ULTIMO;
  for (let mi = i0; mi <= i1; mi++) {
    const clave = `${ind}|${mesStr(mi)}`;
    // M-1 y M-2 se recalculan siempre (reprocesos tardíos); el resto se salta si ya está hecho.
    if (estado.hechos[clave] && mi < ULTIMO - 1) continue;
    if (meses++ >= Number(args['max-meses'] ?? Infinity)) break;
    const t0 = Date.now();
    const comp = compositeMes(ind, Math.floor(mi / 12), (mi % 12) + 1);
    for (let k = 0; k < zonas.length; k += LOTE) {
      const lote = zonas.slice(k, k + LOTE);
      const res = await estadisticasLote(sa, comp, lote);
      for (const [zid, r] of res) {
        const z = leerZona(zid) ?? nuevaZona(zid);
        const s = (z.indicadores[ind] ??= {});
        const mapa = mensualAMapa(s.mensual);
        // Sin píxeles válidos → null explícito (mes cubierto por completo de nubes), nunca 0.
        mapa.set(mi, { v: r.pixeles > 0 ? redondear(r.media, CATALOGO[ind].decimales) : null, n: r.obs });
        s.mensual = mapaAMensual(mapa);
        s.anual = anualDesdeMensual(s.mensual, { agregacion: 'media', decimales: CATALOGO[ind].decimales, minMeses: 9 });
        const errs = validarZona(z); if (errs.length) throw new Error(errs.join('; '));
        escribirZona(z);
      }
    }
    estado.hechos[clave] = new Date().toISOString(); guardarEstado();
    console.log(`[gee] ${clave} ${zonas.length} zonas en ${((Date.now() - t0) / 1000).toFixed(1)} s (llamadas ${stats.llamadas}, 429: ${stats.reintentos429})`);
  }
}
const m = construirManifest({ zonasEsperadas: todas.filter((z) => z.prioridad <= PRIORIDAD_MAX).map((z) => z.id), origenZonas: origen });
console.log(`[manifest] ${m.nZonas} zonas, indicadores: ${Object.keys(m.indicadores).join(', ')}`);
