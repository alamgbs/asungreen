'use client';

import './zona.css';
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, GitCompare, X } from 'lucide-react';
import { INDICADORES, GRUPO_LABEL, type GrupoIndicador } from '@/lib/indicadores';
import { NIVEL_LABEL, getZona, ruta } from '@/lib/zonas';
import type { Gran } from '@/lib/comparar';
import { useZonaSerie } from './datos';
import { seccionesRegistradas, type SeccionCtx } from './secciones';
import { indicadoresDisponibles } from './ui';
import './secciones-base';
import './secciones-externas';

interface Props {
  zonaId: string;
  /** Cierra el panel (la zona sigue seleccionada en el mapa). */
  onCerrar: () => void;
  /** Abre el modo comparar con esta zona. */
  onComparar?: (zonaId: string) => void;
}

// Recuerda el último indicador elegido al cambiar de zona (solo en memoria).
let ultimoIndicador: string | null = null;

export default function PanelZona(props: Props) {
  // key: al cambiar de zona se reinicia el estado interno (reintentos, granularidad).
  return <PanelInterno key={props.zonaId} {...props} />;
}

function PanelInterno({ zonaId, onCerrar, onComparar }: Props) {
  const zona = getZona(zonaId);
  const [intento, setIntento] = useState(0);
  const { estado, datos, error } = useZonaSerie(zona?.id, intento);
  const [abierto, setAbierto] = useState(true);
  const [pedido, setPedido] = useState<string | null>(ultimoIndicador);
  const [gran, setGran] = useState<Gran>('anual');

  // En móvil arranca plegado para no tapar el mapa.
  useEffect(() => {
    if (window.matchMedia('(max-width: 767px)').matches) setAbierto(false); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  const disponibles = useMemo(() => (datos ? Object.keys(datos.indicadores).filter((k) => k in INDICADORES) : []), [datos]);
  const lista = useMemo(() => indicadoresDisponibles(disponibles), [disponibles]);
  const elegido = lista.find((d) => d.id === pedido) ?? lista[0] ?? null;
  const serie = elegido && datos ? datos.indicadores[elegido.id] ?? null : null;

  if (!zona) return null;

  const ctx: SeccionCtx = { zona, serieZona: datos, indicador: elegido, serie, gran, disponibles };
  const grupos = (['clima', 'vegetacion', 'superficie'] as GrupoIndicador[])
    .map((g) => ({ g, items: lista.filter((d) => d.grupo === g) })).filter((x) => x.items.length);
  const camino = ruta(zona.id).filter((z) => z.id !== zona.id && z.nivel !== 'pais').map((z) => z.nombre).join(' › ');
  const tieneMensual = !!serie?.mensual;

  return (
    <section className="zona-panel fade-in-up" data-open={abierto} aria-label={`Panel de la zona ${zona.nombre}`}>
      <div className="zona-head">
        <div className="flex items-start justify-between gap-2">
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-pixel)', fontSize: 10, lineHeight: 1.6, color: 'var(--neon-cyan)', textShadow: 'var(--glow-cyan)', overflowWrap: 'anywhere' }}>
              {zona.nombre.toUpperCase()}
            </h2>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
              {NIVEL_LABEL[zona.nivel]}{camino ? ` · ${camino}` : ''} · {Math.round(zona.area_km2).toLocaleString('es-PY')} km²
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            {onComparar && (
              <button type="button" className="pill-btn" onClick={() => onComparar(zona.id)} aria-label="Comparar esta zona con otras"
                style={{ color: 'var(--neon-cyan)', borderColor: 'var(--neon-cyan)', padding: '4px 8px' }}>
                <GitCompare size={14} aria-hidden style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />Comparar
              </button>
            )}
            <button type="button" className="pill-btn" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}
              aria-label={abierto ? 'Plegar panel' : 'Desplegar panel'} style={{ padding: '4px 8px' }}>
              {abierto ? <ChevronDown size={16} aria-hidden /> : <ChevronUp size={16} aria-hidden />}
            </button>
            <button type="button" className="pill-btn" onClick={onCerrar} aria-label="Cerrar panel de zona" style={{ padding: '4px 8px' }}>
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>

        {estado === 'ok' && lista.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 8 }}>
            <label htmlFor={`ind-${zona.id}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>Indicador</label>
            <select
              id={`ind-${zona.id}`} className="zona-select" value={elegido?.id ?? ''}
              onChange={(e) => { ultimoIndicador = e.target.value; setPedido(e.target.value); }}
            >
              {grupos.map(({ g, items }) => (
                <optgroup key={g} label={GRUPO_LABEL[g]}>
                  {items.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </optgroup>
              ))}
            </select>
            <div className="flex" role="group" aria-label="Granularidad">
              {(['anual', 'mensual'] as Gran[]).map((g) => (
                <button key={g} type="button" className="pill-btn" aria-pressed={gran === g} disabled={g === 'mensual' && !tieneMensual}
                  onClick={() => setGran(g)}
                  style={{ borderColor: gran === g ? 'var(--neon-cyan)' : undefined, color: gran === g ? 'var(--neon-cyan)' : undefined, background: gran === g ? 'var(--neon-cyan)22' : undefined, textTransform: 'uppercase' }}>
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="zona-body">
        {estado === 'cargando' && <Mensaje>Cargando series…</Mensaje>}
        {estado === 'error' && (
          <Mensaje>
            No se pudieron cargar las series ({error}).{' '}
            <button type="button" className="pill-btn" onClick={() => setIntento((n) => n + 1)}>Reintentar</button>
          </Mensaje>
        )}
        {estado === 'vacio' && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>
            <BarChart3 size={20} aria-hidden style={{ color: 'var(--neon-cyan)', marginBottom: 6 }} />
            <p style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>
              {zona.nombre} todavía no tiene series precalculadas.
            </p>
            <p style={{ margin: 0 }}>
              El pipeline las calcula por etapas (país → departamentos → ciudades → distritos) y se
              agregan al correrlo de nuevo (<code>docs/pipeline.md</code>). El mapa y los límites de la zona funcionan igual.
            </p>
          </div>
        )}
        {estado === 'ok' && lista.length === 0 && <Mensaje>La serie de esta zona no contiene indicadores conocidos.</Mensaje>}
        {estado === 'ok' && lista.length > 0 && seccionesRegistradas()
          .filter((s) => !s.visible || s.visible(ctx))
          .map((s) => (
            <div key={s.id} className="zona-sec">
              <h3>{s.titulo.toUpperCase()}</h3>
              <s.Componente ctx={ctx} />
            </div>
          ))}
      </div>
    </section>
  );
}

function Mensaje({ children }: { children: React.ReactNode }) {
  return <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{children}</p>;
}
