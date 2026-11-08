// Cliente Overpass (OSM) con caché en disco, UA identificable (la política de OSM lo exige; sin UA el
// servidor responde 406), reintentos y espejos. Datos © OpenStreetMap contributors, ODbL 1.0.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sleep } from '../lib/http.mjs';
import { ROOT } from '../lib/zonas.mjs';

const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const UA = 'AsuGreen-pipeline/1.0 (open-data research; github.com/asugreen)';
export const CACHE_OSM = join(ROOT, 'scripts', 'pipeline', '.cache', 'osm');
const TTL_DIAS = 30;

/** Ejecuta una consulta; `clave` nombra el archivo de caché. Devuelve el JSON de Overpass. */
export async function overpass(clave, ql, { forzar = false } = {}) {
  mkdirSync(CACHE_OSM, { recursive: true });
  const f = join(CACHE_OSM, `${clave}.json`);
  if (!forzar && existsSync(f)) {
    const j = JSON.parse(readFileSync(f, 'utf8'));
    if (Date.now() - Date.parse(j._descargado) < TTL_DIAS * 864e5) return j;
  }
  let ultimo;
  for (let intento = 0; intento < 6; intento++) {
    const url = MIRRORS[intento % MIRRORS.length];
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: `[out:json][timeout:300];${ql}` }), signal: AbortSignal.timeout(330000),
      });
      const txt = await res.text();
      if (res.ok) {
        const j = JSON.parse(txt); j._descargado = new Date().toISOString();
        if (j.remark && /error|timed out|out of memory/i.test(j.remark)) throw new Error(`overpass remark: ${j.remark}`);
        writeFileSync(f, JSON.stringify(j));
        await sleep(5000); // cortesía entre consultas
        return j;
      }
      ultimo = new Error(`Overpass ${res.status}: ${txt.slice(0, 120)}`);
      await sleep(res.status === 429 ? 60000 : 20000);
    } catch (e) { ultimo = e; await sleep(15000 * (intento + 1)); }
  }
  throw ultimo;
}

const AREA_PY = 'area["ISO3166-1"="PY"]->.a;';
/** Categorías. `salida`: 'geom' (necesita polígono) o 'center'. */
export const CATEGORIAS = {
  verde: {
    salida: 'geom',
    sel: ['"leisure"~"^(park|playground|common)$"', '"landuse"~"^(recreation_ground|village_green)$"'],
  },
  salud: { salida: 'center', sel: ['"amenity"~"^(hospital|clinic|doctors)$"', '"healthcare"~"^(hospital|clinic|centre)$"'] },
  escuela: { salida: 'center', sel: ['"amenity"~"^(school|kindergarten)$"'] },
  transporte: {
    salida: 'center',
    sel: ['"highway"="bus_stop"', '"railway"~"^(station|halt|tram_stop)$"', '"public_transport"="station"'],
  },
};

/** ámbito: { pais:'PY' } o { bbox:[w,s,e,n] } */
export function consulta(cat, ambito) {
  const c = CATEGORIAS[cat];
  const filtro = ambito.pais ? '(area.a)' : `(${ambito.bbox[1]},${ambito.bbox[0]},${ambito.bbox[3]},${ambito.bbox[2]})`;
  const pre = ambito.pais ? AREA_PY : '';
  return `${pre}(${c.sel.map((s) => `nwr[${s}]${filtro};`).join('')});out ${c.salida === 'geom' ? 'geom' : 'center'} qt;`;
}
