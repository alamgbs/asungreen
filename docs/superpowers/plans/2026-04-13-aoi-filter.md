# AOI Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-select AOI panel to the Sidebar that clips GEE layers to a city/region boundary, auto-zooms the camera, and shows dynamic p5/p95 colorscale labels in the Legend.

**Architecture:** 15 GADM-derived city polygons live in `lib/aois.ts`. The API route runs a sequential pair of GEE calls when `aoiId` is present — `value:compute` for p5/p95 stats, then `maps` for clipped tiles — and returns `{tileBaseUrl, token, min, max}`. Frontend state flows: `selectedAoi` from MapClient down to MapView (camera zoom) and Sidebar (AOI pills); `geeStats` bubbles from MapView back up to MapClient then down to Legend.

**Tech Stack:** Next.js 16 App Router, TypeScript, MapLibre GL v5, GEE REST API v1, React hooks.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `lib/aois.ts` | Create | AOI catalog: 15 city polygons + `computeBbox` |
| `app/api/gee-map/route.ts` | Modify | Split image builders; add `value:compute` stats + clip |
| `lib/geeApi.ts` | Modify | Return `{tileBaseUrl, min, max}`; include `aoiId` in cache key |
| `components/MapClient.tsx` | Modify | `selectedAoi` + `geeStats` state; wire `onAoiChange` / `onStatsChange` |
| `components/MapView.tsx` | Modify | AOI camera zoom; call `onStatsChange` after GEE fetch |
| `components/Sidebar.tsx` | Modify | Always-visible AOI panel with cyan radio pills |
| `components/Legend.tsx` | Modify | Accept `geeStats` prop; display dynamic min/max |

---

### Task 1: Create `lib/aois.ts`

**Files:**
- Create: `lib/aois.ts`

- [ ] **Step 1: Create `lib/aois.ts` with the full AOI catalog**

```typescript
// lib/aois.ts
// AOI (Area of Interest) catalog — 15 city/region polygons.
// Geometries are simplified rectangular approximations of GADM administrative
// boundaries. Replace coordinates with actual GADM data for higher fidelity.

type GeoJsonPolygon = { type: 'Polygon'; coordinates: number[][][] };
type GeoJsonMultiPolygon = { type: 'MultiPolygon'; coordinates: number[][][][] };

export interface Aoi {
  id:       string;
  label:    string;
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon;
  zoom:     number;
}

export const AOIS: Aoi[] = [
  {
    id: 'asuncion',
    label: 'Asunción',
    zoom: 12,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-57.720, -25.396], [-57.472, -25.396],
        [-57.472, -25.187], [-57.720, -25.187],
        [-57.720, -25.396],
      ]],
    },
  },
  {
    id: 'central-py',
    label: 'Depto. Central',
    zoom: 10,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-58.150, -25.700], [-56.950, -25.700],
        [-56.950, -25.100], [-58.150, -25.100],
        [-58.150, -25.700],
      ]],
    },
  },
  {
    id: 'encarnacion',
    label: 'Encarnación',
    zoom: 13,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-55.953, -27.420], [-55.790, -27.420],
        [-55.790, -27.278], [-55.953, -27.278],
        [-55.953, -27.420],
      ]],
    },
  },
  {
    id: 'cde',
    label: 'Ciudad del Este',
    zoom: 13,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-54.684, -25.572], [-54.545, -25.572],
        [-54.545, -25.468], [-54.684, -25.468],
        [-54.684, -25.572],
      ]],
    },
  },
  {
    id: 'buenos-aires',
    label: 'Buenos Aires',
    zoom: 11,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-58.531, -34.706], [-58.335, -34.706],
        [-58.335, -34.527], [-58.531, -34.527],
        [-58.531, -34.706],
      ]],
    },
  },
  {
    id: 'rio',
    label: 'Río de Janeiro',
    zoom: 11,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-43.796, -23.083], [-43.099, -23.083],
        [-43.099, -22.742], [-43.796, -22.742],
        [-43.796, -23.083],
      ]],
    },
  },
  {
    id: 'madrid',
    label: 'Madrid',
    zoom: 11,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-3.848, 40.313], [-3.524, 40.313],
        [-3.524, 40.561], [-3.848, 40.561],
        [-3.848, 40.313],
      ]],
    },
  },
  {
    id: 'barcelona',
    label: 'Barcelona',
    zoom: 12,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [2.052, 41.320], [2.228, 41.320],
        [2.228, 41.469], [2.052, 41.469],
        [2.052, 41.320],
      ]],
    },
  },
  {
    id: 'new-york',
    label: 'New York',
    zoom: 11,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-74.259, 40.477], [-73.700, 40.477],
        [-73.700, 40.917], [-74.259, 40.917],
        [-74.259, 40.477],
      ]],
    },
  },
  {
    id: 'panama',
    label: 'Panamá City',
    zoom: 12,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-79.602, 8.897], [-79.453, 8.897],
        [-79.453, 9.051], [-79.602, 9.051],
        [-79.602, 8.897],
      ]],
    },
  },
  {
    id: 'mexico-df',
    label: 'Ciudad de México',
    zoom: 11,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-99.366, 19.183], [-98.940, 19.183],
        [-98.940, 19.592], [-99.366, 19.592],
        [-99.366, 19.183],
      ]],
    },
  },
  {
    id: 'paris',
    label: 'París',
    zoom: 12,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [2.224, 48.815], [2.470, 48.815],
        [2.470, 48.902], [2.224, 48.902],
        [2.224, 48.815],
      ]],
    },
  },
  {
    id: 'heidelberg',
    label: 'Heidelberg',
    zoom: 13,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [8.618, 49.351], [8.771, 49.351],
        [8.771, 49.460], [8.618, 49.460],
        [8.618, 49.351],
      ]],
    },
  },
  {
    id: 'berlin',
    label: 'Berlín',
    zoom: 11,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [13.088, 52.338], [13.761, 52.338],
        [13.761, 52.675], [13.088, 52.675],
        [13.088, 52.338],
      ]],
    },
  },
  {
    id: 'roma',
    label: 'Roma',
    zoom: 12,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [12.352, 41.783], [12.648, 41.783],
        [12.648, 41.987], [12.352, 41.987],
        [12.352, 41.783],
      ]],
    },
  },
];

/**
 * Computes the bounding box of a GeoJSON polygon or multipolygon.
 * Returns [[west, south], [east, north]] — MapLibre fitBounds format.
 */
export function computeBbox(
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
): [[number, number], [number, number]] {
  const flat: number[][] =
    geometry.type === 'Polygon'
      ? geometry.coordinates[0]
      : geometry.coordinates.flatMap((poly) => poly[0]);

  const lngs = flat.map((c) => c[0]);
  const lats = flat.map((c) => c[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build 2>&1 | head -30`

Expected: Build succeeds (zero TypeScript errors in lib/aois.ts). Any unrelated pre-existing errors are acceptable.

- [ ] **Step 3: Commit**

```bash
git add lib/aois.ts
git commit -m "feat: add AOI catalog with 15 city polygons and computeBbox helper"
```

---

### Task 2: Refactor `app/api/gee-map/route.ts` — split image builders

Split the monolithic `ndviExpression`/`lstExpression` functions into reusable image-builder + visualize functions. No AOI logic yet — just the refactor. The POST handler behavior is identical after this task.

**Files:**
- Modify: `app/api/gee-map/route.ts`

- [ ] **Step 1: Replace the GeeValue type and add `geoJsonGeometry` support**

In `route.ts`, find the existing `GeeValue` type:
```typescript
type GeeValue = {
  constantValue?: unknown;
  functionInvocationValue?: { functionName: string; arguments: Record<string, GeeValue> };
  arrayValue?: { values: GeeValue[] };
};
```

Replace it with:
```typescript
type GeeValue = {
  constantValue?: unknown;
  functionInvocationValue?: { functionName: string; arguments: Record<string, GeeValue> };
  arrayValue?: { values: GeeValue[] };
  geoJsonGeometry?: { type: string; coordinates: unknown };
};
```

- [ ] **Step 2: Add helper functions after the existing `arr` function**

After the `arr` function (around line 109), add:

```typescript
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
```

- [ ] **Step 3: Replace `ndviExpression` with `buildNdviImage` + `visualizeNdvi`**

Delete the entire `ndviExpression` function and replace with:

```typescript
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
```

- [ ] **Step 4: Replace `lstExpression` with `buildLstImage` + `visualizeLst`**

Delete the entire `lstExpression` function and replace with:

```typescript
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
```

- [ ] **Step 5: Update the POST handler to use the new functions (no AOI yet)**

Find the existing POST handler section that builds the expression:

```typescript
    const expression = layer === 'ndvi'
      ? ndviExpression(years, seasons)
      : lstExpression(years, seasons);
```

Replace with:

```typescript
    const image = layer === 'ndvi'
      ? buildNdviImage(years, seasons)
      : buildLstImage(years, seasons);

    const expression = layer === 'ndvi'
      ? visualizeNdvi(image, VIZ_DEFAULTS.ndvi.min, VIZ_DEFAULTS.ndvi.max)
      : visualizeLst(image, VIZ_DEFAULTS.soilTemp.min, VIZ_DEFAULTS.soilTemp.max);
```

Also update the return statement to include `min` and `max` (the display values — no AOI so use DISPLAY_DEFAULTS):

Find:
```typescript
    return NextResponse.json({ tileBaseUrl, token }, {
      headers: { 'Cache-Control': 'private, max-age=3000' }, // 50 min — GEE tile maps expire in ~1 hour
    });
```

Replace with:
```typescript
    const displayMin = DISPLAY_DEFAULTS[layer].min;
    const displayMax = DISPLAY_DEFAULTS[layer].max;

    return NextResponse.json({ tileBaseUrl, token, min: displayMin, max: displayMax }, {
      headers: { 'Cache-Control': 'private, max-age=3000' },
    });
```

- [ ] **Step 6: Verify build still passes**

Run: `npm run build 2>&1 | head -40`

Expected: Build succeeds. If TypeScript errors appear, fix them before committing. Common issue: `GeeExpression` return type mismatch — verify `visualizeNdvi`/`visualizeLst` return `{ result: string; values: Record<string, GeeValue> }`.

- [ ] **Step 7: Commit**

```bash
git add app/api/gee-map/route.ts
git commit -m "refactor: split GEE image builders from visualizers, add geoJsonGeometry type"
```

---

### Task 3: Add AOI stats computation to `app/api/gee-map/route.ts`

Add the `value:compute` call for p5/p95 stats and update the POST handler to accept `aoiId`.

**Files:**
- Modify: `app/api/gee-map/route.ts`
- Modify (import): `app/api/gee-map/route.ts` (add `AOIS` import from `lib/aois.ts`)

- [ ] **Step 1: Add the AOIS import at the top of route.ts**

After the existing imports, add:
```typescript
import { AOIS } from '@/lib/aois';
```

- [ ] **Step 2: Add the `computeStats` helper function**

After the `buildGeometry` function (added in Task 2), add:

```typescript
/**
 * Calls GEE value:compute to evaluate a reduceRegion expression.
 * Returns the raw dictionary values from GEE (each entry is a GeeValue).
 */
async function computeStats(
  token:      string,
  projectId:  string,
  expression: GeeExpression,
): Promise<Record<string, { constantValue?: number }>> {
  const res = await fetch(`${GEE_V1}/projects/${projectId}/value:compute`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      Authorization:   `Bearer ${token}`,
    },
    body: JSON.stringify({ expression }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GEE value:compute error: ${text}`);
  }
  const data = await res.json() as {
    result: string;
    values: Record<string, {
      dictionaryValue?: { values: Record<string, { constantValue?: number }> };
    }>;
  };
  const topVal = data.values[data.result];
  if (!topVal?.dictionaryValue) {
    throw new Error(`value:compute: expected dictionaryValue, got: ${JSON.stringify(topVal)}`);
  }
  return topVal.dictionaryValue.values;
}

/** Extracts a number from a GEE constantValue node. */
function extractNumber(v: { constantValue?: number } | undefined, key: string): number {
  if (v && typeof v.constantValue === 'number') return v.constantValue;
  throw new Error(`value:compute: could not read key "${key}": ${JSON.stringify(v)}`);
}
```

- [ ] **Step 3: Refactor the POST handler to handle `aoiId`**

Find the existing POST handler. The `body` type currently is:
```typescript
const body = (await request.json()) as {
  layer: 'ndvi' | 'soilTemp';
  years?: number[];
  seasons?: string[];
};
```

Replace that type with:
```typescript
const body = (await request.json()) as {
  layer:    'ndvi' | 'soilTemp';
  years?:   number[];
  seasons?: string[];
  aoiId?:   string;
};
```

- [ ] **Step 4: Replace the expression-building block in the POST handler**

Find the block that currently reads:
```typescript
    const image = layer === 'ndvi'
      ? buildNdviImage(years, seasons)
      : buildLstImage(years, seasons);

    const expression = layer === 'ndvi'
      ? visualizeNdvi(image, VIZ_DEFAULTS.ndvi.min, VIZ_DEFAULTS.ndvi.max)
      : visualizeLst(image, VIZ_DEFAULTS.soilTemp.min, VIZ_DEFAULTS.soilTemp.max);
```

And the `displayMin`/`displayMax` block near the return statement. Replace the entire section (from building the image to returning the response) with:

```typescript
    const { aoiId } = body;

    // Validate aoiId if provided
    if (aoiId !== undefined) {
      const found = AOIS.find((a) => a.id === aoiId);
      if (!found) {
        return NextResponse.json({ error: `Unknown aoiId: ${aoiId}` }, { status: 400 });
      }
    }

    const image = layer === 'ndvi'
      ? buildNdviImage(years, seasons)
      : buildLstImage(years, seasons);

    let vizMin: number;
    let vizMax: number;
    let displayMin: number;
    let displayMax: number;
    let geometry: GeeValue | undefined;

    if (aoiId) {
      const aoi = AOIS.find((a) => a.id === aoiId)!;
      geometry = buildGeometry(aoi.geometry);

      // Build the stats expression: reduceRegion over the clipped image
      const statsExpression: GeeExpression = {
        result: 'result',
        values: {
          result: invoke('Image.reduceRegion', {
            input: invoke('Image.clip', { input: image, geometry }),
            reducer: invoke('Reducer.percentile', {
              percentiles: arr([constant(5), constant(95)]),
            }),
            geometry,
            scale:      constant(1000),
            bestEffort: constant(true),
          }),
        },
      };

      const statsDict = await computeStats(token, sa.project_id, statsExpression);

      if (layer === 'ndvi') {
        // Band name from Image.normalizedDifference is 'nd'
        const p5  = extractNumber(statsDict['nd_p5'],  'nd_p5');
        const p95 = extractNumber(statsDict['nd_p95'], 'nd_p95');
        vizMin = p5;  vizMax = p95;
        displayMin = p5; displayMax = p95;
      } else {
        // Band name is 'ST_B10_median' from ImageCollection.reduce(Reducer.median)
        const p5  = extractNumber(statsDict['ST_B10_median_p5'],  'ST_B10_median_p5');
        const p95 = extractNumber(statsDict['ST_B10_median_p95'], 'ST_B10_median_p95');
        vizMin = p5;  vizMax = p95;
        displayMin = lstDnToCelsius(p5);
        displayMax = lstDnToCelsius(p95);
      }
    } else {
      vizMin     = VIZ_DEFAULTS[layer].min;
      vizMax     = VIZ_DEFAULTS[layer].max;
      displayMin = DISPLAY_DEFAULTS[layer].min;
      displayMax = DISPLAY_DEFAULTS[layer].max;
    }

    const expression = layer === 'ndvi'
      ? visualizeNdvi(image, vizMin, vizMax, geometry)
      : visualizeLst(image, vizMin, vizMax, geometry);

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

    return NextResponse.json(
      { tileBaseUrl, token, min: displayMin, max: displayMax },
      { headers: { 'Cache-Control': 'private, max-age=3000' } },
    );
```

Note: remove the old `res` fetch block and old `data` extraction that already existed — the above replaces everything from the image-build to the return.

- [ ] **Step 5: Verify build passes**

Run: `npm run build 2>&1 | head -40`

Expected: Build succeeds. Common issues:
- `sa` used before declaration in the new block — verify `const sa = loadServiceAccount()` is still above this section.
- `token` similarly — verify `const token = await getAccessToken(sa)` is still above.
- Import error for `AOIS` — verify `@/lib/aois` path resolves.

- [ ] **Step 6: Commit**

```bash
git add app/api/gee-map/route.ts
git commit -m "feat: add AOI stats computation via GEE value:compute, clip tiles to AOI"
```

---

### Task 4: Update `lib/geeApi.ts` — return `{tileBaseUrl, min, max}`

**Files:**
- Modify: `lib/geeApi.ts`

- [ ] **Step 1: Rewrite `lib/geeApi.ts`**

Replace the entire file with:

```typescript
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
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build 2>&1 | head -40`

Expected: Build may show errors in `MapView.tsx` (old 3-arg `getGeeTileUrl` call is now wrong return type). That is expected — it will be fixed in Task 6.

- [ ] **Step 3: Commit**

```bash
git add lib/geeApi.ts
git commit -m "feat: geeApi returns {tileBaseUrl, min, max}, cache key includes aoiId"
```

---

### Task 5: Update `components/MapClient.tsx` — add AOI state

**Files:**
- Modify: `components/MapClient.tsx`

- [ ] **Step 1: Rewrite `MapClient.tsx`**

Replace the entire file with:

```tsx
'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Header from './Header';
import Sidebar from './Sidebar';
import Legend from './Legend';
import StatusBar from './StatusBar';
import type { LayerType } from '@/lib/types';
import { INITIAL_VIEW_STATE } from '@/lib/constants';

const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-full h-full">
      <div className="flex flex-col items-center gap-4">
        <div
          style={{
            width: '40px',
            height: '40px',
            border: '2px solid var(--neon-green)',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <p
          style={{
            fontFamily: 'var(--font-pixel)',
            fontSize: '7px',
            color: 'var(--neon-green)',
            textShadow: 'var(--glow-green)',
          }}
        >
          CARGANDO_MAPA...
        </p>
      </div>
    </div>
  ),
});

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
  const [hour, setHour]       = useState(8);
  const [years, setYears]     = useState<number[]>([new Date().getFullYear()]);
  const [seasons, setSeasons] = useState<string[]>([currentSeason()]);
  const [selectedAoi, setSelectedAoi] = useState<string | null>(null);
  const [geeStats, setGeeStats] = useState<
    Partial<Record<'ndvi' | 'soilTemp', { min: number; max: number }>>
  >({});
  const [coords, setCoords] = useState({
    lat: INITIAL_VIEW_STATE.latitude,
    lng: INITIAL_VIEW_STATE.longitude,
    zoom: INITIAL_VIEW_STATE.zoom,
  });

  const toggleLayer = (id: LayerType) =>
    setActiveLayers((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleCoordsChange = useCallback(
    (lat: number, lng: number, zoom: number) => setCoords({ lat, lng, zoom }),
    [],
  );

  const handleStatsChange = useCallback(
    (layer: 'ndvi' | 'soilTemp', min: number, max: number) =>
      setGeeStats((prev) => ({ ...prev, [layer]: { min, max } })),
    [],
  );

  return (
    <div
      className="relative w-full h-screen overflow-hidden"
      style={{ background: 'var(--bg-base)' }}
    >
      <MapView
        activeLayers={activeLayers}
        hour={hour}
        onCoordsChange={handleCoordsChange}
        years={years}
        seasons={seasons}
        selectedAoi={selectedAoi}
        onStatsChange={handleStatsChange}
      />
      <Header />
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
        selectedAoi={selectedAoi}
        onAoiChange={setSelectedAoi}
      />
      <Legend activeLayers={activeLayers} geeStats={geeStats} />
      <StatusBar lat={coords.lat} lng={coords.lng} zoom={coords.zoom} />
    </div>
  );
}
```

- [ ] **Step 2: Verify build (errors in MapView/Sidebar/Legend are expected)**

Run: `npm run build 2>&1 | head -40`

Expected: TypeScript errors only in `MapView.tsx`, `Sidebar.tsx`, and `Legend.tsx` (missing props). No errors in `MapClient.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add components/MapClient.tsx
git commit -m "feat: add selectedAoi and geeStats state to MapClient, wire AOI callbacks"
```

---

### Task 6: Update `components/MapView.tsx` — AOI zoom + onStatsChange

**Files:**
- Modify: `components/MapView.tsx`

- [ ] **Step 1: Add new imports and update props interface**

At the top of `MapView.tsx`, add the new import after the existing imports:
```typescript
import { AOIS, computeBbox } from '@/lib/aois';
```

Update the `MapViewProps` interface (currently around line 20):

```typescript
interface MapViewProps {
  activeLayers: Record<LayerType, boolean>;
  hour: number;
  onCoordsChange?: (lat: number, lng: number, zoom: number) => void;
  years: number[];
  seasons: string[];
  selectedAoi: string | null;
  onStatsChange: (layer: 'ndvi' | 'soilTemp', min: number, max: number) => void;
}
```

Update the function signature to destructure the new props:
```typescript
export default function MapView({
  activeLayers, hour, onCoordsChange, years, seasons, selectedAoi, onStatsChange,
}: MapViewProps) {
```

- [ ] **Step 2: Update the GEE refresh effect to include `selectedAoi` and call `onStatsChange`**

Find the existing GEE refresh effect (the `useEffect` with `refreshGee` inside, around line 151). Replace it entirely with:

```typescript
  // ── Fetch / refresh GEE tile URLs ──────────────────
  // Runs on mount and whenever years, seasons, or selectedAoi change.
  useEffect(() => {
    let cancelled = false;

    async function refreshGee(layer: 'ndvi' | 'soilTemp', sourceId: string) {
      try {
        const result = await getGeeTileUrl(layer, years, seasons, selectedAoi ?? undefined);
        if (cancelled) return;
        onStatsChange(layer, result.min, result.max);
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
  }, [years, seasons, selectedAoi]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Add the AOI camera-zoom effect**

Add a new `useEffect` after the GEE refresh effect:

```typescript
  // ── AOI camera zoom ─────────────────────────────────
  // When selectedAoi changes to a non-null value, zoom the camera to fit the AOI.
  useEffect(() => {
    if (!selectedAoi) return;
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    const aoi = AOIS.find((a) => a.id === selectedAoi);
    if (!aoi) return;
    map.fitBounds(computeBbox(aoi.geometry), { padding: 40, duration: 800 });
  }, [selectedAoi]);
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build 2>&1 | head -40`

Expected: `MapView.tsx` now passes. Remaining errors should be only in `Sidebar.tsx` and `Legend.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/MapView.tsx
git commit -m "feat: MapView zooms to AOI on selection, reports GEE stats via onStatsChange"
```

---

### Task 7: Update `components/Sidebar.tsx` — AOI panel

**Files:**
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Add new AOI props to `SidebarProps` and add AOI catalog import**

Add the import at the top (after the lucide-react import):
```typescript
import { AOIS } from '@/lib/aois';
```

Extend the `SidebarProps` interface with two new fields at the bottom:
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
  selectedAoi: string | null;
  onAoiChange: (id: string | null) => void;
}
```

Add `selectedAoi` and `onAoiChange` to the destructured parameters of the `Sidebar` function:
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
  selectedAoi,
  onAoiChange,
}: SidebarProps) {
```

- [ ] **Step 2: Add `handleAoiClick` helper inside the `Sidebar` function body**

Add after the `toggleSeason` function (before `showTemporalFilter`):

```typescript
  function handleAoiClick(id: string) {
    // Radio-select: clicking the active AOI deselects (returns to GLOBAL)
    onAoiChange(selectedAoi === id ? null : id);
  }
```

- [ ] **Step 3: Insert the AOI panel in the JSX**

Find the JSX comment `{/* ── Layer cards ────────────────────────────── */}`.

Insert the AOI panel **between** the system header panel and the layer cards section:

```tsx
      {/* ── AOI Filter ─────────────────────────────────── */}
      <div className="terminal-panel fade-in-up">
        <div
          style={{
            fontFamily:    'var(--font-pixel)',
            fontSize:      '6px',
            color:         'var(--neon-cyan)',
            textShadow:    'var(--glow-cyan)',
            letterSpacing: '0.04em',
            marginBottom:  '10px',
          }}
        >
          &gt; AOI_FILTER
        </div>
        <div className="flex gap-1 flex-wrap">
          {/* GLOBAL pill — always first */}
          <button
            key="global"
            onClick={() => onAoiChange(null)}
            style={{
              fontFamily:    'var(--font-pixel)',
              fontSize:      '6px',
              letterSpacing: '0.04em',
              padding:       '3px 6px',
              border:        `1px solid ${selectedAoi === null ? 'var(--neon-cyan)' : 'var(--bg-border)'}`,
              background:    selectedAoi === null ? 'var(--neon-cyan)22' : 'transparent',
              color:         selectedAoi === null ? 'var(--neon-cyan)' : 'var(--text-muted)',
              textShadow:    selectedAoi === null ? 'var(--glow-cyan)' : 'none',
              cursor:        'pointer',
              transition:    'all 0.15s',
            }}
          >
            GLOBAL
          </button>
          {AOIS.map((aoi) => {
            const active = selectedAoi === aoi.id;
            return (
              <button
                key={aoi.id}
                onClick={() => handleAoiClick(aoi.id)}
                style={{
                  fontFamily:    'var(--font-pixel)',
                  fontSize:      '6px',
                  letterSpacing: '0.04em',
                  padding:       '3px 6px',
                  border:        `1px solid ${active ? 'var(--neon-cyan)' : 'var(--bg-border)'}`,
                  background:    active ? 'var(--neon-cyan)22' : 'transparent',
                  color:         active ? 'var(--neon-cyan)' : 'var(--text-muted)',
                  textShadow:    active ? 'var(--glow-cyan)' : 'none',
                  cursor:        'pointer',
                  transition:    'all 0.15s',
                }}
              >
                {aoi.label.toUpperCase().slice(0, 8)}
              </button>
            );
          })}
        </div>
      </div>
```

(The `.toUpperCase().slice(0,8)` keeps labels short enough to fit the narrow sidebar.)

- [ ] **Step 4: Verify build passes**

Run: `npm run build 2>&1 | head -40`

Expected: `Sidebar.tsx` errors resolved. Only `Legend.tsx` may still have a type error.

- [ ] **Step 5: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat: add always-visible AOI panel to Sidebar with cyan radio pills"
```

---

### Task 8: Update `components/Legend.tsx` — dynamic min/max

**Files:**
- Modify: `components/Legend.tsx`

- [ ] **Step 1: Update `LegendProps` to accept `geeStats`**

Find the existing `LegendProps` interface:
```typescript
interface LegendProps {
  activeLayers: Record<LayerType, boolean>;
}
```

Replace with:
```typescript
interface LegendProps {
  activeLayers: Record<LayerType, boolean>;
  geeStats:     Partial<Record<'ndvi' | 'soilTemp', { min: number; max: number }>>;
}
```

Update the function signature:
```typescript
export default function Legend({ activeLayers, geeStats }: LegendProps) {
```

- [ ] **Step 2: Update the min/max display inside the render loop**

Find the min/max section inside the `.map` loop:
```tsx
            {/* Min/Max */}
            <div
              className="flex justify-between"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                color: 'var(--text-muted)',
              }}
            >
              <span>{leg.min}</span>
              <span>{leg.max}</span>
            </div>
```

Replace with:
```tsx
            {/* Min/Max — dynamic when AOI active, hardcoded otherwise */}
            {(() => {
              const stats = layerId !== 'traffic' ? geeStats[layerId as 'ndvi' | 'soilTemp'] : undefined;
              const isLst = layerId === 'soilTemp';
              const minLabel = stats
                ? (isLst ? `${stats.min.toFixed(1)}°C` : stats.min.toFixed(2))
                : leg.min;
              const maxLabel = stats
                ? (isLst ? `${stats.max.toFixed(1)}°C` : stats.max.toFixed(2))
                : leg.max;
              return (
                <div
                  className="flex justify-between"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9px',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>{minLabel}</span>
                  <span>{maxLabel}</span>
                </div>
              );
            })()}
```

- [ ] **Step 3: Verify full build passes**

Run: `npm run build 2>&1 | head -40`

Expected: Zero TypeScript errors across all modified files. If warnings appear about `unused variables` they are fine — only errors matter.

- [ ] **Step 4: Commit**

```bash
git add components/Legend.tsx
git commit -m "feat: Legend shows dynamic p5/p95 min/max when AOI is active"
```

---

### Task 9: Push and smoke-test

- [ ] **Step 1: Verify the full build one final time**

Run: `npm run build`

Expected: Exits 0 with no TypeScript errors.

- [ ] **Step 2: Push to origin**

```bash
git push origin main
```

- [ ] **Step 3: Manual smoke test checklist**

After Vercel redeploys (watch the deployment at the Vercel dashboard):

1. **GLOBAL default** — open the app, toggle VEGETATION on. Legend should show `-1 SUELO` / `+1 DENSA` (hardcoded — no AOI selected).
2. **Select Asunción AOI** — click `ASUNCIÓN` pill in AOI_FILTER. Map camera should zoom to fit Asunción. GEE re-fetches; tiles should show only the Asunción area. Legend min/max should update to computed values (e.g. `0.02` / `0.65`).
3. **Deselect AOI** — click `ASUNCIÓN` again (or click `GLOBAL`). Camera stays put (no re-zoom). Legend returns to hardcoded labels. GEE re-fetches global tiles.
4. **LST with AOI** — toggle TEMPERATURA on, select `BUENOS AIRES`. Legend should show dynamic °C values after fetch.
5. **Multiple layers + AOI** — both VEGETATION and TEMPERATURA active, select `MADRID`. Both layers should report dynamic stats; both legend entries should update.
6. **Different city** — switch from `MADRID` to `BERLIN`. Map zooms to Berlin. Both layer tiles refresh.
