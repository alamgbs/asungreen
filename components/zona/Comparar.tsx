'use client';

import './zona.css';
import { useMemo, useState } from 'react';
import { Check, Link2, Plus, X } from 'lucide-react';
import { INDICADORES, GRUPO_LABEL, type GrupoIndicador, type IndicadorDef } from '@/lib/indicadores';
import { CIUDADES_REFERENCIA, NIVEL_LABEL, buscarZonas, getZona } from '@/lib/zonas';
import {
  MAX_COMPARAR, aPuntos, conSigno, dominioNice, formatear, tendencia, ultimoValor, type Gran,
} from '@/lib/comparar';
import { useVariasZonas } from './datos';
import SerieChart, { type SerieDib } from './SerieChart';
import Sparkline from './Sparkline';
import WarmingStripes from './WarmingStripes';
import { COLOR_COMPARAR, indicadoresDisponibles, unidadCorta, unidadN } from './ui';
import { colorSentido, T_CHICO } from './secciones-base';

interface Props {
  ids: string[];
  onChange: (ids: string[]) => void;
  onCerrar: () => void;
}

const MONO = { fontFamily: 'var(--font-mono)' } as const;

export default function Comparar({ ids, onChange, onCerrar }: Props) {
  const zonas = ids.map((id) => getZona(id)).filter((z): z is NonNullable<typeof z> => !!z);
  const [intento, setIntento] = useState(0);
  const carga = useVariasZonas(zonas.map((z) => z.id), intento);
  const [pedido, setPedido] = useState<string | null>(null);
  const [gran, setGran] = useState<Gran>('anual');
  const [copiado, setCopiado] = useState(false);

  // Indicadores presentes en al menos una zona; prioriza los que tienen ≥2 zonas.
  const { lista, cuenta } = useMemo(() => {
    const c: Record<string, number> = {};
    for (const z of zonas) for (const k of Object.keys(carga[z.id]?.datos?.indicadores ?? {})) if (k in INDICADORES) c[k] = (c[k] ?? 0) + 1;
    const l = indicadoresDisponibles(Object.keys(c)).sort((a, b) => (c[b.id] >= 2 ? 1 : 0) - (c[a.id] >= 2 ? 1 : 0));
    return { lista: l, cuenta: c };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carga, ids.join(',')]);
  const def: IndicadorDef | null = lista.find((d) => d.id === pedido) ?? lista[0] ?? null;

  const filas = zonas.map((z, k) => {
    const s = def ? carga[z.id]?.datos?.indicadores[def.id] ?? null : null;
    const serie = s ? (gran === 'anual' ? s.anual : s.mensual) : null;
    const pts = aPuntos(serie);
    const anual = s?.anual ?? null;
    return { z, color: COLOR_COMPARAR[k], s, pts, anual, ult: ultimoValor(anual), tend: tendencia(anual), estado: carga[z.id]?.estado ?? 'cargando' };
  });
  const conDatos = filas.filter((f) => f.pts.some((p) => p.v != null));
  const todos = conDatos.flatMap((f) => f.pts.filter((p) => p.v != null).map((p) => p.v as number));
  const dominio = useMemo(() => dominioNice(todos, null, def?.tipo === 'anomalia' ? 0 : undefined), [todos.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Valores en el último año que tienen en común (comparables)
  const anioComun = filas.every((f) => f.ult) && filas.length >= 2 ? Math.min(...filas.map((f) => Number(f.ult!.t))) : null;
  const valorEn = (f: (typeof filas)[number]) => (anioComun != null && f.anual ? f.anual.v[anioComun - f.anual.inicio] ?? null : null);

  function agregar(id: string) { if (ids.length < MAX_COMPARAR && !ids.includes(id)) onChange([...ids, id]); }
  async function copiar() {
    try { await navigator.clipboard.writeText(window.location.href); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sin permiso */ }
  }

  const grupos = (['clima', 'vegetacion', 'superficie'] as GrupoIndicador[])
    .map((g) => ({ g, items: lista.filter((d) => d.grupo === g) })).filter((x) => x.items.length);
  const u = def ? unidadCorta(def.unidad) : '';
  const dec = def?.decimales ?? 1;

  return (
    <section className="zona-panel zona-panel--ancho fade-in-up" data-open="true" aria-label="Comparar zonas">
      <div className="zona-head">
        <div className="flex items-start justify-between gap-2">
          <h2 style={{ margin: 0, fontFamily: 'var(--font-pixel)', fontSize: 10, lineHeight: 1.6, color: 'var(--neon-cyan)', textShadow: 'var(--glow-cyan)' }}>COMPARAR_ZONAS</h2>
          <div className="flex gap-1">
            <button type="button" className="pill-btn" onClick={copiar} aria-label="Copiar enlace de esta comparación" style={{ padding: '4px 8px', color: 'var(--neon-cyan)', borderColor: 'var(--neon-cyan)' }}>
              {copiado ? <Check size={14} aria-hidden style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} /> : <Link2 size={14} aria-hidden style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />}
              {copiado ? 'Copiado' : 'Copiar enlace'}
            </button>
            <button type="button" className="pill-btn" onClick={onCerrar} aria-label="Cerrar comparación" style={{ padding: '4px 8px' }}><X size={16} aria-hidden /></button>
          </div>
        </div>

        {/* zonas elegidas */}
        <ul className="flex flex-wrap gap-2" style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
          {zonas.map((z, k) => (
            <li key={z.id} className="flex items-center" style={{ border: `1px solid ${COLOR_COMPARAR[k]}`, minHeight: 32 }}>
              <span style={{ ...MONO, fontSize: 13, color: COLOR_COMPARAR[k], padding: '0 8px' }}>● {z.nombre}</span>
              <button type="button" className="pill-btn" onClick={() => onChange(ids.filter((i) => i !== z.id))} aria-label={`Quitar ${z.nombre} de la comparación`} style={{ border: 0, minWidth: 32, padding: 0 }}>
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        {ids.length < MAX_COMPARAR && <AgregarZona excluidos={ids} onAgregar={agregar} />}
        {ids.length < 2 && (
          <p style={{ ...T_CHICO, margin: '6px 0 0' }}>Elegí al menos 2 zonas (máx. {MAX_COMPARAR}). También podés hacer clic en el mapa para agregar.</p>
        )}

        {lista.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 8 }}>
            <label htmlFor="cmp-ind" style={T_CHICO}>Indicador</label>
            <select id="cmp-ind" className="zona-select" value={def?.id ?? ''} onChange={(e) => setPedido(e.target.value)}>
              {grupos.map(({ g, items }) => (
                <optgroup key={g} label={GRUPO_LABEL[g]}>
                  {items.map((d) => <option key={d.id} value={d.id}>{d.nombre} ({cuenta[d.id]}/{zonas.length} zonas)</option>)}
                </optgroup>
              ))}
            </select>
            <div className="flex" role="group" aria-label="Granularidad">
              {(['anual', 'mensual'] as Gran[]).map((g) => (
                <button key={g} type="button" className="pill-btn" aria-pressed={gran === g} onClick={() => setGran(g)}
                  style={{ borderColor: gran === g ? 'var(--neon-cyan)' : undefined, color: gran === g ? 'var(--neon-cyan)' : undefined, background: gran === g ? 'var(--neon-cyan)22' : undefined, textTransform: 'uppercase' }}>{g}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="zona-body">
        {zonas.length === 0 && <p style={{ ...MONO, fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Agregá zonas para compararlas lado a lado con la misma escala.</p>}

        {zonas.length > 0 && filas.some((f) => f.estado === 'cargando') && <p style={{ ...MONO, fontSize: 13, color: 'var(--text-muted)' }}>Cargando series…</p>}
        {filas.some((f) => f.estado === 'error') && (
          <p style={{ ...MONO, fontSize: 13, color: 'var(--text-muted)' }}>No se pudieron cargar algunas series. <button type="button" className="pill-btn" onClick={() => setIntento((n) => n + 1)}>Reintentar</button></p>
        )}
        {zonas.length > 0 && !filas.some((f) => f.estado === 'cargando') && lista.length === 0 && (
          <p style={{ ...MONO, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Ninguna de estas zonas tiene series precalculadas todavía. El pipeline las agrega por etapas (país → departamentos → ciudades → distritos); probá con departamentos o con el país.
          </p>
        )}

        {def && conDatos.length > 0 && (
          <>
            <div className="zona-sec">
              <h3>{def.nombre.toUpperCase()}</h3>
              <SerieChart
                series={filas.filter((f) => f.pts.some((p) => p.v != null)).map((f): SerieDib => ({ id: f.z.id, etiqueta: f.z.nombre, color: f.color, pts: f.pts }))}
                unidad={u} decimales={dec} gran={gran} tipo={def.tipo} cambios={def.cambiosSensor} unidadN={unidadN(def)} dominio={dominio} alto={240}
                descripcion={`${def.nombre}: comparación de ${conDatos.map((f) => f.z.nombre).join(', ')}, serie ${gran}`}
              />
              <p style={{ ...T_CHICO, margin: '6px 0 0' }}>Mismo eje para todas las zonas ({formatear(dominio[0], dec)} a {formatear(dominio[1], dec)} {u}).</p>
            </div>

            <div className="zona-sec">
              <h3>LADO_A_LADO</h3>
              <div className="zona-cards">
                {filas.map((f) => (
                  <div key={f.z.id} style={{ border: `1px solid ${f.color}`, padding: '8px 10px', minWidth: 0 }}>
                    <div style={{ ...MONO, fontSize: 13, color: f.color, fontWeight: 700 }}>● {f.z.nombre}</div>
                    <div style={T_CHICO}>{NIVEL_LABEL[f.z.nivel]}</div>
                    {f.ult ? (
                      <>
                        <div style={{ ...MONO, fontSize: 22, color: 'var(--text-bright)', marginTop: 4 }}>{formatear(f.ult.v, dec)} <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u} · {f.ult.t}</span></div>
                        {f.tend && (
                          <div style={{ ...T_CHICO, marginTop: 2 }}>
                            Tendencia: <span style={{ color: f.tend.evidencia === 'insuficiente' ? 'var(--text-muted)' : colorSentido(def.mejorEs, f.tend.porDecada) }}>{conSigno(f.tend.porDecada, dec + 1)} {u}/década</span>
                            {' '}({f.tend.evidencia === 'significativa' ? 'significativa' : f.tend.evidencia === 'debil' ? 'indicio débil' : f.tend.evidencia === 'insuficiente' ? 'pocos años' : 'no concluyente'})
                          </div>
                        )}
                        <div style={{ marginTop: 4 }}><Sparkline pts={aPuntos(f.anual).slice(-20)} color={f.color} dominio={dominio} ancho={160} /></div>
                      </>
                    ) : (
                      <p style={{ ...T_CHICO, margin: '6px 0 0', lineHeight: 1.4 }}>
                        {f.estado === 'vacio' ? 'Esta zona aún no tiene series calculadas.' : f.estado === 'cargando' ? 'Cargando…' : 'Sin datos de este indicador en esta zona.'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {anioComun != null && filas.length >= 2 && (
                <p style={{ ...T_CHICO, margin: '8px 0 0', lineHeight: 1.5 }}>
                  En {anioComun}: {filas.map((f, k) => `${f.z.nombre} ${formatear(valorEn(f), dec)} ${u}${k < filas.length - 1 ? ' · ' : ''}`).join('')}
                  {filas.length === 2 && valorEn(filas[0]) != null && valorEn(filas[1]) != null &&
                    <> — diferencia {filas[0].z.nombre} − {filas[1].z.nombre}: <strong>{conSigno((valorEn(filas[0]) as number) - (valorEn(filas[1]) as number), dec)} {u}</strong></>}
                  .
                </p>
              )}
            </div>
          </>
        )}

        {filas.some((f) => carga[f.z.id]?.datos?.indicadores['temp-aire']?.anual) && (
          <div className="zona-sec">
            <h3>FRANJAS_TEMP_AIRE</h3>
            {filas.map((f) => {
              const a = carga[f.z.id]?.datos?.indicadores['temp-aire']?.anual;
              return (
                <div key={f.z.id} style={{ marginBottom: 12 }}>
                  <div style={{ ...MONO, fontSize: 13, color: f.color, marginBottom: 2 }}>● {f.z.nombre}</div>
                  {a ? <WarmingStripes anual={a} titulo={`Franjas de temperatura del aire en ${f.z.nombre}`} /> : <p style={T_CHICO}>Sin serie de temperatura del aire.</p>}
                </div>
              );
            })}
          </div>
        )}

        {def && (
          <div className="zona-sec">
            <h3>FUENTE</h3>
            <p style={{ ...MONO, fontSize: 13, color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
              {def.fuente.dataset} · {def.resolucion}. Licencia: {def.licencia}.
              {def.calculo === 'openmeteo' && ' Reanálisis de ~25 km: zonas vecinas pueden compartir celda y dar el mismo valor.'}
              {def.calculo === 'modis' && ' Es una muestra alrededor del centroide de cada zona.'}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function AgregarZona({ excluidos, onAgregar }: { excluidos: string[]; onAgregar: (id: string) => void }) {
  const [q, setQ] = useState('');
  const res = useMemo(() => (q.trim() ? buscarZonas(q, { limite: 6 }).filter((z) => !excluidos.includes(z.id)) : []), [q, excluidos]);
  const refs = CIUDADES_REFERENCIA.filter((z) => !excluidos.includes(z.id));
  return (
    <div style={{ marginTop: 8 }}>
      <div className="flex items-center gap-2" style={{ border: '1px solid var(--bg-border)', padding: '0 8px', minHeight: 36 }}>
        <Plus size={14} aria-hidden style={{ color: 'var(--text-muted)' }} />
        <input
          type="text" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Agregar una zona a la comparación" placeholder="Agregar zona (nombre)…"
          autoComplete="off"
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: 'var(--text-bright)', ...MONO, fontSize: 13 }}
        />
      </div>
      {res.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '2px 0 0', padding: 0, border: '1px solid var(--neon-cyan)', maxHeight: 200, overflowY: 'auto' }}>
          {res.map((z) => (
            <li key={z.id}>
              <button type="button" onClick={() => { onAgregar(z.id); setQ(''); }} className="pill-btn" style={{ width: '100%', textAlign: 'left', border: 0, minHeight: 36, color: 'var(--text-bright)' }}>
                {z.nombre} <span style={{ color: 'var(--text-muted)' }}>· {NIVEL_LABEL[z.nivel]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!q && refs.length > 0 && (
        <div className="flex gap-1.5 flex-wrap" style={{ marginTop: 6 }} role="group" aria-label="Ciudades de referencia">
          {refs.slice(0, 15).map((z) => (
            <button key={z.id} type="button" className="pill-btn" onClick={() => onAgregar(z.id)} aria-label={`Agregar ${z.nombre}`} style={{ fontSize: 11, padding: '2px 8px' }}>
              + {z.etiquetaCorta ?? z.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
