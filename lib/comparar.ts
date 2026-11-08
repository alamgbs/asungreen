/**
 * Lógica pura (sin red ni React) del panel de zona y del modo comparar:
 * tendencia con significancia simple, posición relativa, línea base, CSV, URL `?comparar=a,b,c`.
 */
import { resolverZonaId } from './zonas';
import type { SerieAnual, SerieMensual } from './series';

export const MAX_COMPARAR = 3;

// ───────── URL ─────────
/** `a,b,c` → ids canónicos (acepta ids antiguos), sin repetidos, máx. 3. */
export function parseComparar(valor: string | null | undefined): string[] {
  if (!valor) return [];
  const out: string[] = [];
  for (const raw of valor.split(',')) {
    const id = resolverZonaId(raw.trim());
    if (id && !out.includes(id)) out.push(id);
    if (out.length === MAX_COMPARAR) break;
  }
  return out;
}
export const serializarComparar = (ids: string[]): string => ids.slice(0, MAX_COMPARAR).join(',');

// ───────── formato ─────────
export function formatear(v: number | null | undefined, decimales = 1): string {
  if (v == null || !Number.isFinite(v)) return 'sin dato';
  return v.toLocaleString('es-PY', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}
export const conSigno = (v: number, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + formatear(Math.abs(v), d);

// ───────── series ─────────
export type Gran = 'anual' | 'mensual';
export interface Punto { x: number; t: string; v: number | null; n: number | null }

/** x en años fraccionarios (mensual: centro del mes) para poder mezclar granularidades y fuentes. */
export function aPuntos(s: SerieMensual | SerieAnual | null | undefined): Punto[] {
  if (!s) return [];
  if (typeof s.inicio === 'number') {
    return s.v.map((v, k) => ({ x: s.inicio as number + k + 0.5, t: String((s.inicio as number) + k), v, n: s.n[k] ?? null }));
  }
  const [y0, m0] = s.inicio.split('-').map(Number);
  return s.v.map((v, k) => {
    const i = y0 * 12 + (m0 - 1) + k;
    const y = Math.floor(i / 12), m = i % 12;
    return { x: y + (m + 0.5) / 12, t: `${y}-${String(m + 1).padStart(2, '0')}`, v, n: s.n[k] ?? null };
  });
}

const validos = (p: Punto[]) => p.filter((q): q is Punto & { v: number } => q.v != null);

export interface Ultimo { t: string; v: number; n: number | null; i: number }
export function ultimoValor(s: SerieMensual | SerieAnual | null | undefined): Ultimo | null {
  const p = aPuntos(s);
  for (let i = p.length - 1; i >= 0; i--) if (p[i].v != null) return { t: p[i].t, v: p[i].v as number, n: p[i].n, i };
  return null;
}

/** Media de los valores cuyo año está en [desde, hasta]; null si no hay datos. */
export function mediaPeriodo(p: Punto[], desde: number, hasta: number): { media: number; n: number } | null {
  const a = validos(p).filter((q) => Math.floor(q.x) >= desde && Math.floor(q.x) <= hasta);
  return a.length ? { media: a.reduce((s, q) => s + q.v, 0) / a.length, n: a.length } : null;
}

// ───────── tendencia (mínimos cuadrados + prueba t) ─────────
function lnGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
  let s = 1.000000000190015;
  for (const k of c) s += k / ++y;
  return -t + Math.log((2.5066282746310005 * s) / x);
}
function betacf(a: number, b: number, x: number): number {
  const TINY = 1e-30; let c = 1, d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < TINY) d = TINY; d = 1 / d; let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d; h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY; c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY; d = 1 / d;
    const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-10) break;
  }
  return h;
}
function betaInc(x: number, a: number, b: number): number {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
/** p-valor de dos colas de una t de Student. */
export function pValorT(t: number, gl: number): number {
  return betaInc(gl / (gl + t * t), gl / 2, 0.5);
}

export interface Ajuste { a: number; b: number; n: number; r2: number; p: number | null; x0: number; x1: number }
/** Recta y = a + b·x sobre los puntos válidos. p = null si hay menos de 3 puntos. */
export function ajusteLineal(p: Punto[]): Ajuste | null {
  const q = validos(p); const n = q.length;
  if (n < 2) return null;
  const mx = q.reduce((s, z) => s + z.x, 0) / n, my = q.reduce((s, z) => s + z.v, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const z of q) { sxx += (z.x - mx) ** 2; sxy += (z.x - mx) * (z.v - my); syy += (z.v - my) ** 2; }
  if (sxx === 0) return null;
  const b = sxy / sxx, a = my - b * mx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  let pv: number | null = null;
  if (n >= 3) {
    if (r2 >= 1) pv = 0;
    else pv = pValorT(Math.sqrt((r2 * (n - 2)) / (1 - r2)), n - 2);
  }
  return { a, b, n, r2, p: pv, x0: q[0].x, x1: q[q.length - 1].x };
}

export interface Tendencia {
  /** Pendiente por década, en las unidades del indicador. */
  porDecada: number;
  desde: string; hasta: string; n: number; r2: number; p: number | null;
  sentido: 'sube' | 'baja' | 'plana';
  /** 'significativa' p<0,05; 'debil' p<0,10; 'no-concluyente'; 'insuficiente' (<10 años). */
  evidencia: 'significativa' | 'debil' | 'no-concluyente' | 'insuficiente';
  ajuste: Ajuste;
}
export const MIN_ANIOS_TENDENCIA = 10;

/** Tendencia sobre una serie ANUAL (los años incompletos ya vienen como null). */
export function tendencia(anual: SerieAnual | null | undefined): Tendencia | null {
  const p = aPuntos(anual);
  const aj = ajusteLineal(p);
  if (!aj) return null;
  const q = validos(p);
  const porDecada = aj.b * 10;
  const plana = Math.abs(porDecada) < 1e-9;
  let evidencia: Tendencia['evidencia'];
  if (aj.n < MIN_ANIOS_TENDENCIA || aj.p == null) evidencia = 'insuficiente';
  else if (aj.p < 0.05) evidencia = 'significativa';
  else if (aj.p < 0.1) evidencia = 'debil';
  else evidencia = 'no-concluyente';
  return {
    porDecada, desde: q[0].t, hasta: q[q.length - 1].t, n: aj.n, r2: aj.r2, p: aj.p,
    sentido: plana ? 'plana' : porDecada > 0 ? 'sube' : 'baja', evidencia, ajuste: aj,
  };
}

export const TEXTO_EVIDENCIA: Record<Tendencia['evidencia'], string> = {
  significativa: 'Tendencia estadísticamente significativa (p < 0,05)',
  debil: 'Indicio débil de tendencia (p entre 0,05 y 0,10)',
  'no-concluyente': 'No concluyente: la variación entre años es mayor que la tendencia',
  insuficiente: `Pocos años (< ${MIN_ANIOS_TENDENCIA}) para estimar una tendencia`,
};

// ───────── posición relativa ─────────
/** Puesto (1 = valor más alto) de `valor` entre `otros` + él mismo. */
export function posicion(valor: number, otros: number[]): { puesto: number; total: number } {
  return { puesto: 1 + otros.filter((o) => o > valor).length, total: otros.length + 1 };
}

// ───────── escalas / colores ─────────
/** Dominio "bonito" [min,max] con margen que cubre todos los valores. */
export function dominioNice(valores: number[], base?: number | null, simetricoEn?: number): [number, number] {
  const all = [...valores, ...(base != null ? [base] : [])].filter(Number.isFinite);
  if (!all.length) return [0, 1];
  let lo = Math.min(...all), hi = Math.max(...all);
  if (simetricoEn != null) { const m = Math.max(Math.abs(lo - simetricoEn), Math.abs(hi - simetricoEn)); lo = simetricoEn - m; hi = simetricoEn + m; }
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08;
  return [lo - pad, hi + pad];
}
export function ticksNice(lo: number, hi: number, objetivo = 5): number[] {
  const span = hi - lo, raw = span / objetivo, mag = 10 ** Math.floor(Math.log10(raw));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / paso) * paso; v <= hi + 1e-9; v += paso) out.push(Math.round(v / paso) * paso);
  return out;
}

/** ColorBrewer RdBu (11 clases), de azul (frío) a rojo (cálido): apto para daltonismo rojo-verde. */
export const RDBU = ['#053061', '#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7', '#fddbc7', '#f4a582', '#d6604d', '#b2182b', '#67001f'];
export function colorDivergente(v: number, max: number): string {
  const t = Math.max(-1, Math.min(1, v / max));
  return RDBU[Math.round(((t + 1) / 2) * (RDBU.length - 1))];
}

// ───────── CSV ─────────
const esc = (x: string | number | null) => {
  if (x == null) return '';
  const s = String(x);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function csvSerie(meta: {
  zonaId: string; zona: string; indicadorId: string; indicador: string; unidad: string;
  fuente: string; licencia: string; gran: Gran; version?: string; actualizado?: string;
}, serie: SerieMensual | SerieAnual): string {
  const cab = ['zona_id', 'zona', 'indicador_id', 'indicador', 'unidad', 'granularidad', 'periodo', 'valor', 'n', 'fuente', 'licencia', 'version_pipeline', 'actualizado'];
  const filas = aPuntos(serie).map((p) =>
    [meta.zonaId, meta.zona, meta.indicadorId, meta.indicador, meta.unidad, meta.gran, p.t, p.v, p.n, meta.fuente, meta.licencia, meta.version ?? '', meta.actualizado ?? ''].map(esc).join(','));
  return [cab.join(','), ...filas].join('\n') + '\n';
}
