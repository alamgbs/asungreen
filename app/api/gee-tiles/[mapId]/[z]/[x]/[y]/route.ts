/**
 * GET /api/gee-tiles/:mapId/:z/:x/:y
 * Same-origin tile proxy: adds the GEE Authorization header server-side so the
 * access token is never exposed to the browser.
 */
import { GEE_V1, loadServiceAccount, getAccessToken, clientIp, rateLimit } from '@/app/api/_lib/gee';

const INT = /^\d{1,7}$/;
const MAP_ID = /^[A-Za-z0-9_-]{8,128}$/; // blocks path traversal / SSRF via mapId

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mapId: string; z: string; x: string; y: string }> },
) {
  const { mapId, z, x, y } = await params;
  if (!MAP_ID.test(mapId) || !INT.test(z) || !INT.test(x) || !INT.test(y)) {
    return new Response('Parámetros de tile inválidos', { status: 400 });
  }
  // Generous: a full-screen view loads dozens of tiles per pan.
  if (!rateLimit(`tiles:${clientIp(request)}`, 1500, 60_000)) {
    return new Response('Demasiadas solicitudes', { status: 429 });
  }
  try {
    const sa = loadServiceAccount();
    const token = await getAccessToken(sa);
    const res = await fetch(`${GEE_V1}/projects/${sa.project_id}/maps/${mapId}/tiles/${z}/${x}/${y}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return new Response(`GEE tile error ${res.status}`, { status: res.status === 404 ? 404 : 502 });
    }
    return new Response(res.body, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/png',
        // mapId is unique per composite, so the URL is immutable: cache hard.
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, immutable',
      },
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : 'Error', { status: 500 });
  }
}
