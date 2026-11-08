'use client';

import type { Punto } from '@/lib/comparar';

/** Mini gráfico de los últimos años; decorativo (el valor va en texto al lado). Nulos = huecos. */
export default function Sparkline({ pts, color, ancho = 110, alto = 32, dominio }: {
  pts: Punto[]; color: string; ancho?: number; alto?: number; dominio?: [number, number];
}) {
  const v = pts.filter((p) => p.v != null);
  if (v.length < 2) return <span aria-hidden style={{ width: ancho, height: alto, display: 'inline-block' }} />;
  const xs = pts.map((p) => p.x), vs = v.map((p) => p.v as number);
  const [lo, hi] = dominio ?? [Math.min(...vs), Math.max(...vs)];
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = (x: number) => 2 + ((x - x0) / (x1 - x0 || 1)) * (ancho - 4);
  const Y = (y: number) => 3 + (1 - (y - lo) / (hi - lo || 1)) * (alto - 6);
  const tr: string[] = []; let cur: string[] = [];
  for (const p of pts) {
    if (p.v == null) { if (cur.length) tr.push(cur.join(' ')); cur = []; } else cur.push(`${X(p.x).toFixed(1)},${Y(p.v).toFixed(1)}`);
  }
  if (cur.length) tr.push(cur.join(' '));
  const last = v[v.length - 1];
  return (
    <svg aria-hidden width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} style={{ display: 'block', flexShrink: 0 }}>
      {tr.map((t, i) => <polyline key={i} points={t} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />)}
      <circle cx={X(last.x)} cy={Y(last.v as number)} r={2.8} fill={color} />
    </svg>
  );
}
