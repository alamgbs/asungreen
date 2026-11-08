// Descarga el límite administrativo municipal de las ciudades de referencia
// extranjeras desde OpenStreetMap (Nominatim, polygon_geojson). Datos © OpenStreetMap
// contributors (ODbL). Respeta la política de uso: 1 petición/s y User-Agent propio.
// Guarda data/zonas/raw/osm-<id>.json con la respuesta elegida + metadatos.
// Uso: node scripts/zonas/fetch-osm-cities.mjs [--force]
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const RAW = path.resolve('data/zonas/raw');
const force = process.argv.includes('--force');
const UA = 'AsunGreen-zonas/1.0 (proyecto ambiental open source; limites municipales)';
const exists = (p) => access(p).then(() => true, () => false);

// id legado (lib/aois.ts) → consulta estructurada
export const CIUDADES = [
  { id: 'buenos-aires', q: { city: 'Buenos Aires', country: 'Argentina' } },
  { id: 'rio',          q: { city: 'Rio de Janeiro', country: 'Brazil' } },
  { id: 'madrid',       q: { city: 'Madrid', country: 'Spain' } },
  { id: 'barcelona',    q: { city: 'Barcelona', country: 'Spain' } },
  { id: 'new-york',     q: { city: 'New York', country: 'United States' } },
  { id: 'panama',       q: { county: 'Distrito de Panamá', country: 'Panama' } },
  { id: 'mexico-df',    q: { city: 'Ciudad de México', country: 'Mexico' } },
  { id: 'paris',        q: { city: 'Paris', country: 'France' } },
  { id: 'heidelberg',   q: { city: 'Heidelberg', country: 'Germany' } },
  { id: 'berlin',       q: { city: 'Berlin', country: 'Germany' } },
  { id: 'roma',         q: { city: 'Roma', country: 'Italy' } },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await mkdir(RAW, { recursive: true });

for (const c of CIUDADES) {
  const file = path.join(RAW, `osm-${c.id}.json`);
  if (!force && await exists(file)) { console.log(`= ${c.id}`); continue; }
  const p = new URLSearchParams({
    ...c.q, format: 'jsonv2', polygon_geojson: '1', polygon_threshold: '0.0003',
    limit: '5', addressdetails: '1', 'accept-language': 'es',
  });
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${p}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) { console.warn(`${c.id}: HTTP ${r.status}`); await sleep(1500); continue; }
  const res = await r.json();
  // Solo límites administrativos con polígono.
  const cand = res.filter((x) => x.category === 'boundary' && x.type === 'administrative'
    && x.geojson && /Polygon/.test(x.geojson.type));
  console.log(c.id, '→', res.map((x) => `${x.osm_type}/${x.osm_id} ${x.category}:${x.type} ${x.addresstype} "${x.display_name.slice(0, 60)}"`));
  if (!cand.length) { console.warn(`  sin candidato para ${c.id}`); await sleep(1500); continue; }
  const pick = cand[0];
  await writeFile(file, JSON.stringify({
    id: c.id, consulta: c.q, osm_type: pick.osm_type, osm_id: pick.osm_id,
    display_name: pick.display_name, addresstype: pick.addresstype,
    licencia: 'ODbL 1.0 © OpenStreetMap contributors', fecha_consulta: new Date().toISOString().slice(0, 10),
    geometry: pick.geojson,
  }));
  await sleep(1500);
}
