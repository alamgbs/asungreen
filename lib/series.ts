/**
 * Series precalculadas por zona (las produce scripts/pipeline; ver docs/pipeline.md).
 *
 * Servido: archivos ESTÁTICOS en /series/{zonaId}.json y /series/manifest.json.
 * La fuente canónica y versionada es data/series/; `npm run series:sync` la copia a
 * public/series (se ejecuta solo en predev/prebuild). Elegido sobre un Route Handler
 * porque en Vercel `public/` sale del CDN con compresión y sin invocar funciones; los
 * GET de handlers no se cachean por defecto en Next 16. La URL lleva ?v=<pipelineVersion>
 * para que un cambio de versión nunca mezcle datos viejos del CDN o del navegador.
 */

/** Serie mensual: `v[k]` es el mes `inicio` + k. null = sin dato (explícito, nunca 0). */
export interface SerieMensual { inicio: string; v: (number | null)[]; n: (number | null)[] }
/** Serie anual: `v[k]` es el año `inicio` + k. */
export interface SerieAnual { inicio: number; v: (number | null)[]; n: (number | null)[] }

export interface IndicadorSerie {
  mensual?: SerieMensual | null;
  anual?: SerieAnual | null;
}

export interface ZonaSerie {
  zona: string;
  version: string;
  actualizado: string;
  /** Clave = id de indicador (p. ej. 'temp-aire', 'ndvi'); ver `manifest.indicadores` para fuente/licencia. */
  indicadores: Record<string, IndicadorSerie>;
}

export interface ManifestIndicador {
  unidad: string | null;
  fuente: string | null;
  url: string | null;
  licencia: string | null;
  nota: string | null;
  zonas: number;
  mensual: { desde: string; hasta: string | null } | null;
  anual: { desde: number; hasta: number | null } | null;
  /** p5/p95 sobre todas las zonas y meses (rango de leyenda sugerido). */
  p5: number | null;
  p95: number | null;
}

export interface SeriesManifest {
  formato: number;
  pipelineVersion: string;
  generado: string;
  origenZonas: string;
  nZonas: number;
  zonasEsperadas: number | null;
  completo: boolean;
  /** "zona/indicador" → motivo por el que aún no tiene datos. */
  pendientes: Record<string, string>;
  checksum: string;
  indicadores: Record<string, ManifestIndicador>;
  /** zonaId → ids de indicador disponibles. */
  zonas: Record<string, string[]>;
}

export class SerieVersionError extends Error {}

export interface SeriesOpts {
  /** Prefijo absoluto (necesario si se llama desde el servidor o desde tests). Por defecto: mismo origen. */
  baseUrl?: string;
  signal?: AbortSignal;
}

let manifestP: Promise<SeriesManifest> | null = null;
const zonaCache = new Map<string, Promise<ZonaSerie | null>>();

const base = (o?: SeriesOpts) => `${o?.baseUrl ?? ''}/series`;

export function getManifest(opts?: SeriesOpts): Promise<SeriesManifest> {
  manifestP ??= fetch(`${base(opts)}/manifest.json`, { signal: opts?.signal })
    .then((r) => {
      if (!r.ok) throw new Error(`manifest de series: HTTP ${r.status}`);
      return r.json() as Promise<SeriesManifest>;
    })
    .catch((e) => { manifestP = null; throw e; });
  return manifestP;
}

/** Toda la serie de una zona (todos los indicadores). null si la zona aún no tiene datos. */
export function getZonaSerie(zonaId: string, opts?: SeriesOpts): Promise<ZonaSerie | null> {
  let p = zonaCache.get(zonaId);
  if (!p) {
    p = (async () => {
      const m = await getManifest(opts);
      if (!m.zonas[zonaId]) return null;
      const r = await fetch(`${base(opts)}/${encodeURIComponent(zonaId)}.json?v=${m.pipelineVersion}`, { signal: opts?.signal });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`serie ${zonaId}: HTTP ${r.status}`);
      const z = (await r.json()) as ZonaSerie;
      if (z.version !== m.pipelineVersion) {
        throw new SerieVersionError(`serie ${zonaId} v${z.version} ≠ manifest v${m.pipelineVersion}`);
      }
      return z;
    })();
    p.catch(() => zonaCache.delete(zonaId));
    zonaCache.set(zonaId, p);
  }
  return p;
}

/** Serie de un indicador en una zona; null si la zona o el indicador no existen todavía. */
export async function getSerie(zonaId: string, indicador: string, opts?: SeriesOpts): Promise<IndicadorSerie | null> {
  const z = await getZonaSerie(zonaId, opts);
  return z?.indicadores[indicador] ?? null;
}

// ── Utilidades puras (sin red; fáciles de probar) ────────────────────────

/** Puntos [etiqueta, valor, n] de una serie mensual o anual, con nulos conservados. */
export function puntos(s: SerieMensual | SerieAnual): { t: string; v: number | null; n: number | null }[] {
  const mensual = typeof s.inicio === 'string';
  const [y0, m0] = mensual ? (s.inicio as string).split('-').map(Number) : [s.inicio as number, 1];
  return s.v.map((v, k) => {
    if (!mensual) return { t: String(y0 + k), v, n: s.n[k] ?? null };
    const i = y0 * 12 + (m0 - 1) + k;
    return { t: `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, v, n: s.n[k] ?? null };
  });
}

/** Percentil lineal de los valores no nulos; null si no hay datos. */
export function percentil(v: (number | null)[], p: number): number | null {
  const a = v.filter((x): x is number => x != null).sort((x, y) => x - y);
  if (!a.length) return null;
  const k = (a.length - 1) * p;
  const f = Math.floor(k), c = Math.ceil(k);
  return a[f] + (a[c] - a[f]) * (k - f);
}

/** Rango de leyenda por zona = p5/p95 de la propia serie (reemplaza el value:compute del flujo AOI). */
export function rangoSerie(s: SerieMensual | SerieAnual): [number, number] | null {
  const lo = percentil(s.v, 0.05), hi = percentil(s.v, 0.95);
  return lo == null || hi == null || lo === hi ? null : [lo, hi];
}
