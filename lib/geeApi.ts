/**
 * GEE tile URL client.
 * Calls /api/gee-map (server-side proxy) to get a same-origin tile base URL + stats.
 * The GEE access token never reaches the browser (tiles go through /api/gee-tiles).
 * Cache key includes layer + years + seasons + aoiId.
 */

export interface GeeLayerResult {
  tileBaseUrl: string;
  min:         number;
  max:         number;
  /** Zone mean (°C for LST, index for NDVI); only present when an AOI is active. */
  mean?:       number;
}

/** Populated by getGeeTileUrl(). Read by MapView.transformRequest. */
export const geeTileUrlCache: Partial<Record<'ndvi' | 'soilTemp', string>> = {};

/**
 * @deprecated No longer populated: tiles are proxied server-side, so no token
 * reaches the browser. Kept only so existing imports keep compiling.
 */
export const geeTileTokenCache: Partial<Record<'ndvi' | 'soilTemp', string>> = {};

// Tracks which param combo produced the cached URL.
const geeParamCache: Partial<Record<'ndvi' | 'soilTemp', string>> = {};
// Caches the full result (including min/max) by the same key.
const geeResultCache: Partial<Record<'ndvi' | 'soilTemp', GeeLayerResult>> = {};
// Monotonic request counter per layer — guards against stale writes from concurrent fetches.
const geeRequestId: Partial<Record<'ndvi' | 'soilTemp', number>> = {};

/**
 * Calls /api/gee-map to create a GEE visualization map.
 * Returns { tileBaseUrl, min, max }.
 * Cached: if the same layer+years+seasons+aoiId combo was already fetched
 * this session, returns the cached result without a new API call.
 */
async function fetchGeeTileUrl(
  layer:   'ndvi' | 'soilTemp',
  years:   number[],
  seasons: string[],
  aoiId?:  string,
): Promise<GeeLayerResult> {
  const key = `${[...years].sort().join(',')}|${[...seasons].sort().join(',')}|${aoiId ?? 'global'}`;

  if (geeParamCache[layer] === key && geeResultCache[layer]) {
    return geeResultCache[layer]!;
  }

  // Increment request counter just before fetching.
  const myId = (geeRequestId[layer] ?? 0) + 1;
  geeRequestId[layer] = myId;

  const res = await fetch('/api/gee-map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layer, years, seasons, ...(aoiId ? { aoiId } : {}) }),
  });

  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(`GEE proxy error: ${data.error ?? res.status}`);
  }

  const data = (await res.json()) as { tileBaseUrl: string; min: number; max: number; mean?: number };
  const result: GeeLayerResult = { tileBaseUrl: data.tileBaseUrl, min: data.min, max: data.max, mean: data.mean };

  // Only update the tile URL/token caches if this is still the latest request for this layer.
  // A concurrent fetch with a newer AOI selection may have already resolved.
  if (geeRequestId[layer] === myId) {
    geeTileUrlCache[layer] = data.tileBaseUrl;
  }
  geeParamCache[layer]  = key;
  geeResultCache[layer] = result;

  return result;
}

/** Estado de las peticiones a /api/gee-map; lo lee el timelapse (components/TimeSlider.tsx) para no encadenar peticiones. */
export const geeStatus = { pending: 0, lastError: null as string | null, lastErrorAt: 0 };

export async function getGeeTileUrl(
  layer:   'ndvi' | 'soilTemp',
  years:   number[],
  seasons: string[],
  aoiId?:  string,
): Promise<GeeLayerResult> {
  geeStatus.pending++;
  try {
    return await fetchGeeTileUrl(layer, years, seasons, aoiId);
  } catch (e) {
    geeStatus.lastError = e instanceof Error ? e.message : String(e);
    geeStatus.lastErrorAt = performance.now();
    throw e;
  } finally {
    geeStatus.pending--;
  }
}
