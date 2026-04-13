/**
 * GEE tile URL client.
 * Calls /api/gee-map (server-side proxy) to get a tile base URL.
 * The proxy holds the service account credentials — no secrets are
 * exposed to the browser.
 *
 * The access token returned by the proxy is stored alongside the
 * tile base URL so MapView.transformRequest can attach it to tile fetches.
 */

/** Populated by getGeeTileUrl(). Read by MapView.transformRequest. */
export const geeTileUrlCache: Partial<Record<'ndvi' | 'soilTemp', string>> = {};

/**
 * Per-session token cache — access tokens from /api/gee-map.
 * Tiles outside the local bbox are fetched with this token.
 */
export const geeTileTokenCache: Partial<Record<'ndvi' | 'soilTemp', string>> = {};

/**
 * Calls /api/gee-map to create a GEE visualization map for the given layer.
 * Returns the tile base URL. Result is cached — subsequent calls return the
 * cached value without a new API call.
 */
export async function getGeeTileUrl(layer: 'ndvi' | 'soilTemp'): Promise<string> {
  if (geeTileUrlCache[layer]) return geeTileUrlCache[layer]!;

  const res = await fetch('/api/gee-map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layer }),
  });

  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(`GEE proxy error: ${data.error ?? res.status}`);
  }

  const data = (await res.json()) as { tileBaseUrl: string; token: string };
  geeTileUrlCache[layer]      = data.tileBaseUrl;
  geeTileTokenCache[layer]    = data.token;
  return data.tileBaseUrl;
}
