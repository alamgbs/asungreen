'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { ScatterplotLayer } from '@deck.gl/layers';
import { Deck } from '@deck.gl/core';
import type { LayerType } from '@/lib/types';
import { INITIAL_VIEW_STATE, NASA_GIBS } from '@/lib/constants';
import { initParticles, updateParticles, particleColor, particleRadius } from '@/lib/trafficSim';
import type { TrafficParticle } from '@/lib/types';

interface MapViewProps {
  activeLayers: Record<LayerType, boolean>;
  hour: number;
}

const MAP_STYLE = {
  version: 8 as const,
  name: 'AsunGreen Dark',
  sources: {
    'carto-dark': {
      type: 'raster' as const,
      tiles: ['https://basemaps.cartocdn.com/dark_matter_nolabels/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors © CARTO',
    },
    'carto-labels': {
      type: 'raster' as const,
      tiles: ['https://basemaps.cartocdn.com/dark_matter_only_labels/{z}/{x}/{y}.png'],
      tileSize: 256,
    },
  },
  layers: [
    {
      id: 'carto-dark-layer',
      type: 'raster' as const,
      source: 'carto-dark',
      paint: { 'raster-opacity': 1 },
    },
  ],
};

export default function MapView({ activeLayers, hour }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const deckCanvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const deckRef = useRef<Deck | null>(null);
  const particlesRef = useRef<TrafficParticle[]>([]);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const [mapReady, setMapReady] = useState(false);

  // Initialize MapLibre
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE as maplibregl.StyleSpecification,
      center: [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
      zoom: INITIAL_VIEW_STATE.zoom,
      pitch: INITIAL_VIEW_STATE.pitch,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      // Add label layer on top
      map.addLayer({
        id: 'carto-labels-layer',
        type: 'raster',
        source: 'carto-labels',
        paint: { 'raster-opacity': 0.8 },
      });

      // NASA GIBS: Soil Temperature
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
        paint: {
          'raster-opacity': 0,
        },
      });

      // NASA GIBS: NDVI
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
      setMapReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Sync layer visibility with MapLibre
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const tryUpdate = () => {
      if (!map.getLayer('soil-temp-layer') || !map.getLayer('ndvi-layer')) return;
      map.setPaintProperty('soil-temp-layer', 'raster-opacity', activeLayers.soilTemp ? 0.75 : 0);
      map.setPaintProperty('ndvi-layer', 'raster-opacity', activeLayers.ndvi ? 0.78 : 0);
    };

    tryUpdate();
  }, [activeLayers, mapReady]);

  // Initialize Deck.gl
  useEffect(() => {
    if (!deckCanvasRef.current || !mapContainerRef.current) return;

    const container = mapContainerRef.current.parentElement!;
    const { width, height } = container.getBoundingClientRect();

    const deck = new Deck({
      canvas: deckCanvasRef.current,
      width,
      height,
      initialViewState: INITIAL_VIEW_STATE,
      controller: false,
      layers: [],
      parameters: { blend: true },
    });

    deckRef.current = deck;
    particlesRef.current = initParticles();

    // Sync deck viewport with map
    const syncViewport = () => {
      if (!mapRef.current || !deckRef.current) return;
      const center = mapRef.current.getCenter();
      const zoom = mapRef.current.getZoom();
      const pitch = mapRef.current.getPitch();
      const bearing = mapRef.current.getBearing();
      deckRef.current.setProps({
        viewState: {
          longitude: center.lng,
          latitude: center.lat,
          zoom,
          pitch,
          bearing,
        },
      });
    };

    // Poll map view sync
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

  // Animate traffic particles
  const animateTraffic = useCallback(
    (timestamp: number) => {
      if (!deckRef.current) return;
      const delta = lastTimeRef.current ? (timestamp - lastTimeRef.current) / 1000 : 0.016;
      lastTimeRef.current = timestamp;

      if (activeLayers.traffic) {
        particlesRef.current = updateParticles(particlesRef.current, hour, delta);
        const color = particleColor(hour);
        const radius = particleRadius(hour);

        deckRef.current.setProps({
          layers: [
            new ScatterplotLayer({
              id: 'traffic-particles',
              data: particlesRef.current,
              getPosition: (d: TrafficParticle) => d.position,
              getRadius: radius,
              getFillColor: color,
              radiusUnits: 'meters',
              opacity: 0.85,
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
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="absolute inset-0" />
      <canvas
        ref={deckCanvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ mixBlendMode: 'screen' }}
      />
    </div>
  );
}
