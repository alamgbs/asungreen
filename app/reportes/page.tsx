import type { Metadata } from 'next';
import { getAllReports } from '@/lib/reports';
import ReportList from '@/components/reports/ReportList';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Reportes — AsunGreen',
  description: 'Reportes mensuales de monitoreo ambiental: temperatura del suelo, tráfico y NDVI.',
};

export default function ReportesPage() {
  const reports = getAllReports();
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px 64px' }}>
      <h1 style={{ fontFamily: 'var(--font-pixel)', fontSize: 16, lineHeight: 1.6, color: 'var(--neon-green)', textShadow: 'var(--glow-green)', margin: '0 0 8px' }}>
        REPORTES
      </h1>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-primary)', margin: '0 0 24px' }}>
        Informes mensuales de monitoreo ambiental. Filtra por zona o indicador, o busca por texto.
      </p>
      <ReportList reports={reports} />
    </main>
  );
}
