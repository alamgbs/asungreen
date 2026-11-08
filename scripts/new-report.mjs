#!/usr/bin/env node
// Alta de reporte: crea content/reports/YYYY-MM-slug/{meta.json,reporte.pdf} y copia el PDF a public/reports/.
// Uso interactivo:  node scripts/new-report.mjs
// Uso con flags:    node scripts/new-report.mjs --pdf ./mi.pdf --title "..." --summary "..." \
//                     --date 2026-12-01 --zones asuncion,central-py --indicators ndvi,soilTemp \
//                     --tags a,b --author "Nombre" [--slug mi-slug] [--force]
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDICATORS = ['soilTemp', 'traffic', 'ndvi'];
const aoiSrc = fs.readFileSync(path.join(root, 'lib', 'aois.ts'), 'utf8');
const ZONES = [...aoiSrc.matchAll(/^\s*id:\s*'([^']+)'/gm)].map((m) => m[1]);

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2);
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[k] = true;
  else { args[k] = next; i++; }
}

const list = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const fail = (m) => { console.error(`Error: ${m}`); process.exit(1); };

let rl;
async function ask(key, label, def) {
  if (args[key] !== undefined && args[key] !== true) return String(args[key]);
  if (!process.stdin.isTTY) { if (def !== undefined) return def; fail(`falta --${key}`); }
  rl ??= readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(`${label}${def ? ` [${def}]` : ''}: `)).trim();
  return a || def || '';
}

const pdf = await ask('pdf', 'Ruta del PDF');
if (!pdf || !fs.existsSync(pdf)) fail(`PDF no encontrado: ${pdf}`);
const title = await ask('title', 'Título');
const summary = await ask('summary', 'Resumen');
const date = await ask('date', 'Fecha (YYYY-MM-DD)', new Date().toISOString().slice(0, 10));
const zones = list(await ask('zones', `Zonas (${ZONES.join(', ')})`));
const indicators = list(await ask('indicators', `Indicadores (${INDICATORS.join(', ')})`));
const tags = list(await ask('tags', 'Etiquetas (separadas por coma)', ''));
const author = await ask('author', 'Autor');
rl?.close();

if (!title || !summary || !author) fail('título, resumen y autor son obligatorios');
if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) fail('fecha inválida (YYYY-MM-DD)');
for (const z of zones) if (!ZONES.includes(z)) fail(`zona desconocida "${z}". Válidas: ${ZONES.join(', ')}`);
for (const i of indicators) if (!INDICATORS.includes(i)) fail(`indicador desconocido "${i}". Válidos: ${INDICATORS.join(', ')}`);

const slug = `${date.slice(0, 7)}-${args.slug && args.slug !== true ? slugify(args.slug) : slugify(title)}`;
const dir = path.join(root, 'content', 'reports', slug);
const pub = path.join(root, 'public', 'reports', `${slug}.pdf`);
if (fs.existsSync(dir) && !args.force) fail(`ya existe ${path.relative(root, dir)} (usa --force para sobrescribir)`);

fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(path.dirname(pub), { recursive: true });
fs.copyFileSync(pdf, path.join(dir, 'reporte.pdf'));
fs.copyFileSync(pdf, pub);
fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ title, date, summary, zones, indicators, tags, author }, null, 2) + '\n');

console.log(`\nReporte creado: ${slug}`);
console.log(`  ${path.relative(root, dir)}/meta.json`);
console.log(`  ${path.relative(root, pub)}`);
console.log('\nSiguiente: git add content/reports public/reports && git commit && git push');
