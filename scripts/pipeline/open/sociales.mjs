#!/usr/bin/env node
// Capas sociales con datos abiertos y SIN credenciales (Fase 3: 3.1 población, 3.3 OSM, 3.8 verde por habitante):
//   · WorldPop 2020 (CC BY 4.0): poblacion, densidad-poblacion
//   · OpenStreetMap vía Overpass (ODbL): areas-verdes-osm-ha/-pct, centros-salud-osm, escuelas-osm,
//     paradas-transporte-osm; y (sólo Paraguay, 100 m) pob-800m-{verde,salud,escuela,transporte}
//   · derivado: verde-osm-m2-hab = área verde OSM / población WorldPop
// Cada indicador se guarda como serie ANUAL de un punto (el año del corte): inicio = año, v = [valor].
// Uso: node scripts/pipeline/open/sociales.mjs [--solo-py] [--forzar-osm]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, cargarZonas } from '../lib/zonas.mjs';
import { cargarPoligonos, indiceZonas, indicePuntos, areaAnilloKm2, centroideAnillo } from '../lib/geo.mjs';
import { guardarIndicador, redondear, SERIES_DIR } from '../lib/series-io.mjs';
import { overpass, consulta, CATEGORIAS } from './overpass.mjs';
import { descargar, recorrerPixeles, ISO3, URL_100M, URL_1KM } from './worldpop.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const KM_ACCESO = 0.8; // 800 m en línea recta ≈ 15 min a pie (4,8 km/h) con rodeo de ~1,4 → ~1,15 km de red
const ANIO_POB = 2020;
const ANIO_OSM = new Date().getUTCFullYear();

const zonasJson = JSON.parse(readFileSync(join(ROOT, 'data', 'zonas', 'zonas.json'), 'utf8')).zonas;
const info = new Map(zonasJson.map((z) => [z.id, z]));
const polis = cargarPoligonos();
const polisPY = polis.filter((z) => info.get(z.id)?.pais === 'PY' && z.nivel !== 'ciudad');
const ciudades = polis.filter((z) => z.nivel === 'ciudad');
const idxPY = indiceZonas(polisPY);
const meta = { generado: new Date().toISOString(), worldpop: { anio: ANIO_POB }, osm: {} };

const acc = new Map(); // zonaId → acumuladores
const A = (id) => acc.get(id) ?? acc.set(id, { pop: 0, nPix: 0, cerca: { verde: 0, salud: 0, escuela: 0, transporte: 0 }, verdeKm2: 0, n: { salud: 0, escuela: 0, transporte: 0 }, nVerde: 0 }).get(id);

// ── 1. Población ───────────────────────────────────────────────────────
console.log('[pob] Paraguay 100 m…');
const pixeles = { lon: [], lat: [], pop: [], zonas: [] }; // sólo Paraguay (para acceso a 800 m)
await recorrerPixeles(await descargar(URL_100M('PRY')), (lon, lat, v) => {
  const zs = idxPY(lon, lat);
  if (!zs.length) return;
  pixeles.lon.push(lon); pixeles.lat.push(lat); pixeles.pop.push(v); pixeles.zonas.push(zs.map((z) => z.id));
  for (const z of zs) { const a = A(z.id); a.pop += v; a.nPix++; }
});
console.log(`[pob] PY: ${pixeles.pop.length} píxeles con población; total país ${Math.round(A('PY').pop)}`);
meta.worldpop.pais_total_py = Math.round(A('PY').pop);

if (!args['solo-py']) {
  for (const c of ciudades) {
    const iso2 = info.get(c.id)?.pais, iso3 = ISO3[iso2];
    if (!iso3) { console.warn(`[pob] sin ISO3 para ${c.id}`); continue; }
    const idx = indiceZonas([c], 0.1);
    await recorrerPixeles(await descargar(URL_1KM(iso3)), (lon, lat, v) => { if (idx(lon, lat).length) { const a = A(c.id); a.pop += v; a.nPix++; } }, c.bbox);
    console.log(`[pob] ${c.id}: ${Math.round(A(c.id).pop)} hab (${A(c.id).nPix} píxeles de 1 km)`);
  }
}

// ── 2. OSM ─────────────────────────────────────────────────────────────
/** Une segmentos en anillos por extremos coincidentes. */
function ensamblar(segs) {
  const key = (p) => `${p[0]},${p[1]}`;
  const rest = segs.map((s) => s.slice()), anillos = [];
  while (rest.length) {
    let cur = rest.pop(), cambio = true;
    while (cambio && key(cur[0]) !== key(cur.at(-1))) {
      cambio = false;
      for (let i = 0; i < rest.length; i++) {
        const s = rest[i];
        if (key(s[0]) === key(cur.at(-1))) cur = cur.concat(s.slice(1));
        else if (key(s.at(-1)) === key(cur.at(-1))) cur = cur.concat(s.slice(0, -1).reverse());
        else if (key(s.at(-1)) === key(cur[0])) cur = s.concat(cur.slice(1));
        else if (key(s[0]) === key(cur[0])) cur = s.slice(1).reverse().concat(cur);
        else continue;
        rest.splice(i, 1); cambio = true; break;
      }
    }
    anillos.push(cur);
  }
  return anillos;
}
const cerrado = (r) => r.length > 3 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1];

/** Elemento OSM → { cent:[lon,lat], areaKm2, verts:[[lon,lat],…] } */
function featureVerde(el) {
  if (el.type === 'node') return { cent: [el.lon, el.lat], areaKm2: 0, verts: [[el.lon, el.lat]] };
  let outers = [], inners = [];
  if (el.type === 'way') outers = [el.geometry.map((p) => [p.lon, p.lat])];
  else {
    const m = el.members.filter((x) => x.geometry);
    outers = ensamblar(m.filter((x) => x.role !== 'inner').map((x) => x.geometry.map((p) => [p.lon, p.lat])));
    inners = ensamblar(m.filter((x) => x.role === 'inner').map((x) => x.geometry.map((p) => [p.lon, p.lat])));
  }
  const cierra = outers.filter(cerrado);
  const areaKm2 = Math.max(0, cierra.reduce((s, r) => s + areaAnilloKm2(r), 0) - inners.filter(cerrado).reduce((s, r) => s + areaAnilloKm2(r), 0));
  const verts = outers.flat();
  if (!verts.length) return null;
  const mayor = cierra.sort((a, b) => b.length - a.length)[0];
  return { cent: mayor ? centroideAnillo(mayor) : verts[0], areaKm2, verts };
}
const centro = (el) => (el.center ? [el.center.lon, el.center.lat] : el.lat != null ? [el.lon, el.lat] : null);

const puntosPY = { verde: [], salud: [], escuela: [], transporte: [] };
async function procesarAmbito(clave, ambito, idxZ, esPY) {
  for (const cat of Object.keys(CATEGORIAS)) {
    const j = await overpass(`${clave}-${cat}`, consulta(cat, ambito), { forzar: !!args['forzar-osm'] });
    meta.osm[`${clave}-${cat}`] = { timestamp_osm: j.osm3s?.timestamp_osm_base ?? null, elementos: j.elements.length };
    const vistos = new Set();
    for (const el of j.elements) {
      const id = `${el.type}/${el.id}`; if (vistos.has(id)) continue; vistos.add(id);
      if (cat === 'verde') {
        const f = featureVerde(el); if (!f) continue;
        for (const z of idxZ(f.cent[0], f.cent[1])) { const a = A(z.id); a.verdeKm2 += f.areaKm2; a.nVerde++; }
        if (esPY) for (const v of f.verts) puntosPY.verde.push(v);
      } else {
        const c = centro(el); if (!c) continue;
        for (const z of idxZ(c[0], c[1])) A(z.id).n[cat]++;
        if (esPY) puntosPY[cat].push(c);
      }
    }
    console.log(`[osm] ${clave}/${cat}: ${vistos.size} elementos`);
  }
}
await procesarAmbito('PY', { pais: 'PY' }, (x, y) => idxPY(x, y), true);
if (!args['solo-py']) {
  for (const c of ciudades) {
    const idx = indiceZonas([c], 0.1);
    try { await procesarAmbito(c.id, { bbox: c.bbox }, (x, y) => idx(x, y), false); }
    catch (e) { // Overpass caído/saturado: esa ciudad queda sin indicadores OSM (no se escribe nada), el resto sigue
      console.warn(`[osm] ${c.id} FALLÓ (${e.message.slice(0, 80)}); sin indicadores OSM para esta ciudad`);
      for (const k of Object.keys(meta.osm)) if (k.startsWith(c.id)) delete meta.osm[k];
      const a = A(c.id); a.verdeKm2 = 0; a.nVerde = 0; a.n = { salud: 0, escuela: 0, transporte: 0 };
    }
  }
}

// ── 3. Acceso a ≤ 800 m (Paraguay) ─────────────────────────────────────
for (const cat of Object.keys(puntosPY)) {
  const cerca = indicePuntos(puntosPY[cat]);
  for (let i = 0; i < pixeles.pop.length; i++) {
    if (!cerca(pixeles.lon[i], pixeles.lat[i], KM_ACCESO)) continue;
    for (const id of pixeles.zonas[i]) A(id).cerca[cat] += pixeles.pop[i];
  }
  console.log(`[acceso] ${cat} listo`);
}

// ── 4. Guardar ─────────────────────────────────────────────────────────
const punto = (anio, v, n) => ({ inicio: anio, v: [v], n: [n] });
let escritas = 0;
for (const [id, a] of acc) {
  const area = info.get(id)?.area_km2;
  const tieneOSM = Object.keys(meta.osm).some((k) => k.startsWith(id === 'PY' || info.get(id)?.pais === 'PY' ? 'PY-' : id));
  const put = (ind, anio, v, n) => { guardarIndicador(id, ind, { anual: punto(anio, v, n) }); escritas++; };
  const pop = a.pop > 0 ? Math.round(a.pop) : null;
  put('poblacion', ANIO_POB, pop, a.nPix);
  put('densidad-poblacion', ANIO_POB, pop != null && area ? redondear(pop / area, 1) : null, a.nPix);
  if (!tieneOSM) continue;
  const ha = redondear(a.verdeKm2 * 100, 1);
  put('areas-verdes-osm-ha', ANIO_OSM, ha, a.nVerde);
  put('areas-verdes-osm-pct', ANIO_OSM, area ? redondear((a.verdeKm2 / area) * 100, 2) : null, a.nVerde);
  put('verde-osm-m2-hab', ANIO_OSM, pop ? redondear((a.verdeKm2 * 1e6) / pop, 1) : null, a.nVerde);
  put('centros-salud-osm', ANIO_OSM, a.n.salud, a.n.salud);
  put('escuelas-osm', ANIO_OSM, a.n.escuela, a.n.escuela);
  put('paradas-transporte-osm', ANIO_OSM, a.n.transporte, a.n.transporte);
  if (info.get(id)?.pais === 'PY') {
    for (const cat of ['verde', 'salud', 'escuela', 'transporte']) {
      put(`pob-800m-${cat}`, ANIO_OSM, a.pop > 0 ? redondear((a.cerca[cat] / a.pop) * 100, 1) : null, a.nPix);
    }
  }
}
writeFileSync(join(SERIES_DIR, 'meta-sociales.json'), JSON.stringify(meta, null, 1) + '\n');
console.log(`[sociales] ${acc.size} zonas, ${escritas} series escritas`);
void cargarZonas;
