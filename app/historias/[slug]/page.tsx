import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { calcularHistoria, getAllIntervenciones, getIntervencion, nombreZona } from '@/lib/intervenciones-server';
import { hrefMapa } from '@/lib/intervenciones';
import ResultadoBloque from '@/components/historias/ResultadoBloque';
import TarjetaFuente, { ESTADO_UI } from '@/components/historias/TarjetaFuente';

export const dynamicParams = false;
export const dynamic = 'force-static';

export function generateStaticParams() {
  return getAllIntervenciones().map((h) => ({ slug: h.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const h = getIntervencion(slug);
  if (!h) return {};
  return {
    title: `${h.nombre} — Historias AsunGreen`,
    description: h.resumen,
    openGraph: { type: 'article', title: h.nombre, description: h.resumen, locale: 'es_PY', siteName: 'AsunGreen' },
  };
}

const dt: React.CSSProperties = { color: 'var(--neon-green)' };

export default async function HistoriaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const h = getIntervencion(slug);
  if (!h) notFound();
  const calculos = calcularHistoria(h);
  const est = ESTADO_UI[h.estado];
  const ven = (v: { inicio: string; fin: string }) => `${v.inicio} → ${v.fin}`;

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px 20px 64px', fontFamily: 'var(--font-mono)' }}>
      <Link href="/historias" style={{ color: 'var(--neon-cyan)', fontSize: 15 }}>← Todas las historias</Link>

      <p style={{ display: 'inline-block', margin: '16px 0 0', fontSize: 14, color: est.color, border: `1px solid ${est.color}`, padding: '3px 10px' }}>{est.texto}</p>
      <h1 style={{ fontSize: 26, lineHeight: 1.25, color: 'var(--text-bright)', margin: '12px 0 8px' }}>{h.nombre}</h1>
      <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--text-primary)', margin: '0 0 20px' }}>{h.resumen}</p>

      <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 16px', fontSize: 15, margin: '0 0 20px' }}>
        <dt style={dt}>Tipo</dt><dd style={{ margin: 0 }}>{h.tipo}</dd>
        <dt style={dt}>Fecha</dt><dd style={{ margin: 0 }}>{h.inicio}{h.fin ? ` → ${h.fin}` : ''} (confianza {h.fechaConfianza})</dd>
        <dt style={dt}>Zona tratada</dt>
        <dd style={{ margin: 0 }}>
          {h.zonasTratadas.length ? h.zonasTratadas.map(nombreZona).join(', ') : 'sin zona en la app'}
          {h.centro && <span style={{ color: 'var(--text-muted)' }}> · punto aproximado ({h.centro.fuente})</span>}
        </dd>
        <dt style={dt}>Antes</dt><dd style={{ margin: 0 }}>{ven(h.ventanaAntes)}</dd>
        {h.ventanaExcluida && (<><dt style={dt}>Excluido</dt><dd style={{ margin: 0 }}>{ven(h.ventanaExcluida)} (obra o transición)</dd></>)}
        <dt style={dt}>Después</dt><dd style={{ margin: 0 }}>{ven(h.ventanaDespues)}</dd>
        <dt style={dt}>Control</dt>
        <dd style={{ margin: 0 }}>
          {h.control.tipo === 'ninguno' ? 'ninguno. ' : `${h.control.tipo}${h.control.zonaIds?.length ? ` (${h.control.zonaIds.map(nombreZona).join(', ')})` : ''}. `}
          {h.control.criterio} <span style={{ color: 'var(--text-muted)' }}>Tendencias paralelas: {h.control.pretendenciaParalela}.</span>
        </dd>
      </dl>

      <div style={{ margin: '0 0 24px' }}>
        <Link
          href={hrefMapa(h)}
          style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '10px 16px', fontSize: 15, color: 'var(--neon-cyan)', border: '1px solid var(--neon-cyan)', borderRadius: 2, textDecoration: 'none' }}
        >
          Ver en el mapa
        </Link>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
          El mapa tiene capas de satélite desde 2013; para años anteriores usa las series del panel de la zona.
        </p>
      </div>

      <h2 style={{ fontSize: 17, color: 'var(--neon-cyan)', margin: '0 0 10px' }}>QUÉ MUESTRAN LOS DATOS</h2>
      <div style={{ display: 'grid', gap: 16, margin: '0 0 28px' }}>
        {calculos.map((c) => <ResultadoBloque key={c.id} h={h} c={c} />)}
      </div>

      <TarjetaFuente h={h} />
    </main>
  );
}
