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
  arrayValue?: { values: GeeValue[] };
  geoJsonGeometry?: { type: string; coordinates: unknown };
};

interface GeeExpression { result: string; values: Record<string, GeeValue> }

function constant(v: unknown): GeeValue {
  return { constantValue: v };
}

function invoke(fn: string, args: Record<string, GeeValue>): GeeValue {
  return { functionInvocationValue: { functionName: fn, arguments: args } };
}

function arr(values: GeeValue[]): GeeValue {
  return { arrayValue: { values } };
}

/** Wraps a GeoJSON geometry object as a GEE geoJsonGeometry value node. */
function buildGeometry(geojson: { type: string; coordinates: unknown }): GeeValue {
  return { geoJsonGeometry: geojson };
}

// ── LST DN → Celsius conversion ──────────────────────────────────────────
// Landsat Collection 2 Level-2 ST_B10 scale factor: 0.00341802, offset: 149.0
const lstDnToCelsius = (dn: number): number => dn * 0.00341802 + 149.0 - 273.15;

// ── Visualization min/max constants ──────────────────────────────────────
// VIZ_DEFAULTS: raw values passed to GEE Image.visualize
// DISPLAY_DEFAULTS: human-readable values returned in the API response
const VIZ_DEFAULTS = {
  ndvi:     { min: -0.2,  max: 0.8   },
  soilTemp: { min: 40713, max: 50947 }, // raw ST_B10 DN
} as const;

const DISPLAY_DEFAULTS = {
  ndvi:     { min: -0.2,  max: 0.8   },
  soilTemp: { min: lstDnToCelsius(40713), max: lstDnToCelsius(50947) }, // °C ≈ 14.9 / 49.9
} as const;

// Builds Filter.and(gte, lt) for one date range, or Filter.or of N ranges.
// GEE REST API: Filter.and and Filter.or take a 'filters' arrayValue argument.
function buildDateFilter(years: number[], seasons: string[]): GeeValue {
  const ranges: GeeValue[] = [];

  for (const year of years) {
    for (const season of seasons) {
      const fn = SEASON_OFFSETS[season];
      if (!fn) continue;
      const [start, end] = fn(year);
      ranges.push(
        invoke('Filter.and', {
          filters: arr([
            invoke('Filter.gte', {
              leftField:  constant('system:time_start'),
              rightValue: constant(new Date(start).getTime()),
            }),
            invoke('Filter.lt', {
              leftField:  constant('system:time_start'),
              rightValue: constant(new Date(end).getTime()),
            }),
          ]),
        })
      );
    }
  }

  if (ranges.length === 0) {
    throw new Error('buildDateFilter: no valid year/season combinations');
  }

  if (ranges.length === 1) return ranges[0];

  return invoke('Filter.or', { filters: arr(ranges) });
}

// ── NDVI: Sentinel-2 SR Harmonized, 10m ──────────────────────────────────
// Returns the pre-visualize NDVI image node (normalizedDifference result).
function buildNdviImage(years: number[], seasons: string[]): GeeValue {
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

  const selected = invoke('ImageCollection.select', {
    collection:    filtered,
    bandSelectors: constant(['B4', 'B8']),
  });

  const median = invoke('ImageCollection.reduce', {
    collection: selected,
    reducer:    invoke('Reducer.median', {}),
  });

  // GEE REST API: Image.normalizedDifference uses 'input' (not 'image').
  return invoke('Image.normalizedDifference', {
    input:     median,
    bandNames: constant(['B8_median', 'B4_median']),
  });
}

// Wraps NDVI image with optional clip + visualize.
// geometry: if provided, clips the image to that AOI before visualizing.
function visualizeNdvi(
  image:     GeeValue,
  min:       number,
  max:       number,
  geometry?: GeeValue,
): GeeExpression {
  const src = geometry
    ? invoke('Image.clip', { input: image, geometry })
    : image;
  return {
    result: 'result',
    values: {
      result: invoke('Image.visualize', {
        image:   src,
        min:     constant(min),
        max:     constant(max),
        palette: constant(['ff2d78', 'ffe600', '00ff88', '00a855', '004d22']),
      }),
    },
  };
}

// ── LST: Landsat 8+9 Collection 2 Level-2, 30m ───────────────────────────
// Returns the pre-visualize LST median composite image node.
function buildLstImage(years: number[], seasons: string[]): GeeValue {
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

  return invoke('ImageCollection.reduce', {
    collection: filtered,
    reducer:    invoke('Reducer.median', {}),
  });
}

// Wraps LST image with optional clip + visualize.
// min/max are raw ST_B10 DN values (not °C) for GEE Image.visualize.
function visualizeLst(
  image:     GeeValue,
  min:       number,
  max:       number,
  geometry?: GeeValue,
): GeeExpression {
  const src = geometry
    ? invoke('Image.clip', { input: image, geometry })
    : image;
  return {
    result: 'result',
    values: {
      result: invoke('Image.visualize', {
        image:   src,
        bands:   constant(['ST_B10_median']),
        min:     constant(min),
        max:     constant(max),
        palette: constant(['001aff', '00e5ff', 'ffe600', 'ff7c00', 'ff2d78']),
      }),
    },
  };
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

    const sa    = loadServiceAccount();
    const token = await getAccessToken(sa);

    const image = layer === 'ndvi'
      ? buildNdviImage(years, seasons)
      : buildLstImage(years, seasons);

    const expression = layer === 'ndvi'
      ? visualizeNdvi(image, VIZ_DEFAULTS.ndvi.min, VIZ_DEFAULTS.ndvi.max)
      : visualizeLst(image, VIZ_DEFAULTS.soilTemp.min, VIZ_DEFAULTS.soilTemp.max);

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

    const displayMin = DISPLAY_DEFAULTS[layer].min;
    const displayMax = DISPLAY_DEFAULTS[layer].max;

    return NextResponse.json({ tileBaseUrl, token, min: displayMin, max: displayMax }, {
      headers: { 'Cache-Control': 'private, max-age=3000' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
