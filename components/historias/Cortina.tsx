'use client';

/**
 * Cortina antes/después sobre el gráfico de la serie anual.
 * A la izquierda de la cortina se ve el período "antes" (su media como línea de referencia);
 * a la derecha, el "después". Se arrastra con el puntero o con ← → (rol slider).
 *
 * Limitación declarada: es una cortina sobre la SERIE, no sobre imágenes de satélite. La cortina
 * de mapas (dos capas ráster sincronizadas) necesita tiles de Earth Engine por año y no se
 * implementó; ver docs/historias-verificacion.md.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { enVentana, type Punto, type VentanaTemporal } from '@/lib/intervenciones';

interface Props {
  nombre: string;
  unidad: string;
  tratada: Punto[];
  control: Punto[] | null;
  antes: VentanaTemporal;
  despues: VentanaTemporal;
  excluida?: VentanaTemporal;
  /** Texto que describe el gráfico para lectores de pantalla. */
  descripcion: string;
}

const H = 300;
const M = { l: 52, r: 14, t: 16, b: 30 };
const FS = 13;

const media = (p: Punto[]) => {
  const v = p.filter((x) => x.v !== null).map((x) => x.v as number);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const fmt = (n: number | null, d = 3) => (n === null ? '—' : n.toLocaleString('es-PY', { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, 2) }));

export default function Cortina({ nombre, unidad, tratada, control, antes, despues, excluida, descripcion }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [pos, setPos] = useState(0.5); // 0..1 del ancho del área de dibujo
  const arrastrando = useRef(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(280, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const todos = [...tratada, ...(control ?? [])].filter((p) => p.v !== null);
  const anios = tratada.map((p) => Number(p.t.slice(0, 4)));
  const x0 = Math.min(...anios), x1 = Math.max(...anios);
  const vs = todos.map((p) => p.v as number);
  const vmin = vs.length ? Math.min(...vs) : 0, vmax = vs.length ? Math.max(...vs) : 1;
  const pad = (vmax - vmin || 1) * 0.1;
  const lo = vmin - pad, hi = vmax + pad;
  const iw = w - M.l - M.r, ih = H - M.t - M.b;
  const sx = useCallback((y: number) => M.l + ((y - x0) / (x1 - x0 || 1)) * iw, [x0, x1, iw]);
  const sy = (v: number) => M.t + (1 - (v - lo) / (hi - lo)) * ih;

  const enV = (p: Punto, v: VentanaTemporal) => enVentana(p.t, v);
  const filaEx = (p: Punto) => !(excluida && enVentana(p.t, excluida));
  const mAntes = media(tratada.filter((p) => enV(p, antes) && filaEx(p)));
  const mDesp = media(tratada.filter((p) => enV(p, despues) && filaEx(p)));
  const cAntes = control ? media(control.filter((p) => enV(p, antes) && filaEx(p))) : null;
  const cDesp = control ? media(control.filter((p) => enV(p, despues) && filaEx(p))) : null;

  const ruta = (s: Punto[]) => {
    let d = '', lev = false;
    for (const p of s) {
      if (p.v === null) { lev = false; continue; } // los nulos son huecos, nunca ceros
      d += `${lev ? 'L' : 'M'}${sx(Number(p.t.slice(0, 4))).toFixed(1)},${sy(p.v).toFixed(1)}`;
      lev = true;
    }
    return d;
  };
  const rangoX = (v: VentanaTemporal) => {
    const a = Math.max(x0, Number(v.inicio.slice(0, 4))), b = Math.min(x1, Number(v.fin.slice(0, 4)) + 1);
    return a > b ? null : { x: sx(a), w: Math.max(0, sx(b) - sx(a)) };
  };
  const rA = rangoX(antes), rD = rangoX(despues), rE = excluida ? rangoX(excluida) : null;

  const cx = M.l + pos * iw;
  const mover = (clientX: number) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.min(1, Math.max(0, (clientX - r.left - M.l) / iw)));
  };
  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setPos((p) => Math.max(0, p - 0.05)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setPos((p) => Math.min(1, p + 0.05)); }
    if (e.key === 'Home') setPos(0);
    if (e.key === 'End') setPos(1);
  };
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const xt = anios.filter((y, i) => y % 2 === 0 || i === 0).filter((_, i, a) => i % Math.ceil(a.length / Math.max(2, Math.floor(iw / 70))) === 0);

  if (todos.length === 0) {
    return <p role="status" style={{ color: 'var(--text-muted)', fontSize: 15, margin: 0 }}>No hay datos que graficar para {nombre}.</p>;
  }

  return (
    <figure style={{ margin: 0 }}>
      <figcaption style={{ fontSize: 15, color: 'var(--text-bright)', margin: '0 0 6px' }}>
        {nombre} <span style={{ color: 'var(--text-muted)' }}>({unidad}) · serie anual</span>
      </figcaption>
      <div
        ref={wrap}
        style={{ position: 'relative', width: '100%', touchAction: 'pan-y', userSelect: 'none' }}
        onPointerMove={(e) => { if (arrastrando.current) mover(e.clientX); }}
        onPointerUp={() => { arrastrando.current = false; }}
        onPointerLeave={() => { arrastrando.current = false; }}
      >
        <svg width={w} height={H} role="img" aria-label={descripcion} style={{ display: 'block', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--bg-border)' }}>
          <defs>
            <clipPath id={`izq-${uid}`}><rect x={M.l} y={M.t} width={Math.max(0, cx - M.l)} height={ih} /></clipPath>
            <clipPath id={`der-${uid}`}><rect x={cx} y={M.t} width={Math.max(0, M.l + iw - cx)} height={ih} /></clipPath>
          </defs>
          {rA && <rect x={rA.x} y={M.t} width={rA.w} height={ih} fill="rgba(0,229,255,0.10)" />}
          {rE && <rect x={rE.x} y={M.t} width={rE.w} height={ih} fill="rgba(255,255,255,0.07)" />}
          {rD && <rect x={rD.x} y={M.t} width={rD.w} height={ih} fill="rgba(0,255,136,0.10)" />}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={M.l + iw} y1={sy(t)} y2={sy(t)} stroke="rgba(0,255,136,0.12)" />
              <text x={M.l - 6} y={sy(t) + 4} textAnchor="end" fontSize={FS} fill="#8fd09a" fontFamily="var(--font-mono)">{fmt(t, 2)}</text>
            </g>
          ))}
          {xt.map((y) => (
            <text key={y} x={sx(y)} y={H - 8} textAnchor="middle" fontSize={FS} fill="#8fd09a" fontFamily="var(--font-mono)">{y}</text>
          ))}
          {control && <path d={ruta(control)} fill="none" stroke="#ffe600" strokeWidth={1.8} strokeDasharray="5 3" />}
          <path d={ruta(tratada)} fill="none" stroke="#00ff88" strokeWidth={2.2} />
          {mAntes !== null && rA && (
            <g clipPath={`url(#izq-${uid})`}>
              <line x1={rA.x} x2={M.l + iw} y1={sy(mAntes)} y2={sy(mAntes)} stroke="#00e5ff" strokeWidth={2} strokeDasharray="2 4" />
            </g>
          )}
          {mDesp !== null && rD && (
            <g clipPath={`url(#der-${uid})`}>
              <line x1={M.l} x2={rD.x + rD.w} y1={sy(mDesp)} y2={sy(mDesp)} stroke="#ff7c00" strokeWidth={2} strokeDasharray="2 4" />
            </g>
          )}
          <line x1={cx} x2={cx} y1={M.t} y2={M.t + ih} stroke="#e0ffe8" strokeWidth={2} />
        </svg>
        <div
          role="slider"
          tabIndex={0}
          aria-label={`Cortina antes/después de ${nombre}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos * 100)}
          aria-valuetext={`Cortina al ${Math.round(pos * 100)} % del gráfico. Izquierda: antes. Derecha: después.`}
          onKeyDown={teclas}
          onPointerDown={(e) => { arrastrando.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); mover(e.clientX); }}
          style={{
            position: 'absolute', top: M.t + ih / 2 - 22, left: cx - 22, width: 44, height: 44, borderRadius: '50%',
            background: 'var(--bg-surface)', border: '2px solid var(--text-bright)', color: 'var(--text-bright)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ew-resize', fontSize: 16,
          }}
        >
          ⇆
        </div>
      </div>
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '6px 16px', margin: '10px 0 0', fontSize: 14 }}>
        <div><dt style={{ color: '#00e5ff' }}>Antes ({antes.inicio.slice(0, 4)}–{antes.fin.slice(0, 4)})</dt><dd style={{ margin: 0 }}>media {fmt(mAntes)}{control ? ` · control ${fmt(cAntes)}` : ''}</dd></div>
        <div><dt style={{ color: '#ff7c00' }}>Después ({despues.inicio.slice(0, 4)}–{despues.fin.slice(0, 4)})</dt><dd style={{ margin: 0 }}>media {fmt(mDesp)}{control ? ` · control ${fmt(cDesp)}` : ''}</dd></div>
        {excluida && <div><dt style={{ color: '#a8c8ae' }}>Excluido ({excluida.inicio.slice(0, 4)}–{excluida.fin.slice(0, 4)})</dt><dd style={{ margin: 0 }}>obra / transición</dd></div>}
      </dl>
      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
        Línea verde: zona tratada{control ? '; amarilla discontinua: control' : ''}. Los años sin dato quedan como huecos. Mueve la cortina para comparar los períodos.
      </p>
    </figure>
  );
}
