// Lectura/escritura de data/series/{zonaId}.json y manifest.json.
// Formato (FORMATO=1), valores a decimales fijos, nulos EXPLÍCITOS, índices implícitos por posición:
// {
//   "zona": "PY-11", "version": "2026.11.0", "actualizado": "2026-11-08",
//   "indicadores": {
//     "temp-aire": {
//       "mensual": { "inicio": "1991-01", "v": [26.1, null, ...], "n": [31, 28, ...] },   // n = nº de observaciones (días/compuestos)
//       "anual":   { "inicio": 1991,      "v": [23.4, ...],        "n": [365, ...] }
//     }
//   }
// }
// Cada indicador declara su propio "inicio" (no se rellena con nulos hasta el inicio más antiguo).
// La procedencia (fuente, licencia, unidad) vive en manifest.json, no se repite por zona.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './zonas.mjs';
import { PIPELINE_VERSION, FORMATO } from './version.mjs';
import { CATALOGO } from './catalogo.mjs';

export const SERIES_DIR = join(ROOT, 'data', 'series');

// ── aritmética de meses ────────────────────────────────────────────────
export const mesIdx = (y, m) => y * 12 + (m - 1);                 // m: 1..12
export const idxAMes = (i) => ({ y: Math.floor(i / 12), m: (i % 12) + 1 });
export const mesStr = (i) => { const { y, m } = idxAMes(i); return `${y}-${String(m).padStart(2, '0')}`; };
export const parseMes = (s) => mesIdx(+s.slice(0, 4), +s.slice(5, 7));
export const diasEnMes = (i) => { const { y, m } = idxAMes(i); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

export const redondear = (x, d) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

/** Mensual como mapa idx→{v,n} para fusionar con facilidad. */
export function mensualAMapa(m) {
  const map = new Map();
  if (!m) return map;
  const i0 = parseMes(m.inicio);
  m.v.forEach((v, k) => map.set(i0 + k, { v, n: m.n?.[k] ?? null }));
  return map;
}
export function mapaAMensual(map) {
  if (!map.size) return null;
  const ks = [...map.keys()];
  const lo = Math.min(...ks), hi = Math.max(...ks);
  const v = [], n = [];
  for (let i = lo; i <= hi; i++) { const e = map.get(i); v.push(e ? e.v : null); n.push(e ? e.n : 0); }
  return { inicio: mesStr(lo), v, n };
}

/** Anual derivado del mensual: exige `minMeses` meses con valor por año completo. */
export function anualDesdeMensual(mensual, { agregacion, decimales, minMeses = 12 }) {
  if (!mensual) return null;
  const map = mensualAMapa(mensual);
  const porAnio = new Map();
  for (const [i, e] of map) {
    const y = idxAMes(i).y;
    const a = porAnio.get(y) ?? { vals: [], n: 0 };
    if (e.v != null) { a.vals.push(e.v); a.n += e.n ?? 0; }
    porAnio.set(y, a);
  }
  const ys = [...porAnio.keys()];
  if (!ys.length) return null;
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const v = [], n = [];
  for (let y = y0; y <= y1; y++) {
    const a = porAnio.get(y);
    if (!a || a.vals.length < minMeses) { v.push(null); n.push(a?.n ?? 0); continue; }
    const s = a.vals.reduce((p, c) => p + c, 0);
    v.push(redondear(agregacion === 'suma' ? s : s / a.vals.length, decimales));
    n.push(a.n);
  }
  return { inicio: y0, v, n };
}

// ── E/S ────────────────────────────────────────────────────────────────
const archivo = (id) => join(SERIES_DIR, `${id}.json`);

export function leerZona(id) {
  if (!existsSync(archivo(id))) return null;
  const z = JSON.parse(readFileSync(archivo(id), 'utf8'));
  // Versión distinta = fórmulas distintas: no se reutiliza (se reconstruye).
  return z.version === PIPELINE_VERSION ? z : null;
}

export function nuevaZona(id) {
  return { zona: id, version: PIPELINE_VERSION, actualizado: hoy(), indicadores: {} };
}
export const hoy = () => new Date().toISOString().slice(0, 10);

export function escribirZona(z) {
  mkdirSync(SERIES_DIR, { recursive: true });
  z.actualizado = hoy();
  writeFileSync(archivo(z.zona), JSON.stringify(z) + '\n');
}

/** Reglas de calidad mínimas: longitudes coherentes con el inicio y nulos explícitos. */
export function validarZona(z) {
  const errs = [];
  for (const [id, ind] of Object.entries(z.indicadores)) {
    for (const g of ['mensual', 'anual']) {
      const s = ind[g];
      if (!s) continue;
      if (!Array.isArray(s.v) || (s.n && s.n.length !== s.v.length)) errs.push(`${z.zona}/${id}/${g}: largo v≠n`);
      if (s.v.some((x) => x !== null && typeof x !== 'number')) errs.push(`${z.zona}/${id}/${g}: valor no numérico`);
    }
  }
  return errs;
}

function percentil(arr, p) {
  const a = arr.filter((x) => x != null).sort((x, y) => x - y);
  if (!a.length) return null;
  const k = (a.length - 1) * p, f = Math.floor(k), c = Math.ceil(k);
  return a[f] + (a[c] - a[f]) * (k - f);
}

/** Reconstruye manifest.json a partir de lo que hay en data/series. */
export function construirManifest({ zonasEsperadas = [], origenZonas = '', pendientes = {} } = {}) {
  const files = readdirSync(SERIES_DIR).filter((f) => f.endsWith('.json') && f !== 'manifest.json').sort();
  const hash = createHash('sha256');
  const zonas = {};
  const inds = {};
  for (const f of files) {
    const txt = readFileSync(join(SERIES_DIR, f), 'utf8');
    hash.update(f).update(txt);
    const z = JSON.parse(txt);
    zonas[z.zona] = Object.keys(z.indicadores).sort();
    for (const [id, ind] of Object.entries(z.indicadores)) {
      const a = (inds[id] ??= { zonas: 0, vals: [], mDesde: null, mHasta: null, aDesde: null, aHasta: null });
      a.zonas++;
      if (ind.mensual) {
        a.vals.push(...ind.mensual.v);
        const i0 = parseMes(ind.mensual.inicio), i1 = i0 + ind.mensual.v.length - 1;
        // último mes con valor (los nulos finales no cuentan)
        let last = ind.mensual.v.length - 1; while (last >= 0 && ind.mensual.v[last] == null) last--;
        a.mDesde = a.mDesde == null ? i0 : Math.min(a.mDesde, i0);
        if (last >= 0) a.mHasta = a.mHasta == null ? i0 + last : Math.max(a.mHasta, i0 + last);
        void i1;
      }
      if (ind.anual) {
        let last = ind.anual.v.length - 1; while (last >= 0 && ind.anual.v[last] == null) last--;
        a.aDesde = a.aDesde == null ? ind.anual.inicio : Math.min(a.aDesde, ind.anual.inicio);
        if (last >= 0) a.aHasta = a.aHasta == null ? ind.anual.inicio + last : Math.max(a.aHasta, ind.anual.inicio + last);
      }
    }
  }
  const indicadores = {};
  for (const [id, a] of Object.entries(inds)) {
    const c = CATALOGO[id] ?? {};
    indicadores[id] = {
      unidad: c.unidad ?? null, fuente: c.fuente ?? null, url: c.url ?? null, licencia: c.licencia ?? null, nota: c.nota ?? null,
      zonas: a.zonas,
      mensual: a.mDesde == null ? null : { desde: mesStr(a.mDesde), hasta: a.mHasta == null ? null : mesStr(a.mHasta) },
      anual: a.aDesde == null ? null : { desde: a.aDesde, hasta: a.aHasta },
      // p5/p95 sobre TODAS las zonas y meses: rango de leyenda sugerido (por zona se calcula en el cliente)
      p5: redondear(percentil(a.vals, 0.05), 3), p95: redondear(percentil(a.vals, 0.95), 3),
    };
  }
  const faltantes = zonasEsperadas.filter((id) => !zonas[id]);
  const manifest = {
    formato: FORMATO, pipelineVersion: PIPELINE_VERSION, generado: new Date().toISOString(),
    origenZonas, nZonas: files.length, zonasEsperadas: zonasEsperadas.length || null,
    completo: zonasEsperadas.length > 0 && faltantes.length === 0 && Object.keys(pendientes).length === 0,
    pendientes, // { "zona/indicador": "motivo" }
    checksum: hash.digest('hex'),
    indicadores, zonas,
  };
  writeFileSync(join(SERIES_DIR, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  return manifest;
}
