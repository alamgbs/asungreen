import type { ReactNode } from 'react';
import Link from 'next/link';

// El body global tiene overflow:hidden (por el mapa); aquí se crea un contenedor con scroll propio.
export default function ReportesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid-bg" style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: 'var(--bg-base)' }}>
      <nav
        style={{
          position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12, padding: '12px 20px',
          background: 'rgba(3,8,4,0.96)', borderBottom: '1px solid rgba(0,255,136,0.25)',
          fontFamily: 'var(--font-mono)', fontSize: 15,
        }}
      >
        <Link href="/reportes" style={{ color: 'var(--neon-green)', textShadow: 'var(--glow-green)' }}>
          &gt; ASUNGREEN / REPORTES
        </Link>
        <Link href="/" style={{ color: 'var(--neon-cyan)' }}>← Volver al mapa</Link>
      </nav>
      {children}
    </div>
  );
}
