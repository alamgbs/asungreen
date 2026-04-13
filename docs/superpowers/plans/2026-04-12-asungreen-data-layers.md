# AsunGreen Data Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace MODIS low-res data and hardcoded traffic corridors with GEE Sentinel-2/Landsat real data, local tile pre-cache for Asunción, and OSM road network for traffic simulation.

**Architecture:** `transformRequest` in MapLibre intercepts every tile request for the env-data layers — if the tile falls inside Asunción's bbox and below the max zoom for that layer, it serves a pre-downloaded PNG from `/public/tiles/`; otherwise it routes to a live GEE tile URL fetched once per session by `lib/geeApi.ts`. Traffic particles flow along road geometries fetched once from Overpass and stored in `/public/data/`.

**Tech Stack:** Next.js 16, MapLibre GL v5, Google Earth Engine REST API v1, Overpass API, Deck.gl v9 ScatterplotLayer, Node.js ESM scripts

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `components/MapView.tsx` | transformRequest routing, GEE sources, opacity fix, particle fix, OSM loading |
| Create | `lib/geeApi.ts` | GEE REST API client — one map creation per layer per session, cache tile base URL |
| Create | `lib/tileRouter.ts` | Pre-computed bbox tile ranges, `shouldUseLocalTile(layer, z, x, y)` |
| Modify | `lib/trafficSim.ts` | `loadCorridors()`, `initParticles(corridors)`, `updateParticles` uses module-level corridors |
| Modify | `lib/constants.ts` | Remove `TRAFFIC_CORRIDORS` |
| Modify | `lib/types.ts` | No functional changes needed |
| Create | `scripts/fetch-osm-roads.mjs` | Download Asunción roads from Overpass, save GeoJSON |
| Create | `scripts/generate-tiles.mjs` | Download GEE PNG tiles for Asunción bbox, save to `/public/tiles/` |
| Modify | `.env.local` | Add `NEXT_PUBLIC_GEE_PROJECT` |

---

## Task 1: Bug Fixes — Layer Visibility + Particle Zoom Scaling

**Files:**
- Modify: `components/MapView.tsx`

**Context:** Two bugs exist. (1) NDVI and soilTemp layers start with `raster-opacity: 0` and never get set — the effect that sets them depends on `mapReadyRef` which is a ref, so React doesn't re-render when it changes to `true`. Fix: set opacities directly inside `map.on('load', ...)`. (2) Traffic particles use `radiusUnits: 'meters'` which means they shrink to invisible at low zoom and blow up at high zoom. Fix: switch to `radiusUnits: 'pixels'` with a fixed 4px radius.

- [ ] **Step 1: Fix opacity in load handler and particle radius**

Replace the entire `components/MapView.tsx` with this content:

```tsx
'use client';

import { useRef, useEffect, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { ScatterplotLayer } from '@deck.gl/layers';
import { Deck } from '@deck.gl/core';
import type { LayerType } from '@/lib/types';
import { INITIAL_VIEW_STATE, NASA_GIBS } from '@/lib/constants';
import { initParticles, updateParticles, particleColor } from '@/lib/trafficSim';
import type { TrafficParticle } from '@/lib/types';
import { applyNeonTheme } from '@/lib/mapStyle';

interface MapViewProps {
  activeLayers: Record<LayerType, boolean>;
  hour: number;
  onCoordsChange?: (lat: number, lng: number, zoom: number) => void;
}

export default function MapView({ activeLayers, hour, onCoordsChange }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const deckCanvasRef   = useRef<HTMLCanvasElement>(null);
  const mapRef          = useRef<maplibregl.Map | null>(null);
  const deckRef         = useRef<Deck | null>(null);
  const particlesRef    = useRef<TrafficParticle[]>([]);
  const animFrameRef    = useRef<number>(0);
  const lastTimeRef     = useRef<number>(0);
  const mapReadyRef     = useRef(false);

  // ── Initialize MapLibre ─────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
      zoom: INITIAL_VIEW_STATE.zoom,
      pitch: INITIAL_VIEW_STATE.pitch,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('styleimagemissing', (e) => {
      map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
    });

    map.on('load', () => {
      applyNeonTheme(map);

      map.addSource('soil-temp-source', {
        type: 'raster',
        tiles: [NASA_GIBS.soilTemp.url],
        tileSize: 256,
        attribution: NASA_GIBS.soilTemp.attribution,
      });
      map.addLayer({
        id: 'soil-temp-layer',
        type: 'raster',
        source: 'soil-temp-source',
        paint: { 'raster-opacity': 0 },
      });

      map.addSource('ndvi-source', {
        type: 'raster',
        tiles: [NASA_GIBS.ndvi.url],
        tileSize: 256,
        attribution: NASA_GIBS.ndvi.attribution,
      });
      map.addLayer({
        id: 'ndvi-layer',
        type: 'raster',
        source: 'ndvi-source',
        paint: { 'raster-opacity': 0 },
      });

      // Fix Bug 1: apply initial opacities here, not in a separate effect.
      // mapReadyRef is a ref so React never re-renders when it changes,
      // meaning the external effect that syncs opacities never fires after load.
      map.setPaintProperty('soil-temp-layer', 'raster-opacity',
        activeLayers.soilTemp ? 0.75 : 0);
      map.setPaintProperty('ndvi-layer', 'raster-opacity',
        activeLayers.ndvi ? 0.78 : 0);

      mapRef.current = map;
      mapReadyRef.current = true;
    });

    map.on('mousemove', (e) => {
      onCoordsChange?.(e.lngLat.lat, e.lngLat.lng, map.getZoom());
    });

    return () => {
      map.remove();
      mapRef.current = null;
      mapReadyRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync layer visibility on toggle ────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    if (!map.getLayer('soil-temp-layer') || !map.getLayer('ndvi-layer')) return;

    map.setPaintProperty('soil-temp-layer', 'raster-opacity', activeLayers.soilTemp ? 0.75 : 0);
    map.setPaintProperty('ndvi-layer',      'raster-opacity', activeLayers.ndvi      ? 0.78 : 0);
  }, [activeLayers]);

  // ── Initialize Deck.gl ──────────────────────────────
  useEffect(() => {
    if (!deckCanvasRef.current || !mapContainerRef.current) return;

    const container = mapContainerRef.current.parentElement!;
    const { width, height } = container.getBoundingClientRect();

    const canvas = deckCanvasRef.current;
    canvas.width  = width;
    canvas.height = height;

    const gl =
      canvas.getContext('webgl2') ??
      (canvas.getContext('webgl') as WebGL2RenderingContext | null);

    const deck = new Deck({
      canvas,
      gl: gl ?? undefined,
      width,
      height,
      initialViewState: INITIAL_VIEW_STATE,
      controller: false,
      layers: [],
      parameters: { blend: true },
    });

    deckRef.current      = deck;
    particlesRef.current = initParticles([]);

    const syncViewport = () => {
      const m = mapRef.current;
      const d = deckRef.current;
      if (!m || !d) return;
      const center = m.getCenter();
      d.setProps({
        viewState: {
          longitude: center.lng,
          latitude:  center.lat,
          zoom:      m.getZoom(),
          pitch:     m.getPitch(),
          bearing:   m.getBearing(),
        },
      });
    };

    const syncInterval = setInterval(() => {
      if (mapRef.current) {
        mapRef.current.on('move', syncViewport);
        clearInterval(syncInterval);
      }
    }, 100);

    return () => {
      clearInterval(syncInterval);
      deck.finalize();
      deckRef.current = null;
    };
  }, []);

  // ── Animate traffic particles ───────────────────────
  const animateTraffic = useCallback(
    (timestamp: number) => {
      if (!deckRef.current) return;
      const delta = lastTimeRef.current
        ? (timestamp - lastTimeRef.current) / 1000
        : 0.016;
      lastTimeRef.current = timestamp;

      if (activeLayers.traffic) {
        particlesRef.current = updateParticles(particlesRef.current, hour, delta);
        deckRef.current.setProps({
          layers: [
            new ScatterplotLayer({
              id: 'traffic-particles',
              data: particlesRef.current,
              getPosition: (d: TrafficParticle) => d.position,
              // Fix Bug 2: 'meters' made particles invisible at low zoom and
              // giant at high zoom. 'pixels' keeps visual size constant.
              getRadius: 4,
              radiusUnits: 'pixels',
              getFillColor: particleColor(hour),
              opacity: 0.9,
              pickable: false,
              parameters: { blend: true },
            }),
          ],
        });
      } else {
        deckRef.current.setProps({ layers: [] });
      }

      animFrameRef.current = requestAnimationFrame(animateTraffic);
    },
    [activeLayers.traffic, hour]
  );

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(animateTraffic);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [animateTraffic]);

  return (
    <div
      className="grid-bg"
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <div
        ref={mapContainerRef}
        style={{ position: 'absolute', inset: 0 }}
      />
      <canvas
        ref={deckCanvasRef}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.9 }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd "/c/Users/alamb/OneDrive/Attachments/Documents/AsuGreen" && npm run build 2>&1 | tail -15
```

Expected: Build succeeds. If it fails with "particleRadius is not exported", that's expected — we removed the import in step 1.

- [ ] **Step 3: Start dev and verify both layers appear**

```bash
npm run dev
```

Open http://localhost:3000. Toggle soilTemp and NDVI layers. Both should now show colored heatmaps over Paraguay (NASA GIBS data). Toggle traffic and zoom in/out — particles should stay the same visual size at all zoom levels.

- [ ] **Step 4: Commit**

```bash
cd "/c/Users/alamb/OneDrive/Attachments/Documents/AsuGreen"
git add components/MapView.tsx
git commit -m "fix: apply layer opacities in load handler, use pixel-radius for traffic particles"
```

---

## Task 2: Tile Router (`lib/tileRouter.ts`)

**Files:**
- Create: `lib/tileRouter.ts`

**Context:** Pure utility — given a layer name and tile coordinates (z, x, y), determines whether a pre-downloaded local PNG exists. Uses pre-computed tile ranges for Asunción's bbox to avoid recalculating on every tile request. Local tiles exist for NDVI at zoom 10-14 and soilTemp at zoom 10-12.

- [ ] **Step 1: Create `lib/tileRouter.ts`**

```typescript
// Asunción bbox (from lib/constants.ts ASUNCION_BOUNDS)
const WEST  = -57.75;
const EAST  = -57.40;
const NORTH = -25.10;  // less negative = further north
const SOUTH = -25.50;

// Maximum zoom level for which local PNG tiles are pre-downloaded
export const MAX_LOCAL_ZOOM: Record<'ndvi' | 'soilTemp', number> = {
  ndvi:     14,  // Sentinel-2 10m ≈ 8.6 m/pixel at zoom 14 for lat -25°
  soilTemp: 12,  // Landsat 100m  ≈ 34 m/pixel at zoom 12
};

// Standard Web Mercator tile coordinate formulas
function lngToTile(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, z));
}

function latToTile(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      Math.pow(2, z)
  );
}

// Pre-compute tile ranges for zoom 10-15 so we don't recalculate per tile
type TileRange = { xMin: number; xMax: number; yMin: number; yMax: number };

const RANGES: Map<number, TileRange> = new Map();
for (let z = 10; z <= 15; z++) {
  RANGES.set(z, {
    xMin: lngToTile(WEST,  z),
    xMax: lngToTile(EAST,  z),
    yMin: latToTile(NORTH, z),  // north = smaller y (tiles go top-to-bottom)
    yMax: latToTile(SOUTH, z),
  });
}

/**
 * Returns true if the tile at (z, x, y) for the given layer should be served
 * from a pre-downloaded local PNG in /public/tiles/ instead of from GEE live.
 */
export function shouldUseLocalTile(
  layer: 'ndvi' | 'soilTemp',
  z: number,
  x: number,
  y: number
): boolean {
  if (z < 10 || z > MAX_LOCAL_ZOOM[layer]) return false;
  const range = RANGES.get(z);
  if (!range) return false;
  return x >= range.xMin && x <= range.xMax && y >= range.yMin && y <= range.yMax;
}
```

- [ ] **Step 2: Build to verify TypeScript**

```bash
cd "/c/Users/alamb/OneDrive/Attachments/Documents/AsuGreen" && npm run build 2>&1 | tail -8
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add lib/tileRouter.ts
git commit -m "feat: add tile router — bbox check for local vs GEE tile routing"
```

---

## Task 3: GEE API Client (`lib/geeApi.ts`)

**Files:**
- Create: `lib/geeApi.ts`
- Modify: `.env.local`

**Context:** Calls the Earth Engine REST API v1 to create a visualization map for NDVI (Sentinel-2) and LST (Landsat-8). Returns a tile base URL. The call happens once per layer per browser session and the result is cached in a module-level object. The GEE REST API requires an Expression object in serialized form.

Note: If GEE returns a 400 error with "Unrecognized algorithm" or "Unknown function", the expression function names need adjustment. Check `data.error.message` in the console for details.

- [ ] **Step 1: Add `NEXT_PUBLIC_GEE_PROJECT` to `.env.local`**

Add your Google Cloud project ID (the one with Earth Engine API enabled):

```
NEXT_PUBLIC_GEE_PROJECT=your-gcp-project-id
```

Replace `your-gcp-project-id` with your actual project ID (e.g. `asungreen-123456`). Find it at https://console.cloud.google.com — it appears in the project selector at the top.

- [ ] **Step 2: Create `lib/geeApi.ts`**

```typescript
/**
 * Google Earth Engine REST API v1 client.
 * Creates a visualization map for NDVI (Sentinel-2 10m) or LST (Landsat-8 100m)
 * and returns the tile base URL. Results are cached for the browser session.
 *
 * Tile URL format: `${tileBase}/${z}/${x}/${y}?key=${GEE_API_KEY}`
 */

const GEE_V1 = 'https://earthengine.googleapis.com/v1';

/** Populated by getGeeTileUrl(). Read by MapView.transformRequest. */
export const geeTileUrlCache: Partial<Record<'ndvi' | 'soilTemp', string>> = {};

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

/**
 * Serialized EE expression: Sentinel-2 SR median NDVI composite, last 90 days.
 * Palette: neon magenta → yellow → green → dark green (low → high NDVI)
 */
function ndviExpression(start: string, end: string) {
  return {
    result: '0',
    values: {
      '0': {
        functionInvocationValue: {
          functionName: 'Image.visualize',
          arguments: {
            input:   { valueReference: '1' },
            min:     { constantValue: -0.2 },
            max:     { constantValue: 0.8 },
            palette: { constantValue: ['ff2d78', 'ffe600', '00ff88', '00a855', '004d22'] },
          },
        },
      },
      '1': {
        functionInvocationValue: {
          functionName: 'Image.normalizedDifference',
          arguments: {
            input:     { valueReference: '2' },
            bandNames: { constantValue: ['B8', 'B4'] },
          },
        },
      },
      '2': {
        functionInvocationValue: {
          functionName: 'ImageCollection.median',
          arguments: { collection: { valueReference: '3' } },
        },
      },
      '3': {
        functionInvocationValue: {
          functionName: 'Collection.filter',
          arguments: {
            collection: { valueReference: '4' },
            filter: {
              functionInvocationValue: {
                functionName: 'Filter.lt',
                arguments: {
                  name:  { constantValue: 'CLOUDY_PIXEL_PERCENTAGE' },
                  value: { constantValue: 20 },
                },
              },
            },
          },
        },
      },
      '4': {
        functionInvocationValue: {
          functionName: 'ImageCollection.filterDate',
          arguments: {
            collection: { valueReference: '5' },
            start:      { constantValue: start },
            end:        { constantValue: end },
          },
        },
      },
      '5': {
        functionInvocationValue: {
          functionName: 'ImageCollection.load',
          arguments: { id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED' } },
        },
      },
    },
  };
}

/**
 * Serialized EE expression: Landsat-8 LST (Band ST_B10 → Celsius), least cloudy
 * scene in last 180 days.
 * Palette: neon blue → cyan → yellow → orange → magenta (cold → hot)
 * Celsius = ST_B10 × 0.00341802 − 124.15
 */
function lstExpression(start: string, end: string) {
  return {
    result: '0',
    values: {
      '0': {
        functionInvocationValue: {
          functionName: 'Image.visualize',
          arguments: {
            input:   { valueReference: '1' },
            min:     { constantValue: 15 },
            max:     { constantValue: 50 },
            palette: { constantValue: ['001aff', '00e5ff', 'ffe600', 'ff7c00', 'ff2d78'] },
          },
        },
      },
      '1': {
        functionInvocationValue: {
          functionName: 'Image.add',
          arguments: {
            image1: { valueReference: '2' },
            image2: { constantValue: -124.15 },
          },
        },
      },
      '2': {
        functionInvocationValue: {
          functionName: 'Image.multiply',
          arguments: {
            image1: { valueReference: '3' },
            image2: { constantValue: 0.00341802 },
          },
        },
      },
      '3': {
        functionInvocationValue: {
          functionName: 'Image.select',
          arguments: {
            input:         { valueReference: '4' },
            bandSelectors: { constantValue: ['ST_B10'] },
          },
        },
      },
      '4': {
        functionInvocationValue: {
          functionName: 'ImageCollection.first',
          arguments: { collection: { valueReference: '5' } },
        },
      },
      '5': {
        functionInvocationValue: {
          functionName: 'ImageCollection.sort',
          arguments: {
            collection: { valueReference: '6' },
            property:   { constantValue: 'CLOUD_COVER' },
          },
        },
      },
      '6': {
        functionInvocationValue: {
          functionName: 'ImageCollection.filterDate',
          arguments: {
            collection: { valueReference: '7' },
            start:      { constantValue: start },
            end:        { constantValue: end },
          },
        },
      },
      '7': {
        functionInvocationValue: {
          functionName: 'ImageCollection.load',
          arguments: { id: { constantValue: 'LANDSAT/LC08/C02/T1_L2' } },
        },
      },
    },
  };
}

/**
 * Calls GEE REST API to create a visualization map for the given layer.
 * Returns the tile base URL (without /{z}/{x}/{y}).
 * Result is cached in geeTileUrlCache — subsequent calls return cached value.
 *
 * If this throws, the GEE API key or project is not configured correctly,
 * or the Earth Engine API is not enabled for the project.
 */
export async function getGeeTileUrl(layer: 'ndvi' | 'soilTemp'): Promise<string> {
  if (geeTileUrlCache[layer]) return geeTileUrlCache[layer]!;

  const apiKey  = process.env.NEXT_PUBLIC_GEE_API_KEY ?? '';
  const project = process.env.NEXT_PUBLIC_GEE_PROJECT ?? '';

  if (!apiKey || !project) {
    throw new Error(
      'Missing NEXT_PUBLIC_GEE_API_KEY or NEXT_PUBLIC_GEE_PROJECT in .env.local'
    );
  }

  const expression =
    layer === 'ndvi'
      ? ndviExpression(isoDate(90), isoDate(0))
      : lstExpression(isoDate(180), isoDate(0));

  const res = await fetch(
    `${GEE_V1}/projects/${project}/maps?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expression }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GEE API ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { name: string };
  // data.name = "projects/{project}/maps/{mapId}"
  const tileBase = `${GEE_V1}/${data.name}/tiles`;
  geeTileUrlCache[layer] = tileBase;
  return tileBase;
}
```

- [ ] **Step 3: Build to verify TypeScript**

```bash
cd "/c/Users/alamb/OneDrive/Attachments/Documents/AsuGreen" && npm run build 2>&1 | tail -8
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add lib/geeApi.ts .env.local
git commit -m "feat: add GEE REST API client for Sentinel-2 NDVI and Landsat-8 LST tiles"
```

---

## Task 4: OSM Roads Script + Data

**Files:**
- Create: `scripts/fetch-osm-roads.mjs`
- Creates: `public/data/asuncion-roads.geojson`

**Context:** Downloads the road network for Asunción from the Overpass API. Runs once (or when you want to refresh the data). Output is committed to the repo so the app never calls Overpass at runtime.

- [ ] **Step 1: Create `scripts/fetch-osm-roads.mjs`**

```javascript
// scripts/fetch-osm-roads.mjs
// Usage: node scripts/fetch-osm-roads.mjs
// Requires internet access to https://overpass-api.de

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Asunción bbox: south, west, north, east (Overpass format)
const BBOX = '(-25.50,-57.75,-25.10,-57.40)';

const QUERY = `
[out:json][timeout:60];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential)$"]${BBOX};
out geom;
`.trim();

async function main() {
  console.log('Fetching Asunción road network from Overpass API...');
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(QUERY)}`,
  });

  if (!res.ok) {
    throw new Error(`Overpass API error: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  const elements = json.elements ?? [];

  const features = elements
    .filter(
      (el) =>
        el.type === 'way' &&
        Array.isArray(el.geometry) &&
        el.geometry.length >= 2
    )
    .map((el) => ({
      type: 'Feature',
      properties: {
        highway: el.tags?.highway ?? 'road',
        name: el.tags?.name ?? null,
      },
      geometry: {
        type: 'LineString',
        // Overpass returns {lat, lon}; GeoJSON needs [lng, lat]
        coordinates: el.geometry.map((pt) => [pt.lon, pt.lat]),
      },
    }));

  const geojson = {
    type: 'FeatureCollection',
    features,
  };

  const outDir = join(ROOT, 'public', 'data');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'asuncion-roads.geojson');
  writeFileSync(outPath, JSON.stringify(geojson));

  console.log(`✓ Saved ${features.length} road features to public/data/asuncion-roads.geojson`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Run the script**

```bash
cd "/c/Users/alamb/OneDrive/Attachments/Documents/AsuGreen" && node scripts/fetch-osm-roads.mjs
```

Expected output:
```
Fetching Asunción road network from Overpass API...
✓ Saved 4500 road features to public/data/asuncion-roads.geojson
```

(The exact count varies; 3000–8000 is normal for a city-sized area.)

- [ ] **Step 3: Verify the output**

```bash
node -e "
const f = JSON.parse(require('fs').readFileSync('public/data/asuncion-roads.geojson'));
console.log('Features:', f.features.length);
console.log('First feature:', JSON.stringify(f.features[0], null, 2).slice(0, 300));
"
```

Expected: `features.length > 0`, first feature has `geometry.type === 'LineString'` and coordinates with lng near -57.5, lat near -25.3.

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-osm-roads.mjs public/data/asuncion-roads.geojson
git commit -m "feat: add OSM road network fetch script and Asunción road data"
```

---

## Task 5: Update Traffic Simulation + Constants

**Files:**
- Modify: `lib/trafficSim.ts`
- Modify: `lib/constants.ts`

**Context:** Remove hardcoded `TRAFFIC_CORRIDORS` from constants. Update `trafficSim` so `initParticles` accepts corridors as a parameter, and `updateParticles` uses a module-level corridors variable (set when `initParticles` is called). `loadCorridors` fetches the GeoJSON generated in Task 4.

- [ ] **Step 1: Remove `TRAFFIC_CORRIDORS` from `lib/constants.ts`**

Replace the entire `lib/constants.ts` with this content:

```typescript
export const ASUNCION_CENTER: [number, number] = [-57.5759, -25.2867];

export const INITIAL_VIEW_STATE = {
  longitude: -57.5759,
  latitude: -25.2867,
  zoom: 12,
  pitch: 0,
  bearing: 0,
};

export const ASUNCION_BOUNDS: [[number, number], [number, number]] = [
  [-57.75, -25.50],
  [-57.40, -25.10],
];

// Traffic density by hour (0-23), 0-1 scale
export const TRAFFIC_BY_HOUR: number[] = [
  0.05, 0.03, 0.02, 0.02, 0.03, 0.10, // 0-5
  0.30, 0.70, 0.95, 0.80, 0.60, 0.55, // 6-11
  0.55, 0.58, 0.60, 0.65, 0.78, 0.98, // 12-17
  0.92, 0.75, 0.58, 0.40, 0.22, 0.10, // 18-23
];

// NASA GIBS WMS URLs — served via WMS with EPSG:3857 bbox reprojection
const GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX={bbox-epsg-3857}&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&STYLES=&FORMAT=image/png';

export const NASA_GIBS = {
  ndvi: {
    url: `${GIBS_WMS}&LAYERS=MODIS_Terra_NDVI_8Day&TIME=2024-08-04`,
    attribution: 'NASA MODIS Terra NDVI',
  },
  soilTemp: {
    url: `${GIBS_WMS}&LAYERS=MODIS_Terra_Land_Surface_Temp_Day&TIME=2024-08-10`,
    attribution: 'NASA MODIS Terra LST',
  },
};
```

- [ ] **Step 2: Replace `lib/trafficSim.ts`**

```typescript
import { TRAFFIC_BY_HOUR } from './constants';
import type { TrafficParticle } from './types';

// Module-level corridors — set by initParticles, used by updateParticles.
// Starts empty; MapView loads OSM roads and calls initParticles(corridors).
let activeCorridors: [number, number][][] = [];

const PARTICLES_BASE = 600;

function lerpPoint(
  a: [number, number],
  b: [number, number],
  t: number
): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Fetches /data/asuncion-roads.geojson and returns corridors as
 * arrays of [lng, lat] coordinate pairs.
 * Call once at app start; result is passed to initParticles.
 */
export async function loadCorridors(): Promise<[number, number][][]> {
  const res = await fetch('/data/asuncion-roads.geojson');
  if (!res.ok) throw new Error(`Failed to load roads: ${res.status}`);
  const geojson = await res.json() as {
    features: Array<{
      geometry: { type: string; coordinates: number[][] };
    }>;
  };
  return geojson.features
    .filter(
      (f) =>
        f.geometry.type === 'LineString' &&
        f.geometry.coordinates.length >= 2
    )
    .map((f) => f.geometry.coordinates as [number, number][]);
}

/**
 * Creates traffic particles distributed over the provided corridors.
 * Also stores corridors in the module-level activeCorridors for updateParticles.
 * Pass an empty array [] before OSM data loads — results in no particles.
 */
export function initParticles(corridors: [number, number][][]): TrafficParticle[] {
  activeCorridors = corridors;
  if (corridors.length === 0) return [];

  const particles: TrafficParticle[] = [];
  let id = 0;

  for (let ci = 0; ci < corridors.length; ci++) {
    const corridor = corridors[ci];
    if (corridor.length < 2) continue;
    const count = Math.max(1, Math.floor(PARTICLES_BASE / corridors.length));
    for (let i = 0; i < count; i++) {
      const segIdx = Math.floor(Math.random() * (corridor.length - 1));
      const t = Math.random();
      const speed = 0.002 + Math.random() * 0.003;
      particles.push({
        id: id++,
        position: lerpPoint(corridor[segIdx], corridor[segIdx + 1], t),
        corridorIndex: ci,
        segmentIndex: segIdx,
        t,
        speed,
      });
    }
  }

  return particles;
}

export function updateParticles(
  particles: TrafficParticle[],
  hour: number,
  delta: number
): TrafficParticle[] {
  if (activeCorridors.length === 0) return particles;
  const density = TRAFFIC_BY_HOUR[Math.round(hour) % 24];

  return particles.map((p) => {
    const corridor = activeCorridors[p.corridorIndex];
    if (!corridor || corridor.length < 2) return p;
    const effectiveSpeed = p.speed * density * delta * 60;
    let newT = p.t + effectiveSpeed;
    let newSeg = p.segmentIndex;

    while (newT >= 1) {
      newT -= 1;
      newSeg++;
      if (newSeg >= corridor.length - 1) {
        newSeg = 0;
        newT = Math.random() * 0.5;
      }
    }

    const pos = lerpPoint(
      corridor[newSeg],
      corridor[newSeg + 1],
      newT
    );

    return { ...p, position: pos, segmentIndex: newSeg, t: newT };
  });
}

export function particleColor(hour: number): [number, number, number, number] {
  const density = TRAFFIC_BY_HOUR[Math.round(hour) % 24];
  if (density < 0.3)  return [20,  184, 166, 200];
  if (density < 0.6)  return [250, 204, 21,  220];
  if (density < 0.85) return [249, 115, 22,  230];
  return                      [239, 68,  68,  255];
}
```

- [ ] **Step 3: Build to verify TypeScript**

```bash
cd "/c/Users/alamb/OneDrive/Attachments/Documents/AsuGreen" && npm run build 2>&1 | tail -8
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add lib/constants.ts lib/trafficSim.ts
git commit -m "feat: traffic sim uses OSM corridors parameter, remove hardcoded TRAFFIC_CORRIDORS"
```

---

## Task 6: Tile Generation Script + Run

**Files:**
- Create: `scripts/generate-tiles.mjs`
- Creates: `public/tiles/ndvi/{z}/{x}/{y}.png` (zoom 10-14, ~388 files)
- Creates: `public/tiles/soilTemp/{z}/{x}/{y}.png` (zoom 10-12, ~28 files)

**Context:** Downloads pre-rendered PNG tiles from GEE for the Asunción bbox. Requires `NEXT_PUBLIC_GEE_API_KEY` and `NEXT_PUBLIC_GEE_PROJECT` in `.env.local`. Run once; re-run to refresh data. Tiles are committed to the repo.

Note on tile counts: NDVI zoom 10-14 ≈ 388 tiles (~8MB). soilTemp zoom 10-12 ≈ 28 tiles (~0.6MB). The script downloads with concurrency of 5 to respect GEE rate limits.

- [ ] **Step 1: Create `scripts/generate-tiles.mjs`**

```javascript
// scripts/generate-tiles.mjs
// Usage: node scripts/generate-tiles.mjs
// Requires .env.local with NEXT_PUBLIC_GEE_API_KEY and NEXT_PUBLIC_GEE_PROJECT

import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Load .env.local ─────────────────────────────────
function loadEnv() {
  try {
    return Object.fromEntries(
      readFileSync(join(ROOT, '.env.local'), 'utf8')
        .split('\n')
        .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
        .map((l) => {
          const idx = l.indexOf('=');
          return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
        })
    );
  } catch {
    return {};
  }
}

const env = loadEnv();
const GEE_API_KEY = env['NEXT_PUBLIC_GEE_API_KEY'] ?? '';
const GEE_PROJECT = env['NEXT_PUBLIC_GEE_PROJECT'] ?? '';
const GEE_V1 = 'https://earthengine.googleapis.com/v1';

// ── Asunción bbox ────────────────────────────────────
const WEST  = -57.75;
const EAST  = -57.40;
const NORTH = -25.10;
const SOUTH = -25.50;

function lngToTile(lng, z) {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, z));
}
function latToTile(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      Math.pow(2, z)
  );
}

function tilesForZoom(z) {
  const xMin = lngToTile(WEST,  z);
  const xMax = lngToTile(EAST,  z);
  const yMin = latToTile(NORTH, z);
  const yMax = latToTile(SOUTH, z);
  const tiles = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      tiles.push({ z, x, y });
    }
  }
  return tiles;
}

// ── GEE expressions ──────────────────────────────────
function isoDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

function ndviExpression(start, end) {
  return {
    result: '0',
    values: {
      '0': { functionInvocationValue: { functionName: 'Image.visualize', arguments: {
        input: { valueReference: '1' },
        min: { constantValue: -0.2 }, max: { constantValue: 0.8 },
        palette: { constantValue: ['ff2d78','ffe600','00ff88','00a855','004d22'] },
      }}},
      '1': { functionInvocationValue: { functionName: 'Image.normalizedDifference', arguments: {
        input: { valueReference: '2' }, bandNames: { constantValue: ['B8','B4'] },
      }}},
      '2': { functionInvocationValue: { functionName: 'ImageCollection.median', arguments: {
        collection: { valueReference: '3' },
      }}},
      '3': { functionInvocationValue: { functionName: 'Collection.filter', arguments: {
        collection: { valueReference: '4' },
        filter: { functionInvocationValue: { functionName: 'Filter.lt', arguments: {
          name: { constantValue: 'CLOUDY_PIXEL_PERCENTAGE' }, value: { constantValue: 20 },
        }}},
      }}},
      '4': { functionInvocationValue: { functionName: 'ImageCollection.filterDate', arguments: {
        collection: { valueReference: '5' }, start: { constantValue: start }, end: { constantValue: end },
      }}},
      '5': { functionInvocationValue: { functionName: 'ImageCollection.load', arguments: {
        id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED' },
      }}},
    },
  };
}

function lstExpression(start, end) {
  return {
    result: '0',
    values: {
      '0': { functionInvocationValue: { functionName: 'Image.visualize', arguments: {
        input: { valueReference: '1' },
        min: { constantValue: 15 }, max: { constantValue: 50 },
        palette: { constantValue: ['001aff','00e5ff','ffe600','ff7c00','ff2d78'] },
      }}},
      '1': { functionInvocationValue: { functionName: 'Image.add', arguments: {
        image1: { valueReference: '2' }, image2: { constantValue: -124.15 },
      }}},
      '2': { functionInvocationValue: { functionName: 'Image.multiply', arguments: {
        image1: { valueReference: '3' }, image2: { constantValue: 0.00341802 },
      }}},
      '3': { functionInvocationValue: { functionName: 'Image.select', arguments: {
        input: { valueReference: '4' }, bandSelectors: { constantValue: ['ST_B10'] },
      }}},
      '4': { functionInvocationValue: { functionName: 'ImageCollection.first', arguments: {
        collection: { valueReference: '5' },
      }}},
      '5': { functionInvocationValue: { functionName: 'ImageCollection.sort', arguments: {
        collection: { valueReference: '6' }, property: { constantValue: 'CLOUD_COVER' },
      }}},
      '6': { functionInvocationValue: { functionName: 'ImageCollection.filterDate', arguments: {
        collection: { valueReference: '7' }, start: { constantValue: start }, end: { constantValue: end },
      }}},
      '7': { functionInvocationValue: { functionName: 'ImageCollection.load', arguments: {
        id: { constantValue: 'LANDSAT/LC08/C02/T1_L2' },
      }}},
    },
  };
}

// ── GEE map creation ─────────────────────────────────
async function createGeeMap(expression) {
  const res = await fetch(
    `${GEE_V1}/projects/${GEE_PROJECT}/maps?key=${GEE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expression }),
    }
  );
  if (!res.ok) throw new Error(`GEE map creation failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return `${GEE_V1}/${data.name}/tiles`;
}

// ── Concurrent download helper ───────────────────────
async function downloadWithConcurrency(tasks, concurrency) {
  let idx = 0;
  let done = 0;
  const total = tasks.length;

  async function worker() {
    while (idx < total) {
      const task = tasks[idx++];
      await task();
      done++;
      if (done % 50 === 0) process.stdout.write(`  ${done}/${total}\n`);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

// ── Main ─────────────────────────────────────────────
async function main() {
  if (!GEE_API_KEY || !GEE_PROJECT) {
    throw new Error('Set NEXT_PUBLIC_GEE_API_KEY and NEXT_PUBLIC_GEE_PROJECT in .env.local');
  }

  const LAYERS = [
    {
      name: 'ndvi',
      maxZoom: 14,
      expr: ndviExpression(isoDate(90), isoDate(0)),
    },
    {
      name: 'soilTemp',
      maxZoom: 12,
      expr: lstExpression(isoDate(180), isoDate(0)),
    },
  ];

  for (const layer of LAYERS) {
    console.log(`\nCreating GEE map for ${layer.name}...`);
    const tileBase = await createGeeMap(layer.expr);
    console.log(`  Tile base URL: ${tileBase}`);

    const zooms = Array.from(
      { length: layer.maxZoom - 10 + 1 },
      (_, i) => 10 + i
    );
    const allTiles = zooms.flatMap((z) => tilesForZoom(z));
    console.log(`  Downloading ${allTiles.length} tiles (zoom 10-${layer.maxZoom})...`);

    const tasks = allTiles.map(({ z, x, y }) => async () => {
      const url = `${tileBase}/${z}/${x}/${y}?key=${GEE_API_KEY}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`  WARN: tile ${layer.name}/${z}/${x}/${y} → ${res.status}`);
        return;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const dir = join(ROOT, 'public', 'tiles', layer.name, String(z), String(x));
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${y}.png`), buf);
    });

    await downloadWithConcurrency(tasks, 5);
    console.log(`  ✓ ${layer.name} done`);
  }

  console.log('\n✓ All tiles downloaded.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Run the script**

```bash
cd "/c/Users/alamb/OneDrive/Attachments/Documents/AsuGreen" && node scripts/generate-tiles.mjs
```

Expected output (takes 2-5 minutes):
```
Creating GEE map for ndvi...
  Tile base URL: https://earthengine.googleapis.com/v1/projects/.../maps/.../tiles
  Downloading 388 tiles (zoom 10-14)...
  50/388
  100/388
  ...
  ✓ ndvi done

Creating GEE map for soilTemp...
  Tile base URL: ...
  Downloading 28 tiles (zoom 10-12)...
  ✓ soilTemp done

✓ All tiles downloaded.
```

If you see `GEE map creation failed: 400 {...}` with a message about an unknown function name, the EE expression function names may differ in your EE API version. Check the error message — it will name the unrecognized function — and update the `functionName` string in the corresponding expression function.

- [ ] **Step 3: Verify output exists**

```bash
ls "/c/Users/alamb/OneDrive/Attachments/Documents/AsuGreen/public/tiles/"
```

Expected: directories `ndvi/` and `soilTemp/`.

```bash
find "/c/Users/alamb/OneDrive/Attachments/Documents/AsuGreen/public/tiles" -name "*.png" | wc -l
```

Expected: roughly 400-420 PNG files total.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-tiles.mjs public/tiles/
git commit -m "feat: add GEE tile generation script and pre-cached Asunción tiles"
```

---

## Task 7: Wire MapView — GEE Sources + transformRequest + OSM Traffic

**Files:**
- Modify: `components/MapView.tsx`

**Context:** This is the final integration task. Replace the NASA GIBS sources with `env-tile://` sources that route through `transformRequest`. Initialize GEE tile URLs on mount. Load OSM corridors on mount. The file built in Task 1 is the starting point.

- [ ] **Step 1: Replace `components/MapView.tsx` with the fully wired version**

```tsx
'use client';

import { useRef, useEffect, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { ScatterplotLayer } from '@deck.gl/layers';
import { Deck } from '@deck.gl/core';
import type { LayerType } from '@/lib/types';
import { INITIAL_VIEW_STATE } from '@/lib/constants';
import { initParticles, updateParticles, particleColor, loadCorridors } from '@/lib/trafficSim';
import type { TrafficParticle } from '@/lib/types';
import { applyNeonTheme } from '@/lib/mapStyle';
import { getGeeTileUrl, geeTileUrlCache } from '@/lib/geeApi';
import { shouldUseLocalTile } from '@/lib/tileRouter';

const GEE_KEY = process.env.NEXT_PUBLIC_GEE_API_KEY ?? '';

// 1×1 transparent PNG — returned for GEE tiles when the GEE URL is not yet loaded.
// Prevents MapLibre from throwing on the custom env-tile:// scheme while GEE initializes.
const TRANSPARENT_TILE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=';

interface MapViewProps {
  activeLayers: Record<LayerType, boolean>;
  hour: number;
  onCoordsChange?: (lat: number, lng: number, zoom: number) => void;
}

export default function MapView({ activeLayers, hour, onCoordsChange }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const deckCanvasRef   = useRef<HTMLCanvasElement>(null);
  const mapRef          = useRef<maplibregl.Map | null>(null);
  const deckRef         = useRef<Deck | null>(null);
  const particlesRef    = useRef<TrafficParticle[]>([]);
  const animFrameRef    = useRef<number>(0);
  const lastTimeRef     = useRef<number>(0);
  const mapReadyRef     = useRef(false);

  // ── Initialize MapLibre ─────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
      zoom: INITIAL_VIEW_STATE.zoom,
      pitch: INITIAL_VIEW_STATE.pitch,
      attributionControl: false,
      // transformRequest intercepts every tile load for env-tile:// URLs.
      // Tiles inside Asunción bbox → /public/tiles/ (local, instant).
      // Tiles outside Asunción or above max local zoom → GEE live API.
      transformRequest: (url) => {
        if (!url.startsWith('env-tile://')) return undefined;
        const [layer, z, x, y] = url.replace('env-tile://', '').split('/');
        const zi = +z, xi = +x, yi = +y;

        if (shouldUseLocalTile(layer as 'ndvi' | 'soilTemp', zi, xi, yi)) {
          return { url: `/tiles/${layer}/${zi}/${xi}/${yi}.png` };
        }

        const geeBase = geeTileUrlCache[layer as 'ndvi' | 'soilTemp'];
        if (!geeBase) {
          // GEE URL not loaded yet — return transparent tile to avoid 404s.
          // MapView.setTiles() will trigger a reload once GEE URL is ready.
          return { url: TRANSPARENT_TILE };
        }
        return { url: `${geeBase}/${zi}/${xi}/${yi}?key=${GEE_KEY}` };
      },
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('styleimagemissing', (e) => {
      map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
    });

    map.on('load', () => {
      applyNeonTheme(map);

      // soilTemp source — uses env-tile:// scheme, routed by transformRequest
      map.addSource('soil-temp-source', {
        type: 'raster',
        tiles: ['env-tile://soilTemp/{z}/{x}/{y}'],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 18,
        attribution: 'Landsat-8/9 via Google Earth Engine',
      });
      map.addLayer({
        id: 'soil-temp-layer',
        type: 'raster',
        source: 'soil-temp-source',
        paint: { 'raster-opacity': 0 },
      });

      // NDVI source — uses env-tile:// scheme, routed by transformRequest
      map.addSource('ndvi-source', {
        type: 'raster',
        tiles: ['env-tile://ndvi/{z}/{x}/{y}'],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 18,
        attribution: 'Sentinel-2 via Google Earth Engine',
      });
      map.addLayer({
        id: 'ndvi-layer',
        type: 'raster',
        source: 'ndvi-source',
        paint: { 'raster-opacity': 0 },
      });

      // Apply initial opacities in load handler (not in a separate effect —
      // mapReadyRef is a ref and doesn't trigger re-renders)
      map.setPaintProperty('soil-temp-layer', 'raster-opacity',
        activeLayers.soilTemp ? 0.75 : 0);
      map.setPaintProperty('ndvi-layer', 'raster-opacity',
        activeLayers.ndvi ? 0.78 : 0);

      mapRef.current = map;
      mapReadyRef.current = true;
    });

    map.on('mousemove', (e) => {
      onCoordsChange?.(e.lngLat.lat, e.lngLat.lng, map.getZoom());
    });

    return () => {
      map.remove();
      mapRef.current = null;
      mapReadyRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync layer visibility on toggle ────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    if (!map.getLayer('soil-temp-layer') || !map.getLayer('ndvi-layer')) return;

    map.setPaintProperty('soil-temp-layer', 'raster-opacity', activeLayers.soilTemp ? 0.75 : 0);
    map.setPaintProperty('ndvi-layer',      'raster-opacity', activeLayers.ndvi      ? 0.78 : 0);
  }, [activeLayers]);

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

  // ── Load OSM road corridors ─────────────────────────
  // Fetches /data/asuncion-roads.geojson once, re-initializes particles
  // with real OSM road geometry.
  useEffect(() => {
    loadCorridors()
      .then((corridors) => {
        particlesRef.current = initParticles(corridors);
      })
      .catch((err) => {
        console.warn('OSM roads not loaded, traffic particles disabled:', err.message);
      });
  }, []);

  // ── Initialize Deck.gl ──────────────────────────────
  useEffect(() => {
    if (!deckCanvasRef.current || !mapContainerRef.current) return;

    const container = mapContainerRef.current.parentElement!;
    const { width, height } = container.getBoundingClientRect();

    const canvas = deckCanvasRef.current;
    canvas.width  = width;
    canvas.height = height;

    const gl =
      canvas.getContext('webgl2') ??
      (canvas.getContext('webgl') as WebGL2RenderingContext | null);

    const deck = new Deck({
      canvas,
      gl: gl ?? undefined,
      width,
      height,
      initialViewState: INITIAL_VIEW_STATE,
      controller: false,
      layers: [],
      parameters: { blend: true },
    });

    deckRef.current      = deck;
    particlesRef.current = initParticles([]);

    const syncViewport = () => {
      const m = mapRef.current;
      const d = deckRef.current;
      if (!m || !d) return;
      const center = m.getCenter();
      d.setProps({
        viewState: {
          longitude: center.lng,
          latitude:  center.lat,
          zoom:      m.getZoom(),
          pitch:     m.getPitch(),
          bearing:   m.getBearing(),
        },
      });
    };

    const syncInterval = setInterval(() => {
      if (mapRef.current) {
        mapRef.current.on('move', syncViewport);
        clearInterval(syncInterval);
      }
    }, 100);

    return () => {
      clearInterval(syncInterval);
      deck.finalize();
      deckRef.current = null;
    };
  }, []);

  // ── Animate traffic particles ───────────────────────
  const animateTraffic = useCallback(
    (timestamp: number) => {
      if (!deckRef.current) return;
      const delta = lastTimeRef.current
        ? (timestamp - lastTimeRef.current) / 1000
        : 0.016;
      lastTimeRef.current = timestamp;

      if (activeLayers.traffic) {
        particlesRef.current = updateParticles(particlesRef.current, hour, delta);
        deckRef.current.setProps({
          layers: [
            new ScatterplotLayer({
              id: 'traffic-particles',
              data: particlesRef.current,
              getPosition: (d: TrafficParticle) => d.position,
              getRadius: 4,
              radiusUnits: 'pixels',
              getFillColor: particleColor(hour),
              opacity: 0.9,
              pickable: false,
              parameters: { blend: true },
            }),
          ],
        });
      } else {
        deckRef.current.setProps({ layers: [] });
      }

      animFrameRef.current = requestAnimationFrame(animateTraffic);
    },
    [activeLayers.traffic, hour]
  );

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(animateTraffic);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [animateTraffic]);

  return (
    <div
      className="grid-bg"
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <div
        ref={mapContainerRef}
        style={{ position: 'absolute', inset: 0 }}
      />
      <canvas
        ref={deckCanvasRef}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.9 }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Build — full project check**

```bash
cd "/c/Users/alamb/OneDrive/Attachments/Documents/AsuGreen" && npm run build 2>&1 | tail -15
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Visual verification in dev**

```bash
npm run dev
```

Open http://localhost:3000. Check the following:

- [ ] Map loads with dark neon basemap
- [ ] Activate soilTemp layer: gradient heatmap appears over Paraguay (blues/cyans at cool zones, orange/magenta at hot zones)
- [ ] Activate NDVI layer: vegetation index heatmap appears (magenta = bare soil, green = vegetation)
- [ ] Open Network tab in DevTools: for tiles inside Asunción (lat -25.1–-25.5, lng -57.4–-57.75), requests should go to `/tiles/ndvi/…` or `/tiles/soilTemp/…` (local, fast)
- [ ] Pan to Buenos Aires or São Paulo: tiles load from `earthengine.googleapis.com` (live GEE)
- [ ] Activate traffic layer: particles appear on actual streets (visible road network, not random corridors)
- [ ] Zoom in and out: traffic particles stay same visual size (~4px) at all zoom levels
- [ ] No console errors (except any WARN about OSM load timing which is acceptable)

- [ ] **Step 4: Final commit**

```bash
git add components/MapView.tsx
git commit -m "feat: wire GEE tile routing, OSM traffic corridors, env-tile transformRequest"
```

---

## Self-Review

**Spec coverage:**
- ✅ NDVI → Sentinel-2 10m via GEE (Task 3, Task 6, Task 7)
- ✅ LST → Landsat-8 100m via GEE (Task 3, Task 6, Task 7)
- ✅ Pre-cached tiles for Asunción (Task 6: zoom 10-14 NDVI, 10-12 soilTemp)
- ✅ transformRequest routing local vs GEE (Task 2 router, Task 7 MapView)
- ✅ OSM real roads for traffic (Task 4 script, Task 5 trafficSim, Task 7 load)
- ✅ Bug 1 — layer opacity fix (Task 1 + Task 7)
- ✅ Bug 2 — particle zoom fix (Task 1 + Task 7)

**Type consistency:**
- `initParticles([])` — called in Deck.gl useEffect and loadCorridors useEffect ✅
- `loadCorridors(): Promise<[number,number][][]>` — returns same shape as `initParticles` parameter ✅
- `geeTileUrlCache` — exported from `lib/geeApi.ts`, imported in `MapView.tsx` ✅
- `shouldUseLocalTile(layer, z, x, y)` — `layer` typed as `'ndvi' | 'soilTemp'`, same as `geeTileUrlCache` keys ✅
- `MAX_LOCAL_ZOOM` — defined in `tileRouter.ts`, not re-exported (only used internally) ✅
- `particleColor(hour)` — still exported from `trafficSim.ts` ✅
- `particleRadius` — removed from `trafficSim.ts`, removed from `MapView.tsx` import ✅
