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

  const handleAoiChange = useCallback((id: string | null) => {
    setSelectedAoi(id);
    if (id === null) setGeeStats({});
  }, []);

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
        onAoiChange={handleAoiChange}
      />
      <Legend activeLayers={activeLayers} geeStats={geeStats} />
      <StatusBar lat={coords.lat} lng={coords.lng} zoom={coords.zoom} />
    </div>
  );
}
