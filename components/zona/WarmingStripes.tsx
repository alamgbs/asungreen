'use client';

/**
 * Warming stripes: una franja por año, coloreada por la diferencia de la temperatura media anual del aire
 * contra el promedio 1991–2020 de la propia serie. Escala FIJA (± ESCALA °C) para comparar zonas.
 * Los años sin dato (incompletos) van en gris con trama. ERA5 a ~25 km; no es temperatura urbana.
 */
import { useId, useState } from 'react';
import type { SerieAnual } from '@/lib/series';
import { aPuntos, colorDivergente, conSigno, formatear, mediaPeriodo, RDBU } from '@/lib/comparar';

export const ESCALA_STRIPES = 2; // °C a cada lado; cubre el rango observado de anomalías anuales (≈ −1,3…+2,0)

export default function WarmingStripes({ anual, titulo, unidad = '°C' }: { anual: SerieAnual; titulo?: string; unidad?: string }) {
  const uid = useId();
  const pts = aPuntos(anual);
  const [sel, setSel] = useState<number | null>(null);
  const base = mediaPeriodo(pts, 1991, 2020);
  if (!pts.length || !base) {
    return <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)' }}>Sin años completos para dibujar las franjas.</p>;
  }
  const completa = pts[0].x - 0.5 <= 1991 && pts.some((p) => Math.floor(p.x) >= 2020);
  const i = sel ?? pts.length - 1;
  const p = pts[i];
  const dif = p.v != null ? p.v - base.media : null;

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setSel(Math.max(0, i - 1)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setSel(Math.min(pts.length - 1, i + 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setSel(0); }
    else if (e.key === 'End') { e.preventDefault(); setSel(pts.length - 1); }
  }

  return (
    <div>
      <div
        tabIndex={0} role="group" onKeyDown={onKey} onBlur={() => setSel(null)}
        aria-label={`${titulo ?? 'Franjas de temperatura'} ${pts[0].t} a ${pts[pts.length - 1].t}. Flechas para recorrer los años.`}
        aria-describedby={`${uid}-d`}
      >
        <svg width="100%" height={72} viewBox={`0 0 ${pts.length} 1`} preserveAspectRatio="none" role="img" aria-hidden
          style={{ display: 'block', cursor: 'crosshair' }}>
          <defs>
            <pattern id={`${uid}-h`} width={0.25} height={0.25} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={0.25} height={0.25} fill="#2a3a2c" /><rect width={0.07} height={0.25} fill="#5f9a6b" />
            </pattern>
          </defs>
          {pts.map((q, k) => (
            <rect key={q.t} x={k} y={0} width={1.02} height={1}
              fill={q.v == null ? `url(#${uid}-h)` : colorDivergente(q.v - base.media, ESCALA_STRIPES)}
              onPointerEnter={() => setSel(k)} onPointerLeave={() => setSel(null)} />
          ))}
          {sel != null && <rect x={sel} y={0} width={1} height={1} fill="none" stroke="#e0ffe8" strokeWidth={0.12} vectorEffect="non-scaling-stroke" />}
        </svg>
        <div className="flex justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          <span>{pts[0].t}</span><span>{pts[pts.length - 1].t}</span>
        </div>
      </div>
      <div id={`${uid}-d`} aria-live="polite" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-bright)', minHeight: 20, marginTop: 4 }}>
        {p.v == null
          ? `${p.t}: sin dato (año incompleto)`
          : `${p.t}: ${formatear(p.v, 1)} ${unidad} · ${conSigno(dif as number, 1)} ${unidad} vs. promedio 1991–2020`}
      </div>
      <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
        <span>−{ESCALA_STRIPES} {unidad}</span>
        <span aria-hidden style={{ flex: 1, height: 8, background: `linear-gradient(to right, ${RDBU.join(',')})`, maxWidth: 160 }} />
        <span>+{ESCALA_STRIPES} {unidad}</span>
      </div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0' }}>
        Promedio de referencia: {formatear(base.media, 1)} {unidad} ({base.n} años{completa ? '' : '; la serie no cubre todo 1991–2020'}).
        Escala fija para poder comparar zonas. Reanálisis ERA5 de ~25 km, no estaciones.
      </p>
    </div>
  );
}
