'use client';

import { Thermometer, Car, TreePine, ChevronRight, Info } from 'lucide-react';
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
  icon: React.ReactNode;
  color: string;
  source: string;
}[] = [
  {
    id: 'soilTemp',
    name: 'Temperatura del Suelo',
    subtitle: 'MODIS MOD11A1 · LST',
    icon: <Thermometer size={16} />,
    color: '#f97316',
    source: 'NASA MODIS Terra',
  },
  {
    id: 'traffic',
    name: 'Flujo de Tráfico',
    subtitle: 'Simulación · OSM Roads',
    icon: <Car size={16} />,
    color: '#14b8a6',
    source: 'Datos Simulados',
  },
  {
    id: 'ndvi',
    name: 'Índice de Vegetación',
    subtitle: 'NDVI · Sentinel-2',
    icon: <TreePine size={16} />,
    color: '#10b981',
    source: 'NASA MODIS Terra',
  },
];

const HOUR_LABELS: Record<number, string> = {
  0: 'Medianoche', 6: '6 AM', 7: 'Hora pico', 8: 'Hora pico',
  9: '9 AM', 12: 'Mediodía', 17: 'Hora pico', 18: 'Hora pico',
  19: 'Hora pico', 22: '10 PM', 23: 'Noche',
};

function formatHour(h: number): string {
  if (h === 0) return '00:00';
  const period = h < 12 ? 'AM' : 'PM';
  const display = h <= 12 ? h : h - 12;
  return `${display}:00 ${period}`;
}

export default function Sidebar({
  activeLayers,
  onToggleLayer,
  hour,
  onHourChange,
  trafficActive,
}: SidebarProps) {
  return (
    <aside
      className="absolute left-4 top-16 bottom-4 z-40 w-72 flex flex-col gap-3 fade-in-up"
      style={{ top: '72px' }}
    >
      {/* Title */}
      <div className="glass rounded-xl px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-widest uppercase text-[#6b7280]">
            Capas del Mapa
          </h2>
          <ChevronRight size={14} className="text-[#10b981]" />
        </div>
        <p className="text-[10px] text-[#4b5563] mt-1">
          Departamento Central · Asunción, Paraguay
        </p>
      </div>

      {/* Layer cards */}
      <div className="flex flex-col gap-2">
        {LAYERS.map((layer) => {
          const isActive = activeLayers[layer.id];
          return (
            <button
              key={layer.id}
              onClick={() => onToggleLayer(layer.id)}
              className={`glass rounded-xl px-4 py-3.5 text-left transition-all duration-200 glass-hover cursor-pointer ${
                isActive ? 'layer-card-active' : ''
              }`}
              style={{ outline: 'none' }}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200"
                    style={{
                      background: isActive
                        ? `${layer.color}22`
                        : 'rgba(75,85,99,0.2)',
                      color: isActive ? layer.color : '#6b7280',
                      border: `1px solid ${isActive ? layer.color + '44' : 'transparent'}`,
                    }}
                  >
                    {layer.icon}
                  </div>
                  <div>
                    <p
                      className="text-sm font-medium leading-tight"
                      style={{ color: isActive ? '#f0fdf4' : '#9ca3af' }}
                    >
                      {layer.name}
                    </p>
                    <p className="text-[10px] text-[#4b5563] mt-0.5">{layer.subtitle}</p>
                  </div>
                </div>

                {/* Toggle */}
                <div
                  className="w-10 h-5 rounded-full relative transition-all duration-300 flex-shrink-0"
                  style={{
                    background: isActive
                      ? `linear-gradient(to right, ${layer.color}, ${layer.color}cc)`
                      : 'rgba(55,65,81,0.8)',
                    boxShadow: isActive ? `0 0 8px ${layer.color}66` : 'none',
                  }}
                >
                  <div
                    className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-300"
                    style={{
                      left: isActive ? '22px' : '2px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    }}
                  />
                </div>
              </div>

              {isActive && (
                <div
                  className="flex items-center gap-1 mt-2 pt-2"
                  style={{ borderTop: '1px solid rgba(16,185,129,0.12)' }}
                >
                  <Info size={10} style={{ color: layer.color }} />
                  <span className="text-[10px]" style={{ color: layer.color + 'cc' }}>
                    {layer.source}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Time slider — only when traffic is active */}
      {trafficActive && (
        <div className="glass rounded-xl px-4 py-4 fade-in-up">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Car size={13} className="text-[#14b8a6]" />
              <span className="text-xs font-semibold text-[#a7f3d0]">Hora del Día</span>
            </div>
            <div
              className="px-2.5 py-0.5 rounded-full text-xs font-bold"
              style={{
                background: 'rgba(20,184,166,0.15)',
                color: '#14b8a6',
                border: '1px solid rgba(20,184,166,0.3)',
              }}
            >
              {formatHour(hour)}
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={23}
            value={hour}
            onChange={(e) => onHourChange(Number(e.target.value))}
            className="time-slider"
          />

          <div className="flex justify-between mt-2 text-[10px] text-[#4b5563]">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:00</span>
          </div>

          <TrafficDensityBar hour={hour} />
        </div>
      )}

      {/* Footer */}
      <div
        className="glass rounded-xl px-4 py-3 mt-auto"
        style={{ borderColor: 'rgba(16,185,129,0.1)' }}
      >
        <p className="text-[10px] text-[#4b5563] text-center">
          © 2025 AsunGreen · Datos NASA / GEE / OSM
        </p>
      </div>
    </aside>
  );
}

function TrafficDensityBar({ hour }: { hour: number }) {
  const TRAFFIC_BY_HOUR = [
    0.05, 0.03, 0.02, 0.02, 0.03, 0.10,
    0.30, 0.70, 0.95, 0.80, 0.60, 0.55,
    0.55, 0.58, 0.60, 0.65, 0.78, 0.98,
    0.92, 0.75, 0.58, 0.40, 0.22, 0.10,
  ];
  const density = TRAFFIC_BY_HOUR[hour] ?? 0;
  const isPeak = density >= 0.85;
  const isHigh = density >= 0.6;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-[#6b7280]">Densidad de tráfico</span>
        <span
          className="text-[10px] font-bold"
          style={{
            color: isPeak ? '#ef4444' : isHigh ? '#f97316' : '#14b8a6',
          }}
        >
          {isPeak ? '🔴 Pico' : isHigh ? '🟡 Alto' : '🟢 Normal'}
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: 'rgba(55,65,81,0.5)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${density * 100}%`,
            background: isPeak
              ? 'linear-gradient(to right, #f97316, #ef4444)'
              : isHigh
              ? 'linear-gradient(to right, #eab308, #f97316)'
              : 'linear-gradient(to right, #10b981, #14b8a6)',
          }}
        />
      </div>
    </div>
  );
}
