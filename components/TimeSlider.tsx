'use client';

/**
 * Slider temporal + timelapse (Tarea 2.6).
 *  (a) Anima el valor/gráfico de la zona seleccionada: publica el fotograma activo en
 *      `useFrame()` (lib/timelapse.ts) y muestra el valor y una línea de tiempo.
 *  (b) Si hay capas GEE en vivo activas, cambia `years` (estado de MapClient) al año del
 *      fotograma. Un solo cambio a la vez: espera a que terminen las peticiones pendientes y
 *      a un mínimo de 7 s por fotograma (cuota de /api/gee-map: 20 sin caché por minuto).
 * Teclado: el slider es un <input type="range"> nativo (←/→ ±1, Home/End, PageUp/PageDown ±5);
 * además ←/→ con foco en el panel y Espacio en los botones.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { geeStatus } from '@/lib/geeApi';
import { getZona } from '@/lib/zonas';
import { getZonaSerie, type ZonaSerie } from '@/lib/series';
import {
  INDICADORES_PREFERIDOS, VELOCIDADES, dwellMs, enRangoVivo, etiquetaFotograma, fotogramas,
  fotogramasVivos, nombreIndicador, prefiereMenosMovimiento, setFotograma, siguiente, tieneDatos,
  type Fotograma, type Granularidad, type VelocidadId,
} from '@/lib/timelapse';

interface Props {
  /** Zona seleccionada (id canónico) o null = vista global (se usa el país). */
  zonaId: string | null;
  years: number[];
  onYearsChange: (years: number[]) => void;
  /** true si hay alguna capa GEE en vivo (NDVI o temperatura superficial) encendida. */
  liveLayers: boolean;
}

const fmt = (v: number) => v.toLocaleString('es-PY', { maximumFractionDigits: 2 });

type Cargada = { zona: string; data: ZonaSerie | null; error: string | null };

export default function TimeSlider({ zonaId, years, onYearsChange, liveLayers }: Props) {
  const uid = useId();
  const zid = zonaId ?? 'PY';
  const zona = getZona(zid);

  const [abierto, setAbierto] = useState(true);
  const [carga, setCarga] = useState<Cargada | null>(null);
  const [indSel, setIndSel] = useState<string | null>(null);
  const [gran, setGran] = useState<Granularidad>('anual');
  const [clave, setClave] = useState<string | null>(null);
  const [velocidad, setVelocidad] = useState<VelocidadId>('normal');
  const [reproduciendo, setReproduciendo] = useState(false);
  const [tocado, setTocado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const aniosGuardados = useRef<number[] | null>(null);

  // ── Serie de la zona (tolera ausente/incompleta) ───────────────────
  useEffect(() => {
    let vivo = true;
    getZonaSerie(zid)
      .then((data) => { if (vivo) setCarga({ zona: zid, data, error: null }); })
      .catch((e: unknown) => { if (vivo) setCarga({ zona: zid, data: null, error: e instanceof Error ? e.message : 'error' }); });
    return () => { vivo = false; };
  }, [zid]);
  const cargando = carga?.zona !== zid;
  const data = cargando ? null : carga!.data;

  const disponibles = useMemo(
    () => Object.entries(data?.indicadores ?? {}).filter(([, s]) => tieneDatos(s, 'anual') || tieneDatos(s, 'mensual')).map(([id]) => id),
    [data],
  );
  const indicador = indSel && disponibles.includes(indSel)
    ? indSel
    : INDICADORES_PREFERIDOS.find((i) => disponibles.includes(i)) ?? disponibles[0] ?? null;
  const serieInd = indicador ? data?.indicadores[indicador] ?? null : null;
  const granEf: Granularidad = gran === 'mensual' && tieneDatos(serieInd, 'mensual') ? 'mensual' : 'anual';
  const hayMensual = tieneDatos(serieInd, 'mensual');

  const frames: Fotograma[] = useMemo(() => {
    const f = fotogramas(serieInd, granEf);
    return f.length ? f : liveLayers ? fotogramasVivos() : [];
  }, [serieInd, granEf, liveLayers]);
  const sinValores = frames.length > 0 && frames.every((f) => f.v == null);

  const idxEncontrado = clave ? frames.findIndex((f) => f.t === clave) : -1;
  const idx = idxEncontrado >= 0 ? idxEncontrado : Math.max(0, frames.length - 1);
  const frame = frames[idx] ?? null;
  const vivoEnMapa = liveLayers && granEf === 'anual' && frame != null && enRangoVivo(frame.year);

  // ── Publicar el fotograma para el gráfico de la zona ───────────────
  useEffect(() => {
    setFotograma({
      zona: zid, indicador, granularidad: granEf, reproduciendo,
      year: tocado && frame ? frame.year : null,
      month: frame?.month ?? null,
    });
  }, [zid, indicador, granEf, reproduciendo, frame, tocado]);
  useEffect(() => () => setFotograma({ year: null, month: null, reproduciendo: false }), []);

  // ── Aplicar el año a las capas en vivo (con debounce al arrastrar) ──
  useEffect(() => {
    if (!tocado || !vivoEnMapa || !frame) return;
    if (years.length === 1 && years[0] === frame.year) return;
    const id = window.setTimeout(() => onYearsChange([frame.year]), reproduciendo ? 0 : 500);
    return () => window.clearTimeout(id);
  }, [tocado, vivoEnMapa, frame, years, reproduciendo, onYearsChange]);

  // ── Reproducción: avanza sólo si pasó el tiempo y no hay peticiones pendientes ──
  useEffect(() => {
    if (!reproduciendo || frames.length < 2) return;
    const espera = dwellMs(velocidad, vivoEnMapa, prefiereMenosMovimiento());
    const t0 = performance.now();
    let id = 0;
    const tick = () => {
      if (vivoEnMapa && geeStatus.lastErrorAt >= t0 && geeStatus.lastError) {
        setReproduciendo(false);
        setAviso(`Reproducción en pausa: ${geeStatus.lastError}`);
        return;
      }
      if (performance.now() - t0 < espera || (vivoEnMapa && geeStatus.pending > 0)) {
        id = window.setTimeout(tick, 250);
        return;
      }
      setClave(frames[siguiente(idx, frames.length)].t);
    };
    id = window.setTimeout(tick, Math.min(espera, 250));
    return () => window.clearTimeout(id);
  }, [reproduciendo, frames, idx, velocidad, vivoEnMapa]);

  const tocar = useCallback(() => {
    if (!tocado) {
      aniosGuardados.current = years;
      setTocado(true);
    }
    setAviso(null);
  }, [tocado, years]);

  const ir = (i: number) => {
    if (!frames.length) return;
    tocar();
    setClave(frames[Math.min(frames.length - 1, Math.max(0, i))].t);
  };
  const alternar = () => {
    if (frames.length < 2) return;
    tocar();
    setReproduciendo((p) => !p);
  };
  const restaurar = () => {
    setReproduciendo(false);
    if (aniosGuardados.current) onYearsChange(aniosGuardados.current);
    aniosGuardados.current = null;
    setTocado(false);
    setAviso(null);
  };
  const alKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); ir(idx - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); ir(idx + 1); }
  };

  const nombreZona = zona?.nombre ?? zid;
  const hayAlgo = frames.length > 0;

  return (
    <section
      className="timeslider terminal-panel"
      aria-label="Línea de tiempo"
      onKeyDown={alKey}
      data-open={abierto}
    >
      <style>{CSS}</style>
      <div className="ts-head">
        <span className="ts-title">LÍNEA DE TIEMPO · {nombreZona}{zonaId ? '' : ' (vista global)'}</span>
        <button
          type="button" className="pill-btn ts-fold" onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto} aria-controls={`${uid}-cuerpo`}
          aria-label={abierto ? 'Ocultar línea de tiempo' : 'Mostrar línea de tiempo'}
        >
          {abierto ? <ChevronDown size={16} aria-hidden /> : <ChevronUp size={16} aria-hidden />}
        </button>
      </div>

      {abierto && (
        <div id={`${uid}-cuerpo`} className="ts-body">
          {cargando && <p className="ts-msg">Cargando series…</p>}
          {!cargando && !hayAlgo && (
            <p className="ts-msg" role="status">
              {carga?.error
                ? `No se pudieron cargar las series (${carga.error}).`
                : 'Esta zona aún no tiene series calculadas, así que no hay nada que animar.'}{' '}
              {liveLayers ? '' : 'Activa una capa NDVI o temperatura superficial para animar el mapa por año.'}
            </p>
          )}

          {hayAlgo && (
            <>
              <div className="ts-row">
                <button type="button" className="pill-btn ts-btn" onClick={() => ir(idx - 1)} aria-label="Fotograma anterior" disabled={idx === 0}>
                  <SkipBack size={16} aria-hidden />
                </button>
                <button
                  type="button" className="pill-btn ts-btn ts-play" onClick={alternar}
                  aria-label={reproduciendo ? 'Pausar' : 'Reproducir'} aria-pressed={reproduciendo} disabled={frames.length < 2}
                >
                  {reproduciendo ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
                </button>
                <button type="button" className="pill-btn ts-btn" onClick={() => ir(idx + 1)} aria-label="Fotograma siguiente" disabled={idx >= frames.length - 1}>
                  <SkipForward size={16} aria-hidden />
                </button>
                <input
                  className="neon-slider ts-range" type="range" min={0} max={frames.length - 1} step={1} value={idx}
                  onChange={(e) => ir(Number(e.target.value))}
                  aria-label={granEf === 'mensual' ? 'Mes' : 'Año'}
                  aria-valuetext={frame ? `${etiquetaFotograma(frame)}${frame.v == null ? ', sin dato' : `, valor ${fmt(frame.v)}`}` : undefined}
                />
                <output className="ts-frame">{frame ? etiquetaFotograma(frame) : '—'}</output>
              </div>

              <div className="ts-row ts-opts">
                {disponibles.length > 0 && (
                  <label className="ts-lbl">
                    <span>Indicador</span>
                    <select value={indicador ?? ''} onChange={(e) => { setIndSel(e.target.value); setReproduciendo(false); }} className="ts-sel">
                      {disponibles.map((i) => <option key={i} value={i}>{nombreIndicador(i)}</option>)}
                    </select>
                  </label>
                )}
                {hayMensual && (
                  <div role="group" aria-label="Paso temporal" className="ts-grp">
                    {(['anual', 'mensual'] as const).map((g) => (
                      <button key={g} type="button" className="pill-btn" aria-pressed={granEf === g}
                        onClick={() => { setGran(g); setReproduciendo(false); }}
                        style={granEf === g ? { color: 'var(--neon-green)', borderColor: 'var(--neon-green)' } : undefined}>
                        {g === 'anual' ? 'AÑO' : 'MES'}
                      </button>
                    ))}
                  </div>
                )}
                <div role="group" aria-label="Velocidad" className="ts-grp">
                  {VELOCIDADES.map((v) => (
                    <button key={v.id} type="button" className="pill-btn" aria-pressed={velocidad === v.id}
                      onClick={() => setVelocidad(v.id)}
                      style={velocidad === v.id ? { color: 'var(--neon-green)', borderColor: 'var(--neon-green)' } : undefined}>
                      {v.etiqueta}
                    </button>
                  ))}
                </div>
                {tocado && (
                  <button type="button" className="pill-btn ts-restore" onClick={restaurar}>
                    <RotateCcw size={14} aria-hidden /> Restaurar años
                  </button>
                )}
              </div>

              {!sinValores && frame && (
                <div className="ts-row ts-val">
                  <span className="ts-valnum" aria-live={reproduciendo ? 'off' : 'polite'}>
                    {frame.v == null ? 'Sin dato en este período' : fmt(frame.v)}
                  </span>
                  <Spark frames={frames} idx={idx} etiqueta={indicador ? nombreIndicador(indicador) : ''} onPick={ir} />
                </div>
              )}

              <p className="ts-note">
                {liveLayers
                  ? granEf === 'mensual'
                    ? 'Las capas en vivo del mapa se animan solo por año; en modo mes se anima únicamente el valor de la zona.'
                    : vivoEnMapa
                      ? `Mapa en vivo: ${frame!.year}. Avance automático ≥ 7 s por año para respetar la cuota de Earth Engine.`
                      : frame
                        ? `Sin imágenes en vivo para ${frame.year} (disponibles desde 2013); el mapa conserva su último año.`
                        : ''
                  : 'Las capas en vivo (NDVI, temp. superficial) están apagadas: se anima solo el valor de la zona.'}
              </p>
            </>
          )}
          {aviso && <p className="ts-msg ts-warn" role="alert">{aviso}</p>}
        </div>
      )}
    </section>
  );
}

/** Línea de tiempo mínima en SVG (sin dependencias); los nulos dejan huecos. Clic = ir a ese fotograma. */
function Spark({ frames, idx, etiqueta, onPick }: { frames: Fotograma[]; idx: number; etiqueta: string; onPick: (i: number) => void }) {
  const W = 320, H = 44, P = 3;
  const vs = frames.map((f) => f.v).filter((v): v is number => v != null);
  if (vs.length < 2) return null;
  const lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const n = frames.length - 1 || 1;
  const x = (i: number) => P + (i / n) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - lo) / span) * (H - 2 * P);
  let d = '';
  let pen = false;
  frames.forEach((f, i) => {
    if (f.v == null) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(f.v).toFixed(1)}`;
    pen = true;
  });
  const act = frames[idx];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`} className="ts-spark" role="img" preserveAspectRatio="none"
      aria-label={`${etiqueta}: de ${fmt(lo)} a ${fmt(hi)}, fotograma activo ${act ? etiquetaFotograma(act) : ''}`}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onPick(Math.round(((e.clientX - r.left) / r.width) * n));
      }}
    >
      <path d={d} fill="none" stroke="var(--neon-cyan)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {act?.v != null && <line x1={x(idx)} x2={x(idx)} y1={0} y2={H} stroke="var(--neon-green)" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

const CSS = `
.timeslider{position:absolute;z-index:41;left:320px;right:300px;bottom:36px;width:auto;max-width:640px;padding:8px 12px;}
.timeslider[data-open='false']{padding-bottom:4px;}
.ts-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.ts-title{font-family:var(--font-mono);font-size:12px;letter-spacing:.04em;color:var(--neon-green);}
.ts-fold{min-width:32px;display:inline-flex;align-items:center;justify-content:center;padding:4px 6px;}
.ts-body{display:flex;flex-direction:column;gap:8px;margin-top:6px;}
.ts-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.ts-btn{display:inline-flex;align-items:center;justify-content:center;color:var(--text-primary);}
.ts-btn:disabled{opacity:.4;cursor:default;}
.ts-play{color:var(--neon-green);border-color:var(--neon-green);min-width:44px;}
.ts-range{flex:1 1 140px;min-width:120px;}
.ts-frame{font-family:var(--font-data);font-size:20px;color:var(--text-bright);min-width:96px;text-align:right;}
.ts-lbl{display:flex;align-items:center;gap:6px;font-family:var(--font-mono);font-size:12px;color:var(--text-primary);}
.ts-sel{background:var(--bg-surface);color:var(--text-bright);border:1px solid var(--bg-border);font-family:var(--font-mono);font-size:12px;min-height:32px;padding:2px 6px;max-width:220px;}
.ts-grp{display:inline-flex;gap:4px;}
.ts-restore{display:inline-flex;align-items:center;gap:4px;color:var(--neon-cyan);}
.ts-val{gap:12px;}
.ts-valnum{font-family:var(--font-data);font-size:22px;color:var(--neon-cyan);white-space:nowrap;}
.ts-spark{flex:1 1 140px;height:44px;min-width:120px;cursor:pointer;background:rgba(0,255,136,.04);border:1px solid var(--bg-border);}
.ts-note,.ts-msg{margin:0;font-family:var(--font-mono);font-size:12px;line-height:1.4;color:var(--text-primary);}
.ts-warn{color:var(--neon-yellow);}
@media (max-width:1023px){.timeslider{right:12px;}}
@media (max-width:767px){
  .timeslider{left:8px;right:8px;bottom:78px;max-width:none;z-index:35;}
  .ts-frame{font-size:18px;min-width:80px;}
  .ts-spark{display:none;}
}
@media (prefers-reduced-motion:reduce){.timeslider *{transition:none!important;}}
`;
