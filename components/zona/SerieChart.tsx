'use client';

/**
 * Gráfico de series de tiempo en SVG propio (sin dependencias).
 * - Eje X en años; nulos = huecos (la línea se corta, nunca baja a 0).
 * - Línea base (punteada) o, para anomalías, barras/línea alrededor de 0.
 * - Hasta 3 series con el MISMO dominio (pasar `dominio` para fijarlo entre gráficos).
 * - Tooltip con valor y n; navegable con teclado (←/→, Inicio/Fin).
 * - Marcas de cambio de sensor (CambioSensor).
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CambioSensor } from '@/lib/indicadores';
import { dominioNice, formatear, ticksNice, type Ajuste, type Punto } from '@/lib/comparar';

export interface SerieDib {
  id: string;
  etiqueta: string;
  color: string;
  pts: Punto[];
}

interface Props {
  series: SerieDib[];
  unidad: string;
  decimales?: number;
  gran: 'anual' | 'mensual';
  /** 'anomalia': línea base en 0 y barras (solo anual). */
  tipo?: 'valor' | 'anomalia';
  base?: { valor: number; etiqueta: string } | null;
  ajuste?: Ajuste | null;
  cambios?: CambioSensor[];
  dominio?: [number, number];
  dominioX?: [number, number];
  alto?: number;
  /** Texto para lectores de pantalla (qué muestra el gráfico). */
  descripcion: string;
  /** Qué significa n en el tooltip ('días', 'compuestos', …). */
  unidadN?: string;
}

const M = { l: 46, r: 10, t: 12, b: 26 };

/** Parte una serie en tramos continuos (los nulos cortan la línea). */
function tramos(p: Punto[]): Punto[][] {
  const out: Punto[][] = []; let cur: Punto[] = [];
  for (const q of p) {
    if (q.v == null) { if (cur.length) out.push(cur); cur = []; } else cur.push(q);
  }
  if (cur.length) out.push(cur);
  return out;
}

export default function SerieChart({
  series, unidad, decimales = 1, gran, tipo = 'valor', base, ajuste, cambios = [], dominio, dominioX,
  alto = 220, descripcion, unidadN = 'obs.',
}: Props) {
  const uid = useId();
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(360);
  const [cursor, setCursor] = useState<number | null>(null); // índice en la serie de referencia
  const [foco, setFoco] = useState(false);

  useEffect(() => {
    const el = caja.current; if (!el) return;
    const ro = new ResizeObserver(() => setAncho(Math.max(240, Math.round(el.clientWidth))));
    ro.observe(el); setAncho(Math.max(240, Math.round(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  const ref = series[0]?.pts ?? [];
  const xs = useMemo(() => series.flatMap((s) => s.pts.filter((p) => p.v != null).map((p) => p.x)), [series]);
  const [x0, x1] = dominioX ?? (xs.length ? [Math.min(...xs) - (gran === 'anual' ? 0.5 : 0.04), Math.max(...xs) + (gran === 'anual' ? 0.5 : 0.04)] : [0, 1]);
  const vals = useMemo(() => series.flatMap((s) => s.pts.filter((p) => p.v != null).map((p) => p.v as number)), [series]);
  const [y0, y1] = dominio ?? dominioNice(vals, base?.valor ?? null, tipo === 'anomalia' ? 0 : undefined);

  const W = ancho, H = alto, iw = W - M.l - M.r, ih = H - M.t - M.b;
  const X = (x: number) => M.l + ((x - x0) / (x1 - x0 || 1)) * iw;
  const Y = (v: number) => M.t + (1 - (v - y0) / (y1 - y0 || 1)) * ih;

  const yt = ticksNice(y0, y1, 5);
  const span = x1 - x0, paso = span > 30 ? 10 : span > 14 ? 5 : span > 6 ? 2 : 1;
  const xt: number[] = []; for (let a = Math.ceil(x0 / paso) * paso; a <= x1; a += paso) xt.push(a);

  const hayDatos = vals.length > 0;
  const barras = tipo === 'anomalia' && gran === 'anual' && series.length === 1;
  const bw = Math.max(2, Math.min(18, (iw / Math.max(1, ref.length)) * 0.7));

  function indiceCercano(px: number): number | null {
    if (!ref.length) return null;
    const x = x0 + ((px - M.l) / iw) * (x1 - x0);
    let lo = 0, hi = ref.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ref[mid].x < x) lo = mid + 1; else hi = mid; }
    if (lo > 0 && Math.abs(ref[lo - 1].x - x) < Math.abs(ref[lo].x - x)) lo--;
    return lo;
  }
  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setCursor(indiceCercano(e.clientX - r.left));
  }
  function onKey(e: React.KeyboardEvent) {
    if (!ref.length) return;
    const i = cursor ?? ref.length - 1;
    const salto = e.shiftKey ? (gran === 'mensual' ? 12 : 5) : 1;
    if (e.key === 'ArrowLeft') { e.preventDefault(); setCursor(Math.max(0, i - salto)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setCursor(Math.min(ref.length - 1, i + salto)); }
    else if (e.key === 'Home') { e.preventDefault(); setCursor(0); }
    else if (e.key === 'End') { e.preventDefault(); setCursor(ref.length - 1); }
    else if (e.key === 'Escape') setCursor(null);
  }

  const cur = cursor != null ? ref[cursor] : null;
  const filasTip = cur
    ? series.map((s) => {
        // mismo periodo (t) en cada serie
        const q = s.pts.find((p) => p.t === cur.t);
        return { s, q };
      })
    : [];
  const resumenVivo = cur
    ? `${cur.t}: ` + filasTip.map(({ s, q }) => `${s.etiqueta} ${q?.v == null ? 'sin dato' : `${formatear(q.v, decimales)} ${unidad}`}`).join('; ')
    : '';
  const cx = cur ? X(cur.x) : 0;
  const tipIzq = cx > W * 0.55;

  return (
    <div ref={caja} style={{ position: 'relative', width: '100%' }}>
      <div
        tabIndex={0}
        role="group"
        aria-label={`${descripcion}. Use las flechas para recorrer los datos.`}
        aria-describedby={`${uid}-vivo`}
        onKeyDown={onKey}
        onFocus={() => { setFoco(true); setCursor((c) => c ?? Math.max(0, ref.length - 1)); }}
        onBlur={() => { setFoco(false); setCursor(null); }}
        style={{ outlineOffset: 2 }}
      >
        <svg
          width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-hidden={foco ? true : undefined}
          onPointerMove={onMove} onPointerLeave={() => { if (!foco) setCursor(null); }}
          style={{ display: 'block', touchAction: 'pan-y' }}
        >
          <title>{descripcion}</title>
          {/* cuadrícula y eje Y */}
          {yt.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={Y(t)} y2={Y(t)} stroke="#1d4a26" strokeWidth={1} />
              <text x={M.l - 6} y={Y(t) + 4} textAnchor="end" fontSize={12} fill="#5f9a6b" fontFamily="var(--font-mono)">
                {formatear(t, Math.abs(t) < 10 && decimales > 0 ? Math.min(decimales, 1) : 0)}
              </text>
            </g>
          ))}
          {/* eje X (años) */}
          {xt.map((a) => (
            <g key={a}>
              <line x1={X(a)} x2={X(a)} y1={H - M.b} y2={H - M.b + 4} stroke="#5f9a6b" />
              <text x={X(a)} y={H - 6} textAnchor="middle" fontSize={12} fill="#5f9a6b" fontFamily="var(--font-mono)">{a}</text>
            </g>
          ))}
          <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="#5f9a6b" />

          {/* cambios de sensor */}
          {cambios.map((c) => {
            const [yy, mm] = c.t.split('-').map(Number);
            const x = yy + ((mm || 1) - 0.5) / 12;
            if (x < x0 || x > x1) return null;
            return <line key={c.t} x1={X(x)} x2={X(x)} y1={M.t} y2={H - M.b} stroke="#ffe600" strokeDasharray="2 3" strokeWidth={1.5} />;
          })}

          {/* línea base */}
          {tipo === 'anomalia' ? (
            <line x1={M.l} x2={W - M.r} y1={Y(0)} y2={Y(0)} stroke="#e0ffe8" strokeWidth={1.5} />
          ) : base ? (
            <g>
              <line x1={M.l} x2={W - M.r} y1={Y(base.valor)} y2={Y(base.valor)} stroke="#e0ffe8" strokeDasharray="5 4" strokeWidth={1.2} />
            </g>
          ) : null}

          {/* series */}
          {series.map((s) => (
            <g key={s.id}>
              {barras
                ? s.pts.filter((p) => p.v != null).map((p) => (
                    <rect key={p.t} x={X(p.x) - bw / 2} width={bw}
                      y={Math.min(Y(0), Y(p.v as number))} height={Math.max(1, Math.abs(Y(p.v as number) - Y(0)))}
                      fill={(p.v as number) >= 0 ? '#ff2d78' : '#00e5ff'} opacity={0.9} />
                  ))
                : tramos(s.pts).map((tr, k) =>
                    tr.length === 1
                      ? <circle key={k} cx={X(tr[0].x)} cy={Y(tr[0].v as number)} r={2.5} fill={s.color} />
                      : <polyline key={k} fill="none" stroke={s.color} strokeWidth={gran === 'mensual' ? 1.2 : 2}
                          strokeLinejoin="round" points={tr.map((q) => `${X(q.x).toFixed(1)},${Y(q.v as number).toFixed(1)}`).join(' ')} />)}
              {gran === 'anual' && !barras && s.pts.filter((p) => p.v != null).map((p) => (
                <circle key={p.t} cx={X(p.x)} cy={Y(p.v as number)} r={2.2} fill={s.color} />
              ))}
            </g>
          ))}

          {/* tendencia (solo con una serie anual) */}
          {ajuste && series.length === 1 && gran === 'anual' && (
            <line x1={X(ajuste.x0)} x2={X(ajuste.x1)} y1={Y(ajuste.a + ajuste.b * ajuste.x0)} y2={Y(ajuste.a + ajuste.b * ajuste.x1)}
              stroke="#e0ffe8" strokeWidth={2} strokeDasharray="1 5" strokeLinecap="round" />
          )}

          {!hayDatos && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={13} fill="#5f9a6b" fontFamily="var(--font-mono)">Sin datos para mostrar</text>
          )}

          {/* cursor */}
          {cur && (
            <g pointerEvents="none">
              <line x1={cx} x2={cx} y1={M.t} y2={H - M.b} stroke="#e0ffe8" strokeWidth={1} />
              {filasTip.map(({ s, q }) => q?.v != null && <circle key={s.id} cx={X(q.x)} cy={Y(q.v)} r={4} fill={s.color} stroke="#030804" strokeWidth={1.5} />)}
            </g>
          )}
        </svg>

        {cur && (
          <div
            aria-hidden
            style={{
              position: 'absolute', top: 6, [tipIzq ? 'right' : 'left']: tipIzq ? W - cx + 10 : cx + 10,
              background: 'rgba(3,8,4,0.96)', border: '1px solid var(--neon-cyan)', padding: '4px 8px', pointerEvents: 'none',
              fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-bright)', whiteSpace: 'nowrap', zIndex: 3,
            } as React.CSSProperties}
          >
            <div style={{ color: 'var(--text-muted)' }}>{cur.t}</div>
            {filasTip.map(({ s, q }) => (
              <div key={s.id}>
                <span style={{ color: s.color }}>●</span> {series.length > 1 ? `${s.etiqueta}: ` : ''}
                {q?.v == null ? 'sin dato' : `${formatear(q.v, decimales)} ${unidad}`}
                {q?.v != null && q.n != null && <span style={{ color: 'var(--text-muted)' }}> · {q.n} {unidadN}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div id={`${uid}-vivo`} aria-live="polite" style={{ position: 'absolute', left: -9999 }}>{foco ? resumenVivo : ''}</div>

      {/* leyenda */}
      <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
        {series.length > 1 && series.map((s) => <span key={s.id}><span style={{ color: s.color }}>●</span> {s.etiqueta}</span>)}
        {barras && <span><span style={{ color: '#ff2d78' }}>■</span> sobre la base · <span style={{ color: '#00e5ff' }}>■</span> bajo la base</span>}
        {base && tipo !== 'anomalia' && <span><span style={{ color: '#e0ffe8' }}>╌</span> {base.etiqueta}: {formatear(base.valor, decimales)} {unidad}</span>}
        {ajuste && series.length === 1 && gran === 'anual' && <span><span style={{ color: '#e0ffe8' }}>···</span> tendencia lineal</span>}
        {cambios.filter((c) => { const [yy] = c.t.split('-').map(Number); return yy + 1 >= x0 && yy <= x1; }).map((c) => (
          <span key={c.t}><span style={{ color: '#ffe600' }}>┆</span> {c.t}: {c.etiqueta}</span>
        ))}
        <span>Huecos = sin dato</span>
      </div>
    </div>
  );
}

