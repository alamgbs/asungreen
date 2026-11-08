'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AOIS } from '@/lib/aois';
import { INDICATORS, INDICATOR_LABELS, formatDate, zoneLabel, type Report } from '@/lib/reports-shared';

const field: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--text-bright)',
  background: 'var(--bg-surface)', border: '1px solid rgba(0,255,136,0.35)',
  borderRadius: 2, padding: '10px 12px', minHeight: 44,
};

export default function ReportList({ reports }: { reports: Report[] }) {
  const [q, setQ] = useState('');
  const [zone, setZone] = useState('');
  const [ind, setInd] = useState('');

  const usedZones = useMemo(() => {
    const ids = new Set(reports.flatMap((r) => r.zones));
    return AOIS.filter((a) => ids.has(a.id));
  }, [reports]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return reports.filter((r) => {
      if (zone && !r.zones.includes(zone)) return false;
      if (ind && !r.indicators.includes(ind as never)) return false;
      if (!needle) return true;
      const hay = [r.title, r.summary, r.author, ...r.tags, ...r.zones.map(zoneLabel)].join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [reports, q, zone, ind]);

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        <input
          type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar reportes…" aria-label="Buscar reportes"
          style={{ ...field, flex: '1 1 240px' }}
        />
        <select value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Filtrar por zona" style={{ ...field, flex: '0 1 200px' }}>
          <option value="">Todas las zonas</option>
          {usedZones.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <select value={ind} onChange={(e) => setInd(e.target.value)} aria-label="Filtrar por indicador" style={{ ...field, flex: '0 1 220px' }}>
          <option value="">Todos los indicadores</option>
          {INDICATORS.map((i) => <option key={i} value={i}>{INDICATOR_LABELS[i]}</option>)}
        </select>
      </div>

      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-primary)', margin: '0 0 14px' }} aria-live="polite">
        {filtered.length} de {reports.length} reportes
      </p>

      {filtered.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-primary)' }}>
          No hay reportes que coincidan con los filtros.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))' }}>
          {filtered.map((r) => (
            <li key={r.slug}>
              <Link
                href={`/reportes/${r.slug}`}
                className="terminal-panel-btn"
                style={{ display: 'block', height: '100%', padding: 16, textDecoration: 'none' }}
              >
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--neon-cyan)', marginBottom: 6 }}>
                  {formatDate(r.date)}{r.example && <span style={{ color: 'var(--neon-yellow)' }}> · EJEMPLO FICTICIO</span>}
                </div>
                <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 18, lineHeight: 1.3, color: 'var(--text-bright)', margin: '0 0 8px' }}>
                  {r.title}
                </h2>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 15, lineHeight: 1.5, color: 'var(--text-primary)', margin: '0 0 12px' }}>
                  {r.summary}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {r.zones.map((z) => <Chip key={z} color="var(--neon-green)">{zoneLabel(z)}</Chip>)}
                  {r.indicators.map((i) => <Chip key={i} color="var(--neon-purple)">{INDICATOR_LABELS[i]}</Chip>)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Chip({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color, border: `1px solid ${color}`, borderRadius: 2, padding: '2px 8px' }}>
      {children}
    </span>
  );
}
