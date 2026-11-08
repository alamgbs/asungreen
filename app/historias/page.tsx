import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllIntervenciones } from '@/lib/intervenciones-server';
import { ESTADO_UI } from '@/components/historias/TarjetaFuente';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Historias — AsunGreen',
  description: 'Intervenciones humanas con fecha y fuente, y qué muestran los datos antes y después. Coincidencias, no causas.',
};

const TIPO: Record<string, string> = { positiva: 'positiva', negativa: 'negativa', neutra: 'neutra', mixta: 'mixta' };

export default function HistoriasPage() {
  const historias = getAllIntervenciones();
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px 64px', fontFamily: 'var(--font-mono)' }}>
      <h1 style={{ fontFamily: 'var(--font-pixel)', fontSize: 16, lineHeight: 1.6, color: 'var(--neon-green)', textShadow: 'var(--glow-green)', margin: '0 0 8px' }}>
        HISTORIAS
      </h1>
      <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--text-primary)', margin: '0 0 8px', maxWidth: 780 }}>
        Obras, leyes y proyectos con fecha y fuente. Para cada una mostramos qué indicadores esperaríamos ver cambiar y qué dicen las series de la app antes y después.
      </p>
      <p role="note" style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--neon-yellow)', margin: '0 0 24px', maxWidth: 780 }}>
        Lo que se ve <strong>coincide con</strong> la intervención en el tiempo; no prueba que ella lo produjera. Cuando no hay datos suficientes mostramos «sin cálculo» en lugar de un número.
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))' }}>
        {historias.map((h) => {
          const est = ESTADO_UI[h.estado];
          return (
            <li key={h.id} style={{ border: '1px solid var(--bg-border)', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column' }}>
              <Link href={`/historias/${h.id}`} style={{ display: 'block', padding: '14px 16px', flex: 1, color: 'inherit', textDecoration: 'none', minHeight: 44 }}>
                <span style={{ display: 'inline-block', fontSize: 13, color: est.color, border: `1px solid ${est.color}`, padding: '2px 8px', marginBottom: 8 }}>
                  {est.texto}
                </span>
                <h2 style={{ margin: '0 0 6px', fontSize: 18, lineHeight: 1.3, color: 'var(--text-bright)' }}>{h.nombre}</h2>
                <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--text-muted)' }}>
                  {h.pais} · {h.inicio.slice(0, 4)}{h.fin ? `–${h.fin.slice(0, 4)}` : ''} · {TIPO[h.tipo]}
                </p>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--text-primary)' }}>{h.resumen}</p>
              </Link>
            </li>
          );
        })}
      </ul>
      {historias.length === 0 && <p role="status" style={{ fontSize: 16 }}>Todavía no hay historias cargadas.</p>}
    </main>
  );
}
