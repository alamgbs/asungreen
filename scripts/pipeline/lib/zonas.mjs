// Lee la lista de zonas. Fuente preferida: data/zonas/zonas.json (agente 'zonas').
// Si no existe o no se puede interpretar, cae a lib/aois.ts (15 ciudades, rectángulos
// aproximados) y lo avisa por consola; así el pipeline nunca queda bloqueado.
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ZONAS_JSON = join(ROOT, 'data', 'zonas', 'zonas.json');

// nivel → prioridad de cómputo (menor = antes). Cuota de APIs gratuitas limitada: lo más
// visible (país, departamentos, ciudades) se calcula primero; distritos al final.
function prioridad(nivel) {
  const n = String(nivel ?? '').toLowerCase();
  if (/pais|país|adm0|country/.test(n)) return 0;
  if (/depart|adm1/.test(n)) return 1;
  if (/ciudad|city/.test(n)) return 2;
  if (/distr|adm2/.test(n)) return 3;
  return 4;
}

function centroideDe(z) {
  const c = z.centroide ?? z.centroid ?? z.centro;
  if (Array.isArray(c) && c.length >= 2) return { lon: +c[0], lat: +c[1] }; // GeoJSON: [lon, lat]
  if (c && typeof c === 'object') {
    const lon = c.lon ?? c.lng ?? c.longitude, lat = c.lat ?? c.latitude;
    if (lon != null && lat != null) return { lon: +lon, lat: +lat };
  }
  const b = z.bbox; // [oeste, sur, este, norte]
  if (Array.isArray(b) && b.length === 4) return { lon: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2 };
  return null;
}

function desdeAois() {
  const src = readFileSync(join(ROOT, 'lib', 'aois.ts'), 'utf8');
  const out = [];
  for (const m of src.matchAll(/id:\s*'([a-z-]+)'[\s\S]*?label:\s*'([^']+)'[\s\S]*?coordinates:\s*\[\[([\s\S]*?)\]\]/g)) {
    const pts = [...m[3].matchAll(/\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g)].map((p) => [+p[1], +p[2]]);
    const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
    out.push({
      id: `ciudad-${m[1]}`, nombre: m[2], nivel: 'ciudad',
      lon: (Math.min(...lons) + Math.max(...lons)) / 2, lat: (Math.min(...lats) + Math.max(...lats)) / 2,
      prioridad: 2,
    });
  }
  return out;
}

export function cargarZonas() {
  if (existsSync(ZONAS_JSON)) {
    try {
      const raw = JSON.parse(readFileSync(ZONAS_JSON, 'utf8'));
      const lista = Array.isArray(raw) ? raw : (raw.zonas ?? Object.values(raw));
      const zonas = lista.flatMap((z) => {
        const c = centroideDe(z);
        if (!c || !z.id || z.pendiente) return [];
        return [{ id: String(z.id), nombre: z.nombre ?? z.name ?? z.id, nivel: z.nivel ?? '', ...c, prioridad: prioridad(z.nivel) }];
      });
      if (zonas.length) return { zonas: zonas.sort((a, b) => a.prioridad - b.prioridad), origen: 'data/zonas/zonas.json' };
      console.warn('[zonas] zonas.json sin zonas utilizables; uso lib/aois.ts');
    } catch (e) { console.warn('[zonas] no pude leer zonas.json:', e.message); }
  }
  console.warn('[zonas] data/zonas/zonas.json no disponible: uso lista mínima derivada de lib/aois.ts');
  return { zonas: desdeAois(), origen: 'lib/aois.ts (fallback)' };
}
