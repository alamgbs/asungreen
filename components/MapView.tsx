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
