#!/usr/bin/env node
// Regenera data/series/manifest.json desde los archivos presentes (úsalo si otro proceso escribió series).
import { cargarZonas } from './lib/zonas.mjs';
import { construirManifest } from './lib/series-io.mjs';
const { zonas, origen } = cargarZonas();
const m = construirManifest({ zonasEsperadas: zonas.map((z) => z.id), origenZonas: origen });
console.log(`[manifest] ${m.nZonas} zonas, ${Object.keys(m.indicadores).length} indicadores, completo=${m.completo}`);
