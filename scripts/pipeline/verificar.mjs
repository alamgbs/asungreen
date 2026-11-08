#!/usr/bin/env node
// Verifica forma y plausibilidad de data/series (sin dependencias). Sale con código 1 si algo falla.
//  · longitudes v/n coherentes; el año anual cubre los meses; nulos explícitos (nunca NaN/undefined)
//  · rangos físicos por indicador; versión de cada zona = versión del manifest; checksum del manifest
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SERIES_DIR, parseMes } from './lib/series-io.mjs';

const RANGOS = {
  'temp-aire': [-15, 45], 'temp-max-aire': [-15, 55], 'precipitacion': [0, 2500], 'dias-35c': [0, 31],
  'anomalia-temp-aire': [-12, 12], 'ndvi-modis': [-0.2, 1], 'lst-modis': [-20, 70], ndvi: [-1, 1], lst: [-20, 80],
};
const manifest = JSON.parse(readFileSync(join(SERIES_DIR, 'manifest.json'), 'utf8'));
const errs = [];
const hash = createHash('sha256');
const files = readdirSync(SERIES_DIR).filter((f) => f.endsWith('.json') && f !== 'manifest.json').sort();
for (const f of files) {
  const txt = readFileSync(join(SERIES_DIR, f), 'utf8'); hash.update(f).update(txt);
  const z = JSON.parse(txt);
  if (z.version !== manifest.pipelineVersion) errs.push(`${f}: versión ${z.version} ≠ manifest ${manifest.pipelineVersion}`);
  for (const [id, ind] of Object.entries(z.indicadores)) {
    const [lo, hi] = RANGOS[id] ?? [-Infinity, Infinity];
    for (const g of ['mensual', 'anual']) {
      const s = ind[g]; if (!s) continue;
      if (s.v.length !== s.n.length) errs.push(`${f}/${id}/${g}: largo v≠n`);
      if (s.v.some((x) => x === undefined || (x !== null && (typeof x !== 'number' || !Number.isFinite(x))))) errs.push(`${f}/${id}/${g}: valor inválido`);
      const mal = s.v.filter((x) => x !== null && (x < lo || x > hi)).length;
      if (mal) errs.push(`${f}/${id}/${g}: ${mal} valores fuera de [${lo}, ${hi}]`);
    }
    if (ind.mensual && ind.anual) {
      const y0 = Math.floor(parseMes(ind.mensual.inicio) / 12), y1 = Math.floor((parseMes(ind.mensual.inicio) + ind.mensual.v.length - 1) / 12);
      if (ind.anual.inicio !== y0 || ind.anual.v.length !== y1 - y0 + 1) errs.push(`${f}/${id}: años anuales no cubren los meses (${ind.anual.inicio}+${ind.anual.v.length} vs ${y0}..${y1})`);
    }
  }
}
if (hash.digest('hex') !== manifest.checksum) errs.push('checksum del manifest no coincide (¿se editaron series sin regenerarlo?)');
if (files.length !== manifest.nZonas) errs.push(`manifest.nZonas=${manifest.nZonas} pero hay ${files.length} archivos`);
if (errs.length) { console.error(errs.slice(0, 30).join('\n')); process.exit(1); }
console.log(`[verificar] ${files.length} zonas OK (versión ${manifest.pipelineVersion})`);
