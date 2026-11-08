'use client';

/**
 * <SeccionIndices zonaId="PY-11" /> — índices compuestos (Tarea 3.9).
 * Calcula en el navegador a partir de data/series (lib/series.ts). Componentes, fuentes,
 * pesos y limitaciones están siempre visibles; los pesos son editables.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { NIVEL_LABEL, getZona } from '@/lib/zonas';
import {
  INDICES, INDICE_IDS, analizarSensibilidad, calcularIndice, cargarDatosIndice, pesosBase,
  type DatosComponente, type IndiceId, type Pesos,
} from '@/lib/indices';

const fmt = (v: number, d = 1) => v.toLocaleString('es-PY', { maximumFractionDigits: d });
const pct = (v: number) => `${Math.round(v * 100)} %`;

type Carga = { clave: string; datos: DatosComponente[] | null; error: string | null };

export default function SeccionIndices({ zonaId }: { zonaId: string }) {
  const uid = useId();
  const zona = getZona(zonaId);
  const [indiceId, setIndiceId] = useState<IndiceId>('riesgo-calor');
  const def = INDICES[indiceId];
  const [pesosPorIndice, setPesosPorIndice] = useState<Partial<Record<IndiceId, Pesos>>>({});
  const pesos = pesosPorIndice[indiceId] ?? pesosBase(def);
  const editado = indiceId in pesosPorIndice;

  const clave = zona ? `${indiceId}|${zona.nivel}` : '';
  const [carga, setCarga] = useState<Carga | null>(null);
  useEffect(() => {
    if (!zona || zona.nivel === 'pais') return;
    let vivo = true;
    cargarDatosIndice(def, zona.id)
      .then((datos) => { if (vivo) setCarga({ clave, datos, error: null }); })
      .catch((e: unknown) => { if (vivo) setCarga({ clave, datos: null, error: e instanceof Error ? e.message : 'error' }); });
    return () => { vivo = false; };
  }, [def, zona, clave]);
  const cargando = !!zona && zona.nivel !== 'pais' && carga?.clave !== clave;
  const datos = carga?.clave === clave ? carga.datos : null;

  const resultado = useMemo(() => (datos ? calcularIndice(def, datos, pesos) : null), [def, datos, pesos]);
  const zr = resultado?.zonas.find((z) => z.zonaId === zonaId) ?? null;
  const sens = useMemo(
    () => (datos && zr?.puntaje != null ? analizarSensibilidad(def, datos, pesos, zonaId) : null),
    [def, datos, pesos, zonaId, zr?.puntaje],
  );
  const top = useMemo(
    () => (resultado?.zonas ?? []).filter((z) => z.posicion != null).sort((a, b) => a.posicion! - b.posicion! || a.zonaId.localeCompare(b.zonaId)).slice(0, 5),
    [resultado],
  );

  const setPeso = (id: string, v: number) =>
    setPesosPorIndice((p) => ({ ...p, [indiceId]: { ...(p[indiceId] ?? pesosBase(def)), [id]: v / 100 } }));
  const sumaPesos = Object.values(pesos).reduce((a, b) => a + b, 0);

  if (!zona) return <Panel><p className="si-msg">Zona desconocida.</p></Panel>;

  return (
    <Panel>
      <h3 className="si-h">ÍNDICES COMPUESTOS <span className="si-tag">EXPERIMENTAL</span></h3>

      <div role="radiogroup" aria-label="Índice" className="si-tabs">
        {INDICE_IDS.map((id) => (
          <button key={id} type="button" role="radio" aria-checked={id === indiceId} className="pill-btn"
            onClick={() => setIndiceId(id)}
            style={id === indiceId ? { color: 'var(--neon-green)', borderColor: 'var(--neon-green)' } : undefined}>
            {INDICES[id].nombre}
          </button>
        ))}
      </div>
      <p className="si-msg">{def.descripcion}</p>

      {zona.nivel === 'pais' && (
        <p className="si-msg si-warn" role="status">
          El país es una sola zona: no hay con qué compararlo. Elige un departamento, distrito o ciudad.
        </p>
      )}
      {cargando && <p className="si-msg" role="status">Cargando series de las zonas del mismo nivel…</p>}
      {carga?.clave === clave && carga.error && (
        <p className="si-msg si-warn" role="status">
          Las series aún no están disponibles ({carga.error}). El índice se calculará cuando el pipeline publique data/series.
        </p>
      )}

      {resultado && (
        <>
          {/* Puntaje */}
          <div className="si-score" aria-live="polite">
            <span className="si-big">{zr?.puntaje != null ? fmt(zr.puntaje, 0) : '—'}</span>
            <span className="si-sub">/ 100</span>
            <div className="si-pos">
              {zr?.puntaje != null ? (
                <>
                  Posición {zr.posicion} de {resultado.n} ({NIVEL_LABEL[zona.nivel].toLowerCase()}s comparados), según este modelo.
                  {zr.incompleta && <strong className="si-warn"> · INCOMPLETA: falta {zr.faltantes.map((f) => def.componentes.find((c) => c.id === f)?.nombre).join(', ')}.</strong>}
                </>
              ) : (
                <span className="si-warn">Sin puntaje para {zona.nombre}: {zr?.motivoSinPuntaje ?? 'faltan datos'}.</span>
              )}
            </div>
          </div>
          <p className="si-msg">{def.lectura}</p>

          {/* Componentes y pesos (siempre visibles) */}
          <h4 className="si-h2">Componentes y pesos</h4>
          <ul className="si-comps">
            {def.componentes.map((c) => {
              const d = datos!.find((x) => x.def.id === c.id)!;
              const usado = resultado.usados.includes(c.id);
              const ap = zr?.aportes.find((a) => a.id === c.id);
              const excl = resultado.excluidos.find((e) => e.id === c.id);
              const w = pesos[c.id] ?? 0;
              const rango = resultado.rangos[c.id];
              const sliderId = `${uid}-${c.id}`;
              return (
                <li key={c.id} className="si-comp" data-usado={usado}>
                  <div className="si-comp-head">
                    <strong>{c.nombre}</strong>
                    <span className="si-dir">{c.sentido === 'mas' ? '↑ sube' : '↓ baja'} el {def.orientacion === 'alto-peor' ? 'riesgo' : 'índice'} cuanto mayor sea el valor</span>
                  </div>
                  <p className="si-msg">{c.descripcion}</p>
                  {d.fuente ? (
                    <p className="si-msg">
                      Fuente: {d.fuente.nombre}, media {d.fuente.ventana[0]}–{d.fuente.ventana[1]}; {pct(d.fuente.cobertura)} de las zonas con dato.
                    </p>
                  ) : (
                    <p className="si-msg si-warn">Sin datos: {d.motivo}. No se imputa ningún valor.</p>
                  )}
                  {excl && d.fuente && <p className="si-msg si-warn">Excluido del cálculo: {excl.motivo}.</p>}
                  {usado && (
                    <p className="si-msg">
                      Valor de {zona.nombre}: <strong>{ap?.crudo != null ? `${fmt(ap.crudo, 2)}${d.fuente?.unidad ? ` ${d.fuente.unidad}` : ''}` : 'sin dato'}</strong>
                      {rango && <> · rango del nivel {fmt(rango[0], 2)}–{fmt(rango[1], 2)}</>}
                      {ap?.norm != null && <> · normalizado {fmt(ap.norm * 100, 0)}/100</>}
                      {ap && ap.norm != null && <> · aporta {fmt(ap.puntos, 1)} pts</>}
                    </p>
                  )}
                  <div className="si-peso">
                    <label htmlFor={sliderId}>Peso</label>
                    <input id={sliderId} type="range" min={0} max={100} step={5} value={Math.round(w * 100)} className="neon-slider"
                      onChange={(e) => setPeso(c.id, Number(e.target.value))} aria-valuetext={`${Math.round(w * 100)} de ${Math.round(sumaPesos * 100)} partes`} />
                    <span className="si-w">
                      {usado ? pct(resultado.pesos[c.id]) : '—'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="si-row">
            <span className="si-msg">
              Los pesos se renormalizan a 100 %{resultado.usados.length < def.componentes.length ? ' entre los componentes con datos' : ''}.
              {editado ? ' Modificaste los pesos de partida.' : ' Pesos de partida, sin calibrar.'}
            </span>
            {editado && (
              <button type="button" className="pill-btn si-reset"
                onClick={() => setPesosPorIndice((p) => { const n = { ...p }; delete n[indiceId]; return n; })}>
                <RotateCcw size={14} aria-hidden /> Restablecer pesos
              </button>
            )}
          </div>

          {resultado.avisos.length > 0 && (
            <ul className="si-avisos" role="status">
              {resultado.avisos.map((a) => <li key={a}>{a}</li>)}
            </ul>
          )}

          {/* Zonas con mayor puntaje: el orden cambia al editar los pesos */}
          {top.length > 0 && (
            <>
              <h4 className="si-h2">Mayores puntajes entre {NIVEL_LABEL[zona.nivel].toLowerCase()}s</h4>
              <ol className="si-top">
                {top.map((z) => (
                  <li key={z.zonaId} data-sel={z.zonaId === zonaId}>
                    <span>{z.posicion}.</span> <span>{getZona(z.zonaId)?.nombre ?? z.zonaId}{z.incompleta ? ' (incompleta)' : ''}</span>
                    <span className="si-topv">{fmt(z.puntaje!, 0)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {/* Sensibilidad */}
          {sens && (
            <>
              <h4 className="si-h2">Sensibilidad a los pesos</h4>
              <p className="si-msg">
                {sens.minPos === sens.maxPos
                  ? `La posición de ${zona.nombre} (${sens.minPos}) no cambia con los escenarios probados.`
                  : `Con otros pesos, ${zona.nombre} queda entre la posición ${sens.minPos} y la ${sens.maxPos} de ${resultado.n}.`}{' '}
                {sens.estable === false && <strong className="si-warn">La posición es sensible a los pesos: interprétala con cautela.</strong>}
              </p>
              <div className="si-scroll">
                <table className="si-table">
                  <caption className="sr-only">Posición de {zona.nombre} con pesos alternativos</caption>
                  <thead><tr><th scope="col">Escenario</th><th scope="col">Posición</th><th scope="col">Puntaje</th><th scope="col" title="Correlación de Spearman del orden completo contra los pesos actuales">Orden vs. actual</th></tr></thead>
                  <tbody>
                    {sens.escenarios.map((e) => (
                      <tr key={e.nombre}>
                        <th scope="row">{e.nombre}</th>
                        <td>{e.posicion ?? '—'}</td>
                        <td>{e.puntaje != null ? fmt(e.puntaje, 0) : '—'}</td>
                        <td>{e.correlacion != null ? fmt(e.correlacion, 2) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <h4 className="si-h2">Limitaciones</h4>
      <ul className="si-lim">
        {def.limitaciones.map((l) => <li key={l}>{l}</li>)}
        <li>Calculado en tu navegador con series precalculadas; la posición es el orden relativo de este modelo, no una clasificación oficial, y no debe usarse como único criterio de decisión.</li>
      </ul>
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="terminal-panel si-panel" aria-label="Índices compuestos">
      <style>{CSS}</style>
      {children}
    </section>
  );
}

const CSS = `
.si-panel{display:flex;flex-direction:column;gap:8px;font-family:var(--font-mono);color:var(--text-primary);}
.si-h{margin:0;font-size:13px;letter-spacing:.04em;color:var(--neon-green);}
.si-tag{font-size:11px;color:#1a1000;background:var(--neon-yellow);padding:1px 6px;margin-left:6px;}
.si-h2{margin:6px 0 0;font-size:13px;color:var(--text-bright);}
.si-tabs{display:flex;gap:6px;flex-wrap:wrap;}
.si-msg{margin:0;font-size:12px;line-height:1.45;}
.si-warn{color:var(--neon-yellow);}
.si-score{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;}
.si-big{font-family:var(--font-data);font-size:40px;color:var(--neon-cyan);line-height:1;}
.si-sub{font-size:13px;}
.si-pos{flex-basis:100%;font-size:12px;line-height:1.45;}
.si-comps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;}
.si-comp{border:1px solid var(--bg-border);padding:8px 10px;display:flex;flex-direction:column;gap:4px;}
.si-comp[data-usado='true']{border-color:rgba(0,255,136,.35);}
.si-comp-head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--text-bright);}
.si-dir{font-size:12px;color:var(--text-primary);}
.si-peso{display:flex;align-items:center;gap:8px;font-size:12px;}
.si-peso .neon-slider{flex:1;min-width:80px;}
.si-w{min-width:44px;text-align:right;color:var(--neon-cyan);}
.si-row{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;}
.si-reset{display:inline-flex;align-items:center;gap:4px;color:var(--neon-cyan);}
.si-avisos,.si-lim{margin:0;padding-left:18px;font-size:12px;line-height:1.45;}
.si-avisos{color:var(--neon-yellow);}
.si-top{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:2px;font-size:12px;}
.si-top li{display:flex;gap:6px;padding:2px 6px;}
.si-top li[data-sel='true']{background:rgba(0,229,255,.12);color:var(--text-bright);}
.si-topv{margin-left:auto;color:var(--neon-cyan);}
.si-scroll{overflow-x:auto;}
.si-table{border-collapse:collapse;width:100%;font-size:12px;}
.si-table th,.si-table td{border:1px solid var(--bg-border);padding:4px 8px;text-align:right;white-space:nowrap;}
.si-table th[scope='row'],.si-table thead th:first-child{text-align:left;font-weight:400;}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;}
`;
