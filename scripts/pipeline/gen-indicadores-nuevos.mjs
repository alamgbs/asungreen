#!/usr/bin/env node
// Genera data/series/indicadores-nuevos.json: definiciones de los indicadores que el pipeline ya produce y que
// todavía NO están en lib/indicadores.ts (para que el master las integre). Procedencia sale de lib/catalogo.mjs.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOGO } from './lib/catalogo.mjs';
import { SERIES_DIR } from './lib/series-io.mjs';

// [resolución, sentido de mejora, rango fijo sugerido, granularidad, cobertura, cálculo]
const DEF = {
  'temp-max-aire': ['25 km (ERA5)', 'bajo', [15, 42], ['mensual', 'anual'], '1991-01', 'openmeteo'],
  'anomalia-temp-aire': ['25 km (ERA5)', 'bajo', [-4, 4], ['mensual', 'anual'], '1991-01', 'derivado'],
  'ndvi-modis': ['250 m, muestra ~2 km alrededor del centroide', 'alto', [0, 0.9], ['mensual', 'anual'], '2000-02', 'modis'],
  'lst-modis': ['1 km, muestra 3×3 px alrededor del centroide', 'bajo', [15, 50], ['mensual', 'anual'], '2000-02', 'modis'],
  'poblacion': ['100 m (PY) / 1 km (ciudades)', 'neutro', [0, 1e6], ['anual'], '2020', 'worldpop'],
  'densidad-poblacion': ['100 m (PY) / 1 km (ciudades)', 'neutro', [0, 10000], ['anual'], '2020', 'worldpop'],
  'areas-verdes-osm-ha': ['vectorial (OSM)', 'alto', [0, 2000], ['anual'], 'corte OSM actual', 'osm'],
  'areas-verdes-osm-pct': ['vectorial (OSM)', 'alto', [0, 30], ['anual'], 'corte OSM actual', 'osm'],
  'verde-osm-m2-hab': ['vectorial (OSM) / 100 m', 'alto', [0, 30], ['anual'], 'corte OSM actual', 'derivado'],
  'centros-salud-osm': ['puntos (OSM)', 'alto', [0, 200], ['anual'], 'corte OSM actual', 'osm'],
  'escuelas-osm': ['puntos (OSM)', 'alto', [0, 300], ['anual'], 'corte OSM actual', 'osm'],
  'paradas-transporte-osm': ['puntos (OSM)', 'alto', [0, 500], ['anual'], 'corte OSM actual', 'osm'],
  'pob-800m-verde': ['100 m, 800 m en línea recta', 'alto', [0, 100], ['anual'], 'corte OSM actual', 'derivado'],
  'pob-800m-salud': ['100 m, 800 m en línea recta', 'alto', [0, 100], ['anual'], 'corte OSM actual', 'derivado'],
  'pob-800m-escuela': ['100 m, 800 m en línea recta', 'alto', [0, 100], ['anual'], 'corte OSM actual', 'derivado'],
  'pob-800m-transporte': ['100 m, 800 m en línea recta', 'alto', [0, 100], ['anual'], 'corte OSM actual', 'derivado'],
  'rwi': ['2,4 km', 'alto', [-1.5, 1.5], ['anual'], '2021 (corte único)', 'hdx'],
  'incendios-viirs': ['375 m', 'bajo', [0, 500], ['mensual', 'anual'], '2012-01', 'firms'],
  'incendios-frp-viirs': ['375 m', 'bajo', [0, 5000], ['mensual', 'anual'], '2012-01', 'firms'],
};
const NOMBRES = {
  'temp-max-aire': 'Temperatura máxima del aire (ERA5)', 'anomalia-temp-aire': 'Anomalía de temperatura vs. 1991–2020',
  'ndvi-modis': 'Vegetación MODIS (NDVI)', 'lst-modis': 'Temp. superficial MODIS (LST)', 'poblacion': 'Población (WorldPop 2020)',
  'densidad-poblacion': 'Densidad de población', 'areas-verdes-osm-ha': 'Áreas verdes (OSM, ha)', 'areas-verdes-osm-pct': 'Áreas verdes (% de la zona)',
  'verde-osm-m2-hab': 'Verde por habitante (OSM)', 'centros-salud-osm': 'Centros de salud (OSM)', 'escuelas-osm': 'Escuelas y jardines (OSM)',
  'paradas-transporte-osm': 'Paradas de transporte (OSM)', 'pob-800m-verde': 'Población a ≤800 m de áreas verdes',
  'pob-800m-salud': 'Población a ≤800 m de un centro de salud', 'pob-800m-escuela': 'Población a ≤800 m de una escuela',
  'pob-800m-transporte': 'Población a ≤800 m de transporte', 'rwi': 'Índice de riqueza relativa (Meta)',
  'incendios-viirs': 'Detecciones de incendio (VIIRS)', 'incendios-frp-viirs': 'Potencia radiativa de incendios (FRP)',
};
const out = Object.entries(DEF).map(([id, [resolucion, mejorEs, rango, granularidad, desde, calculo]]) => {
  const c = CATALOGO[id];
  return { id, nombre: NOMBRES[id], unidad: c.unidad, fuente: c.fuente, url: c.url, resolucion, licencia: c.licencia, agregacion: c.agregacion,
    mejorEs, rango, cobertura: { desde, granularidad }, calculo, limitaciones: [c.nota], estado: 'pipeline',
    ...(id === 'rwi' ? { usoNoComercial: true } : {}) };
});
writeFileSync(join(SERIES_DIR, 'indicadores-nuevos.json'), JSON.stringify({ generado: new Date().toISOString().slice(0, 10), indicadores: out }, null, 1) + '\n');
console.log(`[indicadores-nuevos] ${out.length} definiciones`);
