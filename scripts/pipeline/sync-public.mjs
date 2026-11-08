#!/usr/bin/env node
// Copia data/series/*.json → public/series/ (se sirve estático desde el CDN). public/series está en
// .gitignore: la fuente de verdad versionada es data/series. Se ejecuta en predev y prebuild.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/zonas.mjs';

const src = join(ROOT, 'data', 'series');
const dst = join(ROOT, 'public', 'series');
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
if (!existsSync(src)) { console.warn('[series:sync] data/series no existe; public/series queda vacío'); process.exit(0); }
let n = 0;
for (const f of readdirSync(src)) if (f.endsWith('.json')) { cpSync(join(src, f), join(dst, f)); n++; }
console.log(`[series:sync] ${n} archivos → public/series`);
