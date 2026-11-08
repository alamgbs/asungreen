// Utilidades geométricas sin dependencias: point-in-polygon con índice por celdas, áreas y distancias.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './zonas.mjs';

const R = 6371.0088, RAD = Math.PI / 180;

/** Distancia aproximada (km), plano local equirectangular: error <0,3 % a estas escalas. */
export const distKm = (lat1, lon1, lat2, lon2) => {
  const x = (lon2 - lon1) * RAD * Math.cos(((lat1 + lat2) / 2) * RAD), y = (lat2 - lat1) * RAD;
  return R * Math.hypot(x, y);
};

export function areaAnilloKm2(ring) { // esférica simple; ring [[lon,lat],…]
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
    s += (x2 - x1) * RAD * (2 + Math.sin(y1 * RAD) + Math.sin(y2 * RAD));
  }
  return Math.abs((s * R * R) / 2);
}

export function centroideAnillo(ring) {
  let a = 0, cx = 0, cy = 0;
  const k = Math.cos(ring[0][1] * RAD);
  for (let i = 0; i < ring.length - 1; i++) {
    const x1 = ring[i][0] * k, y1 = ring[i][1], x2 = ring[i + 1][0] * k, y2 = ring[i + 1][1];
    const cr = x1 * y2 - x2 * y1; a += cr / 2; cx += (x1 + x2) * cr; cy += (y1 + y2) * cr;
  }
  if (Math.abs(a) < 1e-12) return ring[0];
  return [cx / (6 * a) / k, cy / (6 * a)];
}

function enAnillo(x, y, r) {
  let d = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

/** Zona = { id, nivel, bbox:[w,s,e,n], polys:[[outer,…holes],…] } */
export function enZona(x, y, z) {
  const b = z.bbox;
  if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
  for (const p of z.polys) if (enAnillo(x, y, p[0]) && !p.slice(1).some((h) => enAnillo(x, y, h))) return true;
  return false;
}

/** Lee public/zonas/{nivel}.geojson → zonas con bbox y polys. */
export function cargarPoligonos(niveles = ['pais', 'departamento', 'distrito', 'ciudad']) {
  const out = [];
  for (const nivel of niveles) {
    const f = join(ROOT, 'public', 'zonas', `${nivel}.geojson`);
    if (!existsSync(f)) continue;
    for (const ft of JSON.parse(readFileSync(f, 'utf8')).features) {
      const g = ft.geometry;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      let w = 180, s = 90, e = -180, n = -90;
      for (const p of polys) for (const [x, y] of p[0]) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
      out.push({ id: ft.properties.id, nivel, nombre: ft.properties.nombre, bbox: [w, s, e, n], polys });
    }
  }
  return out;
}

/** Índice en celdas de `paso` grados: devuelve f(x,y) → zonas que contienen el punto. */
export function indiceZonas(zonas, paso = 0.25) {
  const celdas = new Map();
  for (const z of zonas) {
    for (let i = Math.floor(z.bbox[0] / paso); i <= Math.floor(z.bbox[2] / paso); i++)
      for (let j = Math.floor(z.bbox[1] / paso); j <= Math.floor(z.bbox[3] / paso); j++) {
        const k = `${i},${j}`; (celdas.get(k) ?? celdas.set(k, []).get(k)).push(z);
      }
  }
  return (x, y) => (celdas.get(`${Math.floor(x / paso)},${Math.floor(y / paso)}`) ?? []).filter((z) => enZona(x, y, z));
}

/** Índice de puntos para "¿hay alguno a ≤ km?" (celdas de 0,01° ≈ 1,1 km). */
export function indicePuntos(puntos /* [[lon,lat],…] */) {
  const H = 0.01, m = new Map();
  for (const p of puntos) {
    const k = `${Math.floor(p[0] / H)},${Math.floor(p[1] / H)}`;
    (m.get(k) ?? m.set(k, []).get(k)).push(p);
  }
  return (lon, lat, km) => {
    const r = Math.ceil(km / (111 * H * Math.max(0.2, Math.cos(lat * RAD))));
    const ry = Math.ceil(km / (111 * H));
    const i0 = Math.floor(lon / H), j0 = Math.floor(lat / H);
    for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - ry; j <= j0 + ry; j++) {
      const c = m.get(`${i},${j}`); if (!c) continue;
      for (const p of c) if (distKm(lat, lon, p[1], p[0]) <= km) return true;
    }
    return false;
  };
}
