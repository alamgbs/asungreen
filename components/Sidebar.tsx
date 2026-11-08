'use client';

import { useState } from 'react';
import { Thermometer, Car, TreePine, ChevronUp, ChevronDown } from 'lucide-react';
import type { LayerType } from '@/lib/types';
import { AOIS } from '@/lib/aois';
import { TRAFFIC_BY_HOUR } from '@/lib/constants';
import { LAYER_INFO, SIM_BADGE } from '@/lib/layerInfo';

interface SidebarProps {
  activeLayers: Record<LayerType, boolean>;
  onToggleLayer: (id: LayerType) => void;
  hour: number;
  onHourChange: (h: number) => void;
  trafficActive: boolean;
  years: number[];
  seasons: string[];
  onYearsChange: (years: number[]) => void;
  onSeasonsChange: (seasons: string[]) => void;
  selectedAoi: string | null;
  onAoiChange: (id: string | null) => void;
  onOpenMethodology: () => void;
}

const SEASON_LABELS: { id: string; label: string; full: string }[] = [
  { id: 'spring', label: 'PRIM', full: 'Primavera' },
  { id: 'summer', label: 'VER',  full: 'Verano' },
  { id: 'autumn', label: 'OTO',  full: 'Otoño' },
  { id: 'winter', label: 'INV',  full: 'Invierno' },
];

const AVAILABLE_YEARS: number[] = Array.from(
  { length: 10 },
  (_, i) => new Date().getFullYear() - i,
);

const LAYERS: { id: LayerType; icon: React.ReactNode; color: string }[] = [
  { id: 'soilTemp', icon: <Thermometer size={16} />, color: 'var(--neon-orange)' },
  { id: 'traffic',  icon: <Car size={16} />,         color: 'var(--neon-cyan)'   },
  { id: 'ndvi',     icon: <TreePine size={16} />,    color: 'var(--neon-green)'  },
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

function pillStyle(active: boolean, color: string, glow: string): React.CSSProperties {
  return {
    borderColor: active ? color : undefined,
    background:  active ? `${color}22` : undefined,
    color:       active ? color : undefined,
    textShadow:  active ? glow : 'none',
  };
}

const SECTION_TITLE: React.CSSProperties = {
  fontFamily: 'var(--font-pixel)',
  fontSize: '9px',
  letterSpacing: '0.04em',
  marginBottom: '10px',
};

export default function Sidebar({
  activeLayers,
  onToggleLayer,
  hour,
  onHourChange,
  trafficActive,
  years,
  seasons,
  onYearsChange,
  onSeasonsChange,
  selectedAoi,
  onAoiChange,
  onOpenMethodology,
}: SidebarProps) {
  // Solo aplica en móvil (< 768px); en escritorio el CSS ignora el estado.
  const [sheetOpen, setSheetOpen] = useState(false);

  function toggleYear(y: number) {
    if (years.includes(y) && years.length === 1) return;
    onYearsChange(years.includes(y) ? years.filter(v => v !== y) : [...years, y]);
  }

  function toggleSeason(s: string) {
    if (seasons.includes(s) && seasons.length === 1) return;
    onSeasonsChange(seasons.includes(s) ? seasons.filter(v => v !== s) : [...seasons, s]);
  }

  function handleAoiClick(id: string) {
    // Radio-select: clicking the active AOI deselects (returns to GLOBAL)
    onAoiChange(selectedAoi === id ? null : id);
  }

  const showTemporalFilter = activeLayers.ndvi || activeLayers.soilTemp;

  return (
    <aside
      id="app-sidebar"
      className="app-sidebar fade-in-up"
      data-open={sheetOpen}
      aria-label="Panel de capas y filtros"
    >
      {/* ── Asa del bottom sheet (solo móvil) ─────── */}
      <button
        type="button"
        className="sheet-handle"
        onClick={() => setSheetOpen((v) => !v)}
        aria-expanded={sheetOpen}
        aria-controls="app-sidebar"
      >
        <span>{sheetOpen ? 'Ocultar capas y filtros' : 'Capas y filtros'}</span>
        {sheetOpen ? <ChevronDown size={18} aria-hidden /> : <ChevronUp size={18} aria-hidden />}
      </button>

      {/* ── System header ──────────────────────────── */}
      <div className="terminal-panel">
        <div style={{ ...SECTION_TITLE, marginBottom: 0, color: 'var(--neon-green)', textShadow: 'var(--glow-green)' }}>
          MAP_LAYERS.SH
        </div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
          DEPT·CENTRAL · ASU · PY
        </p>
        <button
          type="button"
          className="pill-btn"
          onClick={onOpenMethodology}
          style={{ marginTop: '8px', width: '100%', color: 'var(--neon-cyan)', borderColor: 'var(--neon-cyan)' }}
        >
          ¿Cómo se calcula?
        </button>
      </div>

      {/* ── AOI Filter ─────────────────────────────────── */}
      <div className="terminal-panel fade-in-up" role="group" aria-labelledby="aoi-title">
        <div id="aoi-title" style={{ ...SECTION_TITLE, color: 'var(--neon-cyan)', textShadow: 'var(--glow-cyan)' }}>
          &gt; ZONA
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            type="button"
            className="pill-btn"
            onClick={() => onAoiChange(null)}
            aria-pressed={selectedAoi === null}
            aria-label="Zona: global (todo el mapa)"
            style={pillStyle(selectedAoi === null, 'var(--neon-cyan)', 'var(--glow-cyan)')}
          >
            GLOBAL
          </button>
          {AOIS.map((aoi) => {
            const active = selectedAoi === aoi.id;
            return (
              <button
                key={aoi.id}
                type="button"
                className="pill-btn"
                onClick={() => handleAoiClick(aoi.id)}
                aria-pressed={active}
                aria-label={`Zona: ${aoi.label}`}
                style={pillStyle(active, 'var(--neon-cyan)', 'var(--glow-cyan)')}
              >
                {aoi.shortLabel}
              </button>
            );
          })}
        </div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
          Las zonas son aproximaciones rectangulares, no límites oficiales.
        </p>
      </div>

      {/* ── Layer cards ────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        {LAYERS.map((layer, i) => {
          const info = LAYER_INFO[layer.id];
          const isActive = activeLayers[layer.id];
          const isSim = layer.id === 'traffic';
          return (
            <button
              key={layer.id}
              type="button"
              onClick={() => onToggleLayer(layer.id)}
              className="terminal-panel-btn"
              role="switch"
              aria-checked={isActive}
              aria-label={`Capa ${info.name}${isSim ? ' (simulación, no son datos reales)' : ''}`}
              style={{
                borderColor: isActive ? layer.color : 'var(--bg-border)',
                boxShadow: isActive ? `0 0 10px ${layer.color}33` : 'none',
              }}
            >
              <div
                aria-hidden
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: isActive ? layer.color : 'var(--text-muted)',
                  marginBottom: '6px',
                }}
              >
                {pad(i)} ──────────────────────
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span style={{ color: isActive ? layer.color : 'var(--text-muted)' }}>{layer.icon}</span>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: isActive ? 'var(--text-bright)' : 'var(--text-primary)',
                        textShadow: isActive ? `0 0 8px ${layer.color}` : 'none',
                        letterSpacing: '0.03em',
                      }}
                    >
                      {info.name}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        color: isActive ? layer.color : 'var(--text-muted)',
                        marginTop: '2px',
                      }}
                    >
                      {info.subtitle}
                    </div>
                  </div>
                </div>

                {/* Neon toggle */}
                <div
                  aria-hidden
                  style={{
                    width: '36px',
                    height: '16px',
                    borderRadius: '1px',
                    position: 'relative',
                    background: isActive
                      ? `linear-gradient(90deg, ${layer.color}99, ${layer.color})`
                      : 'rgba(13,43,18,0.6)',
                    border: `1px solid ${isActive ? layer.color : 'var(--text-muted)'}`,
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

              {isSim && (
                <div style={{ marginTop: '8px' }}>
                  <span className="sim-badge">{SIM_BADGE}</span>
                </div>
              )}
              {info.note && !isSim && (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  {info.note}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Temporal filter (ndvi / soilTemp only) ─── */}
      {showTemporalFilter && (
        <div className="terminal-panel fade-in-up">
          <div style={{ ...SECTION_TITLE, color: 'var(--neon-green)', textShadow: 'var(--glow-green)' }}>
            &gt; PERIODO
          </div>

          <div id="seasons-label" style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            ESTACIÓN
          </div>
          <div className="flex gap-1.5 flex-wrap" role="group" aria-labelledby="seasons-label" style={{ marginBottom: '10px' }}>
            {SEASON_LABELS.map(({ id, label, full }) => {
              const active = seasons.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  className="pill-btn"
                  onClick={() => toggleSeason(id)}
                  aria-pressed={active}
                  aria-label={full}
                  style={pillStyle(active, 'var(--neon-green)', 'var(--glow-green)')}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div id="years-label" style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            AÑO
          </div>
          <div className="flex gap-1.5 flex-wrap" role="group" aria-labelledby="years-label">
            {AVAILABLE_YEARS.map((y) => {
              const active = years.includes(y);
              return (
                <button
                  key={y}
                  type="button"
                  className="pill-btn"
                  onClick={() => toggleYear(y)}
                  aria-pressed={active}
                  style={{ ...pillStyle(active, 'var(--neon-green)', 'var(--glow-green)'), fontFamily: 'var(--font-data)', fontSize: '16px', padding: '2px 8px' }}
                >
                  {y}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Time slider (traffic only) ──────────────── */}
      {trafficActive && (
        <div className="terminal-panel fade-in-up">
          <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
            <label htmlFor="hour-slider" style={{ ...SECTION_TITLE, marginBottom: 0, color: 'var(--neon-cyan)', textShadow: 'var(--glow-cyan)' }}>
              HORA_DEL_DIA
            </label>
            <span style={{ fontFamily: 'var(--font-data)', fontSize: '22px', color: 'var(--neon-cyan)', textShadow: 'var(--glow-cyan)' }}>
              {formatHour(hour)}
            </span>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <span className="sim-badge">{SIM_BADGE}</span>
          </div>

          <input
            id="hour-slider"
            type="range"
            min={0}
            max={23}
            value={hour}
            aria-valuetext={formatHour(hour)}
            onChange={(e) => onHourChange(Number(e.target.value))}
            className="neon-slider"
          />

          <div
            aria-hidden
            className="flex justify-between mt-2"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}
          >
            <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
          </div>

          <TrafficBar hour={hour} />
        </div>
      )}

      {/* ── Footer ─────────────────────────────────── */}
      <div className="terminal-panel mt-auto" style={{ borderColor: 'transparent' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
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
  const color   = isPeak ? 'var(--neon-magenta)' : isHigh ? 'var(--neon-yellow)' : 'var(--neon-cyan)';
  const label   = isPeak ? 'PICO' : isHigh ? 'ALTO' : 'NORMAL';

  return (
    <div style={{ marginTop: '10px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '5px' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>
          DENSIDAD SIMULADA:
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, color, textShadow: `0 0 8px ${color}` }}>
          {label}
        </span>
      </div>
      <div style={{ height: '4px', background: '#1d4a26' }}>
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
