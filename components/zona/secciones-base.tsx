'use client';

/** Secciones incorporadas del panel de zona: KPIs, gráfico, franjas y fuente. Se auto-registran. */
import { useMemo } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Download } from 'lucide-react';
import { NIVEL_LABEL } from '@/lib/zonas';
import {
  TEXTO_EVIDENCIA, aPuntos, ajusteLineal, conSigno, csvSerie, formatear, mediaPeriodo, posicion, tendencia, ultimoValor,
} from '@/lib/comparar';
import { registrarSeccion, type SeccionCtx } from './secciones';
import { usePares } from './datos';
import SerieChart from './SerieChart';
import Sparkline from './Sparkline';
import WarmingStripes from './WarmingStripes';
import { colorIndicador, descargarTexto, unidadCorta, unidadN } from './ui';

const MONO = { fontFamily: 'var(--font-mono)' } as const;
export const T_CHICO = { ...MONO, fontSize: 12, color: 'var(--text-muted)' } as const;
const NIVELES_PLURAL: Record<string, string> = { pais: 'países', departamento: 'departamentos', distrito: 'distritos del mismo departamento', ciudad: 'ciudades' };

function Vacio({ children }: { children: React.ReactNode }) {
  return <p style={{ ...MONO, fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{children}</p>;
}

// ───────────────── KPIs ─────────────────
function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--bg-border)', padding: '8px 10px', minWidth: 0 }}>
      <div style={{ ...T_CHICO, marginBottom: 4 }}>{titulo}</div>
      {children}
    </div>
  );
}

export function colorSentido(mejorEs: 'alto' | 'bajo' | 'neutro', delta: number): string {
  if (mejorEs === 'neutro' || delta === 0) return 'var(--neon-cyan)';
  const mejora = mejorEs === 'alto' ? delta > 0 : delta < 0;
  return mejora ? 'var(--neon-green)' : 'var(--neon-magenta)';
}

function Kpis({ ctx }: { ctx: SeccionCtx }) {
  const { zona, indicador: def, serie } = ctx;
  const dec = def?.decimales ?? 1, u = def ? unidadCorta(def.unidad) : '';
  const anual = serie?.anual ?? null;
  const ult = ultimoValor(anual);
  const ptsAnual = useMemo(() => aPuntos(anual), [anual]);
  const prev = ult ? ptsAnual[ult.i - 1] : null;
  const tend = useMemo(() => tendencia(anual), [anual]);
  const mes = ultimoValor(serie?.mensual);
  const anio = ult ? Number(ult.t) : null;
  const pares = usePares(zona, def?.id ?? null, anio);
  const color = colorIndicador(def);
  if (!def || !serie) return <Vacio>Elegí un indicador con datos para ver los valores clave.</Vacio>;
  if (!ult) return <Vacio>Este indicador no tiene años completos todavía en esta zona.</Vacio>;

  const delta = prev?.v != null ? ult.v - prev.v : null;
  const pos = pares.valores.length >= 2 ? posicion(ult.v, pares.valores) : null;
  const Flecha = !tend ? ArrowRight : tend.sentido === 'sube' ? ArrowUp : tend.sentido === 'baja' ? ArrowDown : ArrowRight;
  const colTend = tend && tend.evidencia !== 'insuficiente' ? colorSentido(def.mejorEs, tend.porDecada) : 'var(--text-muted)';

  return (
    <div className="zona-kpis">
      <Tarjeta titulo={`Último año completo (${ult.t})`}>
        <div style={{ ...MONO, fontSize: 24, color: 'var(--text-bright)', lineHeight: 1.1 }}>
          {formatear(ult.v, dec)} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{u}</span>
        </div>
        <div style={{ ...T_CHICO, marginTop: 4 }}>
          {delta != null ? <>vs. {prev!.t}: <span style={{ color: colorSentido(def.mejorEs, delta) }}>{conSigno(delta, dec)} {u}</span></> : 'sin año anterior para comparar'}
        </div>
        {mes && <div style={T_CHICO}>Último mes con dato ({mes.t}): {formatear(mes.v, dec)} {u}</div>}
      </Tarjeta>

      <Tarjeta titulo="Tendencia">
        {tend ? (
          <>
            <div style={{ ...MONO, fontSize: 18, color: colTend, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Flecha size={20} aria-hidden /> {conSigno(tend.porDecada, dec + (Math.abs(tend.porDecada) < 1 ? 1 : 0))} {u}/década
            </div>
            <div style={{ ...T_CHICO, marginTop: 4 }}>
              {tend.desde}–{tend.hasta} ({tend.n} años). {TEXTO_EVIDENCIA[tend.evidencia]}.
            </div>
          </>
        ) : <Vacio>Faltan años para estimar una tendencia.</Vacio>}
      </Tarjeta>

      <Tarjeta titulo={`Últimos años`}>
        <div className="flex items-center gap-3">
          <Sparkline pts={ptsAnual.slice(-15)} color={color} />
          <span style={T_CHICO}>{ptsAnual.slice(-15).find((p) => p.v != null)?.t}–{ult.t}</span>
        </div>
      </Tarjeta>

      <Tarjeta titulo={`Posición entre ${NIVELES_PLURAL[zona.nivel] ?? 'zonas'}`}>
        {pares.cargando ? <Vacio>Calculando…</Vacio> : pos ? (
          <>
            <div style={{ ...MONO, fontSize: 18, color: 'var(--text-bright)' }}>N.º {pos.puesto} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>de {pos.total}</span></div>
            <div aria-hidden style={{ height: 6, background: '#1d4a26', marginTop: 6, position: 'relative' }}>
              <div style={{ position: 'absolute', left: `${((pos.total - pos.puesto) / Math.max(1, pos.total - 1)) * 100}%`, top: -3, width: 4, height: 12, background: color, transform: 'translateX(-2px)' }} />
            </div>
            <div style={{ ...T_CHICO, marginTop: 4 }}>En {ult.t}; 1 = valor más alto. Solo zonas con serie calculada.</div>
          </>
        ) : <Vacio>Aún no hay suficientes zonas del mismo nivel con serie calculada.</Vacio>}
      </Tarjeta>
    </div>
  );
}

// ───────────────── Gráfico ─────────────────
function GraficoSerie({ ctx }: { ctx: SeccionCtx }) {
  const { zona, indicador: def, serie, gran, serieZona } = ctx;
  const s = gran === 'anual' ? serie?.anual : serie?.mensual;
  const pts = useMemo(() => aPuntos(s), [s]);
  const base = useMemo(() => {
    if (!def || def.tipo === 'anomalia') return null;
    const m = mediaPeriodo(aPuntos(serie?.anual), 1991, 2020);
    if (!m || m.n < 10) return null;
    const anios = aPuntos(serie?.anual).filter((p) => p.v != null && Math.floor(p.x) >= 1991 && Math.floor(p.x) <= 2020);
    return { valor: m.media, etiqueta: `Promedio ${anios[0].t}–${anios[anios.length - 1].t}` };
  }, [def, serie]);
  const ajuste = useMemo(() => (gran === 'anual' ? ajusteLineal(aPuntos(serie?.anual)) : null), [gran, serie]);
  if (!def || !serie || !s || !pts.some((p) => p.v != null)) {
    return <Vacio>Sin datos {gran === 'mensual' ? 'mensuales' : 'anuales'} de este indicador en la zona.</Vacio>;
  }
  const nulos = pts.filter((p) => p.v == null).length;
  const color = colorIndicador(def);
  const u = unidadCorta(def.unidad);

  function descargar() {
    if (!def || !s) return;
    const csv = csvSerie({
      zonaId: zona.id, zona: zona.nombre, indicadorId: def.id, indicador: def.nombre, unidad: def.unidad,
      fuente: def.fuente.dataset, licencia: def.licencia, gran, version: serieZona?.version, actualizado: serieZona?.actualizado,
    }, s);
    descargarTexto(`asungreen_${zona.id}_${def.id}_${gran}.csv`, csv);
  }

  return (
    <div>
      <SerieChart
        series={[{ id: zona.id, etiqueta: zona.nombre, color, pts }]}
        unidad={u} decimales={def.decimales ?? 1} gran={gran} tipo={def.tipo} base={base} ajuste={ajuste}
        cambios={def.cambiosSensor} unidadN={unidadN(def)}
        descripcion={`${def.nombre} en ${zona.nombre}, serie ${gran}, ${pts[0].t} a ${pts[pts.length - 1].t}`}
      />
      <div className="flex items-center justify-between gap-2 flex-wrap" style={{ marginTop: 8 }}>
        <span style={T_CHICO}>{pts.length - nulos} de {pts.length} {gran === 'anual' ? 'años' : 'meses'} con dato{nulos ? ` · ${nulos} sin dato (huecos)` : ''}</span>
        <button type="button" className="pill-btn" onClick={descargar} style={{ color: 'var(--neon-cyan)', borderColor: 'var(--neon-cyan)' }}>
          <Download size={14} aria-hidden style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />Descargar CSV
        </button>
      </div>
    </div>
  );
}

// ───────────────── Franjas ─────────────────
function Franjas({ ctx }: { ctx: SeccionCtx }) {
  const anual = ctx.serieZona?.indicadores['temp-aire']?.anual;
  if (!anual) return <Vacio>Esta zona no tiene la serie de temperatura del aire.</Vacio>;
  return <WarmingStripes anual={anual} titulo={`Franjas de temperatura del aire en ${ctx.zona.nombre}`} />;
}

// ───────────────── Fuente ─────────────────
function Fuente({ ctx }: { ctx: SeccionCtx }) {
  const { indicador: def, serieZona, serie, zona } = ctx;
  if (!def) return <Vacio>Sin indicador seleccionado.</Vacio>;
  const ini = serie?.mensual?.inicio ?? (serie?.anual ? String(serie.anual.inicio) : null);
  return (
    <dl style={{ ...MONO, fontSize: 13, margin: 0, color: 'var(--text-primary)', lineHeight: 1.5 }}>
      <dt style={T_CHICO}>Qué es</dt><dd style={{ margin: '0 0 6px' }}>{def.descripcion}</dd>
      <dt style={T_CHICO}>Fuente</dt>
      <dd style={{ margin: '0 0 6px' }}>{def.fuente.dataset} · <a href={def.fuente.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--neon-cyan)' }}>documentación</a></dd>
      <dt style={T_CHICO}>Resolución</dt><dd style={{ margin: '0 0 6px' }}>{def.resolucion}</dd>
      <dt style={T_CHICO}>Licencia</dt><dd style={{ margin: '0 0 6px' }}>{def.licencia}</dd>
      <dt style={T_CHICO}>En esta zona</dt>
      <dd style={{ margin: '0 0 6px' }}>
        {NIVEL_LABEL[zona.nivel]} · serie desde {ini ?? 'n/d'}
        {serieZona && <> · calculada el {serieZona.actualizado} (pipeline v{serieZona.version})</>}
      </dd>
      <dt style={T_CHICO}>Limitaciones</dt>
      <dd style={{ margin: 0 }}><ul style={{ margin: 0, paddingLeft: 18 }}>{def.limitaciones.map((l) => <li key={l}>{l}</li>)}</ul></dd>
    </dl>
  );
}

registrarSeccion({ id: 'kpis', titulo: 'Valores clave', orden: 10, Componente: Kpis });
registrarSeccion({ id: 'serie', titulo: 'Serie de tiempo', orden: 20, Componente: GraficoSerie });
registrarSeccion({
  id: 'franjas', titulo: 'Franjas de temperatura (ERA5)', orden: 30, Componente: Franjas,
  visible: (c) => !!c.serieZona?.indicadores['temp-aire']?.anual,
});
registrarSeccion({ id: 'fuente', titulo: 'Fuente, licencia y límites', orden: 90, Componente: Fuente });
