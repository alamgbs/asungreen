// scripts/fetch-osm-roads.mjs
// Usage: node scripts/fetch-osm-roads.mjs
// Requires internet access to https://overpass-api.de

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Asunción bbox: south, west, north, east (Overpass format)
const BBOX = '(-25.50,-57.75,-25.10,-57.40)';

const QUERY = `
[out:json][timeout:60];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential)$"]${BBOX};
out geom;
`.trim();

async function main() {
  console.log('Fetching Asunción road network from Overpass API...');
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(QUERY)}`,
  });

  if (!res.ok) {
    throw new Error(`Overpass API error: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  const elements = json.elements ?? [];

  const features = elements
    .filter(
      (el) =>
        el.type === 'way' &&
        Array.isArray(el.geometry) &&
        el.geometry.length >= 2
    )
    .map((el) => ({
      type: 'Feature',
      properties: {
        highway: el.tags?.highway ?? 'road',
        name: el.tags?.name ?? null,
      },
      geometry: {
        type: 'LineString',
        // Overpass returns {lat, lon}; GeoJSON needs [lng, lat]
        coordinates: el.geometry.map((pt) => [pt.lon, pt.lat]),
      },
    }));

  const geojson = {
    type: 'FeatureCollection',
    features,
  };

  const outDir = join(ROOT, 'public', 'data');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'asuncion-roads.geojson');
  writeFileSync(outPath, JSON.stringify(geojson));

  console.log(`✓ Saved ${features.length} road features to public/data/asuncion-roads.geojson`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
