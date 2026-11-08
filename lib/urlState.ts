/**
 * Estado compartible del mapa en la query string.
 * Claves: zona, layers, years, seasons, hour, lat, lng, z.
 * `aoi` se sigue ACEPTANDO al leer (enlaces viejos y /reportes: `?aoi=asuncion`); al escribir se usa `zona`.
 * Ambas aceptan ids de zona (`PY-11-luque`) o ids antiguos (`asuncion`, `madrid`).
 */
import type { LayerType } from './types';
import { resolverZonaId } from './zonas';
import { INITIAL_VIEW_STATE } from './constants';

export interface MapUrlState {
  /** Id canónico de zona (lib/zonas.ts) o null = global. */
  zona: string | null;
  layers: Record<LayerType, boolean>;
  years: number[];
  seasons: string[];
  hour: number;
  view: { lat: number; lng: number; zoom: number };
  /** true si la URL traía lat/lng/z explícitos (no hay que auto-encuadrar el AOI). */
  hasView: boolean;
}

export const SEASON_IDS = ['spring', 'summer', 'autumn', 'winter'] as const;
const LAYER_IDS: LayerType[] = ['soilTemp', 'traffic', 'ndvi'];
const MIN_YEAR = 2013;

export const DEFAULT_LAYERS: Record<LayerType, boolean> = {
  soilTemp: true,
  traffic: false, // simulación: apagada por defecto
  ndvi: false,
};

export function currentSeason(): string {
  const m = new Date().getMonth() + 1;
  if (m >= 9 && m <= 11) return 'spring';
  if (m === 12 || m <= 2) return 'summer';
  if (m >= 3 && m <= 5) return 'autumn';
  return 'winter';
}

export function defaultMapState(): MapUrlState {
  return {
    zona: null,
    layers: { ...DEFAULT_LAYERS },
    years: [new Date().getFullYear()],
    seasons: [currentSeason()],
    hour: 8,
    view: {
      lat: INITIAL_VIEW_STATE.latitude,
      lng: INITIAL_VIEW_STATE.longitude,
      zoom: INITIAL_VIEW_STATE.zoom,
    },
    hasView: false,
  };
}

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function get(p: Params, key: string): string | undefined {
  if (p instanceof URLSearchParams) return p.get(key) ?? undefined;
  const v = p[key];
  return Array.isArray(v) ? v[0] : v;
}

const num = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Parsea y valida; todo lo inválido cae al valor por defecto. */
export function parseMapState(p: Params): MapUrlState {
  const s = defaultMapState();

  s.zona = resolverZonaId(get(p, 'zona')) ?? resolverZonaId(get(p, 'aoi'));

  const layers = get(p, 'layers');
  if (layers !== undefined) {
    const wanted = layers.split(',').filter((l): l is LayerType => LAYER_IDS.includes(l as LayerType));
    // `layers=` vacío o sin ids válidos → conserva los defaults
    if (wanted.length) {
      s.layers = { soilTemp: false, traffic: false, ndvi: false };
      wanted.forEach((l) => { s.layers[l] = true; });
    }
  }

  const maxYear = new Date().getFullYear();
  const years = (get(p, 'years') ?? '')
    .split(',').map(Number)
    .filter((y) => Number.isInteger(y) && y >= MIN_YEAR && y <= maxYear);
  if (years.length) s.years = [...new Set(years)].sort((a, b) => b - a);

  const seasons = (get(p, 'seasons') ?? '')
    .split(',').filter((x) => (SEASON_IDS as readonly string[]).includes(x));
  if (seasons.length) s.seasons = [...new Set(seasons)];

  const hour = num(get(p, 'hour'));
  if (hour !== null && Number.isInteger(hour) && hour >= 0 && hour <= 23) s.hour = hour;

  const lat = num(get(p, 'lat'));
  const lng = num(get(p, 'lng'));
  const z = num(get(p, 'z'));
  if (lat !== null && lng !== null && Math.abs(lat) <= 85 && Math.abs(lng) <= 180) {
    s.view = { lat, lng, zoom: z !== null && z >= 0 && z <= 22 ? z : s.view.zoom };
    s.hasView = true;
  }
  return s;
}

const sameSet = (a: (string | number)[], b: (string | number)[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/** Query string (sin '?') con solo lo que difiere de los valores por defecto. */
export function serializeMapState(st: Omit<MapUrlState, 'hasView'>, includeView: boolean): string {
  const d = defaultMapState();
  const q = new URLSearchParams();
  if (st.zona) q.set('zona', st.zona);
  if (LAYER_IDS.some((l) => st.layers[l] !== d.layers[l])) {
    q.set('layers', LAYER_IDS.filter((l) => st.layers[l]).join(','));
  }
  if (!sameSet(st.years, d.years)) q.set('years', [...st.years].sort((a, b) => b - a).join(','));
  if (!sameSet(st.seasons, d.seasons)) q.set('seasons', st.seasons.join(','));
  if (st.layers.traffic && st.hour !== d.hour) q.set('hour', String(st.hour));
  if (includeView) {
    q.set('lat', st.view.lat.toFixed(4));
    q.set('lng', st.view.lng.toFixed(4));
    q.set('z', st.view.zoom.toFixed(2));
  }
  return q.toString().replace(/%2C/g, ',');
}
