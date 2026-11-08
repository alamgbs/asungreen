/**
 * Zonas geográficas reales (país → departamento → distrito, y ciudades de referencia).
 * Fuente de datos: data/zonas/zonas.json (generado por scripts/zonas/build-zonas.mjs).
 * Las geometrías para el mapa están en public/zonas/{nivel}.geojson (simplificadas).
 *
 * Seguro para componentes cliente: no incluye geometrías, solo bbox y centroide.
 */
import data from '../data/zonas/zonas.json';

export type NivelZona = 'pais' | 'departamento' | 'distrito' | 'ciudad';

export interface Zona {
  /** Id estable: `PY`, `PY-11`, `PY-11-luque`, `ciudad-madrid`. */
  id: string;
  nivel: NivelZona;
  nombre: string;
  padre: string | null;
  /** [oeste, sur, este, norte] */
  bbox: [number, number, number, number];
  /** Punto representativo, garantizado dentro de la zona. */
  centroide: { lat: number; lng: number };
  area_km2: number;
  pais: string;
  hemisferio: 'S' | 'N';
  /** Ids antiguos (lib/aois.ts) que apuntan a esta zona. */
  aliases?: string[];
  /** true si es una de las ciudades de referencia de la app. */
  ciudadReferencia?: boolean;
  /** Si es un duplicado de otra zona (p. ej. el distrito Asunción = departamento Asunción). */
  duplicaDe?: string;
  /** true = no calcular series ni mostrar (artefacto de la fuente). */
  omitirSeries?: boolean;
  etiquetaCorta?: string;
  zoom?: number;
  nota?: string;
  fuenteGeometria: string;
  licenciaGeometria?: string;
}

/** Zona conocida pero sin geometría fiable todavía (ver data/zonas/reconciliacion.md). */
export interface ZonaPendiente {
  id: string;
  nivel: 'distrito';
  nombre: string;
  padre: string;
  estado: 'pendiente';
  motivo: string;
}

const raw = data as unknown as {
  version: string;
  generado: string;
  fuentes: Record<string, string>;
  zonas: Zona[];
  pendientes: ZonaPendiente[];
};

export const ZONAS_VERSION = raw.version;
export const FUENTES_GEOMETRIA = raw.fuentes;
export const ZONAS: readonly Zona[] = raw.zonas;
export const ZONAS_PENDIENTES: readonly ZonaPendiente[] = raw.pendientes;

export const ZONA_POR_ID: ReadonlyMap<string, Zona> = new Map(ZONAS.map((z) => [z.id, z]));
const POR_ALIAS = new Map(ZONAS.flatMap((z) => (z.aliases ?? []).map((a) => [a, z.id] as const)));

/** Acepta un id canónico o un id antiguo (`asuncion`, `central-py`, `madrid`, …). */
export function resolverZonaId(idOAlias: string | null | undefined): string | null {
  if (!idOAlias) return null;
  if (ZONA_POR_ID.has(idOAlias)) return idOAlias;
  return POR_ALIAS.get(idOAlias) ?? null;
}

export function getZona(id: string | null | undefined): Zona | undefined {
  const r = resolverZonaId(id);
  return r ? ZONA_POR_ID.get(r) : undefined;
}

export const hijosDe = (id: string): Zona[] => ZONAS.filter((z) => z.padre === id);

/** Cadena de ancestros, de la raíz a la zona (inclusive). */
export function ruta(id: string): Zona[] {
  const out: Zona[] = [];
  let z = ZONA_POR_ID.get(id);
  while (z) { out.unshift(z); z = z.padre ? ZONA_POR_ID.get(z.padre) : undefined; }
  return out;
}

export const NIVEL_LABEL: Record<NivelZona, string> = {
  pais: 'País', departamento: 'Departamento', distrito: 'Distrito', ciudad: 'Ciudad',
};

/** Ciudades de referencia (las 15 de la app original). */
export const CIUDADES_REFERENCIA: readonly Zona[] = ZONAS.filter((z) => z.ciudadReferencia);

/** [[oeste, sur], [este, norte]] para `map.fitBounds`. */
export const boundsLngLat = (z: Zona): [[number, number], [number, number]] =>
  [[z.bbox[0], z.bbox[1]], [z.bbox[2], z.bbox[3]]];

export const geojsonUrl = (nivel: NivelZona) => `/zonas/${nivel}.geojson`;

// ───────── búsqueda tilde-insensible ─────────
export function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

// Se excluyen duplicados y artefactos de la fuente de la búsqueda.
const INDICE = ZONAS.filter((z) => !z.omitirSeries && !z.duplicaDe).map((z) => ({ z, n: normalizarTexto(z.nombre) }));

export function buscarZonas(consulta: string, opts: { niveles?: NivelZona[]; limite?: number } = {}): Zona[] {
  const q = normalizarTexto(consulta);
  const limite = opts.limite ?? 8;
  const permitidos = opts.niveles ? new Set(opts.niveles) : null;
  const puntuadas: { z: Zona; p: number }[] = [];
  for (const { z, n } of INDICE) {
    if (permitidos && !permitidos.has(z.nivel)) continue;
    if (!q) { puntuadas.push({ z, p: z.ciudadReferencia ? 1 : z.nivel === 'departamento' ? 2 : 9 }); continue; }
    let p = -1;
    if (n === q) p = 0;
    else if (n.startsWith(q)) p = 1;
    else if (n.split(' ').some((w) => w.startsWith(q))) p = 2;
    else if (n.includes(q)) p = 3;
    if (p >= 0) puntuadas.push({ z, p });
  }
  puntuadas.sort((a, b) => a.p - b.p || a.z.nombre.localeCompare(b.z.nombre, 'es'));
  return puntuadas.slice(0, limite).map((x) => x.z);
}

/** Nivel de zonas interactivas según el zoom del mapa. */
export const ZOOM_DISTRITOS = 8;
