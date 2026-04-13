// scripts/generate-tiles.mjs
// Usage: node scripts/generate-tiles.mjs
// Requires .env.local with NEXT_PUBLIC_GEE_API_KEY and NEXT_PUBLIC_GEE_PROJECT

import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Load .env.local ─────────────────────────────────
function loadEnv() {
  try {
    return Object.fromEntries(
      readFileSync(join(ROOT, '.env.local'), 'utf8')
        .split('\n')
        .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
        .map((l) => {
          const idx = l.indexOf('=');
          return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
        })
    );
  } catch {
    return {};
  }
}

const env = loadEnv();
const GEE_API_KEY = env['NEXT_PUBLIC_GEE_API_KEY'] ?? '';
const GEE_PROJECT = env['NEXT_PUBLIC_GEE_PROJECT'] ?? '';
const GEE_V1 = 'https://earthengine.googleapis.com/v1';

// ── Asunción bbox ────────────────────────────────────
const WEST  = -57.75;
const EAST  = -57.40;
const NORTH = -25.10;
const SOUTH = -25.50;

function lngToTile(lng, z) {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, z));
}
function latToTile(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      Math.pow(2, z)
  );
}

function tilesForZoom(z) {
  const xMin = lngToTile(WEST,  z);
  const xMax = lngToTile(EAST,  z);
  const yMin = latToTile(NORTH, z);
  const yMax = latToTile(SOUTH, z);
  const tiles = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      tiles.push({ z, x, y });
    }
  }
  return tiles;
}

// ── GEE expressions ──────────────────────────────────
function isoDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

function ndviExpression(start, end) {
  return {
    result: '0',
    values: {
      '0': { functionInvocationValue: { functionName: 'Image.visualize', arguments: {
        input: { valueReference: '1' },
        min: { constantValue: -0.2 }, max: { constantValue: 0.8 },
        palette: { constantValue: ['ff2d78','ffe600','00ff88','00a855','004d22'] },
      }}},
      '1': { functionInvocationValue: { functionName: 'Image.normalizedDifference', arguments: {
        input: { valueReference: '2' }, bandNames: { constantValue: ['B8','B4'] },
      }}},
      '2': { functionInvocationValue: { functionName: 'ImageCollection.median', arguments: {
        collection: { valueReference: '3' },
      }}},
      '3': { functionInvocationValue: { functionName: 'Collection.filter', arguments: {
        collection: { valueReference: '4' },
        filter: { functionInvocationValue: { functionName: 'Filter.lt', arguments: {
          name: { constantValue: 'CLOUDY_PIXEL_PERCENTAGE' }, value: { constantValue: 20 },
        }}},
      }}},
      '4': { functionInvocationValue: { functionName: 'ImageCollection.filterDate', arguments: {
        collection: { valueReference: '5' }, start: { constantValue: start }, end: { constantValue: end },
      }}},
      '5': { functionInvocationValue: { functionName: 'ImageCollection.load', arguments: {
        id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED' },
      }}},
    },
  };
}

function lstExpression(start, end) {
  return {
    result: '0',
    values: {
      '0': { functionInvocationValue: { functionName: 'Image.visualize', arguments: {
        input: { valueReference: '1' },
        min: { constantValue: 15 }, max: { constantValue: 50 },
        palette: { constantValue: ['001aff','00e5ff','ffe600','ff7c00','ff2d78'] },
      }}},
      '1': { functionInvocationValue: { functionName: 'Image.add', arguments: {
        image1: { valueReference: '2' }, image2: { constantValue: -124.15 },
      }}},
      '2': { functionInvocationValue: { functionName: 'Image.multiply', arguments: {
        image1: { valueReference: '3' }, image2: { constantValue: 0.00341802 },
      }}},
      '3': { functionInvocationValue: { functionName: 'Image.select', arguments: {
        input: { valueReference: '4' }, bandSelectors: { constantValue: ['ST_B10'] },
      }}},
      '4': { functionInvocationValue: { functionName: 'ImageCollection.first', arguments: {
        collection: { valueReference: '5' },
      }}},
      '5': { functionInvocationValue: { functionName: 'ImageCollection.sort', arguments: {
        collection: { valueReference: '6' }, property: { constantValue: 'CLOUD_COVER' },
      }}},
      '6': { functionInvocationValue: { functionName: 'ImageCollection.filterDate', arguments: {
        collection: { valueReference: '7' }, start: { constantValue: start }, end: { constantValue: end },
      }}},
      '7': { functionInvocationValue: { functionName: 'ImageCollection.load', arguments: {
        id: { constantValue: 'LANDSAT/LC08/C02/T1_L2' },
      }}},
    },
  };
}

// ── GEE map creation ─────────────────────────────────
async function createGeeMap(expression) {
  const res = await fetch(
    `${GEE_V1}/projects/${GEE_PROJECT}/maps?key=${GEE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expression }),
    }
  );
  if (!res.ok) throw new Error(`GEE map creation failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return `${GEE_V1}/${data.name}/tiles`;
}

// ── Concurrent download helper ───────────────────────
async function downloadWithConcurrency(tasks, concurrency) {
  let idx = 0;
  let done = 0;
  const total = tasks.length;

  async function worker() {
    while (idx < total) {
      const task = tasks[idx++];
      await task();
      done++;
      if (done % 50 === 0) process.stdout.write(`  ${done}/${total}\n`);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

// ── Main ─────────────────────────────────────────────
async function main() {
  if (!GEE_API_KEY || !GEE_PROJECT) {
    throw new Error('Set NEXT_PUBLIC_GEE_API_KEY and NEXT_PUBLIC_GEE_PROJECT in .env.local');
  }

  const LAYERS = [
    {
      name: 'ndvi',
      maxZoom: 14,
      expr: ndviExpression(isoDate(90), isoDate(0)),
    },
    {
      name: 'soilTemp',
      maxZoom: 12,
      expr: lstExpression(isoDate(180), isoDate(0)),
    },
  ];

  for (const layer of LAYERS) {
    console.log(`\nCreating GEE map for ${layer.name}...`);
    const tileBase = await createGeeMap(layer.expr);
    console.log(`  Tile base URL: ${tileBase}`);

    const zooms = Array.from(
      { length: layer.maxZoom - 10 + 1 },
      (_, i) => 10 + i
    );
    const allTiles = zooms.flatMap((z) => tilesForZoom(z));
    console.log(`  Downloading ${allTiles.length} tiles (zoom 10-${layer.maxZoom})...`);

    const tasks = allTiles.map(({ z, x, y }) => async () => {
      const url = `${tileBase}/${z}/${x}/${y}?key=${GEE_API_KEY}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`  WARN: tile ${layer.name}/${z}/${x}/${y} → ${res.status}`);
        return;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const dir = join(ROOT, 'public', 'tiles', layer.name, String(z), String(x));
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${y}.png`), buf);
    });

    await downloadWithConcurrency(tasks, 5);
    console.log(`  ✓ ${layer.name} done`);
  }

  console.log('\n✓ All tiles downloaded.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
