import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { INDICATOR_LABELS, formatDate, getAllReports, getReport, mapHref, zoneLabel } from '@/lib/reports';

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllReports().map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = getReport(slug);
  if (!r) return {};
  return {
    title: `${r.title} — Reportes AsunGreen`,
    description: r.summary,
    openGraph: {
      type: 'article',
      title: r.title,
      description: r.summary,
      publishedTime: r.date,
      authors: [r.author],
      tags: r.tags,
      locale: 'es_PY',
      siteName: 'AsunGreen',
    },
    twitter: { card: 'summary', title: r.title, description: r.summary },
  };
}

const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '10px 16px',
  fontFamily: 'var(--font-mono)', fontSize: 15, borderRadius: 2, textDecoration: 'none',
};

export default async function ReportePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = getReport(slug);
  if (!r) notFound();

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px 20px 64px', fontFamily: 'var(--font-mono)' }}>
      <Link href="/reportes" style={{ color: 'var(--neon-cyan)', fontSize: 15 }}>← Todos los reportes</Link>

      {r.example && (
        <div role="note" style={{ margin: '16px 0', padding: '10px 14px', border: '1px solid var(--neon-yellow)', color: 'var(--neon-yellow)', fontSize: 15 }}>
          Reporte de ejemplo ficticio — no contiene datos reales.
        </div>
      )}

      <h1 style={{ fontSize: 26, lineHeight: 1.25, color: 'var(--text-bright)', margin: '16px 0 8px' }}>{r.title}</h1>
      <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--text-primary)', margin: '0 0 20px' }}>{r.summary}</p>

      <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 16px', fontSize: 15, margin: '0 0 24px' }}>
        <dt style={{ color: 'var(--neon-green)' }}>Fecha</dt><dd style={{ margin: 0 }}>{formatDate(r.date)}</dd>
        <dt style={{ color: 'var(--neon-green)' }}>Autor</dt><dd style={{ margin: 0 }}>{r.author}</dd>
        <dt style={{ color: 'var(--neon-green)' }}>Zonas</dt><dd style={{ margin: 0 }}>{r.zones.map(zoneLabel).join(', ') || '—'}</dd>
        <dt style={{ color: 'var(--neon-green)' }}>Indicadores</dt><dd style={{ margin: 0 }}>{r.indicators.map((i) => INDICATOR_LABELS[i]).join(', ') || '—'}</dd>
        {r.tags.length > 0 && (<><dt style={{ color: 'var(--neon-green)' }}>Etiquetas</dt><dd style={{ margin: 0 }}>{r.tags.join(', ')}</dd></>)}
      </dl>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <a href={r.pdfUrl} download style={{ ...btn, color: '#030804', background: 'var(--neon-green)' }}>Descargar PDF</a>
        <Link href={mapHref(r)} style={{ ...btn, color: 'var(--neon-cyan)', border: '1px solid var(--neon-cyan)' }}>Ver en el mapa</Link>
      </div>

      <object data={r.pdfUrl} type="application/pdf" aria-label={`PDF: ${r.title}`}
        style={{ width: '100%', height: '75vh', minHeight: 420, border: '1px solid rgba(0,255,136,0.35)', background: '#fff' }}>
        <p style={{ padding: 16, fontSize: 15, color: '#111' }}>
          Tu navegador no puede mostrar el PDF incrustado.{' '}
          <a href={r.pdfUrl} style={{ color: '#0645ad' }}>Abrir o descargar el PDF</a>.
        </p>
      </object>
    </main>
  );
}
