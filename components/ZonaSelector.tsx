'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import {
  CIUDADES_REFERENCIA, NIVEL_LABEL, buscarZonas, getZona, ruta,
  type NivelZona, type Zona,
} from '@/lib/zonas';

interface Props {
  selectedZona: string | null;
  onZonaChange: (id: string | null) => void;
}

const FILTROS: { id: 'todos' | NivelZona; label: string }[] = [
  { id: 'todos', label: 'TODO' },
  { id: 'departamento', label: 'DPTOS' },
  { id: 'distrito', label: 'DISTRITOS' },
  { id: 'ciudad', label: 'CIUDADES' },
];

const CYAN = 'var(--neon-cyan)';

function pill(active: boolean): React.CSSProperties {
  return {
    borderColor: active ? CYAN : undefined,
    background: active ? 'var(--neon-cyan)22' : undefined,
    color: active ? CYAN : undefined,
    textShadow: active ? 'var(--glow-cyan)' : 'none',
  };
}

/** "Central › Luque" (sin el país, que es siempre Paraguay para estos niveles). */
function contexto(z: Zona): string {
  const r = ruta(z.id).filter((x) => x.id !== z.id && x.nivel !== 'pais');
  return r.length ? r.map((x) => x.nombre).join(' › ') : z.nivel === 'ciudad' ? z.pais : 'Paraguay';
}

export default function ZonaSelector({ selectedZona, onZonaChange }: Props) {
  const uid = useId();
  const listId = `${uid}-lista`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<'todos' | NivelZona>('todos');
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [mas, setMas] = useState(false);

  const resultados = useMemo(
    () => buscarZonas(q, { niveles: filtro === 'todos' ? undefined : [filtro], limite: 8 }),
    [q, filtro],
  );
  const actual = getZona(selectedZona);

  function elegir(z: Zona) {
    onZonaChange(z.id);
    setQ('');
    setAbierto(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAbierto(true); setActivo((i) => Math.min(i + 1, resultados.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && abierto && resultados[activo]) { e.preventDefault(); elegir(resultados[activo]); }
    else if (e.key === 'Escape') { setAbierto(false); }
  }

  return (
    <div className="terminal-panel fade-in-up" role="group" aria-labelledby={`${uid}-t`}>
      <div
        id={`${uid}-t`}
        style={{ fontFamily: 'var(--font-pixel)', fontSize: '9px', letterSpacing: '0.04em', marginBottom: '10px', color: CYAN, textShadow: 'var(--glow-cyan)' }}
      >
        &gt; ZONA
      </div>

      {/* Selección actual */}
      <div
        className="flex items-center justify-between gap-2"
        style={{ border: `1px solid ${actual ? CYAN : 'var(--bg-border)'}`, padding: '6px 8px', marginBottom: '8px', minHeight: '40px' }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: actual ? CYAN : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {actual ? actual.nombre : 'GLOBAL · todo el mapa'}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
            {actual ? `${NIVEL_LABEL[actual.nivel]} · ${contexto(actual)} · ${Math.round(actual.area_km2).toLocaleString('es-PY')} km²` : 'Elegí una zona en el mapa o buscala'}
          </div>
        </div>
        {actual && (
          <button type="button" className="pill-btn" onClick={() => onZonaChange(null)} aria-label="Quitar zona (volver a global)" style={{ padding: '0 6px' }}>
            <X size={14} aria-hidden />
          </button>
        )}
      </div>

      {/* Buscador (patrón combobox) */}
      <div style={{ position: 'relative' }}>
        <label htmlFor={`${uid}-q`} className="sr-only" style={{ position: 'absolute', left: '-9999px' }}>Buscar zona</label>
        <div className="flex items-center gap-2" style={{ border: '1px solid var(--bg-border)', padding: '0 8px', minHeight: '36px' }}>
          <Search size={14} aria-hidden style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            id={`${uid}-q`}
            type="text"
            role="combobox"
            aria-expanded={abierto}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={abierto && resultados[activo] ? `${uid}-o-${activo}` : undefined}
            autoComplete="off"
            placeholder="Buscar distrito, depto. o ciudad…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setActivo(0); setAbierto(true); }}
            onFocus={() => setAbierto(true)}
            onBlur={() => setTimeout(() => setAbierto(false), 120)}
            onKeyDown={onKeyDown}
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: 'var(--text-bright)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}
          />
        </div>

        {abierto && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Zonas encontradas"
            style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, margin: '2px 0 0', padding: 0, listStyle: 'none', background: 'var(--bg-surface)', border: `1px solid ${CYAN}`, maxHeight: '260px', overflowY: 'auto' }}
          >
            {resultados.length === 0 && (
              <li style={{ padding: '8px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>Sin resultados</li>
            )}
            {resultados.map((z, i) => (
              <li
                key={z.id}
                id={`${uid}-o-${i}`}
                role="option"
                aria-selected={i === activo}
                onMouseDown={(e) => { e.preventDefault(); elegir(z); }}
                onMouseEnter={() => setActivo(i)}
                style={{ padding: '6px 8px', minHeight: '36px', cursor: 'pointer', background: i === activo ? 'var(--neon-cyan)22' : 'transparent' }}
              >
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: i === activo ? CYAN : 'var(--text-bright)' }}>{z.nombre}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>{NIVEL_LABEL[z.nivel]} · {contexto(z)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        className="pill-btn"
        aria-expanded={mas}
        aria-controls={`${uid}-mas`}
        onClick={() => setMas((v) => !v)}
        style={{ width: '100%', marginTop: '8px', fontSize: '12px' }}
      >
        {mas ? 'Menos opciones ▴' : 'Ciudades de referencia y filtros ▾'}
      </button>
      {mas && (
        <div id={`${uid}-mas`}>
      {/* Filtro por nivel */}
      <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Filtrar búsqueda por nivel" style={{ marginTop: '8px' }}>
        {FILTROS.map((f) => (
          <button key={f.id} type="button" className="pill-btn" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)} style={{ ...pill(filtro === f.id), fontSize: '11px', padding: '2px 8px' }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Acceso rápido: ciudades de referencia */}
      <div id={`${uid}-ref`} style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)', margin: '10px 0 6px' }}>
        CIUDADES DE REFERENCIA
      </div>
      <div className="flex gap-1.5 flex-wrap" role="group" aria-labelledby={`${uid}-ref`}>
        <button type="button" className="pill-btn" aria-pressed={selectedZona === null} aria-label="Zona: global (todo el mapa)" onClick={() => onZonaChange(null)} style={pill(selectedZona === null)}>
          GLOBAL
        </button>
        {CIUDADES_REFERENCIA.map((z) => (
          <button
            key={z.id}
            type="button"
            className="pill-btn"
            aria-pressed={selectedZona === z.id}
            aria-label={`Zona: ${z.nombre}`}
            onClick={() => onZonaChange(selectedZona === z.id ? null : z.id)}
            style={pill(selectedZona === z.id)}
          >
            {z.etiquetaCorta ?? z.nombre}
          </button>
        ))}
      </div>

      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
        Límites reales (geoBoundaries 2012 y OpenStreetMap), simplificados para el mapa. Faltan 18 distritos que figuran en listados más recientes (docs/zonas.md).
      </p>
        </div>
      )}
    </div>
  );
}
