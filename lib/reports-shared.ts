// lib/reports-shared.ts — tipos y helpers puros (seguros para componentes cliente).
import { AOIS } from './aois';

export const INDICATORS = ['soilTemp', 'traffic', 'ndvi'] as const;
export type ReportIndicator = (typeof INDICATORS)[number];

export const INDICATOR_LABELS: Record<ReportIndicator, string> = {
  soilTemp: 'Temperatura del suelo',
  traffic: 'Tráfico',
  ndvi: 'NDVI',
};

export interface ReportMeta {
  title: string;
  date: string; // YYYY-MM-DD
  summary: string;
  zones: string[];
  indicators: ReportIndicator[];
  tags: string[];
  author: string;
  example?: boolean;
}

export interface Report extends ReportMeta {
  slug: string; // nombre de carpeta, p.ej. 2026-11-ejemplo-ficticio
  pdfUrl: string; // /reports/<slug>.pdf
}

export const zoneLabel = (id: string): string =>
  AOIS.find((a) => a.id === id)?.label ?? id;

export function formatDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('es-PY', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

/** Enlace al mapa: /?aoi=<zona>&layers=<capas separadas por coma> */
export function mapHref(r: Report): string {
  const p = new URLSearchParams();
  if (r.zones[0]) p.set('aoi', r.zones[0]);
  if (r.indicators.length) p.set('layers', r.indicators.join(','));
  const qs = p.toString();
  return qs ? `/?${qs}` : '/';
}
