# AsunGreen — High-Resolution Environmental Data Layers

**Date:** 2026-04-13
**Status:** Approved

## Problem

Current MODIS-based tiles (NDVI at 250m, LST at 1km) are insufficient for urban environmental analysis. Asunción requires 10m–30m resolution to identify meaningful spatial patterns at the neighborhood scale.

---

## Solution Overview

Replace MODIS pre-cached tiles with fully on-demand GEE streaming at high resolution:

- **NDVI**: Sentinel-2 at 10m (`COPERNICUS/S2_SR_HARMONIZED`)
- **Soil Temperature (LST)**: Landsat 8+9 merged collection at 30m (`LANDSAT/LC08/C02/T1_L2` + `LANDSAT/LC09/C02/T1_L2`)

Users select one or more years (last 10) and one or more seasons (Southern Hemisphere). GEE computes a median composite of all matching images server-side and returns a tile URL. The browser streams tiles live from GEE using an OAuth2 token from the existing `/api/gee-map` proxy.

---

## Data Sources

### NDVI — Sentinel-2 SR Harmonized

| Property | Value |
|---|---|
| Collection | `COPERNICUS/S2_SR_HARMONIZED` |
| Native resolution | 10m (B4, B8) |
| Cloud filter | `CLOUDY_PIXEL_PERCENTAGE < 20` (scene-level) |
| Composite method | `ImageCollection.reduce(Reducer.median)` |
| NDVI computation | `Image.normalizedDifference(['B8_median', 'B4_median'])` |
| Visualization | min=−0.2, max=0.8, palette: `ff2d78 → ffe600 → 00ff88 → 00a855 → 004d22` |

### LST — Landsat 8+9 Collection 2 Level-2

| Property | Value |
|---|---|
| Collection | Merge of `LANDSAT/LC08/C02/T1_L2` and `LANDSAT/LC09/C02/T1_L2` |
| Native resolution | 30m optical / 100m thermal resampled to 30m |
| Cloud filter | `CLOUD_COVER < 30` (scene-level) |
| Composite method | `ImageCollection.reduce(Reducer.median)` |
| Band | `ST_B10_median` (raw DN) |
| Visualization | min=40713, max=50947 (equivalent to 15°C–50°C without in-expression conversion), palette: `001aff → 00e5ff → ffe600 → ff7c00 → ff2d78` |

> **Note on Landsat thermal resolution**: The thermal band is native 100m, resampled to 30m in the Level-2 product. This is the highest publicly available resolution for surface temperature globally. No 10m thermal data exists (physics limitation).

---

## Seasonal Filter

Southern Hemisphere seasons. Summer spans the year boundary.

| Season | Months | Key for year Y |
|---|---|---|
| Spring (`spring`) | Sep–Nov | `Y-09-01` to `Y-11-30` |
| Summer (`summer`) | Dec–Feb | `Y-12-01` to `(Y+1)-02-28` |
| Autumn (`autumn`) | Mar–May | `Y-03-01` to `Y-05-31` |
| Winter (`winter`) | Jun–Aug | `Y-06-01` to `Y-08-31` |

When multiple years and/or seasons are selected, all (year × season) date ranges are combined using `Filter.or`. Example: years=[2023,2024], seasons=['summer','winter'] produces 4 date ranges ORed together.

---

## API Changes

### `POST /api/gee-map`

**Request body:**
```json
{
  "layer": "ndvi" | "soilTemp",
  "years": [2024],
  "seasons": ["summer"]
}
```

**Response:**
```json
{
  "tileBaseUrl": "https://earthengine.googleapis.com/v1/projects/.../maps/.../tiles",
  "token": "<oauth2_access_token>"
}
```

The server:
1. Computes all (year, season) date ranges from the request
2. Builds a `Filter.or` of `Filter.and(Filter.gte, Filter.lt)` pairs on `system:time_start`
3. Applies scene-level cloud filter
4. Merges Landsat collections (LST only)
5. Reduces to median
6. Creates GEE map with `fileFormat: 'PNG'`
7. Returns tile URL + bearer token

**Default values** (when omitted): current year, current Southern Hemisphere season.

---

## Frontend Changes

### `lib/geeApi.ts`

- Cache key changes from `layer` to `layer + years.join(',') + seasons.join(',')`
- `getGeeTileUrl(layer, years, seasons)` — new signature
- When parameters change, bypass cache and fetch a new tile URL

### `lib/tileRouter.ts`

- `shouldUseLocalTile()` returns `false` always — no local tile cache
- File kept for future use but effectively a no-op

### `components/Sidebar.tsx`

New filter panel shown when NDVI or soilTemp layer is active:

```
┌─────────────────────────────┐
│ > TEMPORAL_FILTER           │
│                             │
│ ESTACIÓN                    │
│ [PRIM] [VER*] [OTO] [INV]  │
│                             │
│ AÑO                         │
│ [2025*][2024][2023][2022]   │
│ [2021][2020][2019][2018]    │
│ [2017][2016]                │
└─────────────────────────────┘
```

- Pills use existing neon toggle style
- `*` = selected state
- Multi-select for both dimensions
- Default: current year + current season

### `components/MapClient.tsx`

- Holds `years: number[]` and `seasons: string[]` state
- Passes them to `MapView` which passes them to `getGeeTileUrl`
- On change: call `getGeeTileUrl(layer, years, seasons)` → `setTiles()` to refresh

---

## Cleanup

- Delete `public/tiles/` (552 MODIS PNG files)
- Remove `scripts/generate-tiles.mjs` (replaced by on-demand approach)
- Remove `NEXT_PUBLIC_GEE_API_KEY` from `.env.local` (no longer used)

---

## Out of Scope

- Pixel-level SCL cloud masking (deferred — median composite is statistically robust for multi-year seasonal windows)
- Date range picker (year/season selectors cover the use case)
- Comparing two time periods side by side
