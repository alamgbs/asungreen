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
import { getGeeTileUrl, geeTileUrlCache, geeTileTokenCache } from '@/lib/geeApi';
import { shouldUseLocalTile } from '@/lib/tileRouter';

// 1×1 transparent PNG — returned for GEE tiles when the GEE URL is not yet loaded.
// Prevents MapLibre from throwing on the custom env-tile:// scheme while GEE initializes.
const TRANSPARENT_TILE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=';

interface MapViewProps {
  activeLayers: Record<LayerType, boolean>;
  hour: number;
  onCoordsChange?: (lat: number, lng: number, zoom: number) => void;
  years: number[];
  seasons: string[];
}

export default function MapView({ activeLayers, hour, onCoordsChange, years, seasons }: MapViewProps) {
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

        const geeBase  = geeTileUrlCache[layer as 'ndvi' | 'soilTemp'];
        const geeToken = geeTileTokenCache[layer as 'ndvi' | 'soilTemp'];
        if (!geeBase || !geeToken) {
          // GEE URL not loaded yet — return transparent tile to avoid 404s.
          // initGee() will call setTiles() once the URL is ready.
          return { url: TRANSPARENT_TILE };
        }
        return {
          url: `${geeBase}/${zi}/${xi}/${yi}`,
          headers: { Authorization: `Bearer ${geeToken}` },
        };
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
