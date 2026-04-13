# AsunGreen — AOI Filter with Dynamic Color Scale

**Date:** 2026-04-13
**Status:** Approved

## Problem

All GEE layers currently cover the entire globe with fixed color scale ranges (e.g., NDVI -0.2→0.8, LST 15°C→50°C). These ranges are too wide for city-scale analysis — a city like Asunción in autumn may only span NDVI 0.0→0.55 and LST 18°C→38°C, making subtle differences invisible.

---

## Solution Overview

Add a single-select AOI (Area of Interest) panel to the Sidebar. Selecting an AOI:
1. **Clips** the GEE layer to the exact administrative polygon of that city/region
2. **Zooms** the camera to fit the AOI bounds
3. **Computes** p5/p95 statistics over the AOI via GEE `value:compute` and uses them as the visualization min/max
4. **Updates** the Legend to display the real computed range

GLOBAL (no AOI) is the default: no clip, no stats computation, hardcoded scale.

---

## AOI Catalog

**File:** `lib/aois.ts`

```typescript
interface Aoi {
  id:       string;
  label:    string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon; // GADM-sourced, simplified ~0.01°
  zoom:     number; // camera zoom level on selection
}
```

Polygons are sourced from GADM (gadm.org) and simplified at ~0.01° tolerance during implementation. The camera `fitBounds` bbox is computed at runtime from the geometry's coordinate extremes (no stored bbox needed).

| id | label | zoom |
|---|---|---|
| `asuncion` | Asunción | 12 |
| `central-py` | Depto. Central | 10 |
| `encarnacion` | Encarnación | 13 |
| `cde` | Ciudad del Este | 13 |
| `buenos-aires` | Buenos Aires | 11 |
| `rio` | Río de Janeiro | 11 |
| `madrid` | Madrid | 11 |
| `barcelona` | Barcelona | 12 |
| `new-york` | New York | 11 |
| `panama` | Panamá City | 12 |
| `mexico-df` | Ciudad de México | 11 |
| `paris` | París | 12 |
| `heidelberg` | Heidelberg | 13 |
| `berlin` | Berlín | 11 |
| `roma` | Roma | 12 |

Helper exported from `lib/aois.ts`:
```typescript
export function computeBbox(geometry: GeoJSON.Geometry): [[number, number], [number, number]]
// Returns [[west, south], [east, north]] for map.fitBounds()
```

---

## API Changes

### `POST /api/gee-map`

**Request body:**
```json
{
  "layer":   "ndvi" | "soilTemp",
  "years":   [2024],
  "seasons": ["autumn"],
  "aoiId":   "asuncion"   // optional — omit for global
}
```

**Response:**
```json
{
  "tileBaseUrl": "https://earthengine.googleapis.com/v1/projects/.../maps/.../tiles",
  "token":       "<oauth2_access_token>",
  "min":         0.02,
  "max":         0.71
}
```

- Without AOI: `min`/`max` are the hardcoded defaults (NDVI: -0.2/0.8, LST: 14.9°C/49.9°C converted to °C). No extra GEE call.
- With AOI: `min`/`max` are the p5/p95 values computed over the AOI. LST values are converted from raw DN to °C by the server before returning.

### Internal server flow (with AOI)

```
1. Validate aoiId against AOIS catalog
2. Load AOI geometry → geoJsonGeometry node
3. buildNdviImage(years, seasons) or buildLstImage(years, seasons)
   → returns pre-visualize GEE image node (reused for both calls)
4. [GEE call 1] POST /projects/{id}/value:compute
   Expression: Image.reduceRegion(
     input:      Image.clip(input=image, geometry=geoJsonGeometry),
     reducer:    Reducer.percentile(percentiles=[5, 95]),
     geometry:   geoJsonGeometry,
     scale:      1000,
     bestEffort: true
   )
   → parse p5/p95 from result dictionary
5. Convert LST DN to °C: celsius = (dn * 0.00341802 + 149.0) - 273.15
6. [GEE call 2] POST /projects/{id}/maps
   Expression: Image.visualize(
     image:   Image.clip(input=image, geometry=geoJsonGeometry),
     min:     p5,
     max:     p95,
     palette: [...]
   )
7. Return { tileBaseUrl, token, min: p5_display, max: p95_display }
```

### Route refactor

The current monolithic `ndviExpression()` and `lstExpression()` functions are split:

```typescript
// Returns the pre-visualize image node (filtered, reduced, NDVI computed)
function buildNdviImage(years: number[], seasons: string[]): GeeValue
function buildLstImage(years: number[], seasons: string[]): GeeValue

// Wraps with optional clip + visualize with given min/max
function visualizeNdvi(image: GeeValue, min: number, max: number, geometry?: GeeValue): GeeExpression
function visualizeLst(image: GeeValue, min: number, max: number, geometry?: GeeValue): GeeExpression

// Builds a geoJsonGeometry node from a GeoJSON geometry object
function buildGeometry(geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon): GeeValue
// → { geoJsonGeometry: geojson }
```

### Default min/max constants (no AOI)

```typescript
const DEFAULTS = {
  ndvi:     { min: -0.2,  max: 0.8   },
  soilTemp: { min: 14.9,  max: 49.9  }, // °C (pre-converted from DN 40713/50947)
} as const;
```

---

## Frontend Changes

### `lib/geeApi.ts`

```typescript
export async function getGeeTileUrl(
  layer:    'ndvi' | 'soilTemp',
  years:    number[],
  seasons:  string[],
  aoiId?:   string,
): Promise<{ tileBaseUrl: string; min: number; max: number }>
```

- Cache key: `${layer}|${years.sort()}|${seasons.sort()}|${aoiId ?? 'global'}`
- Cache stores `{ tileBaseUrl, min, max }` (replaces current string-only cache)
- `geeTileUrlCache` and `geeTileTokenCache` updated accordingly
- `geeTileTokenCache` unchanged (still keyed by `'ndvi' | 'soilTemp'`)

### `components/MapClient.tsx`

New state:
```typescript
const [selectedAoi, setSelectedAoi] = useState<string | null>(null);
const [geeStats, setGeeStats] = useState<
  Partial<Record<'ndvi' | 'soilTemp', { min: number; max: number }>>
>({});
```

Passes to children:
- `MapView`: `selectedAoi`, `onStatsChange`
- `Sidebar`: `selectedAoi`, `onAoiChange`
- `Legend`: `geeStats`

### `components/MapView.tsx`

New props: `selectedAoi: string | null`, `onStatsChange: (layer: 'ndvi' | 'soilTemp', min: number, max: number) => void`

**Camera zoom:** When `selectedAoi` changes to a non-null value, call `map.fitBounds(computeBbox(aoi.geometry), { padding: 40 })`.

**GEE refresh effect** now depends on `[years, seasons, selectedAoi]` and calls `getGeeTileUrl(layer, years, seasons, selectedAoi ?? undefined)`. After receiving result, calls `onStatsChange(layer, result.min, result.max)`.

### `components/Sidebar.tsx`

New props: `selectedAoi: string | null`, `onAoiChange: (id: string | null) => void`

New panel **always visible** (not gated on layer activity), positioned above the temporal filter:

```
┌─────────────────────────────┐
│ > AOI_FILTER                │
│                             │
│ [GLOBAL*] [ASU] [CENTRAL]  │
│ [ENC] [CDE] [BUE] [RIO]    │
│ [MAD] [BCN] [NYC] [PAN]     │
│ [MEX] [PAR] [HEI] [BER]    │
│ [ROM]                       │
└─────────────────────────────┘
```

- Uses `var(--neon-cyan)` when active (distinguishes from year/season pills which use `var(--neon-green)`)
- Radio-select: clicking the active AOI deselects it (returns to GLOBAL)
- GLOBAL pill is always first, always shown

### `components/Legend.tsx`

New prop: `geeStats: Partial<Record<'ndvi' | 'soilTemp', { min: number; max: number }>>`

Display logic per layer:
- **With stats** (AOI active): `${stats.min.toFixed(layer === 'ndvi' ? 2 : 1)}` and `${stats.max.toFixed(layer === 'ndvi' ? 2 : 1)}°C` (LST) or no unit (NDVI)
- **Without stats** (GLOBAL): existing hardcoded labels unchanged

---

## GEE REST API Notes

- `geoJsonGeometry` is a valid value-node type in the GEE REST API expression format.
- `Image.clip` takes `input` (not `image`) as the image argument — consistent with `Image.normalizedDifference`.
- `Reducer.percentile` takes `percentiles: number[]` argument.
- `Image.reduceRegion` takes `input`, `reducer`, `geometry`, `scale`, `bestEffort` arguments.
- `value:compute` endpoint: `POST /projects/{project}/value:compute`, body `{ expression }`. Returns computed value in GEE serialized format — parse the result dictionary for p5/p95 values.
- If `bestEffort=true` and the AOI is very large, GEE may increase the scale automatically — acceptable.

---

## Out of Scope

- Multiple simultaneous AOI selection
- Custom user-drawn AOI
- AOI-specific layer attribution or source display changes
- Saving/sharing selected AOI in URL
