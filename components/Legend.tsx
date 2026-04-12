'use client';

import type { LayerType } from '@/lib/types';

interface LegendProps {
  activeLayers: Record<LayerType, boolean>;
}

const LEGENDS: Record<
  LayerType,
  { title: string; unit: string; gradient: string; min: string; max: string; description: string }
> = {
  soilTemp: {
    title: 'Temperatura del Suelo',
    unit: '°C',
    gradient: 'linear-gradient(to right, #1e40af, #3b82f6, #a3e635, #facc15, #f97316, #ef4444)',
    min: '< 20°C',
    max: '> 45°C',
    description: 'MODIS LST Day · 1km resolución',
  },
  traffic: {
    title: 'Flujo Vehicular',
    unit: 'veh/min',
    gradient: 'linear-gradient(to right, #14b8a6, #eab308, #f97316, #ef4444)',
    min: 'Bajo',
    max: 'Pico',
    description: 'Estimación simulada · Hora seleccionada',
  },
  ndvi: {
    title: 'Índice de Vegetación (NDVI)',
    unit: 'NDVI',
    gradient: 'linear-gradient(to right, #92400e, #dc2626, #eab308, #4ade80, #16a34a, #14532d)',
    min: '−1 (Sin vegetación)',
    max: '+1 (Densa)',
    description: 'MODIS NDVI · 250m resolución',
  },
};

export default function Legend({ activeLayers }: LegendProps) {
  const visible = (Object.keys(activeLayers) as LayerType[]).filter((k) => activeLayers[k]);

  if (visible.length === 0) return null;

  return (
    <div className="absolute bottom-4 right-4 z-40 flex flex-col gap-2 fade-in-up">
      {visible.map((layerId) => {
        const leg = LEGENDS[layerId];
        return (
          <div key={layerId} className="glass rounded-xl px-4 py-3 w-72">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#f0fdf4]">{leg.title}</span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}
              >
                {leg.unit}
              </span>
            </div>
            <div className="h-2.5 rounded-full mb-1.5 shadow-inner" style={{ background: leg.gradient }} />
            <div className="flex justify-between text-[10px] text-[#6b7280]">
              <span>{leg.min}</span>
              <span>{leg.max}</span>
            </div>
            <p className="text-[10px] text-[#4b5563] mt-1.5 pt-1.5" style={{ borderTop: '1px solid rgba(16,185,129,0.08)' }}>
              {leg.description}
            </p>
          </div>
        );
      })}
    </div>
  );
}
