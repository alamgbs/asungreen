/**
 * POST /api/gee-map
 * Body: { layer: 'ndvi' | 'soilTemp', years?: number[], seasons?: string[], aoiId?: string }
 * Returns: { tileBaseUrl: string, min: number, max: number, mean?: number, masked: boolean }
 *
 * 'soilTemp' is the legacy LayerType id; the layer is actually land surface
 * temperature (LST, °C) from Landsat 8+9. NDVI comes from Sentinel-2.
 * tileBaseUrl is same-origin (/api/gee-tiles/<mapId>); the GEE token stays server-side.
 * min/max are a FIXED scale shared by all AOIs (see LAYER_VALUE_RANGE).
 */

import { NextResponse } from 'next/server';
import type { Aoi } from '@/lib/aois';
import { findAoi } from '@/lib/zonasServer';
import { LAYER_VALUE_RANGE } from '@/lib/constants';
import { GEE_V1, loadServiceAccount, getAccessToken, clientIp, rateLimit } from '@/app/api/_lib/gee';

type Layer = 'ndvi' | 'soilTemp';
type Hemisphere = 'S' | 'N';

// ── Seasons ───────────────────────────────────────────────────────────────
// Returns [startISO, endISO) exclusive end. The winter/summer season that
// wraps the new year is anchored on the year it STARTS in (Dec Y – Feb Y+1).
// Tropical AOIs (Panamá ~9°N, CDMX ~19°N) use the northern meteorological
// seasons: the UI only exposes 4 seasons, so we do not map wet/dry seasons.
const SEASON_OFFSETS: Record<Hemisphere, Record<string, (y: number) => [string, string]>> = {
  S: {
    spring: (y) => [`${y}-09-01`, `${y}-12-01`],
    summer: (y) => [`${y}-12-01`, `${y + 1}-03-01`],
    autumn: (y) => [`${y}-03-01`, `${y}-06-01`],
    winter: (y) => [`${y}-06-01`, `${y}-09-01`],
  },
  N: {
    spring: (y) => [`${y}-03-01`, `${y}-06-01`],
    summer: (y) => [`${y}-06-01`, `${y}-09-01`],
    autumn: (y) => [`${y}-09-01`, `${y}-12-01`],
    winter: (y) => [`${y}-12-01`, `${y + 1}-03-01`],
  },
};
const VALID_SEASONS = new Set(Object.keys(SEASON_OFFSETS.S));

function currentSeason(h: Hemisphere): string {
  const m = new Date().getMonth() + 1;
  const spring = h === 'S' ? [9, 10, 11] : [3, 4, 5];
  const summer = h === 'S' ? [12, 1, 2] : [6, 7, 8];
  const autumn = h === 'S' ? [3, 4, 5] : [9, 10, 11];
  if (spring.includes(m)) return 'spring';
  if (summer.includes(m)) return 'summer';
  if (autumn.includes(m)) return 'autumn';
  return 'winter';
}

// ── Data availability ─────────────────────────────────────────────────────
// Sentinel-2 SR Harmonized (+ Cloud Score+) global from 2017; Landsat 8 from
// Apr 2013 (LC09 from late 2021 is merged but not required).
const DATA_START: Record<Layer, { year: number; iso: string; label: string }> = {
  ndvi:     { year: 2017, iso: '2017-01-01', label: 'Sentinel-2 (desde 2017)' },
  soilTemp: { year: 2013, iso: '2013-04-11', label: 'Landsat 8 (desde 2013)' },
};

/** Keeps only [year, season] ranges that overlap the dataset and are not in the future. */
function validRanges(layer: Layer, h: Hemisphere, years: number[], seasons: string[]) {
  const now = Date.now();
  const dataStart = new Date(DATA_START[layer].iso).getTime();
  const out: [string, string][] = [];
  for (const y of years) for (const s of seasons) {
    const [a, b] = SEASON_OFFSETS[h][s](y);
    if (new Date(b).getTime() > dataStart && new Date(a).getTime() <= now) out.push([a, b]);
  }
  return out;
}

// ── GEE expression value-node helpers ─────────────────────────────────────
type GeeValue = {
  constantValue?: unknown;
  valueReference?: string;
  argumentReference?: string;
  functionInvocationValue?: { functionName: string; arguments: Record<string, GeeValue> };
  functionDefinitionValue?: { argumentNames: string[]; body: string };
  arrayValue?: { values: GeeValue[] };
  geoJsonGeometry?: { type: string; coordinates: unknown };
};
interface GeeExpression { result: string; values: Record<string, GeeValue> }

const constant = (v: unknown): GeeValue => ({ constantValue: v });
const invoke = (fn: string, args: Record<string, GeeValue>): GeeValue =>
  ({ functionInvocationValue: { functionName: fn, arguments: args } });
const arr = (values: GeeValue[]): GeeValue => ({ arrayValue: { values } });
/** GeoJSON Polygon/MultiPolygon → nodo de la API REST (no existe el campo `geoJsonGeometry`). */
const geom = (g: { type: string; coordinates: unknown }): GeeValue =>
  invoke(g.type === 'MultiPolygon' ? 'GeometryConstructors.MultiPolygon' : 'GeometryConstructors.Polygon',
    { coordinates: constant(g.coordinates), geodesic: constant(false), evenOdd: constant(true), maxError: constant(1) });
const imgConst = (v: number): GeeValue => invoke('Image.constant', { value: constant(v) });

/** Builds a Collection.map(img => body(img)) node. The body is stored as a named value in `values`. */
function mapCollection(
  values: Record<string, GeeValue>,
  name: string,
  collection: GeeValue,
  body: (img: GeeValue) => GeeValue,
): GeeValue {
  values[name] = body({ argumentReference: `${name}_arg` });
  return invoke('Collection.map', {
    collection,
    baseAlgorithm: { functionDefinitionValue: { argumentNames: [`${name}_arg`], body: name } },
  });
}

function buildDateFilter(ranges: [string, string][]): GeeValue {
  const nodes = ranges.map(([start, end]) =>
    invoke('Filter.and', {
      filters: arr([
        invoke('Filter.gte', { leftField: constant('system:time_start'), rightValue: constant(new Date(start).getTime()) }),
        invoke('Filter.lt',  { leftField: constant('system:time_start'), rightValue: constant(new Date(end).getTime()) }),
      ]),
    }));
  return nodes.length === 1 ? nodes[0] : invoke('Filter.or', { filters: arr(nodes) });
}

const filterColl = (collection: GeeValue, filter: GeeValue) => invoke('Collection.filter', { collection, filter });
const lt = (field: string, v: number) => invoke('Filter.lt', { leftField: constant(field), rightValue: constant(v) });
const median = (collection: GeeValue) => invoke('ImageCollection.reduce', { collection, reducer: invoke('Reducer.median', {}) });

/**
 * Pre-visualize single-band composite.
 * masked=true  → per-pixel cloud masking (needs Collection.map / linkCollection;
 *                unverifiable offline, so the route probes it and falls back).
 * masked=false → scene-level CLOUDY_PIXEL_PERCENTAGE / CLOUD_COVER filter only.
 */
function buildComposite(
  layer: Layer, ranges: [string, string][], masked: boolean, values: Record<string, GeeValue>,
): { image: GeeValue; band: string } {
  const dateFilter = buildDateFilter(ranges);

  if (layer === 'ndvi') {
    let coll = filterColl(
      filterColl(invoke('ImageCollection.load', { id: constant('COPERNICUS/S2_SR_HARMONIZED') }), dateFilter),
      lt('CLOUDY_PIXEL_PERCENTAGE', masked ? 70 : 20), // pixel mask does the real work when masked
    );
    if (!masked) {
      return {
        image: invoke('Image.normalizedDifference', { input: median(coll), bandNames: constant(['B8_median', 'B4_median']) }),
        band: 'nd',
      };
    }
    // Cloud Score+ (cs_cdf ≥ 0.6) joined by system:index.
    coll = invoke('ImageCollection.linkCollection', {
      input: coll,
      imageCollection: invoke('ImageCollection.load', { id: constant('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED') }),
      linkedBands: constant(['cs_cdf']),
    });
    const ndviColl = mapCollection(values, 'ndviMask', coll, (img) =>
      invoke('Image.normalizedDifference', {
        input: invoke('Image.updateMask', {
          image: img,
          mask: invoke('Image.gte', {
            image1: invoke('Image.select', { input: img, bandSelectors: constant(['cs_cdf']) }),
            image2: imgConst(0.6),
          }),
        }),
        bandNames: constant(['B8', 'B4']),
      }));
    return { image: median(ndviColl), band: 'nd_median' };
  }

  // LST: Landsat 8+9 Collection 2 Level-2, ST_B10 → °C
  let coll = filterColl(
    filterColl(
      invoke('ImageCollection.merge', {
        collection1: invoke('ImageCollection.load', { id: constant('LANDSAT/LC08/C02/T1_L2') }),
        collection2: invoke('ImageCollection.load', { id: constant('LANDSAT/LC09/C02/T1_L2') }),
      }),
      dateFilter,
    ),
    lt('CLOUD_COVER', masked ? 60 : 30),
  );
  if (masked) {
    // QA_PIXEL bits 1 (dilated cloud), 2 (cirrus), 3 (cloud), 4 (cloud shadow) → mask 0b11110 = 30.
    // NOTE: ImageCollection.select is NOT supported by value:compute (see git history), so
    // band selection happens per image inside the map using Image.select.
    coll = mapCollection(values, 'lstMask', coll, (img) =>
      invoke('Image.updateMask', {
        image: invoke('Image.select', { input: img, bandSelectors: constant(['ST_B10']) }),
        mask: invoke('Image.eq', {
          image1: invoke('Image.bitwiseAnd', {
            image1: invoke('Image.select', { input: img, bandSelectors: constant(['QA_PIXEL']) }),
            image2: imgConst(30),
          }),
          image2: imgConst(0),
        }),
      }));
  }
  // DN → °C is linear (scale 0.00341802, offset 149 K), so it commutes with the median.
  const dn = invoke('Image.select', { input: median(coll), bandSelectors: constant(['ST_B10_median']) });
  const celsius = invoke('Image.subtract', {
    image1: invoke('Image.add', {
      image1: invoke('Image.multiply', { image1: dn, image2: imgConst(0.00341802) }),
      image2: imgConst(149.0),
    }),
    image2: imgConst(273.15),
  });
  return { image: celsius, band: 'ST_B10_median' };
}

// ── GEE calls ─────────────────────────────────────────────────────────────
const post = (url: string, token: string, body: unknown) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

class GeeError extends Error { constructor(msg: string, readonly status: number) { super(msg); } }

/** reduceRegion(mean) over the clipped composite. Doubles as a validity probe of the expression. */
async function computeMean(
  token: string, projectId: string, image: GeeValue, geometry: GeeValue, values: Record<string, GeeValue>,
): Promise<number | undefined> {
  const expression: GeeExpression = {
    result: 'result',
    values: {
      ...values,
      result: invoke('Image.reduceRegion', {
        image: invoke('Image.clip', { input: image, geometry }),
        reducer: invoke('Reducer.mean', {}),
        geometry,
        scale: constant(1000),
        bestEffort: constant(true),
      }),
    },
  };
  const res = await post(`${GEE_V1}/projects/${projectId}/value:compute`, token, { expression });
  if (!res.ok) throw new GeeError(`GEE value:compute error: ${await res.text()}`, res.status);
  const data = await res.json() as {
    result: string;
    values: Record<string, { dictionaryValue?: { values: Record<string, { constantValue?: number }> } }>;
  };
  const dict = data.values?.[data.result]?.dictionaryValue?.values ?? {};
  const first = Object.values(dict)[0]?.constantValue; // single-band image → single key
  return typeof first === 'number' ? first : undefined;
}

interface MapResult { mapId: string; min: number; max: number; mean?: number; masked: boolean }

async function createMap(
  token: string, projectId: string, layer: Layer, ranges: [string, string][], aoi: Aoi | undefined, masked: boolean,
): Promise<MapResult> {
  const values: Record<string, GeeValue> = {};
  const { image, band } = buildComposite(layer, ranges, masked, values);
  const range = LAYER_VALUE_RANGE[layer];

  // Probe region: the AOI, or a small box in Asunción when no AOI is active.
  const geometry: GeeValue | undefined = aoi ? geom(aoi.geometry) : undefined;
  const probeGeom: GeeValue = geometry ?? geom({ type: 'Polygon', coordinates: [[[-57.6, -25.35], [-57.5, -25.35], [-57.5, -25.25], [-57.6, -25.25], [-57.6, -25.35]]] });
  // Throws if any function in the (masked) expression is unsupported → caller falls back.
  const mean = await computeMean(token, projectId, image, probeGeom, values);

  const src = geometry ? invoke('Image.clip', { input: image, geometry }) : image;
  const palette = layer === 'ndvi'
    ? ['ff2d78', 'ffe600', '00ff88', '00a855', '004d22']
    : ['001aff', '00e5ff', 'ffe600', 'ff7c00', 'ff2d78'];
  const expression: GeeExpression = {
    result: 'result',
    values: {
      ...values,
      result: invoke('Image.visualize', {
        image: src, bands: constant([band]), min: constant(range.min), max: constant(range.max), palette: constant(palette),
      }),
    },
  };
  const res = await post(`${GEE_V1}/projects/${projectId}/maps`, token, { expression, fileFormat: 'PNG' });
  if (!res.ok) throw new GeeError(`GEE error: ${await res.text()}`, res.status);
  const { name } = await res.json() as { name: string }; // projects/<p>/maps/<id>
  return { mapId: name.split('/').pop()!, min: range.min, max: range.max, mean: aoi ? mean : undefined, masked };
}

// ── Cache (in-memory, TTL) + in-flight dedupe ─────────────────────────────
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // GEE map ids stay valid for many hours
const CACHE_MAX = 300;
const cache = new Map<string, { exp: number; value: MapResult }>();
const inflight = new Map<string, Promise<MapResult>>();

function cacheGet(key: string): MapResult | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.exp < Date.now()) { cache.delete(key); return undefined; }
  return hit.value;
}
function cacheSet(key: string, value: MapResult) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!); // oldest insertion
  cache.set(key, { exp: Date.now() + CACHE_TTL_MS, value });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      layer: Layer; years?: number[]; seasons?: string[]; aoiId?: string;
    };
    const { layer, aoiId } = body;
    if (layer !== 'ndvi' && layer !== 'soilTemp') {
      return NextResponse.json({ error: 'Capa inválida' }, { status: 400 });
    }

    const aoi = aoiId !== undefined ? findAoi(aoiId) : undefined;
    if (aoiId !== undefined && !aoi) {
      return NextResponse.json({ error: `aoiId desconocido: ${aoiId}` }, { status: 400 });
    }
    // Without an AOI (global view) we keep the project's home hemisphere (Paraguay).
    const hemisphere: Hemisphere = aoi?.hemisphere ?? 'S';

    const years   = body.years?.length   ? body.years   : [new Date().getFullYear()];
    const seasons = body.seasons?.length ? body.seasons : [currentSeason(hemisphere)];
    for (const s of seasons) {
      if (!VALID_SEASONS.has(s)) return NextResponse.json({ error: `Estación inválida: ${s}` }, { status: 400 });
    }
    for (const y of years) {
      if (!Number.isInteger(y) || y < 1984 || y > new Date().getFullYear()) {
        return NextResponse.json({ error: `Año inválido: ${y}` }, { status: 400 });
      }
    }

    const ranges = validRanges(layer, hemisphere, years, seasons);
    if (ranges.length === 0) {
      return NextResponse.json({
        error: `Sin datos para el rango pedido: ${DATA_START[layer].label}. ` +
          `Elegí años desde ${DATA_START[layer].year} que ya hayan ocurrido.`,
      }, { status: 400 });
    }

    const key = `${layer}|${[...years].sort().join(',')}|${[...seasons].sort().join(',')}|${aoiId ?? 'global'}`;
    const headers = { 'Cache-Control': 'private, max-age=3000' };
    const respond = (r: MapResult) => NextResponse.json({
      tileBaseUrl: `/api/gee-tiles/${r.mapId}`, // same-origin proxy; no token exposed
      min: r.min, max: r.max, ...(r.mean !== undefined ? { mean: r.mean } : {}), masked: r.masked,
    }, { headers });

    const cached = cacheGet(key);
    if (cached) return respond(cached);

    // Only uncached requests cost GEE quota, so only they count against the limit.
    if (!inflight.has(key) && !rateLimit(`map:${clientIp(request)}`, 20, 60_000)) {
      return NextResponse.json({ error: 'Demasiadas solicitudes, esperá un momento.' }, { status: 429 });
    }

    let pending = inflight.get(key);
    if (!pending) {
      pending = (async () => {
        const sa = loadServiceAccount();
        const token = await getAccessToken(sa);
        let result: MapResult;
        try {
          result = await createMap(token, sa.project_id, layer, ranges, aoi, true);
        } catch (e) {
          // Masked expression rejected (unsupported function in value:compute) → scene-level filter only.
          if (!(e instanceof GeeError) || e.status >= 500 || e.status === 429) throw e;
          console.warn('[gee-map] pixel masking failed, falling back to scene filter:', e.message.slice(0, 300));
          result = await createMap(token, sa.project_id, layer, ranges, aoi, false);
        }
        cacheSet(key, result);
        return result;
      })().finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    return respond(await pending);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: err instanceof GeeError ? 502 : 500 });
  }
}
