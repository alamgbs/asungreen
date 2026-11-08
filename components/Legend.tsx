'use client';

import { useState } from 'react';
import type { LayerType } from '@/lib/types';
import { LAYER_INFO, SIM_BADGE } from '@/lib/layerInfo';
import { indicadorDeCapa } from '@/lib/indicadores';
import { formatear } from '@/lib/comparar';

interface LegendProps {
  activeLayers: Record<LayerType, boolean>;
  /** @deprecated Ya no se usa: la escala es el rango fijo de lib/indicadores.ts (sin value:compute). */
  geeStats?:    Partial<Record<'ndvi' | 'soilTemp', { min: number; max: number }>>;
}

const LEGENDS: Record<
  LayerType,
  { title: string; unit: string; gradient: string; min: string; max: string; source: string; glowColor: string }
> = {
  soilTemp: {
    title: 'TEMP. SUPERFICIAL',
    unit: '°C',
    gradient: 'linear-gradient(to right, #001aff, #0080ff, #00ffcc, #ffe600, #ff7c00, #ff2d78)',
    min: '<20°C',
    max: '>45°C',
    source: 'LANDSAT·8/9·LST·30m',
    glowColor: 'var(--neon-orange)',
  },
  traffic: {
    title: 'FLUJO_VIAL_SIM',
    unit: 'veh/min',
    gradient: 'linear-gradient(to right, #00e5ff, #ffe600, #ff7c00, #ff2d78)',
    min: 'BAJO',
    max: 'PICO',
    source: 'Vías OSM · perfil horario inventado',
    glowColor: 'var(--neon-cyan)',
  },
  ndvi: {
    title: 'VEGETACION',
    unit: 'NDVI',
    gradient: 'linear-gradient(to right, #ff2d78, #ffe600, #00ff88, #00a855, #004d22)',
    min: '-1 SUELO',
    max: '+1 DENSA',
    source: 'SENTINEL-2·NDVI·10m',
    glowColor: 'var(--neon-green)',
  },
};

/** Gradiente y rótulos desde el registro: la escala es FIJA e igual para todas las zonas y años. */
function escalaFija(layerId: LayerType) {
  const def = indicadorDeCapa(layerId);
  if (!def) return null;
  const [lo, hi] = def.rango;
  const dec = def.decimales ?? 1;
  const u = def.id === 'lst' ? '°C' : '';
  return {
    gradient: `linear-gradient(to right, ${def.paleta.map((c) => `#${c}`).join(', ')})`,
    min: `${formatear(lo, dec)}${u}`,
    mid: `${formatear((lo + hi) / 2, dec)}${u}`,
    max: `${formatear(hi, dec)}${u}`,
  };
}

export default function Legend({ activeLayers }: LegendProps) {
  const [open, setOpen] = useState(false); // solo móvil: plegada para no tapar el mapa
  const visible = (Object.keys(activeLayers) as LayerType[]).filter((k) => activeLayers[k]);

  if (visible.length === 0) return null;

  return (
    <div className="legend-wrap fade-in-up" data-open={open}>
      <button
        type="button"
        className="legend-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Ocultar leyenda' : 'Mostrar leyenda'}
      >
        {open ? 'Ocultar leyenda' : 'Leyenda'}
      </button>
      <div className="legend-panels flex flex-col gap-2">
      {visible.map((layerId) => {
        const leg = LEGENDS[layerId];
        const fija = escalaFija(layerId);
        return (
          <div
            key={layerId}
            className="terminal-panel"
            style={{
              width: '232px',
              maxWidth: '100%',
              borderColor: leg.glowColor,
              boxShadow: `0 0 12px ${leg.glowColor}33`,
            }}
          >
            {/* Title row */}
            <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
              <span
                style={{
                  fontFamily: 'var(--font-pixel)',
                  fontSize: '9px',
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
                  fontSize: '16px',
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
                background: fija?.gradient ?? leg.gradient,
                borderRadius: '1px',
                boxShadow: `0 0 8px ${leg.glowColor}44`,
                marginBottom: '5px',
              }}
            />

            {/* Escala fija del registro: mismos valores en todas las zonas */}
            <div
              className="flex justify-between"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}
            >
              <span>{fija?.min ?? leg.min}</span>
              {fija && <span>{fija.mid}</span>}
              <span>{fija?.max ?? leg.max}</span>
            </div>
            {fija && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Escala fija: igual en todas las zonas y años.
              </div>
            )}

            {/* Source */}
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-muted)',
                marginTop: '6px',
                paddingTop: '5px',
                borderTop: `1px solid ${leg.glowColor}18`,
              }}
            >
              &gt; {leg.source}
              {layerId === 'traffic' && (
                <div style={{ marginTop: '6px' }}><span className="sim-badge">{SIM_BADGE}</span></div>
              )}
              {layerId === 'soilTemp' && <div style={{ marginTop: '4px' }}>{LAYER_INFO.soilTemp.note}</div>}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
