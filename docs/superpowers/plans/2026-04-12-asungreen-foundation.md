# AsunGreen Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace broken CartoCDN basemap with OpenFreeMap neon-styled vector tiles and apply full 8-bit terminal aesthetic to all UI components.

**Architecture:** MapLibre loads OpenFreeMap's hosted dark style, then a `applyNeonTheme()` utility patches all vector layer colors to the neon palette after the style loads. NASA GIBS layers are added via WMS on top. All UI components are rewritten with CSS variables, pixel fonts, scan-line effects, and ASCII terminal aesthetics.

**Tech Stack:** Next.js 16, MapLibre GL v5, Deck.gl v9, Tailwind v4, Google Fonts (Press Start 2P, VT323, Share Tech Mono), OpenFreeMap vector tiles (free, no API key)

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `app/layout.tsx` | Add pixel Google Fonts via `<link>` tags |
| Modify | `app/globals.css` | Replace glassmorphism with neon terminal CSS variables + effects |
| Create | `lib/mapStyle.ts` | `applyNeonTheme(map)` — patches OpenFreeMap layer colors to neon palette |
| Modify | `components/MapView.tsx` | Switch basemap to OpenFreeMap style URL, call neon theme, add StatusBar coords callback |
| Modify | `components/Header.tsx` | Full rewrite — terminal prompt, blinking cursor, system badges |
| Modify | `components/Sidebar.tsx` | Full rewrite — numbered ASCII cards, neon toggles |
| Modify | `components/Legend.tsx` | Full rewrite — neon gradient bars with glow |
| Create | `components/StatusBar.tsx` | New — fixed bottom bar with live coords, zoom, timestamp |
| Modify | `components/MapClient.tsx` | Add coords state, wire MapView → StatusBar |

---

## Task 1: Google Fonts + CSS Design Tokens

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Update layout.tsx with pixel fonts**

Replace the entire contents of `app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AsunGreen — Monitoreo Ambiental Asunción',
  description:
    'Plataforma GIS de análisis ambiental para Asunción y el Departamento Central, Paraguay. Temperatura del suelo, tráfico y NDVI en tiempo real.',
  keywords: ['GIS', 'Paraguay', 'Asunción', 'medio ambiente', 'NDVI', 'temperatura'],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=Share+Tech+Mono&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full overflow-hidden">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Replace globals.css with neon terminal system**

Replace the entire contents of `app/globals.css`:

```css
@import 'maplibre-gl/dist/maplibre-gl.css';
@import "tailwindcss";

/* ── Design tokens ───────────────────────────────────── */
:root {
  --bg-base:       #030804;
  --bg-surface:    #0a0f0a;
  --bg-border:     #0d2b12;

  --neon-green:    #00ff88;
  --neon-cyan:     #00e5ff;
  --neon-magenta:  #ff2d78;
  --neon-yellow:   #ffe600;
  --neon-purple:   #bf5fff;
  --neon-orange:   #ff7c00;

  --text-primary:  #a8ffb0;
  --text-muted:    #2d5c35;
  --text-bright:   #e0ffe8;

  --glow-green:    0 0 8px rgba(0,255,136,0.9), 0 0 20px rgba(0,255,136,0.4);
  --glow-cyan:     0 0 8px rgba(0,229,255,0.9), 0 0 20px rgba(0,229,255,0.4);
  --glow-magenta:  0 0 8px rgba(255,45,120,0.9), 0 0 20px rgba(255,45,120,0.4);
  --glow-yellow:   0 0 8px rgba(255,230,0,0.9),  0 0 20px rgba(255,230,0,0.4);
  --glow-purple:   0 0 8px rgba(191,95,255,0.9), 0 0 20px rgba(191,95,255,0.4);

  --font-pixel:    'Press Start 2P', monospace;
  --font-data:     'VT323', monospace;
  --font-mono:     'Share Tech Mono', monospace;
}

/* ── Reset ───────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: var(--font-mono);
}

/* ── MapLibre controls ───────────────────────────────── */
.maplibregl-ctrl-bottom-left,
.maplibregl-ctrl-bottom-right { display: none; }

.maplibregl-ctrl-top-right { top: 56px; right: 12px; }

.maplibregl-ctrl button {
  background-color: var(--bg-surface) !important;
  border-color: var(--bg-border) !important;
}

.maplibregl-ctrl button span {
  filter: invert(1) sepia(1) saturate(3) hue-rotate(90deg);
}

/* ── Terminal panel ──────────────────────────────────── */
.terminal-panel {
  background: var(--bg-surface);
  border: 1px solid var(--bg-border);
  border-radius: 2px;
  padding: 12px 14px;
  position: relative;
  width: 100%;
  cursor: default;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.terminal-panel-btn {
  background: var(--bg-surface);
  border: 1px solid var(--bg-border);
  border-radius: 2px;
  padding: 12px 14px;
  position: relative;
  width: 100%;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.terminal-panel-btn:hover {
  border-color: rgba(0,255,136,0.25);
}

/* ── Scan lines ──────────────────────────────────────── */
.scan-lines {
  position: relative;
}

.scan-lines::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0,0,0,0.12) 2px,
    rgba(0,0,0,0.12) 4px
  );
  pointer-events: none;
  z-index: 1;
}

/* ── Grid background ─────────────────────────────────── */
.grid-bg {
  background-image:
    linear-gradient(rgba(0,255,136,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,255,136,0.025) 1px, transparent 1px);
  background-size: 40px 40px;
}

/* ── Neon glow text utilities ────────────────────────── */
.glow-green { text-shadow: var(--glow-green); }
.glow-cyan  { text-shadow: var(--glow-cyan); }

/* ── Animations ──────────────────────────────────────── */
@keyframes blink {
  0%, 49%  { opacity: 1; }
  50%, 100% { opacity: 0; }
}

.blink { animation: blink 1.06s step-end infinite; }

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

.fade-in-up { animation: fadeInUp 0.3s ease forwards; }

@keyframes neonPulse {
  0%, 100% { box-shadow: 0 0 4px rgba(0,255,136,0.4); }
  50%       { box-shadow: 0 0 12px rgba(0,255,136,0.9), 0 0 24px rgba(0,255,136,0.3); }
}

.neon-pulse { animation: neonPulse 2s ease-in-out infinite; }

/* ── Neon range slider ───────────────────────────────── */
.neon-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 2px;
  background: var(--bg-border);
  outline: none;
  cursor: pointer;
  border-radius: 0;
}

.neon-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 10px;
  height: 10px;
  background: var(--neon-green);
  cursor: pointer;
  border-radius: 0;
  box-shadow: var(--glow-green);
}

.neon-slider::-moz-range-thumb {
  width: 10px;
  height: 10px;
  background: var(--neon-green);
  border: none;
  border-radius: 0;
  cursor: pointer;
}

/* ── Scrollbar ───────────────────────────────────────── */
::-webkit-scrollbar { width: 3px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bg-border); }
```

- [ ] **Step 3: Verify TypeScript builds**

```bash
cd /c/Users/alamb/OneDrive/Attachments/Documents/AsuGreen && npm run build
```

Expected: Build succeeds. If font import warnings appear, they are safe to ignore.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/alamb/OneDrive/Attachments/Documents/AsuGreen
git add app/layout.tsx app/globals.css
git commit -m "feat: add neon terminal design tokens and pixel fonts"
```

---

## Task 2: Neon Map Theme Utility

**Files:**
- Create: `lib/mapStyle.ts`

- [ ] **Step 1: Create lib/mapStyle.ts**

```typescript
import type maplibregl from 'maplibre-gl';

/**
 * Patches an OpenFreeMap dark style to use AsunGreen neon terminal palette.
 * Uses source-layer names from the OpenMapTiles spec (stable across style versions).
 */
export function applyNeonTheme(map: maplibregl.Map): void {
  const { layers } = map.getStyle();

  layers.forEach((layer) => {
    try {
      const sourceLayer = (layer as Record<string, unknown>)['source-layer'] as string | undefined ?? '';
      const id = layer.id;

      if (layer.type === 'background') {
        map.setPaintProperty(id, 'background-color', '#030804');
        return;
      }

      if (layer.type === 'fill') {
        if (sourceLayer === 'water') {
          map.setPaintProperty(id, 'fill-color', '#001820');
          map.setPaintProperty(id, 'fill-opacity', 0.95);
        } else if (sourceLayer === 'building') {
          map.setPaintProperty(id, 'fill-color', '#0a0f0a');
          map.setPaintProperty(id, 'fill-outline-color', '#152e1a');
          map.setPaintProperty(id, 'fill-opacity', 1);
        } else if (sourceLayer === 'park' || sourceLayer === 'landuse') {
          map.setPaintProperty(id, 'fill-color', '#040d05');
          map.setPaintProperty(id, 'fill-opacity', 0.85);
        } else {
          map.setPaintProperty(id, 'fill-color', '#030804');
        }
        return;
      }

      if (layer.type === 'line') {
        if (sourceLayer === 'waterway' || sourceLayer === 'water') {
          map.setPaintProperty(id, 'line-color', '#00e5ff');
          map.setPaintProperty(id, 'line-opacity', 0.5);
        } else if (sourceLayer === 'transportation') {
          const isMajor =
            id.includes('primary') || id.includes('secondary') ||
            id.includes('motorway') || id.includes('trunk') ||
            id.includes('major') || id.includes('highway');
          map.setPaintProperty(id, 'line-color', '#00ff88');
          map.setPaintProperty(id, 'line-opacity', isMajor ? 0.75 : 0.18);
        } else if (sourceLayer === 'boundary') {
          map.setPaintProperty(id, 'line-color', '#0d2b12');
          map.setPaintProperty(id, 'line-opacity', 0.6);
        } else {
          map.setPaintProperty(id, 'line-opacity', 0.1);
        }
        return;
      }

      if (layer.type === 'symbol') {
        map.setPaintProperty(id, 'text-color', '#2d5c35');
        map.setPaintProperty(id, 'text-halo-color', '#030804');
        map.setPaintProperty(id, 'text-halo-width', 1);
        // Make city/town labels readable
        if (sourceLayer === 'place') {
          map.setPaintProperty(id, 'text-color', '#a8ffb0');
        }
      }
    } catch {
      // Skip read-only or incompatible layers
    }
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /c/Users/alamb/OneDrive/Attachments/Documents/AsuGreen && npm run build
```

Expected: Build succeeds, no type errors in `lib/mapStyle.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/mapStyle.ts
git commit -m "feat: add applyNeonTheme utility for OpenFreeMap style patching"
```

---

## Task 3: MapView — Swap Basemap to OpenFreeMap + Neon Theme

**Files:**
- Modify: `components/MapView.tsx`

- [ ] **Step 1: Replace MapView.tsx entirely**

```tsx
'use client';

import { useRef, useEffect, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { ScatterplotLayer } from '@deck.gl/layers';
import { Deck } from '@deck.gl/core';
import type { LayerType } from '@/lib/types';
import { INITIAL_VIEW_STATE, NASA_GIBS } from '@/lib/constants';
import { initParticles, updateParticles, particleColor, particleRadius } from '@/lib/trafficSim';
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

    map.on('load', () => {
      // Apply neon terminal palette over OpenFreeMap dark style
      applyNeonTheme(map);

      // NASA GIBS: Soil Temperature (WMS — supports EPSG:3857 bbox)
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

      // NASA GIBS: NDVI (WMS — supports EPSG:3857 bbox)
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

      mapRef.current = map;
      mapReadyRef.current = true;
    });

    // Live coordinate broadcast for StatusBar
    map.on('mousemove', (e) => {
      onCoordsChange?.(e.lngLat.lat, e.lngLat.lng, map.getZoom());
    });

    return () => {
      map.remove();
      mapRef.current = null;
      mapReadyRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync NASA layer visibility ──────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    if (!map.getLayer('soil-temp-layer') || !map.getLayer('ndvi-layer')) return;

    map.setPaintProperty('soil-temp-layer', 'raster-opacity', activeLayers.soilTemp ? 0.75 : 0);
    map.setPaintProperty('ndvi-layer',      'raster-opacity', activeLayers.ndvi      ? 0.78 : 0);
  }, [activeLayers]);

  // ── Initialize Deck.gl (WebGL2) ─────────────────────
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

    deckRef.current   = deck;
    particlesRef.current = initParticles();

    // Sync deck viewport when map moves
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

    // Wait for map to initialise before binding move event
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
              getRadius: particleRadius(hour),
              getFillColor: particleColor(hour),
              radiusUnits: 'meters',
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
    <div className="relative w-full h-full grid-bg">
      <div ref={mapContainerRef} className="absolute inset-0" />
      <canvas
        ref={deckCanvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ mixBlendMode: 'screen' }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Build to check types**

```bash
cd /c/Users/alamb/OneDrive/Attachments/Documents/AsuGreen && npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Run dev and verify map loads dark with neon roads**

```bash
npm run dev
```

Open `http://localhost:3000`. Expect:
- Dark map background (#030804)
- Neon green road lines
- Cyan water
- No CartoCDN errors in console
- NASA layers load (may show empty tiles over ocean — normal)

- [ ] **Step 4: Commit**

```bash
git add components/MapView.tsx lib/mapStyle.ts
git commit -m "fix: switch basemap to OpenFreeMap with neon theme, fix NASA WMS sources"
```

---

## Task 4: Header — Terminal Prompt Redesign

**Files:**
- Modify: `components/Header.tsx`

- [ ] **Step 1: Replace Header.tsx entirely**

```tsx
'use client';

import { useEffect, useState } from 'react';

const BADGES = [
  { label: 'SYS:NOMINAL', color: 'var(--neon-green)',   glow: 'var(--glow-green)'   },
  { label: 'NASA·MODIS',  color: 'var(--neon-cyan)',    glow: 'var(--glow-cyan)'    },
  { label: 'GEE·READY',   color: 'var(--neon-purple)',  glow: 'var(--glow-purple)'  },
];

export default function Header() {
  const [cursorOn, setCursorOn] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setCursorOn((v) => !v), 530);
    return () => clearInterval(t);
  }, []);

  return (
    <header
      className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-5 scan-lines"
      style={{
        height: '48px',
        background: 'rgba(3,8,4,0.96)',
        borderBottom: '1px solid rgba(0,255,136,0.25)',
        boxShadow: '0 0 24px rgba(0,255,136,0.08)',
      }}
    >
      {/* ── Prompt ─────────────────────────────────── */}
      <div className="flex items-center gap-1.5">
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            color: 'var(--text-muted)',
          }}
        >
          &gt;
        </span>
        <span
          style={{
            fontFamily: 'var(--font-pixel)',
            fontSize: '8px',
            color: 'var(--neon-green)',
            textShadow: 'var(--glow-green)',
            letterSpacing: '0.04em',
          }}
        >
          ASUNGREEN_v0.1
        </span>
        <span
          style={{
            fontFamily: 'var(--font-pixel)',
            fontSize: '9px',
            color: 'var(--neon-green)',
            textShadow: 'var(--glow-green)',
            opacity: cursorOn ? 1 : 0,
            transition: 'opacity 0.05s',
          }}
        >
          █
        </span>
      </div>

      {/* ── Status badges ──────────────────────────── */}
      <div className="hidden md:flex items-center gap-2.5">
        {BADGES.map(({ label, color, glow }) => (
          <span
            key={label}
            style={{
              fontFamily: 'var(--font-pixel)',
              fontSize: '6px',
              color,
              padding: '4px 8px',
              border: `1px solid ${color}`,
              borderRadius: '1px',
              background: `${color}0f`,
              boxShadow: `0 0 6px ${color}55`,
              letterSpacing: '0.04em',
              textShadow: glow,
            }}
          >
            [{label}]
          </span>
        ))}
      </div>

      {/* ── Coordinates ────────────────────────────── */}
      <div
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: '15px',
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
        }}
      >
        LAT:-25.2867 · LNG:-57.5759 · ASU·PY
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

Expected: Build passes. Run `npm run dev`, verify header shows terminal prompt with blinking cursor and neon badges.

- [ ] **Step 3: Commit**

```bash
git add components/Header.tsx
git commit -m "feat: redesign Header as neon terminal prompt with blinking cursor"
```

---

## Task 5: Sidebar — ASCII Terminal Cards

**Files:**
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Replace Sidebar.tsx entirely**

```tsx
'use client';

import { Thermometer, Car, TreePine } from 'lucide-react';
import type { LayerType } from '@/lib/types';

interface SidebarProps {
  activeLayers: Record<LayerType, boolean>;
  onToggleLayer: (id: LayerType) => void;
  hour: number;
  onHourChange: (h: number) => void;
  trafficActive: boolean;
}

const LAYERS: {
  id: LayerType;
  name: string;
  subtitle: string;
  source: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    id: 'soilTemp',
    name: 'TEMPERATURA',
    subtitle: 'MODIS·MOD11A1·LST',
    source: 'NASA TERRA · 1km',
    icon: <Thermometer size={13} />,
    color: 'var(--neon-orange)',
  },
  {
    id: 'traffic',
    name: 'TRAFICO',
    subtitle: 'SIMULACION·OSM',
    source: 'DATOS SIMULADOS',
    icon: <Car size={13} />,
    color: 'var(--neon-cyan)',
  },
  {
    id: 'ndvi',
    name: 'VEGETACION',
    subtitle: 'NDVI·MODIS·250m',
    source: 'NASA TERRA · 250m',
    icon: <TreePine size={13} />,
    color: 'var(--neon-green)',
  },
];

function pad(n: number) {
  return String(n + 1).padStart(2, '0');
}

function formatHour(h: number): string {
  if (h === 0) return '00:00';
  const period = h < 12 ? 'AM' : 'PM';
  const display = h <= 12 ? h : h - 12;
  return `${display}:00 ${period}`;
}

const TRAFFIC_BY_HOUR = [
  0.05, 0.03, 0.02, 0.02, 0.03, 0.10,
  0.30, 0.70, 0.95, 0.80, 0.60, 0.55,
  0.55, 0.58, 0.60, 0.65, 0.78, 0.98,
  0.92, 0.75, 0.58, 0.40, 0.22, 0.10,
];

export default function Sidebar({
  activeLayers,
  onToggleLayer,
  hour,
  onHourChange,
  trafficActive,
}: SidebarProps) {
  return (
    <aside
      className="absolute left-3 z-40 flex flex-col gap-2 fade-in-up"
      style={{ top: '56px', bottom: '36px', width: '268px' }}
    >
      {/* ── System header ──────────────────────────── */}
      <div className="terminal-panel">
        <div
          style={{
            fontFamily: 'var(--font-pixel)',
            fontSize: '7px',
            color: 'var(--neon-green)',
            textShadow: 'var(--glow-green)',
            letterSpacing: '0.05em',
          }}
        >
          MAP_LAYERS.SH
        </div>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--text-muted)',
            marginTop: '5px',
          }}
        >
          DEPT·CENTRAL · ASU · PY
        </p>
      </div>

      {/* ── Layer cards ────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        {LAYERS.map((layer, i) => {
          const isActive = activeLayers[layer.id];
          return (
            <button
              key={layer.id}
              onClick={() => onToggleLayer(layer.id)}
              className="terminal-panel-btn"
              style={{
                borderColor: isActive ? layer.color : 'var(--bg-border)',
                boxShadow: isActive ? `0 0 10px ${layer.color}33` : 'none',
              }}
            >
              {/* Row number */}
              <div
                style={{
                  fontFamily: 'var(--font-pixel)',
                  fontSize: '6px',
                  color: isActive ? layer.color : 'var(--text-muted)',
                  marginBottom: '7px',
                  letterSpacing: '0.04em',
                }}
              >
                {pad(i)} ──────────────────────
              </div>

              {/* Main row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span style={{ color: isActive ? layer.color : 'var(--text-muted)' }}>
                    {layer.icon}
                  </span>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-pixel)',
                        fontSize: '7px',
                        color: isActive ? 'var(--text-bright)' : 'var(--text-muted)',
                        textShadow: isActive ? `0 0 8px ${layer.color}` : 'none',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {layer.name}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        color: isActive ? `${layer.color}cc` : 'var(--bg-border)',
                        marginTop: '2px',
                      }}
                    >
                      {layer.subtitle}
                    </div>
                  </div>
                </div>

                {/* Neon toggle */}
                <div
                  style={{
                    width: '36px',
                    height: '16px',
                    borderRadius: '1px',
                    position: 'relative',
                    background: isActive
                      ? `linear-gradient(90deg, ${layer.color}99, ${layer.color})`
                      : 'rgba(13,43,18,0.6)',
                    border: `1px solid ${isActive ? layer.color : 'var(--bg-border)'}`,
                    boxShadow: isActive ? `0 0 6px ${layer.color}88` : 'none',
                    transition: 'all 0.2s',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '2px',
                      width: '10px',
                      height: '10px',
                      borderRadius: '1px',
                      background: '#fff',
                      left: isActive ? '23px' : '2px',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
                    }}
                  />
                </div>
              </div>

              {/* Source line when active */}
              {isActive && (
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: `${layer.color}99`,
                    marginTop: '7px',
                    paddingTop: '6px',
                    borderTop: `1px solid ${layer.color}22`,
                  }}
                >
                  &gt; {layer.source} · ACTIVE
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Time slider (traffic only) ──────────────── */}
      {trafficActive && (
        <div className="terminal-panel fade-in-up">
          <div className="flex items-center justify-between" style={{ marginBottom: '10px' }}>
            <div
              style={{
                fontFamily: 'var(--font-pixel)',
                fontSize: '6px',
                color: 'var(--neon-cyan)',
                textShadow: 'var(--glow-cyan)',
                letterSpacing: '0.04em',
              }}
            >
              HORA_DEL_DIA
            </div>
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: '18px',
                color: 'var(--neon-cyan)',
                textShadow: 'var(--glow-cyan)',
              }}
            >
              {formatHour(hour)}
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={23}
            value={hour}
            onChange={(e) => onHourChange(Number(e.target.value))}
            className="neon-slider"
          />

          <div
            className="flex justify-between mt-2"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: 'var(--text-muted)',
            }}
          >
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:00</span>
          </div>

          <TrafficBar hour={hour} />
        </div>
      )}

      {/* ── Footer ─────────────────────────────────── */}
      <div
        className="terminal-panel mt-auto"
        style={{ borderColor: 'transparent' }}
      >
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}
        >
          © 2025 ASUNGREEN · NASA/GEE/OSM
        </p>
      </div>
    </aside>
  );
}

function TrafficBar({ hour }: { hour: number }) {
  const density = TRAFFIC_BY_HOUR[hour] ?? 0;
  const isPeak  = density >= 0.85;
  const isHigh  = density >= 0.6;
  const color   = isPeak
    ? 'var(--neon-magenta)'
    : isHigh
    ? 'var(--neon-yellow)'
    : 'var(--neon-cyan)';
  const label   = isPeak ? 'PICO' : isHigh ? 'ALTO' : 'NORMAL';

  return (
    <div style={{ marginTop: '10px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '5px' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            color: 'var(--text-muted)',
          }}
        >
          DENSIDAD:
        </span>
        <span
          style={{
            fontFamily: 'var(--font-pixel)',
            fontSize: '6px',
            color,
            textShadow: `0 0 8px ${color}`,
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          height: '3px',
          background: 'var(--bg-border)',
          borderRadius: '0',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${density * 100}%`,
            background: color,
            boxShadow: `0 0 6px ${color}`,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

Expected: Build passes. Dev server shows ASCII-styled layer cards with neon toggles.

- [ ] **Step 3: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat: redesign Sidebar as ASCII terminal layer cards"
```

---

## Task 6: Legend — Neon Gradient Bars

**Files:**
- Modify: `components/Legend.tsx`

- [ ] **Step 1: Replace Legend.tsx entirely**

```tsx
'use client';

import type { LayerType } from '@/lib/types';

interface LegendProps {
  activeLayers: Record<LayerType, boolean>;
}

const LEGENDS: Record<
  LayerType,
  { title: string; unit: string; gradient: string; min: string; max: string; source: string; glowColor: string }
> = {
  soilTemp: {
    title: 'TEMPERATURA',
    unit: '°C',
    gradient: 'linear-gradient(to right, #001aff, #0080ff, #00ffcc, #ffe600, #ff7c00, #ff2d78)',
    min: '<20°C',
    max: '>45°C',
    source: 'MODIS·LST·1km',
    glowColor: 'var(--neon-orange)',
  },
  traffic: {
    title: 'FLUJO_VIAL',
    unit: 'veh/min',
    gradient: 'linear-gradient(to right, #00e5ff, #ffe600, #ff7c00, #ff2d78)',
    min: 'BAJO',
    max: 'PICO',
    source: 'SIMULACION·OSM',
    glowColor: 'var(--neon-cyan)',
  },
  ndvi: {
    title: 'VEGETACION',
    unit: 'NDVI',
    gradient: 'linear-gradient(to right, #ff2d78, #ffe600, #00ff88, #00a855, #004d22)',
    min: '-1 SUELO',
    max: '+1 DENSA',
    source: 'MODIS·NDVI·250m',
    glowColor: 'var(--neon-green)',
  },
};

export default function Legend({ activeLayers }: LegendProps) {
  const visible = (Object.keys(activeLayers) as LayerType[]).filter((k) => activeLayers[k]);

  if (visible.length === 0) return null;

  return (
    <div
      className="absolute z-40 flex flex-col gap-2 fade-in-up"
      style={{ bottom: '36px', right: '12px' }}
    >
      {visible.map((layerId) => {
        const leg = LEGENDS[layerId];
        return (
          <div
            key={layerId}
            className="terminal-panel"
            style={{
              width: '220px',
              borderColor: leg.glowColor,
              boxShadow: `0 0 12px ${leg.glowColor}33`,
            }}
          >
            {/* Title row */}
            <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
              <span
                style={{
                  fontFamily: 'var(--font-pixel)',
                  fontSize: '6px',
                  color: leg.glowColor,
                  textShadow: `0 0 8px ${leg.glowColor}`,
                  letterSpacing: '0.04em',
                }}
              >
                {leg.title}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: '13px',
                  color: leg.glowColor,
                  padding: '1px 6px',
                  border: `1px solid ${leg.glowColor}`,
                  background: `${leg.glowColor}11`,
                }}
              >
                {leg.unit}
              </span>
            </div>

            {/* Gradient bar */}
            <div
              style={{
                height: '6px',
                background: leg.gradient,
                borderRadius: '1px',
                boxShadow: `0 0 8px ${leg.glowColor}44`,
                marginBottom: '5px',
              }}
            />

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

            {/* Source */}
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                color: 'var(--text-muted)',
                marginTop: '6px',
                paddingTop: '5px',
                borderTop: `1px solid ${leg.glowColor}18`,
              }}
            >
              &gt; {leg.source}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

Expected: Build passes. Activating a layer in dev shows a neon-framed gradient legend in the bottom right.

- [ ] **Step 3: Commit**

```bash
git add components/Legend.tsx
git commit -m "feat: redesign Legend with neon gradient bars and terminal style"
```

---

## Task 7: StatusBar — Live Coordinate Footer

**Files:**
- Create: `components/StatusBar.tsx`
- Modify: `components/MapClient.tsx`

- [ ] **Step 1: Create components/StatusBar.tsx**

```tsx
'use client';

interface StatusBarProps {
  lat: number;
  lng: number;
  zoom: number;
}

export default function StatusBar({ lat, lng, zoom }: StatusBarProps) {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-50 flex items-center justify-between px-4"
      style={{
        height: '28px',
        background: 'rgba(3,8,4,0.96)',
        borderTop: '1px solid rgba(0,255,136,0.12)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: '14px',
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
        }}
      >
        LAT: {lat.toFixed(4)} | LNG: {lng.toFixed(4)} | ZOOM: {zoom.toFixed(1)}
      </span>

      <span
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: '14px',
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
        }}
      >
        DATA: 2024-08-10 · ASUNCION · PY
      </span>

      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          color: 'var(--neon-green)',
          letterSpacing: '0.04em',
        }}
      >
        ● LIVE
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Update MapClient.tsx to wire coords state**

Replace the entire contents of `components/MapClient.tsx`:

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

export default function MapClient() {
  const [activeLayers, setActiveLayers] = useState<Record<LayerType, boolean>>({
    soilTemp: true,
    traffic: false,
    ndvi: false,
  });
  const [hour, setHour] = useState(8);
  const [coords, setCoords] = useState({
    lat: INITIAL_VIEW_STATE.latitude,
    lng: INITIAL_VIEW_STATE.longitude,
    zoom: INITIAL_VIEW_STATE.zoom,
  });

  const toggleLayer = (id: LayerType) =>
    setActiveLayers((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleCoordsChange = useCallback(
    (lat: number, lng: number, zoom: number) => setCoords({ lat, lng, zoom }),
    []
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
      />
      <Header />
      <Sidebar
        activeLayers={activeLayers}
        onToggleLayer={toggleLayer}
        hour={hour}
        onHourChange={setHour}
        trafficActive={activeLayers.traffic}
      />
      <Legend activeLayers={activeLayers} />
      <StatusBar lat={coords.lat} lng={coords.lng} zoom={coords.zoom} />
    </div>
  );
}
```

Note: Add the `spin` keyframe to `globals.css`:

```css
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 3: Build — full project check**

```bash
npm run build
```

Expected: Build passes with no TypeScript errors.

- [ ] **Step 4: Full visual verification in dev**

```bash
npm run dev
```

Checklist:
- [ ] Dark map background with neon green roads visible
- [ ] Header shows `> ASUNGREEN_v0.1 █` with blinking cursor
- [ ] Three neon badges `[SYS:NOMINAL]` etc. visible
- [ ] Sidebar shows numbered ASCII layer cards
- [ ] Toggling a layer shows active state with neon glow
- [ ] Legend appears bottom-right when layer is active
- [ ] StatusBar at bottom shows coordinates
- [ ] Moving mouse over map updates StatusBar coords
- [ ] Traffic layer shows neon particles
- [ ] No CartoCDN errors in browser console
- [ ] No NASA GIBS 400 errors at current zoom level

- [ ] **Step 5: Final commit**

```bash
git add components/StatusBar.tsx components/MapClient.tsx app/globals.css
git commit -m "feat: add StatusBar, wire live coords, complete neon terminal UI"
```

---

## Self-Review

**Spec coverage:**
- ✅ Basemap switch (CartoCDN → OpenFreeMap with neon theme)
- ✅ NASA GIBS WMS fix (already done, preserved in MapView)
- ✅ Press Start 2P + VT323 + Share Tech Mono fonts
- ✅ CSS variables neon system + scan lines + glow + blink
- ✅ Header terminal prompt redesign
- ✅ Sidebar ASCII cards redesign
- ✅ Legend neon gradient redesign
- ✅ StatusBar new component
- ✅ MapClient wires everything together

**Placeholder scan:** None found. All steps have complete code.

**Type consistency:**
- `onCoordsChange?: (lat: number, lng: number, zoom: number) => void` — defined in MapView props, passed from MapClient ✅
- `applyNeonTheme(map: maplibregl.Map)` — defined in `lib/mapStyle.ts`, imported in `MapView.tsx` ✅
- `INITIAL_VIEW_STATE` — imported from `lib/constants` in both MapView and MapClient ✅
- `LayerType` — imported from `lib/types` everywhere ✅
