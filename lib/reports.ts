// lib/reports.ts — lectura y validación de reportes (git-based) en build time.
import fs from 'node:fs';
import path from 'node:path';
import { AOIS } from './aois';
import { INDICATORS, type Report, type ReportIndicator, type ReportMeta } from './reports-shared';

export * from './reports-shared';

const REPORTS_DIR = path.join(process.cwd(), 'content', 'reports');

function strArray(v: unknown, field: string, file: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw new Error(`[reports] ${file}: "${field}" debe ser un arreglo de strings`);
  }
  return v as string[];
}

function parseMeta(raw: unknown, file: string): ReportMeta {
  if (!raw || typeof raw !== 'object') throw new Error(`[reports] ${file}: JSON inválido`);
  const r = raw as Record<string, unknown>;
  for (const f of ['title', 'date', 'summary', 'author'] as const) {
    if (typeof r[f] !== 'string' || !(r[f] as string).trim()) {
      throw new Error(`[reports] ${file}: falta el campo "${f}"`);
    }
  }
  const date = r.date as string;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    throw new Error(`[reports] ${file}: "date" debe ser YYYY-MM-DD`);
  }
  const zones = strArray(r.zones, 'zones', file);
  const known = new Set(AOIS.map((a) => a.id));
  for (const z of zones) {
    if (!known.has(z)) {
      throw new Error(`[reports] ${file}: zona desconocida "${z}" (válidas: ${[...known].join(', ')})`);
    }
  }
  const indicators = strArray(r.indicators, 'indicators', file);
  for (const i of indicators) {
    if (!(INDICATORS as readonly string[]).includes(i)) {
      throw new Error(`[reports] ${file}: indicador desconocido "${i}" (válidos: ${INDICATORS.join(', ')})`);
    }
  }
  return {
    title: (r.title as string).trim(),
    date,
    summary: (r.summary as string).trim(),
    zones,
    indicators: indicators as ReportIndicator[],
    tags: strArray(r.tags ?? [], 'tags', file),
    author: (r.author as string).trim(),
    example: r.example === true,
  };
}

export function getAllReports(): Report[] {
  if (!fs.existsSync(REPORTS_DIR)) return [];
  const reports: Report[] = [];
  for (const entry of fs.readdirSync(REPORTS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const metaFile = path.join(REPORTS_DIR, entry.name, 'meta.json');
    if (!fs.existsSync(metaFile)) continue;
    const meta = parseMeta(JSON.parse(fs.readFileSync(metaFile, 'utf8')), metaFile);
    const pdfUrl = `/reports/${entry.name}.pdf`;
    if (!fs.existsSync(path.join(process.cwd(), 'public', 'reports', `${entry.name}.pdf`))) {
      throw new Error(`[reports] ${entry.name}: falta public/reports/${entry.name}.pdf`);
    }
    reports.push({ ...meta, slug: entry.name, pdfUrl });
  }
  return reports.sort((a, b) => b.date.localeCompare(a.date));
}

export const getReport = (slug: string): Report | undefined =>
  getAllReports().find((r) => r.slug === slug);

