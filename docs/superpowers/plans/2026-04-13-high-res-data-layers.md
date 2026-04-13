# High-Resolution GEE Data Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace MODIS 250m/1km tiles with on-demand Sentinel-2 10m NDVI and Landsat 8+9 30m LST composites from GEE, adding year/season multi-selectors in the sidebar.

**Architecture:** `POST /api/gee-map` now accepts `years[]` and `seasons[]`, builds GEE median composites server-side using Sentinel-2 or Landsat 8+9 filtered by Southern Hemisphere seasons, and returns a tile URL + OAuth2 token. State flows `MapClient` → `MapView` (tile refresh) and `MapClient` → `Sidebar` (UI). `lib/tileRouter` becomes a no-op (always returns false). Local `public/tiles/` and `scripts/generate-tiles.mjs` are deleted.

**Tech Stack:** Next.js 16 App Router, MapLibre GL v5, GEE REST API v1, TypeScript 5.

---

### Task 1: Rewrite `app/api/gee-map/route.ts` with S2/Landsat expressions

**Files:**
- Modify: `app/api/gee-map/route.ts`

- [ ] **Step 1: Replace route.ts entirely**

```typescript
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
    // Fallback: accept all images (shouldn't happen with validated input)
    return invoke('Filter.gte', {
      leftField:  constant('system:time_start'),
      rightValue: constant(0),
    });
  }

  if (ranges.length === 1) return ranges[0];

  const orArgs: Record<string, GeeValue> = {};
  ranges.forEach((r, i) => { orArgs[`filter${i + 1}`] = r; });
  return invoke('Filter.or', orArgs);
}

// ── NDVI: Sentinel-2 SR Harmonized, 10m ──────────────────────────────────
// date+cloud filter → median → normalizedDifference(B8_median, B4_median) → visualize
function ndviExpression(years: number[], seasons: string[]): object {
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
function lstExpression(years: number[], seasons: string[]): object {
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
      headers: { 'Cache-Control': 'private, max-age=3000' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/api/gee-map/route.ts
git commit -m "feat: replace MODIS with Sentinel-2/Landsat8+9 expressions, add year+season params"
```

---

### Task 2: Update `lib/geeApi.ts` — new signature and cache key

**Files:**
- Modify: `lib/geeApi.ts`

- [ ] **Step 1: Replace geeApi.ts entirely**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors (MapView.tsx will show errors until Task 5 — that's fine)

- [ ] **Step 3: Commit**

```bash
git add lib/geeApi.ts
git commit -m "feat: update getGeeTileUrl signature to accept years+seasons, cache by composite key"
```

---

### Task 3: Simplify `lib/tileRouter.ts` to always return false

**Files:**
- Modify: `lib/tileRouter.ts`

- [ ] **Step 1: Replace tileRouter.ts**

```typescript
/**
 * Tile routing: always use GEE live tiles (no local tile cache).
 * Kept for future use — returns false unconditionally.
 */
export function shouldUseLocalTile(
  _layer: 'ndvi' | 'soilTemp',
  _z: number,
  _x: number,
  _y: number,
): boolean {
  return false;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors (MapView.tsx errors remain until Task 5)

- [ ] **Step 3: Commit**

```bash
git add lib/tileRouter.ts
git commit -m "feat: tileRouter always returns false, no local tile cache"
```

---

### Task 4: Update `components/MapView.tsx` — accept years/seasons, refresh on change

**Files:**
- Modify: `components/MapView.tsx`

The GEE init `useEffect` currently has `[]` deps and calls `getGeeTileUrl(layer)` (old 1-arg signature).
Replace it so it:
1. Takes `years: number[]` and `seasons: string[]` as props.
2. Calls `getGeeTileUrl(layer, years, seasons)` — new 3-arg signature.
3. Depends on `[years, seasons]` so it re-runs when the user changes filters.

- [ ] **Step 1: Update MapViewProps interface**

Find in `components/MapView.tsx`:
```typescript
interface MapViewProps {
  activeLayers: Record<LayerType, boolean>;
  hour: number;
  onCoordsChange?: (lat: number, lng: number, zoom: number) => void;
}
```
Replace with:
```typescript
interface MapViewProps {
  activeLayers: Record<LayerType, boolean>;
  hour: number;
  onCoordsChange?: (lat: number, lng: number, zoom: number) => void;
  years: number[];
  seasons: string[];
}
```

- [ ] **Step 2: Destructure new props**

Find:
```typescript
export default function MapView({ activeLayers, hour, onCoordsChange }: MapViewProps) {
```
Replace with:
```typescript
export default function MapView({ activeLayers, hour, onCoordsChange, years, seasons }: MapViewProps) {
```

- [ ] **Step 3: Replace the GEE init useEffect**

Find the entire block (lines 150–172):
```typescript
  // ── Initialize GEE tile URLs ────────────────────────
  // Calls GEE REST API once per layer per session. When URLs are ready,
  // calls setTiles() to trigger MapLibre to re-fetch tiles that were
  // previously served as transparent placeholders.
  useEffect(() => {
    let cancelled = false;

    async function initGee(layer: 'ndvi' | 'soilTemp', sourceId: string) {
      try {
        await getGeeTileUrl(layer); // populates geeTileUrlCache[layer]
        if (cancelled) return;
        const m = mapRef.current;
        if (!m || !mapReadyRef.current) return;
        const src = m.getSource(sourceId) as maplibregl.RasterTileSource | undefined;
        // setTiles forces MapLibre to reload all tiles for this source,
        // replacing transparent placeholders with real GEE data.
        src?.setTiles([`env-tile://${layer}/{z}/{x}/{y}`]);
      } catch (err) {
        console.error(`GEE init failed for ${layer}:`, err);
      }
    }

    initGee('ndvi', 'ndvi-source');
    initGee('soilTemp', 'soil-temp-source');

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
```

Replace with:
```typescript
  // ── Fetch / refresh GEE tile URLs ──────────────────
  // Runs on mount and whenever years or seasons change.
  // getGeeTileUrl caches by (layer, years, seasons) — only re-fetches on change.
  // setTiles() forces MapLibre to reload tiles that were transparent placeholders.
  useEffect(() => {
    let cancelled = false;

    async function refreshGee(layer: 'ndvi' | 'soilTemp', sourceId: string) {
      try {
        await getGeeTileUrl(layer, years, seasons);
        if (cancelled) return;
        const m = mapRef.current;
        if (!m || !mapReadyRef.current) return;
        const src = m.getSource(sourceId) as maplibregl.RasterTileSource | undefined;
        src?.setTiles([`env-tile://${layer}/{z}/{x}/{y}`]);
      } catch (err) {
        console.error(`GEE refresh failed for ${layer}:`, err);
      }
    }

    refreshGee('ndvi', 'ndvi-source');
    refreshGee('soilTemp', 'soil-temp-source');

    return () => { cancelled = true; };
  }, [years, seasons]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: error only in MapClient.tsx about missing `years`/`seasons` props (fixed in Task 5). No errors in MapView.tsx.

- [ ] **Step 5: Commit**

```bash
git add components/MapView.tsx
git commit -m "feat: MapView accepts years+seasons props, refreshes GEE tiles on filter change"
```

---

### Task 5: Update `components/MapClient.tsx` — add years/seasons state

**Files:**
- Modify: `components/MapClient.tsx`

- [ ] **Step 1: Add season helper and year/season state**

Find in `components/MapClient.tsx`:
```typescript
export default function MapClient() {
  const [activeLayers, setActiveLayers] = useState<Record<LayerType, boolean>>({
    soilTemp: true,
    traffic: false,
    ndvi: false,
  });
  const [hour, setHour] = useState(8);
```
Replace with:
```typescript
function currentSeason(): string {
  const m = new Date().getMonth() + 1;
  if (m >= 9 && m <= 11) return 'spring';
  if (m === 12 || m <= 2) return 'summer';
  if (m >= 3 && m <= 5) return 'autumn';
  return 'winter';
}

export default function MapClient() {
  const [activeLayers, setActiveLayers] = useState<Record<LayerType, boolean>>({
    soilTemp: true,
    traffic: false,
    ndvi: false,
  });
  const [hour, setHour] = useState(8);
  const [years, setYears]     = useState<number[]>([new Date().getFullYear()]);
  const [seasons, setSeasons] = useState<string[]>([currentSeason()]);
```

- [ ] **Step 2: Pass years/seasons to MapView and Sidebar**

Find:
```typescript
      <MapView
        activeLayers={activeLayers}
        hour={hour}
        onCoordsChange={handleCoordsChange}
      />
```
Replace with:
```typescript
      <MapView
        activeLayers={activeLayers}
        hour={hour}
        onCoordsChange={handleCoordsChange}
        years={years}
        seasons={seasons}
      />
```

Find:
```typescript
      <Sidebar
        activeLayers={activeLayers}
        onToggleLayer={toggleLayer}
        hour={hour}
        onHourChange={setHour}
        trafficActive={activeLayers.traffic}
      />
```
Replace with:
```typescript
      <Sidebar
        activeLayers={activeLayers}
        onToggleLayer={toggleLayer}
        hour={hour}
        onHourChange={setHour}
        trafficActive={activeLayers.traffic}
        years={years}
        seasons={seasons}
        onYearsChange={setYears}
        onSeasonsChange={setSeasons}
      />
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: error only in Sidebar.tsx about unknown props (fixed in Task 6). MapClient.tsx and MapView.tsx clean.

- [ ] **Step 4: Commit**

```bash
git add components/MapClient.tsx
git commit -m "feat: MapClient holds years+seasons state, passes to MapView and Sidebar"
```

---

### Task 6: Update `components/Sidebar.tsx` — temporal filter panel

**Files:**
- Modify: `components/Sidebar.tsx`

Add a year/season multi-select panel that appears when NDVI or soilTemp is active.
Uses the existing neon pill toggle pattern (no new CSS classes needed).

- [ ] **Step 1: Update SidebarProps interface and add constants**

Find at the top of the file (after the imports):
```typescript
interface SidebarProps {
  activeLayers: Record<LayerType, boolean>;
  onToggleLayer: (id: LayerType) => void;
  hour: number;
  onHourChange: (h: number) => void;
  trafficActive: boolean;
}
```
Replace with:
```typescript
interface SidebarProps {
  activeLayers: Record<LayerType, boolean>;
  onToggleLayer: (id: LayerType) => void;
  hour: number;
  onHourChange: (h: number) => void;
  trafficActive: boolean;
  years: number[];
  seasons: string[];
  onYearsChange: (years: number[]) => void;
  onSeasonsChange: (seasons: string[]) => void;
}

const SEASON_LABELS: { id: string; label: string }[] = [
  { id: 'spring', label: 'PRIM' },
  { id: 'summer', label: 'VER'  },
  { id: 'autumn', label: 'OTO'  },
  { id: 'winter', label: 'INV'  },
];

const AVAILABLE_YEARS: number[] = Array.from(
  { length: 10 },
  (_, i) => new Date().getFullYear() - i,
);
```

- [ ] **Step 2: Destructure new props**

Find:
```typescript
export default function Sidebar({
  activeLayers,
  onToggleLayer,
  hour,
  onHourChange,
  trafficActive,
}: SidebarProps) {
```
Replace with:
```typescript
export default function Sidebar({
  activeLayers,
  onToggleLayer,
  hour,
  onHourChange,
  trafficActive,
  years,
  seasons,
  onYearsChange,
  onSeasonsChange,
}: SidebarProps) {
  function toggleYear(y: number) {
    if (years.includes(y) && years.length === 1) return;
    onYearsChange(years.includes(y) ? years.filter(v => v !== y) : [...years, y]);
  }

  function toggleSeason(s: string) {
    if (seasons.includes(s) && seasons.length === 1) return;
    onSeasonsChange(seasons.includes(s) ? seasons.filter(v => v !== s) : [...seasons, s]);
  }

  const showTemporalFilter = activeLayers.ndvi || activeLayers.soilTemp;
```

- [ ] **Step 3: Insert temporal filter panel**

Find the time slider block (appears after the layer cards block):
```typescript
      {/* ── Time slider (traffic only) ──────────────── */}
      {trafficActive && (
```
Insert the following block immediately before it:
```typescript
      {/* ── Temporal filter (ndvi / soilTemp only) ─── */}
      {showTemporalFilter && (
        <div className="terminal-panel fade-in-up">
          <div
            style={{
              fontFamily: 'var(--font-pixel)',
              fontSize: '6px',
              color: 'var(--neon-green)',
              textShadow: 'var(--glow-green)',
              letterSpacing: '0.04em',
              marginBottom: '10px',
            }}
          >
            &gt; TEMPORAL_FILTER
          </div>

          {/* Season pills */}
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: 'var(--text-muted)',
              marginBottom: '6px',
            }}
          >
            ESTACION
          </div>
          <div className="flex gap-1 flex-wrap" style={{ marginBottom: '10px' }}>
            {SEASON_LABELS.map(({ id, label }) => {
              const active = seasons.includes(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleSeason(id)}
                  style={{
                    fontFamily:   'var(--font-pixel)',
                    fontSize:     '6px',
                    letterSpacing: '0.04em',
                    padding:      '3px 6px',
                    border:       `1px solid ${active ? 'var(--neon-green)' : 'var(--bg-border)'}`,
                    background:   active ? 'var(--neon-green)22' : 'transparent',
                    color:        active ? 'var(--neon-green)' : 'var(--text-muted)',
                    textShadow:   active ? 'var(--glow-green)' : 'none',
                    cursor:       'pointer',
                    transition:   'all 0.15s',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Year pills */}
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize:   '9px',
              color:      'var(--text-muted)',
              marginBottom: '6px',
            }}
          >
            AÑO
          </div>
          <div className="flex gap-1 flex-wrap">
            {AVAILABLE_YEARS.map((y) => {
              const active = years.includes(y);
              return (
                <button
                  key={y}
                  onClick={() => toggleYear(y)}
                  style={{
                    fontFamily:    'var(--font-data)',
                    fontSize:      '11px',
                    padding:       '2px 5px',
                    border:        `1px solid ${active ? 'var(--neon-green)' : 'var(--bg-border)'}`,
                    background:    active ? 'var(--neon-green)22' : 'transparent',
                    color:         active ? 'var(--neon-green)' : 'var(--text-muted)',
                    textShadow:    active ? 'var(--glow-green)' : 'none',
                    cursor:        'pointer',
                    transition:    'all 0.15s',
                  }}
                >
                  {y}
                </button>
              );
            })}
          </div>
        </div>
      )}

```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat: add temporal filter panel with year+season multi-select to Sidebar"
```

---

### Task 7: Update metadata strings — remove MODIS references

**Files:**
- Modify: `components/Sidebar.tsx`
- Modify: `components/Legend.tsx`

- [ ] **Step 1: Update Sidebar layer subtitles and sources**

In `components/Sidebar.tsx`, find:
```typescript
  {
    id: 'soilTemp',
    name: 'TEMPERATURA',
    subtitle: 'MODIS·MOD11A1·LST',
    source: 'NASA TERRA · 1km',
```
Replace with:
```typescript
  {
    id: 'soilTemp',
    name: 'TEMPERATURA',
    subtitle: 'LANDSAT·8/9·LST·30m',
    source: 'LANDSAT 8+9 · 30m',
```

Find:
```typescript
  {
    id: 'ndvi',
    name: 'VEGETACION',
    subtitle: 'NDVI·MODIS·250m',
    source: 'NASA TERRA · 250m',
```
Replace with:
```typescript
  {
    id: 'ndvi',
    name: 'VEGETACION',
    subtitle: 'NDVI·SENTINEL-2·10m',
    source: 'SENTINEL-2 · 10m',
```

Find:
```typescript
        © 2025 ASUNGREEN · NASA/GEE/OSM
```
Replace with:
```typescript
        © 2025 ASUNGREEN · GEE/OSM
```

- [ ] **Step 2: Update Legend source strings**

In `components/Legend.tsx`, find:
```typescript
    source: 'MODIS·LST·1km',
```
Replace with:
```typescript
    source: 'LANDSAT·8/9·LST·30m',
```

Find:
```typescript
    source: 'MODIS·NDVI·250m',
```
Replace with:
```typescript
    source: 'SENTINEL-2·NDVI·10m',
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add components/Sidebar.tsx components/Legend.tsx
git commit -m "chore: update layer metadata strings from MODIS to Sentinel-2/Landsat 8+9"
```

---

### Task 8: Delete MODIS artifacts

**Files:**
- Delete: `public/tiles/` (552 PNG files)
- Delete: `scripts/generate-tiles.mjs`

- [ ] **Step 1: Delete local tile tree**

```bash
rm -rf public/tiles/
```

- [ ] **Step 2: Delete tile generation script**

```bash
rm scripts/generate-tiles.mjs
```

- [ ] **Step 3: Verify files are gone**

```bash
ls public/ && ls scripts/ 2>/dev/null || echo "scripts/ empty or removed"
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete MODIS pre-cached tiles and generate-tiles script (replaced by on-demand GEE)"
```

---

### Task 9: Push to GitHub

- [ ] **Step 1: Push all commits**

```bash
git push origin main
```

Expected: All 8 commits pushed to `alamgbs/asungreen`.
