/**
 * GEE tile URL client.
 * Calls /api/gee-map (server-side proxy) to get a tile base URL + token.
 * Cache key includes layer + years + seasons so changing filters re-fetches.
 */

/** Populated by getGeeTileUrl(). Read by MapView.transformRequest. */
export const geeTileUrlCache: Partial<Record<'ndvi' | 'soilTemp', string>> = {};

/**
 * Per-session token cache — access tokens from /api/gee-map.
 * Tiles are fetched with this token in the Authorization header.
 */
export const geeTileTokenCache: Partial<Record<'ndvi' | 'soilTemp', string>> = {};

// Tracks which year+season combo produced the cached URL.
const geeParamCache: Partial<Record<'ndvi' | 'soilTemp', string>> = {};

/**
 * Calls /api/gee-map to create a GEE visualization map for the given layer,
 * years, and seasons. Returns the tile base URL.
 * Cached: if the same layer+years+seasons combo was already fetched this
 * session, returns the cached URL without a new API call.
 */
export async function getGeeTileUrl(
  layer: 'ndvi' | 'soilTemp',
  years: number[],
  seasons: string[],
): Promise<string> {
  const key = `${[...years].sort().join(',')}|${[...seasons].sort().join(',')}`;
  if (geeTileUrlCache[layer] && geeParamCache[layer] === key) {
    return geeTileUrlCache[layer]!;
  }

  const res = await fetch('/api/gee-map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layer, years, seasons }),
  });

  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(`GEE proxy error: ${data.error ?? res.status}`);
  }

  const data = (await res.json()) as { tileBaseUrl: string; token: string };
  geeTileUrlCache[layer]   = data.tileBaseUrl;
  geeTileTokenCache[layer] = data.token;
  geeParamCache[layer]     = key;
  return data.tileBaseUrl;
}
