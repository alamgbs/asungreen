/**
 * POST /api/gee-map
 * Body: { layer: 'ndvi' | 'soilTemp' }
 * Returns: { tileBaseUrl: string }
 *
 * Server-side proxy for GEE map creation. Uses the service account
 * from GEE_SA_JSON env var (or service-account.json in dev) to obtain
 * an OAuth2 token and create a GEE visualization map.
 * The private key is never exposed to the browser.
 */

import { createSign } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';

const GEE_V1 = 'https://earthengine.googleapis.com/v1';

function loadServiceAccount() {
  // Production: set GEE_SA_JSON env var with the full JSON string.
  if (process.env.GEE_SA_JSON) {
    return JSON.parse(process.env.GEE_SA_JSON) as ServiceAccount;
  }
  // Dev: read from service-account.json at project root.
  const devPath = join(process.cwd(), 'service-account.json');
  if (existsSync(devPath)) {
    return JSON.parse(readFileSync(devPath, 'utf8')) as ServiceAccount;
  }
  throw new Error('GEE service account not configured. Set GEE_SA_JSON or add service-account.json.');
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function b64url(buf: string | Buffer): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/earthengine',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  const sig = b64url(sign.sign(sa.private_key));
  const jwt = `${unsigned}.${sig}`;

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
  return data.access_token;
}

// MODIS MOD13A2: 16-day NDVI composite, 500m. Band NDVI raw 0–10000.
function ndviExpression() {
  return {
    result: '0',
    values: {
      '0': { functionInvocationValue: { functionName: 'Image.visualize', arguments: {
        image:   { valueReference: '1' },
        min:     { constantValue: 0 },
        max:     { constantValue: 8000 },
        bands:   { constantValue: ['NDVI'] },
        palette: { constantValue: ['ff2d78','ffe600','00ff88','00a855','004d22'] },
      }}},
      '1': { functionInvocationValue: { functionName: 'ImageCollection.mosaic', arguments: {
        collection: { valueReference: '2' },
      }}},
      '2': { functionInvocationValue: { functionName: 'ImageCollection.load', arguments: {
        id: { constantValue: 'MODIS/061/MOD13A2' },
      }}},
    },
  };
}

// MODIS MOD11A2: 8-day daytime LST, 1km. Band LST_Day_1km raw in 50×K.
function lstExpression() {
  return {
    result: '0',
    values: {
      '0': { functionInvocationValue: { functionName: 'Image.visualize', arguments: {
        image:   { valueReference: '1' },
        min:     { constantValue: 14300 },
        max:     { constantValue: 16200 },
        bands:   { constantValue: ['LST_Day_1km'] },
        palette: { constantValue: ['001aff','00e5ff','ffe600','ff7c00','ff2d78'] },
      }}},
      '1': { functionInvocationValue: { functionName: 'ImageCollection.mosaic', arguments: {
        collection: { valueReference: '2' },
      }}},
      '2': { functionInvocationValue: { functionName: 'ImageCollection.load', arguments: {
        id: { constantValue: 'MODIS/061/MOD11A2' },
      }}},
    },
  };
}

export async function POST(request: Request) {
  try {
    const { layer } = (await request.json()) as { layer: 'ndvi' | 'soilTemp' };
    if (layer !== 'ndvi' && layer !== 'soilTemp') {
      return NextResponse.json({ error: 'Invalid layer' }, { status: 400 });
    }

    const sa    = loadServiceAccount();
    const token = await getAccessToken(sa);
    const expression = layer === 'ndvi' ? ndviExpression() : lstExpression();

    const res = await fetch(`${GEE_V1}/projects/${sa.project_id}/maps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ expression, fileFormat: 'PNG' }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `GEE error: ${text}` }, { status: 502 });
    }

    const data = (await res.json()) as { name: string };
    const tileBaseUrl = `${GEE_V1}/${data.name}/tiles`;

    // Cache for 50 minutes (tiles expire in ~1 hour)
    return NextResponse.json({ tileBaseUrl, token }, {
      headers: { 'Cache-Control': 'private, max-age=3000' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
