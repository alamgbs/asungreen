/**
 * POST /api/gee-map
 * Body: { layer: 'ndvi' | 'soilTemp', years?: number[], seasons?: string[] }
 * Returns: { tileBaseUrl: string, token: string }
 *
 * Builds a GEE median composite from Sentinel-2 (NDVI 10m) or
 * Landsat 8+9 merged (LST 30m), filtered by Southern Hemisphere seasons.
 */

import { createSign } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';

const GEE_V1 = 'https://earthengine.googleapis.com/v1';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function loadServiceAccount(): ServiceAccount {
  if (process.env.GEE_SA_JSON) {
    return JSON.parse(process.env.GEE_SA_JSON) as ServiceAccount;
  }
  const devPath = join(process.cwd(), 'service-account.json');
  if (existsSync(devPath)) {
    return JSON.parse(readFileSync(devPath, 'utf8')) as ServiceAccount;
  }
  throw new Error('GEE service account not configured. Set GEE_SA_JSON or add service-account.json.');
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

// ── Seasonal date ranges (Southern Hemisphere) ────────────────────────────
// Returns [startISO, endISO) exclusive end.
// Summer spans year boundary: year Y → Dec Y – Feb Y+1.
const SEASON_OFFSETS: Record<string, (y: number) => [string, string]> = {
  spring: (y) => [`${y}-09-01`, `${y}-12-01`],
  summer: (y) => [`${y}-12-01`, `${y + 1}-03-01`],
  autumn: (y) => [`${y}-03-01`, `${y}-06-01`],
  winter: (y) => [`${y}-06-01`, `${y}-09-01`],
};

function currentSeason(): string {
  const m = new Date().getMonth() + 1;
  if (m >= 9 && m <= 11) return 'spring';
  if (m === 12 || m <= 2) return 'summer';
  if (m >= 3 && m <= 5) return 'autumn';
  return 'winter';
}

// ── GEE expression value-node helpers ────────────────────────────────────
type GeeValue = {
  constantValue?: unknown;
  functionInvocationValue?: { functionName: string; arguments: Record<string, GeeValue> };
};

interface GeeExpression { result: string; values: Record<string, GeeValue> }

function constant(v: unknown): GeeValue {
  return { constantValue: v };
}

function invoke(fn: string, args: Record<string, GeeValue>): GeeValue {
  return { functionInvocationValue: { functionName: fn, arguments: args } };
}

// Builds Filter.and(gte, lt) for one date range, or Filter.or of N ranges.
// GEE variadic functions use positional arg names: filter1, filter2, ...filterN.
function buildDateFilter(years: number[], seasons: string[]): GeeValue {
  const ranges: GeeValue[] = [];

  for (const year of years) {
    for (const season of seasons) {
      const fn = SEASON_OFFSETS[season];
      if (!fn) continue;
      const [start, end] = fn(year);
      ranges.push(
        invoke('Filter.and', {
          filter1: invoke('Filter.gte', {
            leftField:  constant('system:time_start'),
            rightValue: constant(new Date(start).getTime()),
          }),
          filter2: invoke('Filter.lt', {
            leftField:  constant('system:time_start'),
            rightValue: constant(new Date(end).getTime()),
          }),
        })
      );
    }
  }

  if (ranges.length === 0) {
    throw new Error('buildDateFilter: no valid year/season combinations');
  }

  if (ranges.length === 1) return ranges[0];

  const orArgs: Record<string, GeeValue> = {};
  ranges.forEach((r, i) => { orArgs[`filter${i + 1}`] = r; });
  return invoke('Filter.or', orArgs);
}

// ── NDVI: Sentinel-2 SR Harmonized, 10m ──────────────────────────────────
// date+cloud filter → median → normalizedDifference(B8_median, B4_median) → visualize
function ndviExpression(years: number[], seasons: string[]): GeeExpression {
  const dateFilter  = buildDateFilter(years, seasons);
  const cloudFilter = invoke('Filter.lt', {
    leftField:  constant('CLOUDY_PIXEL_PERCENTAGE'),
    rightValue: constant(20),
  });

  const filtered = invoke('Collection.filter', {
    collection: invoke('Collection.filter', {
      collection: invoke('ImageCollection.load', {
        id: constant('COPERNICUS/S2_SR_HARMONIZED'),
      }),
      filter: dateFilter,
    }),
    filter: cloudFilter,
  });

  const median = invoke('ImageCollection.reduce', {
    collection: filtered,
    reducer:    invoke('Reducer.median', {}),
  });

  const ndvi = invoke('Image.normalizedDifference', {
    image:     median,
    bandNames: constant(['B8_median', 'B4_median']),
  });

  const visualized = invoke('Image.visualize', {
    image:   ndvi,
    min:     constant(-0.2),
    max:     constant(0.8),
    palette: constant(['ff2d78', 'ffe600', '00ff88', '00a855', '004d22']),
  });

  return { result: 'result', values: { result: visualized } };
}

// ── LST: Landsat 8+9 Collection 2 Level-2, 30m ───────────────────────────
// merge LC08+LC09 → date+cloud filter → median → ST_B10_median → visualize
function lstExpression(years: number[], seasons: string[]): GeeExpression {
  const dateFilter  = buildDateFilter(years, seasons);
  const cloudFilter = invoke('Filter.lt', {
    leftField:  constant('CLOUD_COVER'),
    rightValue: constant(30),
  });

  const merged = invoke('ImageCollection.merge', {
    collection1: invoke('ImageCollection.load', { id: constant('LANDSAT/LC08/C02/T1_L2') }),
    collection2: invoke('ImageCollection.load', { id: constant('LANDSAT/LC09/C02/T1_L2') }),
  });

  const filtered = invoke('Collection.filter', {
    collection: invoke('Collection.filter', {
      collection: merged,
      filter: dateFilter,
    }),
    filter: cloudFilter,
  });

  const median = invoke('ImageCollection.reduce', {
    collection: filtered,
    reducer:    invoke('Reducer.median', {}),
  });

  const visualized = invoke('Image.visualize', {
    image:   median,
    bands:   constant(['ST_B10_median']),
    min:     constant(40713),
    max:     constant(50947),
    palette: constant(['001aff', '00e5ff', 'ffe600', 'ff7c00', 'ff2d78']),
  });

  return { result: 'result', values: { result: visualized } };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      layer: 'ndvi' | 'soilTemp';
      years?: number[];
      seasons?: string[];
    };

    const { layer } = body;
    if (layer !== 'ndvi' && layer !== 'soilTemp') {
      return NextResponse.json({ error: 'Invalid layer' }, { status: 400 });
    }

    const years   = body.years?.length   ? body.years   : [new Date().getFullYear()];
    const seasons = body.seasons?.length ? body.seasons : [currentSeason()];

    const VALID_SEASONS = new Set(Object.keys(SEASON_OFFSETS));
    for (const s of seasons) {
      if (!VALID_SEASONS.has(s)) {
        return NextResponse.json({ error: `Invalid season: ${s}` }, { status: 400 });
      }
    }

    for (const y of years) {
      if (!Number.isInteger(y) || y < 1984 || y > new Date().getFullYear()) {
        return NextResponse.json({ error: `Invalid year: ${y}` }, { status: 400 });
      }
    }

    const sa         = loadServiceAccount();
    const token      = await getAccessToken(sa);
    const expression = layer === 'ndvi'
      ? ndviExpression(years, seasons)
      : lstExpression(years, seasons);

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

    return NextResponse.json({ tileBaseUrl, token }, {
      headers: { 'Cache-Control': 'private, max-age=3000' }, // 50 min — GEE tile maps expire in ~1 hour
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
