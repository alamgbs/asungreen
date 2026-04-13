'use client';

import { Thermometer, Car, TreePine } from 'lucide-react';
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
  source: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    id: 'soilTemp',
    name: 'TEMPERATURA',
    subtitle: 'LANDSAT·8/9·LST·30m',
    source: 'LANDSAT 8+9 · 30m',
    icon: <Thermometer size={13} />,
    color: 'var(--neon-orange)',
  },
  {
    id: 'traffic',
    name: 'TRAFICO',
    subtitle: 'SIMULACION·OSM',
    source: 'DATOS SIMULADOS',
    icon: <Car size={13} />,
    color: 'var(--neon-cyan)',
  },
  {
    id: 'ndvi',
    name: 'VEGETACION',
    subtitle: 'NDVI·SENTINEL-2·10m',
    source: 'SENTINEL-2 · 10m',
    icon: <TreePine size={13} />,
    color: 'var(--neon-green)',
  },
];

function pad(n: number) {
  return String(n + 1).padStart(2, '0');
}

function formatHour(h: number): string {
  if (h === 0) return '00:00';
  const period = h < 12 ? 'AM' : 'PM';
  const display = h <= 12 ? h : h - 12;
  return `${display}:00 ${period}`;
}

const TRAFFIC_BY_HOUR = [
  0.05, 0.03, 0.02, 0.02, 0.03, 0.10,
  0.30, 0.70, 0.95, 0.80, 0.60, 0.55,
  0.55, 0.58, 0.60, 0.65, 0.78, 0.98,
  0.92, 0.75, 0.58, 0.40, 0.22, 0.10,
];

export default function Sidebar({
  activeLayers,
  onToggleLayer,
  hour,
  onHourChange,
  trafficActive,
}: SidebarProps) {
  return (
    <aside
      className="absolute left-3 z-40 flex flex-col gap-2 fade-in-up"
      style={{ top: '56px', bottom: '36px', width: '268px' }}
    >
      {/* ── System header ──────────────────────────── */}
      <div className="terminal-panel">
        <div
          style={{
            fontFamily: 'var(--font-pixel)',
            fontSize: '7px',
            color: 'var(--neon-green)',
            textShadow: 'var(--glow-green)',
            letterSpacing: '0.05em',
          }}
        >
          MAP_LAYERS.SH
        </div>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--text-muted)',
            marginTop: '5px',
          }}
        >
          DEPT·CENTRAL · ASU · PY
        </p>
      </div>

      {/* ── Layer cards ────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        {LAYERS.map((layer, i) => {
          const isActive = activeLayers[layer.id];
          return (
            <button
              key={layer.id}
              onClick={() => onToggleLayer(layer.id)}
              className="terminal-panel-btn"
              style={{
                borderColor: isActive ? layer.color : 'var(--bg-border)',
                boxShadow: isActive ? `0 0 10px ${layer.color}33` : 'none',
              }}
            >
              {/* Row number */}
              <div
                style={{
                  fontFamily: 'var(--font-pixel)',
                  fontSize: '6px',
                  color: isActive ? layer.color : 'var(--text-muted)',
                  marginBottom: '7px',
                  letterSpacing: '0.04em',
                }}
              >
                {pad(i)} ──────────────────────
              </div>

              {/* Main row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span style={{ color: isActive ? layer.color : 'var(--text-muted)' }}>
                    {layer.icon}
                  </span>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-pixel)',
                        fontSize: '7px',
                        color: isActive ? 'var(--text-bright)' : 'var(--text-muted)',
                        textShadow: isActive ? `0 0 8px ${layer.color}` : 'none',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {layer.name}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        color: isActive ? `${layer.color}cc` : 'var(--bg-border)',
                        marginTop: '2px',
                      }}
                    >
                      {layer.subtitle}
                    </div>
                  </div>
                </div>

                {/* Neon toggle */}
                <div
                  style={{
                    width: '36px',
                    height: '16px',
                    borderRadius: '1px',
                    position: 'relative',
                    background: isActive
                      ? `linear-gradient(90deg, ${layer.color}99, ${layer.color})`
                      : 'rgba(13,43,18,0.6)',
                    border: `1px solid ${isActive ? layer.color : 'var(--bg-border)'}`,
                    boxShadow: isActive ? `0 0 6px ${layer.color}88` : 'none',
                    transition: 'all 0.2s',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '2px',
                      width: '10px',
                      height: '10px',
                      borderRadius: '1px',
                      background: '#fff',
                      left: isActive ? '23px' : '2px',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
                    }}
                  />
                </div>
              </div>

              {/* Source line when active */}
              {isActive && (
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: `${layer.color}99`,
                    marginTop: '7px',
                    paddingTop: '6px',
                    borderTop: `1px solid ${layer.color}22`,
                  }}
                >
                  &gt; {layer.source} · ACTIVE
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Time slider (traffic only) ──────────────── */}
      {trafficActive && (
        <div className="terminal-panel fade-in-up">
          <div className="flex items-center justify-between" style={{ marginBottom: '10px' }}>
            <div
              style={{
                fontFamily: 'var(--font-pixel)',
                fontSize: '6px',
                color: 'var(--neon-cyan)',
                textShadow: 'var(--glow-cyan)',
                letterSpacing: '0.04em',
              }}
            >
              HORA_DEL_DIA
            </div>
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: '18px',
                color: 'var(--neon-cyan)',
                textShadow: 'var(--glow-cyan)',
              }}
            >
              {formatHour(hour)}
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={23}
            value={hour}
            onChange={(e) => onHourChange(Number(e.target.value))}
            className="neon-slider"
          />

          <div
            className="flex justify-between mt-2"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: 'var(--text-muted)',
            }}
          >
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:00</span>
          </div>

          <TrafficBar hour={hour} />
        </div>
      )}

      {/* ── Footer ─────────────────────────────────── */}
      <div
        className="terminal-panel mt-auto"
        style={{ borderColor: 'transparent' }}
      >
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}
        >
          © 2025 ASUNGREEN · GEE/OSM
        </p>
      </div>
    </aside>
  );
}

function TrafficBar({ hour }: { hour: number }) {
  const density = TRAFFIC_BY_HOUR[hour] ?? 0;
  const isPeak  = density >= 0.85;
  const isHigh  = density >= 0.6;
  const color   = isPeak
    ? 'var(--neon-magenta)'
    : isHigh
    ? 'var(--neon-yellow)'
    : 'var(--neon-cyan)';
  const label   = isPeak ? 'PICO' : isHigh ? 'ALTO' : 'NORMAL';

  return (
    <div style={{ marginTop: '10px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '5px' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            color: 'var(--text-muted)',
          }}
        >
          DENSIDAD:
        </span>
        <span
          style={{
            fontFamily: 'var(--font-pixel)',
            fontSize: '6px',
            color,
            textShadow: `0 0 8px ${color}`,
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          height: '3px',
          background: 'var(--bg-border)',
          borderRadius: '0',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${density * 100}%`,
            background: color,
            boxShadow: `0 0 6px ${color}`,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
}
