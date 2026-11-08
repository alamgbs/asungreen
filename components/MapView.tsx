'use client';

import { useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { ScatterplotLayer } from '@deck.gl/layers';
import { Deck } from '@deck.gl/core';
import type { LayerType } from '@/lib/types';
import { INITIAL_VIEW_STATE } from '@/lib/constants';
import { initParticles, updateParticles, particleColor, loadCorridors } from '@/lib/trafficSim';
import type { TrafficParticle } from '@/lib/types';
import { applyNeonTheme } from '@/lib/mapStyle';
import { getGeeTileUrl, geeTileUrlCache } from '@/lib/geeApi';
import {
  ZONAS, NIVEL_LABEL, ZOOM_DISTRITOS, boundsLngLat, geojsonUrl, getZona,
  type NivelZona,
} from '@/lib/zonas';
import { shouldUseLocalTile } from '@/lib/tileRouter';

// 1×1 transparent PNG — returned for GEE tiles when the GEE URL is not yet loaded.
// Prevents MapLibre from throwing on the custom env-tile:// scheme while GEE initializes.
const TRANSPARENT_TILE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=';

interface MapViewProps {
  activeLayers: Record<LayerType, boolean>;
  hour: number;
  onCoordsChange?: (lat: number, lng: number, zoom: number) => void;
  /** Vista inicial (de la URL). Si viene, no se auto-encuadra la zona. */
  initialView?: { lat: number; lng: number; zoom: number };
  /** Centro/zoom del mapa tras cada movimiento (para la URL). */
  onViewChange?: (lat: number, lng: number, zoom: number) => void;
  years: number[];
  seasons: string[];
  /** Id canónico de zona (lib/zonas.ts) o null = global. */
  selectedZona: string | null;
  /** Clic sobre una zona del mapa. */
  onZonaClick?: (id: string) => void;
  onStatsChange: (layer: 'ndvi' | 'soilTemp', min: number, max: number) => void;
}

export default function MapView({ activeLayers, hour, onCoordsChange, initialView, onViewChange, years, seasons, selectedZona, onZonaClick, onStatsChange }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const deckCanvasRef   = useRef<HTMLCanvasElement>(null);
  const mapRef          = useRef<maplibregl.Map | null>(null);
  const deckRef         = useRef<Deck | null>(null);
  const particlesRef    = useRef<TrafficParticle[]>([]);
  const animFrameRef    = useRef<number>(0);
  const lastTimeRef     = useRef<number>(0);
  const mapReadyRef     = useRef(false);
  const initialViewRef  = useRef(initialView);
  const initialZonaRef  = useRef(selectedZona);
  const onZonaClickRef  = useRef(onZonaClick);
  const tooltipRef      = useRef<HTMLDivElement>(null);
  useEffect(() => { onZonaClickRef.current = onZonaClick; }, [onZonaClick]);
  const onViewChangeRef = useRef(onViewChange);
  useEffect(() => { onViewChangeRef.current = onViewChange; }, [onViewChange]);

  // ── Initialize MapLibre ─────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: initialViewRef.current
        ? [initialViewRef.current.lng, initialViewRef.current.lat]
        : [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
      zoom: initialViewRef.current?.zoom ?? INITIAL_VIEW_STATE.zoom,
      pitch: INITIAL_VIEW_STATE.pitch,
      attributionControl: false,
      // transformRequest intercepts every tile load for env-tile:// URLs.
      // All tiles are served from GEE live API (shouldUseLocalTile always returns false).
      transformRequest: (url) => {
        if (!url.startsWith('env-tile://')) return undefined;
        const [layer, z, x, y] = url.replace('env-tile://', '').split('/');
        const zi = +z, xi = +x, yi = +y;

        if (shouldUseLocalTile(layer as 'ndvi' | 'soilTemp', zi, xi, yi)) {
          return { url: `/tiles/${layer}/${zi}/${xi}/${yi}.png` };
        }

        const geeBase  = geeTileUrlCache[layer as 'ndvi' | 'soilTemp'];
        if (!geeBase) {
          // GEE URL not loaded yet — return transparent tile to avoid 404s.
          // refreshGee() will call setTiles() once the URL is ready.
          return { url: TRANSPARENT_TILE };
        }
        // Same-origin proxy (/api/gee-tiles) adds the GEE auth server-side.
        return { url: `${geeBase}/${zi}/${xi}/${yi}` };
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

      // Capa de zonas (polígonos reales) con resaltado y clic.
      setupZonaLayers(map, tooltipRef.current, (id) => onZonaClickRef.current?.(id));
      void setZonaSeleccion(map, initialZonaRef.current);

      // Enlace con ?zona= pero sin lat/lng: encuadra la zona al cargar.
      const zona0 = getZona(initialZonaRef.current);
      if (zona0 && !initialViewRef.current) {
        map.fitBounds(boundsLngLat(zona0), { padding: 40, duration: 0, maxZoom: 14 });
      }
    });

    map.on('moveend', () => {
      const c = map.getCenter();
      onViewChangeRef.current?.(c.lat, c.lng, map.getZoom());
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
  // Runs on mount and whenever years, seasons, or selectedZona change.
  useEffect(() => {
    let cancelled = false;

    async function refreshGee(layer: 'ndvi' | 'soilTemp', sourceId: string) {
      try {
        const result = await getGeeTileUrl(layer, years, seasons, selectedZona ?? undefined);
        if (cancelled) return;
        onStatsChange(layer, result.min, result.max);
        const m = mapRef.current;
        if (!m || !mapReadyRef.current) return;
        const src = m.getSource(sourceId) as maplibregl.RasterTileSource | undefined;
        try {
          src?.setTiles([`env-tile://${layer}/{z}/{x}/{y}`]);
        } catch {
          // MapLibre race condition: AbortController not yet assigned on pending tile
          // requests when setTiles() is called at startup. Harmless — tiles load correctly.
        }
      } catch (err) {
        console.error(`GEE refresh failed for ${layer}:`, err);
      }
    }

    refreshGee('ndvi', 'ndvi-source');
    refreshGee('soilTemp', 'soil-temp-source');

    return () => { cancelled = true; };
  }, [years, seasons, selectedZona]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Zona seleccionada: contorno resaltado + encuadre ─
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    const zona = getZona(selectedZona);
    void setZonaSeleccion(map, zona?.id ?? null);
    if (zona) map.fitBounds(boundsLngLat(zona), { padding: 40, duration: 800, maxZoom: 14 });
  }, [selectedZona]);

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
  const trafficRef = useRef({ on: activeLayers.traffic, hour });
  useEffect(() => { trafficRef.current = { on: activeLayers.traffic, hour }; }, [activeLayers.traffic, hour]);

  useEffect(() => {
    const frame = (timestamp: number) => {
      if (deckRef.current) {
        const { on, hour: h } = trafficRef.current;
        const delta = lastTimeRef.current ? (timestamp - lastTimeRef.current) / 1000 : 0.016;
        lastTimeRef.current = timestamp;

        if (on) {
          particlesRef.current = updateParticles(particlesRef.current, h, delta);
          deckRef.current.setProps({
            layers: [
              new ScatterplotLayer({
                id: 'traffic-particles',
                data: particlesRef.current,
                getPosition: (d: TrafficParticle) => d.position,
                getRadius: 4,
                radiusUnits: 'pixels',
                getFillColor: particleColor(h),
                opacity: 0.9,
                pickable: false,
                parameters: { blend: true },
              }),
            ],
          });
        } else {
          deckRef.current.setProps({ layers: [] });
        }
      }
      animFrameRef.current = requestAnimationFrame(frame);
    };
    animFrameRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

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
      <div
        ref={tooltipRef}
        role="status"
        style={{
          position: 'absolute', left: 0, top: 0, display: 'none', pointerEvents: 'none', zIndex: 5,
          background: 'rgba(3,8,4,0.95)', border: '1px solid var(--neon-cyan)', padding: '4px 8px',
          fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-bright)', whiteSpace: 'nowrap',
        }}
      />
    </div>
  );
}

// ───────────────────────── Zonas: polígonos, resaltado y selección ─────────────────────────
type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry, { id: string; nombre: string; nivel: NivelZona; padre: string | null }>;
const fcCache: Partial<Record<NivelZona, Promise<FC>>> = {};
const loadNivel = (nivel: NivelZona): Promise<FC> =>
  (fcCache[nivel] ??= fetch(geojsonUrl(nivel)).then((r) => {
    if (!r.ok) throw new Error(`zonas ${nivel}: HTTP ${r.status}`);
    return r.json() as Promise<FC>;
  }));

const CYAN = '#00e5ff';
const NIVELES_INTERACTIVOS: NivelZona[] = ['departamento', 'distrito', 'ciudad'];
const fillId = (n: NivelZona) => `zonas-${n}-fill`;

function addNivel(map: maplibregl.Map, nivel: NivelZona) {
  if (map.getSource(`zonas-${nivel}`)) return;
  map.addSource(`zonas-${nivel}`, { type: 'geojson', data: geojsonUrl(nivel), promoteId: 'id' });
  const minzoom = nivel === 'distrito' ? ZOOM_DISTRITOS : 0;
  const maxzoom = nivel === 'departamento' ? ZOOM_DISTRITOS : 24;
  map.addLayer({
    id: fillId(nivel), type: 'fill', source: `zonas-${nivel}`, minzoom, maxzoom,
    paint: {
      'fill-color': CYAN,
      // 0,01 de base: opacidad casi nula pero la capa sigue siendo "consultable" con el cursor.
      'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.2, 0.01],
    },
  });
  map.addLayer({
    id: `zonas-${nivel}-line`, type: 'line', source: `zonas-${nivel}`, minzoom, maxzoom,
    paint: {
      'line-color': CYAN,
      'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2.4, nivel === 'departamento' ? 1.6 : 1.1],
      'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0.7],
    },
  });
}

/** Contorno de la zona elegida; visible a cualquier zoom. */
async function setZonaSeleccion(map: maplibregl.Map, id: string | null) {
  const src = map.getSource('zona-seleccion') as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  const z = getZona(id);
  if (!z) { src.setData(empty); return; }
  try {
    const fc = await loadNivel(z.nivel);
    const f = fc.features.find((x) => x.properties.id === z.id);
    src.setData(f ? { type: 'FeatureCollection', features: [f] } : empty);
  } catch (err) {
    console.warn('No se pudo cargar el límite de la zona:', err);
  }
}

function setupZonaLayers(map: maplibregl.Map, tip: HTMLDivElement | null, onClick: (id: string) => void) {
  addNivel(map, 'departamento');
  addNivel(map, 'ciudad');

  // Distritos (≈1 MB): se cargan al acercarse o al seleccionar uno.
  const ensureDistritos = () => addNivel(map, 'distrito');
  if (map.getZoom() >= ZOOM_DISTRITOS - 1) ensureDistritos();
  map.on('zoomend', () => { if (map.getZoom() >= ZOOM_DISTRITOS - 1) ensureDistritos(); });

  // Ciudades de referencia: punto visible a zoom mundial (los polígonos son diminutos).
  map.addSource('zonas-ciudad-puntos', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: ZONAS.filter((z) => z.nivel === 'ciudad').map((z) => ({
        type: 'Feature', properties: { id: z.id, nombre: z.nombre },
        geometry: { type: 'Point', coordinates: [z.centroide.lng, z.centroide.lat] },
      })),
    },
  });
  map.addLayer({
    id: 'zonas-ciudad-puntos', type: 'circle', source: 'zonas-ciudad-puntos', maxzoom: 7,
    paint: { 'circle-radius': 6, 'circle-color': '#ff2d78', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 },
  });

  map.addSource('zona-seleccion', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'zona-seleccion-fill', type: 'fill', source: 'zona-seleccion', paint: { 'fill-color': CYAN, 'fill-opacity': 0.08 } });
  map.addLayer({ id: 'zona-seleccion-line', type: 'line', source: 'zona-seleccion', paint: { 'line-color': CYAN, 'line-width': 3, 'line-opacity': 1 } });

  // Hover y clic
  let hovered: { source: string; id: string } | null = null;
  const consultables = () =>
    [...NIVELES_INTERACTIVOS.map(fillId), 'zonas-ciudad-puntos'].filter((l) => map.getLayer(l));

  const clearHover = () => {
    if (hovered) map.setFeatureState({ source: hovered.source, id: hovered.id }, { hover: false });
    hovered = null;
    if (tip) tip.style.display = 'none';
    map.getCanvas().style.cursor = '';
  };

  map.on('mousemove', (e) => {
    const f = map.queryRenderedFeatures(e.point, { layers: consultables() })[0];
    if (!f) { clearHover(); return; }
    const id = String(f.properties?.id);
    if (f.source !== 'zonas-ciudad-puntos' && (hovered?.id !== id || hovered?.source !== f.source)) {
      if (hovered) map.setFeatureState({ source: hovered.source, id: hovered.id }, { hover: false });
      map.setFeatureState({ source: f.source, id }, { hover: true });
      hovered = { source: f.source, id };
    }
    map.getCanvas().style.cursor = 'pointer';
    const z = getZona(id);
    if (tip && z) {
      tip.textContent = `${z.nombre} · ${NIVEL_LABEL[z.nivel]}`;
      tip.style.display = 'block';
      tip.style.transform = `translate(${e.point.x + 12}px, ${e.point.y + 12}px)`;
    }
  });
  map.on('mouseout', clearHover);
  map.on('click', (e) => {
    const f = map.queryRenderedFeatures(e.point, { layers: consultables() })[0];
    if (f?.properties?.id) onClick(String(f.properties.id));
  });
  // Evita dejar el hover pegado al cambiar de nivel por zoom.
  map.on('zoomstart', clearHover);

}
