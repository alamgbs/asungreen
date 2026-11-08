'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Header from './Header';
import Sidebar from './Sidebar';
import Legend from './Legend';
import StatusBar from './StatusBar';
import MethodologyModal from './MethodologyModal';
import type { LayerType } from '@/lib/types';
import { serializeMapState, type MapUrlState } from '@/lib/urlState';

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
            fontSize: '10px',
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

export default function MapClient({ initial }: { initial: MapUrlState }) {
  const [activeLayers, setActiveLayers] = useState<Record<LayerType, boolean>>(initial.layers);
  const [hour, setHour]       = useState(initial.hour);
  const [years, setYears]     = useState<number[]>(initial.years);
  const [seasons, setSeasons] = useState<string[]>(initial.seasons);
  const [selectedZona, setSelectedZona] = useState<string | null>(initial.zona);
  const [showMethod, setShowMethod] = useState(false);
  const [geeStats, setGeeStats] = useState<
    Partial<Record<'ndvi' | 'soilTemp', { min: number; max: number }>>
  >({});
  const [coords, setCoords] = useState(initial.view);
  // Centro/zoom reales del mapa (para la URL); `null` hasta que el usuario o la URL fijan una vista.
  const viewRef = useRef<{ lat: number; lng: number; zoom: number } | null>(
    initial.hasView ? initial.view : null,
  );

  // ── Estado → URL (debounce, history.replaceState) ───
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef({ selectedZona, activeLayers, years, seasons, hour });

  const flushUrl = useCallback(() => {
    const st = stateRef.current;
    const qs = serializeMapState(
      { zona: st.selectedZona, layers: st.activeLayers, years: st.years, seasons: st.seasons,
        hour: st.hour, view: viewRef.current ?? initial.view },
      viewRef.current !== null,
    );
    const next = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(window.history.state, '', next);
    }
  }, [initial.view]);

  const scheduleUrlWrite = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flushUrl, 400);
  }, [flushUrl]);

  useEffect(() => {
    stateRef.current = { selectedZona, activeLayers, years, seasons, hour };
    scheduleUrlWrite();
  }, [selectedZona, activeLayers, years, seasons, hour, scheduleUrlWrite]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const handleViewChange = useCallback((lat: number, lng: number, zoom: number) => {
    viewRef.current = { lat, lng, zoom };
    scheduleUrlWrite();
  }, [scheduleUrlWrite]);

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

  const handleZonaChange = useCallback((id: string | null) => {
    setSelectedZona(id);
    if (id === null) setGeeStats({});
  }, []);

  return (
    <div
      className="relative w-full h-screen overflow-hidden"
      style={{ background: 'var(--bg-base)' }}
    >
      <MapView
        initialView={initial.hasView ? initial.view : undefined}
        onViewChange={handleViewChange}
        activeLayers={activeLayers}
        hour={hour}
        onCoordsChange={handleCoordsChange}
        years={years}
        seasons={seasons}
        selectedZona={selectedZona}
        onZonaClick={handleZonaChange}
        onStatsChange={handleStatsChange}
      />
      <Header onOpenMethodology={() => setShowMethod(true)} />
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
        selectedZona={selectedZona}
        onZonaChange={handleZonaChange}
        onOpenMethodology={() => setShowMethod(true)}
      />
      <Legend activeLayers={activeLayers} geeStats={geeStats} />
      <StatusBar lat={coords.lat} lng={coords.lng} zoom={coords.zoom} />
      {showMethod && <MethodologyModal onClose={() => setShowMethod(false)} />}
    </div>
  );
}
