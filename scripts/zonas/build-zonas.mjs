// Construye data/zonas/zonas.json y public/zonas/{pais,departamento,distrito,ciudad}.geojson
// a partir de data/zonas/raw/ (ver fetch-boundaries.mjs y fetch-osm-cities.mjs).
//
// Uso: node scripts/zonas/build-zonas.mjs
// Variables: MAPSHAPER (comando, por defecto "npx --yes mapshaper")
//
// Decisiones (detalle en docs/zonas.md):
//  - Jerarquía: PY (país) → departamentos (ADM1, incl. Asunción) → distritos (ADM2).
//  - Los distrito→departamento se asignan por voto de puntos interiores (geoBoundaries ADM2 no trae padre).
//  - Ciudades de referencia de Paraguay NO se duplican: Asunción = PY-ASU, Encarnación y
//    Ciudad del Este = su distrito; llevan `ciudadReferencia` y `aliases` con el id legado.
//  - Ciudades extranjeras (nivel "ciudad") = límite municipal de OSM.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const RAW = path.resolve('data/zonas/raw');
const OUT_PUB = path.resolve('public/zonas');
const OUT_DATA = path.resolve('data/zonas');
const MAPSHAPER = (process.env.MAPSHAPER || 'npx --yes mapshaper').split(' ');
const TMP = path.resolve('data/zonas/raw/tmp');
const readJson = async (f) => JSON.parse(await readFile(path.join(RAW, f), 'utf8'));

// ───────── geometría ─────────
const R = 6371.0088; // km
const rad = Math.PI / 180;
const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

function ringAreaKm2(ring) {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
    s += (x2 - x1) * rad * (2 + Math.sin(y1 * rad) + Math.sin(y2 * rad));
  }
  return Math.abs((s * R * R) / 2);
}
const polyAreaKm2 = (p) => p.reduce((a, r, i) => a + (i === 0 ? ringAreaKm2(r) : -ringAreaKm2(r)), 0);
const areaKm2 = (g) => polys(g).reduce((a, p) => a + polyAreaKm2(p), 0);

function bbox(g) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const p of polys(g)) for (const [x, y] of p[0]) {
    if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
  }
  return [w, s, e, n];
}
function inRing(x, y, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const inPoly = (x, y, p) => inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h));
const inGeom = (x, y, g) => polys(g).some((p) => inPoly(x, y, p));

/** Puntos interiores de rejilla dentro de la geometría (para votar el padre y para el centroide). */
function interiorPoints(g, n = 14) {
  const [w, s, e, nn] = bbox(g);
  const pts = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = w + ((i + 0.5) / n) * (e - w), y = s + ((j + 0.5) / n) * (nn - s);
    if (inGeom(x, y, g)) pts.push([x, y]);
  }
  return pts;
}
/** Centroide ponderado por área; si cae fuera, el punto interior más cercano. */
function representativePoint(g) {
  const lat0 = (bbox(g)[1] + bbox(g)[3]) / 2, k = Math.cos(lat0 * rad);
  let A = 0, cx = 0, cy = 0;
  for (const p of polys(g)) p.forEach((ring, idx) => {
    const sign = idx === 0 ? 1 : -1;
    for (let i = 0; i < ring.length - 1; i++) {
      const x1 = ring[i][0] * k, y1 = ring[i][1], x2 = ring[i + 1][0] * k, y2 = ring[i + 1][1];
      const cr = x1 * y2 - x2 * y1;
      A += sign * cr / 2; cx += sign * (x1 + x2) * cr; cy += sign * (y1 + y2) * cr;
    }
  });
  let lng = cx / (6 * A) / k, lat = cy / (6 * A);
  if (Number.isFinite(lng) && inGeom(lng, lat, g)) return [lng, lat];
  const pts = interiorPoints(g, 24);
  pts.sort((a, b) => ((a[0] - lng) ** 2 + (a[1] - lat) ** 2) - ((b[0] - lng) ** 2 + (b[1] - lat) ** 2));
  return pts[0] ?? [lng, lat];
}

// ───────── nombres ─────────
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/ñ/g, 'n').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function prettyName(s) {
  const t = s.trim().toLowerCase().split(/\s+/).map((w, i) =>
    (i > 0 && ['de', 'del', 'la', 'las', 'los', 'y', 'e', 'el'].includes(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1));
  return t.join(' ');
}
// geoBoundaries ADM1 viene en MAYÚSCULAS sin tildes: nombres oficiales de los departamentos.
const DEPTO_NOMBRE = {
  'PY-ASU': 'Asunción', 'PY-1': 'Concepción', 'PY-2': 'San Pedro', 'PY-3': 'Cordillera', 'PY-4': 'Guairá',
  'PY-5': 'Caaguazú', 'PY-6': 'Caazapá', 'PY-7': 'Itapúa', 'PY-8': 'Misiones', 'PY-9': 'Paraguarí',
  'PY-10': 'Alto Paraná', 'PY-11': 'Central', 'PY-12': 'Ñeembucú', 'PY-13': 'Amambay', 'PY-14': 'Canindeyú',
  'PY-15': 'Presidente Hayes', 'PY-16': 'Alto Paraguay', 'PY-19': 'Boquerón',
};

// Ciudades de referencia de la app (ids legados de lib/aois.ts).
const LEGADO = {
  asuncion:      { label: 'Asunción',         short: 'ASU',     hemi: 'S', zoom: 12, py: 'PY-ASU' },
  'central-py':  { label: 'Depto. Central',   short: 'CENTRAL', hemi: 'S', zoom: 10, py: 'PY-11' },
  encarnacion:   { label: 'Encarnación',      short: 'ENCARN.', hemi: 'S', zoom: 13, pyDistrito: ['PY-7', 'encarnacion'] },
  cde:           { label: 'Ciudad del Este',  short: 'CDE',     hemi: 'S', zoom: 13, pyDistrito: ['PY-10', 'ciudad-del-este'] },
  'buenos-aires':{ label: 'Buenos Aires',     short: 'BUE.AIR', hemi: 'S', zoom: 11, osm: true, pais: 'AR' },
  rio:           { label: 'Río de Janeiro',   short: 'RIO',     hemi: 'S', zoom: 11, osm: true, pais: 'BR' },
  madrid:        { label: 'Madrid',           short: 'MADRID',  hemi: 'N', zoom: 11, osm: true, pais: 'ES' },
  barcelona:     { label: 'Barcelona',        short: 'BARNA',   hemi: 'N', zoom: 12, osm: true, pais: 'ES' },
  'new-york':    { label: 'New York',         short: 'NYC',     hemi: 'N', zoom: 11, osm: true, pais: 'US' },
  panama:        { label: 'Panamá (distrito)',short: 'PANAMA',  hemi: 'N', zoom: 12, osm: true, pais: 'PA' },
  'mexico-df':   { label: 'Ciudad de México', short: 'MEX.DF',  hemi: 'N', zoom: 11, osm: true, pais: 'MX' },
  paris:         { label: 'París',            short: 'PARIS',   hemi: 'N', zoom: 12, osm: true, pais: 'FR' },
  heidelberg:    { label: 'Heidelberg',       short: 'HEIDELB', hemi: 'N', zoom: 13, osm: true, pais: 'DE' },
  berlin:        { label: 'Berlín',           short: 'BERLIN',  hemi: 'N', zoom: 11, osm: true, pais: 'DE' },
  roma:          { label: 'Roma',             short: 'ROMA',    hemi: 'N', zoom: 12, osm: true, pais: 'IT' },
};

const round = (n, d) => Number(n.toFixed(d));
const zonas = [];     // índice
const feats = { pais: [], departamento: [], distrito: [], ciudad: [] };
const full = new Map(); // id → geometría original (sin simplificar)

function addZona({ id, nivel, nombre, padre, geometry, extra = {} }) {
  const [w, s, e, n] = bbox(geometry);
  const [lng, lat] = representativePoint(geometry);
  zonas.push({
    id, nivel, nombre, padre,
    bbox: [round(w, 4), round(s, 4), round(e, 4), round(n, 4)],
    centroide: { lat: round(lat, 4), lng: round(lng, 4) },
    area_km2: round(areaKm2(geometry), 1),
    ...extra,
  });
  full.set(id, geometry);
  feats[nivel].push({ type: 'Feature', properties: { id, nombre, nivel, padre }, geometry });
}

// ───────── Paraguay ─────────
const adm0 = (await readJson('PRY-ADM0.geojson')).features;
const adm1 = (await readJson('PRY-ADM1.geojson')).features;
const adm2 = (await readJson('PRY-ADM2.geojson')).features;
const meta = await readJson('metadata.json');
const fuentePY = (adm) => ({ fuenteGeometria: `geoboundaries-${adm.toLowerCase()}` });

addZona({ id: 'PY', nivel: 'pais', nombre: 'Paraguay', padre: null, geometry: adm0[0].geometry,
  extra: { pais: 'PY', ...fuentePY('ADM0') } });

const deptoGeom = new Map();
for (const f of adm1) {
  const iso = f.properties.shapeISO;
  const id = iso; // "PY-11", "PY-ASU"
  const nombre = DEPTO_NOMBRE[iso] ?? prettyName(f.properties.shapeName);
  deptoGeom.set(id, f.geometry);
  const alias = id === 'PY-ASU' ? ['asuncion'] : id === 'PY-11' ? ['central-py'] : [];
  addZona({ id, nivel: 'departamento', nombre, padre: 'PY', geometry: f.geometry,
    extra: { pais: 'PY', ...(alias.length ? { aliases: alias, ciudadReferencia: true } : {}),
      ...(id === 'PY-ASU' ? { nota: 'Capital: se modela como departamento; no se duplica como ciudad.' } : {}), ...fuentePY('ADM1') } });
}

// distritos: padre por voto de puntos interiores
const usados = new Map();
const sinPadre = [];
const slugsRepetidos = [];
for (const f of adm2) {
  const g = f.geometry;
  const pts = interiorPoints(g, 10);
  if (!pts.length) pts.push(representativePoint(g));
  const votos = new Map();
  for (const [x, y] of pts) for (const [id, dg] of deptoGeom) {
    const [w, s, e, n] = bbox(dg);
    if (x < w || x > e || y < s || y > n) continue;
    if (inGeom(x, y, dg)) { votos.set(id, (votos.get(id) ?? 0) + 1); break; }
  }
  const padre = [...votos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!padre) { sinPadre.push(f.properties.shapeName); continue; }
  let nombre = prettyName(f.properties.shapeName);
  let sl = slug(f.properties.shapeName), id = `${padre}-${sl}`;
  if (usados.has(id)) { slugsRepetidos.push(id); id = `${id}-${usados.get(id) + 1}`; usados.set(`${padre}-${sl}`, usados.get(`${padre}-${sl}`) + 1); }
  else usados.set(id, 1);
  const leg = Object.entries(LEGADO).find(([, v]) => v.pyDistrito && v.pyDistrito[0] === padre && v.pyDistrito[1] === sl);
  if (leg) nombre = LEGADO[leg[0]].label; // geoBoundaries trae "Encarnacion" sin tilde
  addZona({ id, nivel: 'distrito', nombre, padre, geometry: g,
    extra: { pais: 'PY',
      ...(f.geometry && areaKm2(g) < 1 ? { omitirSeries: true, nota: 'Polígono diminuto (<1 km²) con nombre repetido dentro de otro distrito: probable artefacto de geoBoundaries. Excluir de series y de la UI.' } : {}),
      ...(padre === 'PY-ASU' ? { duplicaDe: 'PY-ASU', nota: 'Mismo territorio que el departamento Capital; no calcular series dos veces.' } : {}),
      ...(leg ? { aliases: [leg[0]], ciudadReferencia: true } : {}),
      ...(votos.size > 1 ? { nota: 'El distrito cruza el límite departamental en la fuente; padre por mayoría de puntos.' } : {}),
      ...fuentePY('ADM2') } });
}

// ───────── ciudades extranjeras (OSM) ─────────
for (const [legacy, v] of Object.entries(LEGADO)) {
  if (!v.osm) continue;
  const o = await readJson(`osm-${legacy}.json`);
  addZona({ id: `ciudad-${legacy}`, nivel: 'ciudad', nombre: v.label, padre: null, geometry: o.geometry,
    extra: { pais: v.pais, aliases: [legacy], ciudadReferencia: true,
      fuenteGeometria: `OpenStreetMap ${o.osm_type}/${o.osm_id} (${o.addresstype}), consultado ${o.fecha_consulta}`,
      licenciaGeometria: 'ODbL 1.0' } });
}

// metadatos comunes + hemisferio
for (const z of zonas) {
  z.hemisferio = z.centroide.lat < 0 ? 'S' : 'N';
  const leg = z.aliases?.map((a) => LEGADO[a]).find(Boolean);
  if (leg) { z.etiquetaCorta = leg.short; z.zoom = leg.zoom; if (leg.label) z.nombreCorto = leg.label; }
}

// ───────── reconciliación básica / validaciones ─────────
const areaSum = (nivel) => zonas.filter((z) => z.nivel === nivel).reduce((a, z) => a + z.area_km2, 0);
const informe = {
  generado: new Date().toISOString().slice(0, 10),
  conteo: Object.fromEntries(['pais', 'departamento', 'distrito', 'ciudad'].map((n) => [n, zonas.filter((z) => z.nivel === n).length])),
  area_pais_km2: round(areaSum('pais'), 0), area_departamentos_km2: round(areaSum('departamento'), 0),
  area_distritos_km2: round(areaSum('distrito'), 0),
  distritos_sin_padre: sinPadre,
  poligonos_diminutos_omitidos: zonas.filter((z) => z.omitirSeries).map((z) => z.id), ids_repetidos_resueltos: slugsRepetidos,
  distritos_cruzan_depto: zonas.filter((z) => z.nota?.startsWith('El distrito cruza')).map((z) => z.id),
  homonimos: (() => { const c = {}; zonas.filter((z) => z.nivel === 'distrito').forEach((z) => { (c[z.nombre] ??= []).push(z.id); });
    return Object.fromEntries(Object.entries(c).filter(([, v]) => v.length > 1)); })(),
};
// auto-intersección burda: anillos con <4 puntos o área 0
informe.geometrias_invalidas = zonas.filter((z) => !(z.area_km2 > 0)).map((z) => z.id);
// conteo de distritos por departamento
informe.distritos_por_departamento = Object.fromEntries(
  zonas.filter((z) => z.nivel === 'departamento').map((d) => [d.id, zonas.filter((z) => z.padre === d.id).length]));

// ───────── escritura + simplificación ─────────
await mkdir(OUT_PUB, { recursive: true }); await mkdir(TMP, { recursive: true });
const sizeMB = async (f) => (await stat(f)).size / 1e6;

// objetivo: < 1,5 MB por nivel. Se prueba una lista de porcentajes de Visvalingam hasta cumplirlo.
const PCTS = { pais: [100, 20, 5], departamento: [20, 10, 5, 3], distrito: [10, 5, 3, 2, 1.5, 1], ciudad: [30, 20, 10, 5] };
const tamanos = {};
for (const nivel of Object.keys(feats)) {
  const src = path.join(TMP, `${nivel}.geojson`), dst = path.join(OUT_PUB, `${nivel}.geojson`);
  await writeFile(src, JSON.stringify({ type: 'FeatureCollection', features: feats[nivel] }));
  for (const pct of PCTS[nivel]) {
    execFileSync(MAPSHAPER[0], [...MAPSHAPER.slice(1), src, '-simplify', 'visvalingam', `${pct}%`, 'keep-shapes',
      '-o', dst, 'format=geojson', 'precision=0.0001', 'force'], { stdio: 'pipe' });
    const mb = await sizeMB(dst);
    tamanos[nivel] = { porcentaje_vertices: pct, mb: round(mb, 3) };
    if (mb < 1.5) break;
  }
  console.log(nivel, tamanos[nivel]);
}
informe.tamanos_public = tamanos;

// Geometrías de los AOI legados (para lib/aois.ts y /api/gee-map): muy simplificadas para ir inline a GEE.
const aoiFeats = [];
for (const legacy of Object.keys(LEGADO)) {
  const z = zonas.find((x) => x.aliases?.includes(legacy));
  aoiFeats.push({ type: 'Feature', properties: { id: legacy, zona: z.id }, geometry: full.get(z.id) });
}
const aoiSrc = path.join(TMP, 'aois.geojson'), aoiDst = path.join(TMP, 'aois-s.geojson');
await writeFile(aoiSrc, JSON.stringify({ type: 'FeatureCollection', features: aoiFeats }));
let aoiBytes = 0;
for (const pct of [100, 60, 40, 25, 15, 10, 6, 3]) {
  execFileSync(MAPSHAPER[0], [...MAPSHAPER.slice(1), aoiSrc, '-simplify', 'visvalingam', `${pct}%`, 'keep-shapes',
    '-o', aoiDst, 'format=geojson', 'precision=0.0001', 'force'], { stdio: 'pipe' });
  aoiBytes = (await stat(aoiDst)).size;
  if (aoiBytes < 100_000) break;
}
const aoiOut = JSON.parse(await readFile(aoiDst, 'utf8'));
const aoiGeoms = {};
for (const f of aoiOut.features) aoiGeoms[f.properties.id] = f.geometry;
await writeFile(path.join(OUT_DATA, 'aoi-geometrias.json'), JSON.stringify(aoiGeoms));
informe.aoi_geometrias_bytes = aoiBytes;

await writeFile(path.join(OUT_DATA, 'zonas.json'), JSON.stringify({
  version: '2026.11.0', generado: informe.generado,
  niveles: ['pais', 'departamento', 'distrito', 'ciudad'],
  fuentes: {
    'geoboundaries-adm0': `geoBoundaries gbOpen PRY ADM0 (CC BY 4.0), fuente ${meta['PRY-ADM0'].source}, año ${meta['PRY-ADM0'].yearRepresented}`,
    'geoboundaries-adm1': `geoBoundaries gbOpen PRY ADM1 (CC BY 4.0), fuente ${meta['PRY-ADM1'].source}, año ${meta['PRY-ADM1'].yearRepresented}`,
    'geoboundaries-adm2': `geoBoundaries gbOpen PRY ADM2 (CC BY 4.0), fuente ${meta['PRY-ADM2'].source}, año ${meta['PRY-ADM2'].yearRepresented}`,
    osm: 'OpenStreetMap vía Nominatim (ODbL 1.0, © OpenStreetMap contributors); ver fuenteGeometria de cada ciudad',
  },
  zonas,
}, null, 1));
await writeFile(path.join(OUT_DATA, 'reconciliacion.json'), JSON.stringify(informe, null, 2));
console.log(JSON.stringify(informe, null, 1).slice(0, 2500));
