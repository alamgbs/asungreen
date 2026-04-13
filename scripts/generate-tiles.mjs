// scripts/generate-tiles.mjs
// Usage: node scripts/generate-tiles.mjs
// Requires service-account.json at project root (never commit this file).

import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createSign } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Load service account ─────────────────────────────
const SA = JSON.parse(readFileSync(join(ROOT, 'service-account.json'), 'utf8'));
const GEE_PROJECT = SA.project_id;
const GEE_V1 = 'https://earthengine.googleapis.com/v1';

// ── OAuth2 via service account JWT ──────────────────
function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss:   SA.client_email,
    scope: 'https://www.googleapis.com/auth/earthengine',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  const sig = b64url(sign.sign(SA.private_key));
  const jwt = `${unsigned}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });
  if (!res.ok) throw new Error(`OAuth2 token error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

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
// Rules learned from GEE REST API probing:
//   - Image.visualize takes 'image' arg (not 'input')
//   - ImageCollection.mosaic takes 'collection' arg
//   - Request body needs fileFormat: 'PNG'
//   - Can pass 'bands' inside Image.visualize instead of a separate Image.select
//
// MODIS MOD13A2: 16-day NDVI composite, 500m.
//   Band 'NDVI': raw 0–10000 (×0.0001 = NDVI). Mosaic = most recent valid pixel.
//
// MODIS MOD11A2: 8-day daytime LST, 1km.
//   Band 'LST_Day_1km': raw in 50×Kelvin.  ~14300 ≈ 13°C, ~16150 ≈ 50°C.

function ndviExpression() {
  return {
    result: '0',
    values: {
      '0': { functionInvocationValue: { functionName: 'Image.visualize', arguments: {
        image:   { valueReference: '1' },
        min:     { constantValue: 0 },
        max:     { constantValue: 8000 },
        bands:   { constantValue: ['NDVI'] },
        palette: { constantValue: ['ff2d78','ffe600','00ff88','00a855','004d22'] },
      }}},
      '1': { functionInvocationValue: { functionName: 'ImageCollection.mosaic', arguments: {
        collection: { valueReference: '2' },
      }}},
      '2': { functionInvocationValue: { functionName: 'ImageCollection.load', arguments: {
        id: { constantValue: 'MODIS/061/MOD13A2' },
      }}},
    },
  };
}

function lstExpression() {
  return {
    result: '0',
    values: {
      '0': { functionInvocationValue: { functionName: 'Image.visualize', arguments: {
        image:   { valueReference: '1' },
        min:     { constantValue: 14300 },
        max:     { constantValue: 16200 },
        bands:   { constantValue: ['LST_Day_1km'] },
        palette: { constantValue: ['001aff','00e5ff','ffe600','ff7c00','ff2d78'] },
      }}},
      '1': { functionInvocationValue: { functionName: 'ImageCollection.mosaic', arguments: {
        collection: { valueReference: '2' },
      }}},
      '2': { functionInvocationValue: { functionName: 'ImageCollection.load', arguments: {
        id: { constantValue: 'MODIS/061/MOD11A2' },
      }}},
    },
  };
}

// ── GEE map creation ─────────────────────────────────
async function createGeeMap(expression, token) {
  const res = await fetch(
    `${GEE_V1}/projects/${GEE_PROJECT}/maps`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ expression, fileFormat: 'PNG' }),
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
  console.log('Authenticating with Google Earth Engine...');
  const token = await getAccessToken();
  console.log('  ✓ OAuth2 token obtained');

  const LAYERS = [
    { name: 'ndvi',     maxZoom: 14, expr: ndviExpression() },
    { name: 'soilTemp', maxZoom: 12, expr: lstExpression()  },
  ];

  for (const layer of LAYERS) {
    console.log(`\nCreating GEE map for ${layer.name}...`);
    const tileBase = await createGeeMap(layer.expr, token);
    console.log(`  Tile base URL: ${tileBase}`);

    const zooms    = Array.from({ length: layer.maxZoom - 10 + 1 }, (_, i) => 10 + i);
    const allTiles = zooms.flatMap((z) => tilesForZoom(z));
    console.log(`  Downloading ${allTiles.length} tiles (zoom 10-${layer.maxZoom})...`);

    const tasks = allTiles.map(({ z, x, y }) => async () => {
      const url = `${tileBase}/${z}/${x}/${y}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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
