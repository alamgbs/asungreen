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
