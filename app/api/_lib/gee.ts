/**
 * Server-only GEE helpers shared by /api/gee-map and /api/gee-tiles.
 * The access token never leaves the server (see gee-tiles proxy).
 */
import { createSign } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export const GEE_V1 = 'https://earthengine.googleapis.com/v1';

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export function loadServiceAccount(): ServiceAccount {
  if (process.env.GEE_SA_JSON) return JSON.parse(process.env.GEE_SA_JSON) as ServiceAccount;
  const devPath = join(process.cwd(), 'service-account.json');
  if (existsSync(devPath)) return JSON.parse(readFileSync(devPath, 'utf8')) as ServiceAccount;
  throw new Error('GEE service account not configured. Set GEE_SA_JSON or add service-account.json.');
}

const b64url = (buf: string | Buffer): string =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

// Token cached in memory until 5 min before expiry (avoids one OAuth call per request/tile).
let tokenCache: { token: string; exp: number } | null = null;

export async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - 300 > now) return tokenCache.token;

  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/earthengine',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  const jwt = `${unsigned}.${b64url(sign.sign(sa.private_key))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json() as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(`OAuth2 failed: ${data.error}`);
  tokenCache = { token: data.access_token, exp: now + 3600 };
  return data.access_token;
}

/** Best-effort client IP (behind Vercel/proxies the first x-forwarded-for hop). */
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  return xff?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

/** Fixed-window in-memory rate limiter. Per-instance only: protects quota, not a hard guarantee on serverless. */
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { count: 1, reset: now + windowMs }); return true; }
  b.count += 1;
  return b.count <= limit;
}
