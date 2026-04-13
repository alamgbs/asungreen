/**
 * GEE tile URL client.
 * Calls /api/gee-map (server-side proxy) to get a tile base URL + token + stats.
 * Cache key includes layer + years + seasons + aoiId.
 */

export interface GeeLayerResult {
  tileBaseUrl: string;
  min:         number;
  max:         number;
}

/** Populated by getGeeTileUrl(). Read by MapView.transformRequest. */
export const geeTileUrlCache: Partial<Record<'ndvi' | 'soilTemp', string>> = {};

/**
 * Per-session token cache — access tokens from /api/gee-map.
 * Tiles are fetched with this token in the Authorization header.
 */
export const geeTileTokenCache: Partial<Record<'ndvi' | 'soilTemp', string>> = {};

// Tracks which param combo produced the cached URL.
const geeParamCache: Partial<Record<'ndvi' | 'soilTemp', string>> = {};
// Caches the full result (including min/max) by the same key.
const geeResultCache: Partial<Record<'ndvi' | 'soilTemp', GeeLayerResult>> = {};

/**
 * Calls /api/gee-map to create a GEE visualization map.
 * Returns { tileBaseUrl, min, max }.
 * Cached: if the same layer+years+seasons+aoiId combo was already fetched
 * this session, returns the cached result without a new API call.
 */
export async function getGeeTileUrl(
  layer:   'ndvi' | 'soilTemp',
  years:   number[],
  seasons: string[],
  aoiId?:  string,
): Promise<GeeLayerResult> {
  const key = `${[...years].sort().join(',')}|${[...seasons].sort().join(',')}|${aoiId ?? 'global'}`;

  if (geeParamCache[layer] === key && geeResultCache[layer]) {
    return geeResultCache[layer]!;
  }

  const res = await fetch('/api/gee-map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layer, years, seasons, ...(aoiId ? { aoiId } : {}) }),
  });

  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(`GEE proxy error: ${data.error ?? res.status}`);
  }

  const data = (await res.json()) as { tileBaseUrl: string; token: string; min: number; max: number };
  const result: GeeLayerResult = { tileBaseUrl: data.tileBaseUrl, min: data.min, max: data.max };

  geeTileUrlCache[layer]   = data.tileBaseUrl;
  geeTileTokenCache[layer] = data.token;
  geeParamCache[layer]     = key;
  geeResultCache[layer]    = result;

  return result;
}
