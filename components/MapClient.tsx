'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Header from './Header';
import Sidebar from './Sidebar';
import Legend from './Legend';
import type { LayerType } from '@/lib/types';

// Dynamic import to avoid SSR issues with MapLibre/Deck.gl
const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-full h-full">
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-16 h-16 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: '#10b981', borderTopColor: 'transparent' }}
        />
        <p className="text-sm text-[#6b7280]">Cargando mapa…</p>
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

  const toggleLayer = (id: LayerType) => {
    setActiveLayers((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#050a07]">
      {/* Full-screen map */}
      <MapView activeLayers={activeLayers} hour={hour} />

      {/* UI overlay */}
      <Header />
      <Sidebar
        activeLayers={activeLayers}
        onToggleLayer={toggleLayer}
        hour={hour}
        onHourChange={setHour}
        trafficActive={activeLayers.traffic}
      />
      <Legend activeLayers={activeLayers} />
    </div>
  );
}
