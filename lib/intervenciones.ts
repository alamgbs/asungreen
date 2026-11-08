/**
 * Intervenciones humanas ("historias"): esquema, validador y estadística antes/después.
 * Diseño: docs/superpowers/specs/2026-11-08-historias-intervenciones.md.
 *
 * Seguro para cliente y servidor: sin acceso a disco ni imports en tiempo de ejecución
 * (solo tipos), de modo que `node --test` puede cargarlo directamente.
 * La lectura de archivos está en lib/intervenciones-server.ts.
 *
 * Regla de producto: la app muestra COINCIDENCIA temporal, no causalidad. El validador
 * rechaza textos que afirmen causa ("causó", "gracias a", …).
 */
import type { IndicadorId } from './indicadores';

export type TipoIntervencion = 'positiva' | 'negativa' | 'neutra' | 'mixta';
export type Confianza = 'alta' | 'media' | 'baja';
export type EstadoHistoria = 'borrador' | 'verificada' | 'publicada';

export interface FuenteVerificable {
  titulo: string;
  url: string;
  publicador: string;
  tipo: 'oficial' | 'prensa' | 'academica' | 'ong' | 'otra';
  fechaPublicacion?: string;
  /** ISO: cuándo se abrió el enlace y se leyó lo citado. */
  fechaConsulta: string;
  respalda: Array<'fecha' | 'ubicacion' | 'efecto'>;
  /** Qué dice textualmente la fuente sobre lo que respalda (cita corta o paráfrasis fiel). */
  extracto?: string;
}

/** Ventana de meses, ambos extremos incluidos. Formato `YYYY-MM`. */
export interface VentanaTemporal { inicio: string; fin: string }

export interface GrupoControl {
  tipo: 'buffer-anillo' | 'zona-vecina-similar' | 'sintetico' | 'ninguno';
  zonaIds?: string[];
  criterio: string;
  pretendenciaParalela: 'verificada' | 'no-verificada' | 'no-aplica';
}

export const INDICADOR_IDS = [
  'ndvi', 'lst', 'temp-aire', 'temp-max-aire', 'anomalia-temp-aire',
  'precipitacion', 'dias-35c', 'ndvi-modis', 'lst-modis',
] as const satisfies readonly IndicadorId[];

export type AdecuacionSensor = 'buena' | 'limitada' | 'mala';

export interface IndicadorAfectado {
  id: IndicadorId;
  direccionEsperada: 'sube' | 'baja' | 'indefinida';
  /** ¿Puede el sensor/serie "ver" el cambio? 'mala' = no se calcula contraste. */
  adecuacionSensor: AdecuacionSensor;
  nota?: string;
}

export interface Intervencion {
  /** kebab-case estable; es también el slug de la URL. */
  id: string;
  nombre: string;
  tipo: TipoIntervencion;
  /** ≤ 280 caracteres, en español, lenguaje de coincidencia. */
  resumen: string;
  pais: string;
  /** Ids de data/zonas/zonas.json de la zona tratada (puede ser más de una). */
  zonasTratadas: string[];
  /** Punto aproximado cuando no hay zona; `fuente` dice de dónde sale. */
  centro?: { lat: number; lng: number; fuente: string } | null;
  /** Geometría del área tratada, solo si tiene fuente. */
  geometria?: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown; fuente: string } | null;
  /** `YYYY`, `YYYY-MM` o `YYYY-MM-DD`. */
  inicio: string;
  fin?: string;
  fechaConfianza: Confianza;
  fechaNota?: string;
  fuentes: FuenteVerificable[];
  indicadores: IndicadorAfectado[];
  ventanaAntes: VentanaTemporal;
  ventanaDespues: VentanaTemporal;
  /** Período de obra/transición que no entra en el contraste. */
  ventanaExcluida?: VentanaTemporal;
  estacionalidad: 'mismo-mes' | 'anual';
  control: GrupoControl;
  efectoAfirmadoPorFuente?: { texto: string; fuenteIdx: number };
  advertencias: string[];
  estado: EstadoHistoria;
  /** Cómo se verificó (o por qué no). Obligatorio en 'verificada'/'publicada'. */
  verificacion: { verificadoEl: string; notas: string[] };
  /** Capa del mapa y años sugeridos para "Ver en el mapa". */
  mapa?: { capa?: 'ndvi' | 'soilTemp'; anios?: number[] };
}

// ── Validador ─────────────────────────────────────────────────────────────

const RE_FECHA = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const RE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Lenguaje causal prohibido en textos visibles. */
const RE_CAUSAL = /\b(caus[óo]|causada?|gracias a|provoc[óo]|produjo|se debe a|debido a la (intervenci|obra|ley|pol)|fue el responsable|logr[óo] (reducir|bajar|aumentar))/i;

export interface ResultadoValidacion { ok: boolean; errores: string[]; avisos: string[] }

function mesIdx(m: string): number {
  const [y, mo] = m.split('-').map(Number);
  return y * 12 + (mo - 1);
}

export function validarIntervencion(raw: unknown, opts?: { zonaIdsValidos?: ReadonlySet<string> }): ResultadoValidacion {
  const errores: string[] = [];
  const avisos: string[] = [];
  const e = (m: string) => errores.push(m);
  if (!raw || typeof raw !== 'object') return { ok: false, errores: ['no es un objeto'], avisos };
  const r = raw as Record<string, unknown>;
  const str = (k: string) => typeof r[k] === 'string' && (r[k] as string).trim() !== '';

  if (!str('id') || !RE_ID.test(r.id as string)) e('id: kebab-case obligatorio');
  for (const k of ['nombre', 'resumen', 'pais']) if (!str(k)) e(`${k}: obligatorio`);
  if (!['positiva', 'negativa', 'neutra', 'mixta'].includes(r.tipo as string)) e('tipo inválido');
  if (str('resumen') && (r.resumen as string).length > 280) e('resumen: máximo 280 caracteres');
  if (!['borrador', 'verificada', 'publicada'].includes(r.estado as string)) e('estado inválido');
  if (!['alta', 'media', 'baja'].includes(r.fechaConfianza as string)) e('fechaConfianza inválida');
  if (!str('inicio') || !RE_FECHA.test(r.inicio as string)) e('inicio: YYYY, YYYY-MM o YYYY-MM-DD');
  if (r.fin !== undefined && (typeof r.fin !== 'string' || !RE_FECHA.test(r.fin))) e('fin: formato de fecha inválido');

  const zonas = r.zonasTratadas;
  if (!Array.isArray(zonas) || zonas.some((z) => typeof z !== 'string')) e('zonasTratadas: arreglo de ids');
  else {
    if (zonas.length === 0 && !r.centro && !r.geometria) e('sin zona, centro ni geometría: no se puede ubicar');
    if (opts?.zonaIdsValidos) for (const z of zonas as string[]) if (!opts.zonaIdsValidos.has(z)) e(`zonasTratadas: id desconocido "${z}"`);
  }
  const c = r.centro as { lat?: unknown; lng?: unknown; fuente?: unknown } | null | undefined;
  if (c) {
    if (typeof c.lat !== 'number' || typeof c.lng !== 'number' || Math.abs(c.lat) > 90 || Math.abs(c.lng) > 180) e('centro: lat/lng inválidos');
    if (typeof c.fuente !== 'string' || !c.fuente) e('centro: falta la fuente de las coordenadas');
  }
  const g = r.geometria as { fuente?: unknown } | null | undefined;
  if (g && (typeof g.fuente !== 'string' || !g.fuente)) e('geometria: falta la fuente');

  // Fuentes
  const fuentes = Array.isArray(r.fuentes) ? (r.fuentes as Record<string, unknown>[]) : [];
  if (fuentes.length < 1) e('fuentes: mínimo 1');
  fuentes.forEach((f, i) => {
    if (typeof f.url !== 'string' || !/^https?:\/\/[^\s]+$/.test(f.url)) e(`fuentes[${i}].url inválida`);
    for (const k of ['titulo', 'publicador']) if (typeof f[k] !== 'string' || !f[k]) e(`fuentes[${i}].${k} obligatorio`);
    if (typeof f.fechaConsulta !== 'string' || !RE_FECHA.test(f.fechaConsulta)) e(`fuentes[${i}].fechaConsulta obligatoria`);
    if (!Array.isArray(f.respalda) || f.respalda.length === 0) e(`fuentes[${i}].respalda vacío`);
  });

  // Indicadores
  const inds = Array.isArray(r.indicadores) ? (r.indicadores as Record<string, unknown>[]) : [];
  if (inds.length === 0) e('indicadores: mínimo 1');
  inds.forEach((x, i) => {
    if (!(INDICADOR_IDS as readonly string[]).includes(x.id as string)) e(`indicadores[${i}].id desconocido: ${String(x.id)}`);
    if (!['sube', 'baja', 'indefinida'].includes(x.direccionEsperada as string)) e(`indicadores[${i}].direccionEsperada inválida`);
    if (!['buena', 'limitada', 'mala'].includes(x.adecuacionSensor as string)) e(`indicadores[${i}].adecuacionSensor inválida`);
  });

  // Ventanas
  const vent = (k: string): { inicio: string; fin: string } | null => {
    const v = r[k] as { inicio?: unknown; fin?: unknown } | undefined;
    if (v === undefined) return null;
    if (typeof v?.inicio !== 'string' || typeof v?.fin !== 'string' || !RE_MES.test(v.inicio) || !RE_MES.test(v.fin)) { e(`${k}: YYYY-MM obligatorio`); return null; }
    if (mesIdx(v.inicio) > mesIdx(v.fin)) { e(`${k}: inicio posterior a fin`); return null; }
    return { inicio: v.inicio, fin: v.fin };
  };
  const antes = vent('ventanaAntes');
  const despues = vent('ventanaDespues');
  const excl = vent('ventanaExcluida');
  if (!antes) e('ventanaAntes obligatoria');
  if (!despues) e('ventanaDespues obligatoria');
  if (antes && despues) {
    if (mesIdx(antes.fin) >= mesIdx(despues.inicio)) e('ventanaAntes debe terminar antes de ventanaDespues');
    if (excl) {
      if (mesIdx(excl.inicio) <= mesIdx(antes.fin)) e('ventanaExcluida se superpone con ventanaAntes');
      if (mesIdx(excl.fin) >= mesIdx(despues.inicio)) e('ventanaExcluida se superpone con ventanaDespues');
    }
  }
  if (!['mismo-mes', 'anual'].includes(r.estacionalidad as string)) e('estacionalidad inválida');

  // Control
  const ctl = r.control as Record<string, unknown> | undefined;
  if (!ctl) e('control obligatorio (usar tipo "ninguno" si no hay)');
  else {
    if (!['buffer-anillo', 'zona-vecina-similar', 'sintetico', 'ninguno'].includes(ctl.tipo as string)) e('control.tipo inválido');
    if (typeof ctl.criterio !== 'string' || !ctl.criterio.trim()) e('control.criterio obligatorio (justificar o explicar la ausencia)');
    if (!['verificada', 'no-verificada', 'no-aplica'].includes(ctl.pretendenciaParalela as string)) e('control.pretendenciaParalela inválida');
    if (ctl.tipo !== 'ninguno' && !(Array.isArray(ctl.zonaIds) && ctl.zonaIds.length)) avisos.push('control sin zonaIds: no se podrá calcular diferencia-en-diferencias');
    if (opts?.zonaIdsValidos && Array.isArray(ctl.zonaIds)) for (const z of ctl.zonaIds as string[]) if (!opts.zonaIdsValidos.has(z)) e(`control.zonaIds: id desconocido "${z}"`);
  }

  // Lenguaje causal en textos visibles
  const textos: [string, unknown][] = [['nombre', r.nombre], ['resumen', r.resumen], ['fechaNota', r.fechaNota]];
  (Array.isArray(r.advertencias) ? r.advertencias : []).forEach((a, i) => textos.push([`advertencias[${i}]`, a]));
  inds.forEach((x, i) => textos.push([`indicadores[${i}].nota`, x.nota]));
  for (const [k, t] of textos) if (typeof t === 'string' && RE_CAUSAL.test(t)) e(`${k}: lenguaje causal ("${t.match(RE_CAUSAL)![0]}"); usar "coincide con" / "después de"`);
  // El efecto afirmado por la fuente SÍ puede traer verbos causales, pero debe ir atribuido.
  const ef = r.efectoAfirmadoPorFuente as { texto?: unknown; fuenteIdx?: unknown } | undefined;
  if (ef) {
    if (typeof ef.texto !== 'string' || !ef.texto) e('efectoAfirmadoPorFuente.texto vacío');
    if (typeof ef.fuenteIdx !== 'number' || !fuentes[ef.fuenteIdx]) e('efectoAfirmadoPorFuente.fuenteIdx no apunta a una fuente');
  }
  if (!Array.isArray(r.advertencias) || r.advertencias.length === 0) e('advertencias: mínimo 1 (siempre se muestran)');

  // Reglas de estado
  const est = r.estado;
  if (est === 'verificada' || est === 'publicada') {
    if (!fuentes.some((f) => Array.isArray(f.respalda) && f.respalda.includes('fecha'))) e(`estado "${est}": ninguna fuente respalda la fecha`);
    if (r.fechaConfianza === 'baja') e(`estado "${est}" no admite fechaConfianza "baja"`);
    const v = r.verificacion as { verificadoEl?: unknown; notas?: unknown } | undefined;
    if (!v || typeof v.verificadoEl !== 'string' || !Array.isArray(v.notas) || v.notas.length === 0) e(`estado "${est}": falta verificacion.verificadoEl / notas`);
  }
  if (r.control && (r.control as { tipo?: string }).tipo === 'ninguno') avisos.push('sin grupo de control: la UI no mostrará efecto neto');
  return { ok: errores.length === 0, errores, avisos };
}

// ── Estadística antes/después y diferencia-en-diferencias ─────────────────

/** `t` es `YYYY` (serie anual) o `YYYY-MM` (mensual). */
export interface Punto { t: string; v: number | null }

export function enVentana(t: string, w: VentanaTemporal): boolean {
  if (t.length === 4) { // anual: el año completo debe caber en la ventana
    return mesIdx(`${t}-01`) >= mesIdx(w.inicio) && mesIdx(`${t}-12`) <= mesIdx(w.fin);
  }
  const i = mesIdx(t);
  return i >= mesIdx(w.inicio) && i <= mesIdx(w.fin);
}

/** Media por instante entre varias series; null si FALTA alguna (composición constante). */
export function promediarZonas(series: Punto[][]): Punto[] {
  if (series.length === 0) return [];
  const base = series[0];
  const mapas = series.map((s) => new Map(s.map((p) => [p.t, p.v])));
  return base.map((p) => {
    let suma = 0;
    for (const m of mapas) {
      const v = m.get(p.t);
      if (v === null || v === undefined || !Number.isFinite(v)) return { t: p.t, v: null };
      suma += v;
    }
    return { t: p.t, v: suma / mapas.length };
  });
}

const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const varMuestral = (a: number[]) => {
  if (a.length < 2) return NaN;
  const m = media(a);
  return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1);
};

/** t crítico bilateral 95 % (tabla; df entero ≥ 1). */
const T95 = [0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086];
export function tCritico95(df: number): number {
  if (!Number.isFinite(df) || df < 1) return NaN;
  const d = Math.floor(df);
  if (d <= 20) return T95[d];
  if (d <= 30) return 2.086 - (d - 20) * 0.004;
  return 1.96 + 2.5 / d;
}

/** Diferencia de medias (b − a) con IC 95 % de Welch. */
export function difMedias(a: number[], b: number[]): { dif: number; ic95: [number, number] | null; se: number | null } {
  const dif = media(b) - media(a);
  if (a.length < 2 || b.length < 2) return { dif, ic95: null, se: null };
  const va = varMuestral(a) / a.length, vb = varMuestral(b) / b.length;
  const se = Math.sqrt(va + vb);
  if (se === 0) return { dif, ic95: [dif, dif], se: 0 };
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  const t = tCritico95(df);
  return { dif, ic95: [dif - t * se, dif + t * se], se };
}

/** Pendiente MCO de y sobre x, con su error estándar (n ≥ 3). */
export function pendiente(x: number[], y: number[]): { b: number; se: number } | null {
  const n = x.length;
  if (n < 3) return null;
  const mx = media(x), my = media(y);
  const sxx = x.reduce((s, v) => s + (v - mx) ** 2, 0);
  if (sxx === 0) return null;
  const b = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / sxx;
  const res = y.reduce((s, v, i) => s + (v - (my + b * (x[i] - mx))) ** 2, 0);
  return { b, se: Math.sqrt(res / (n - 2) / sxx) };
}

export interface ResumenGrupo { mediaAntes: number; mediaDespues: number; diferencia: number }

export interface ResultadoContraste {
  indicador: string;
  nAntes: number;
  nDespues: number;
  tratada: ResumenGrupo & { ic95: [number, number] | null };
  control: ResumenGrupo | null;
  /** (Δ tratada) − (Δ control). null sin control o sin datos suficientes. */
  did: number | null;
  /** IC 95 % de Welch sobre la serie de diferencias tratada − control. No corrige autocorrelación. */
  didIc95: [number, number] | null;
  pretendencia: { pendientePorPaso: number; errorEstandar: number; n: number; paralela: boolean } | null;
  /** El IC incluye 0 (no se distingue de ningún cambio). */
  indistinguibleDeCero: boolean | null;
  advertencias: string[];
}

export interface OpcionesContraste {
  antes: VentanaTemporal;
  despues: VentanaTemporal;
  excluida?: VentanaTemporal;
  /** Mínimo de puntos válidos por ventana. Por defecto 3. */
  minPuntos?: number;
}

/**
 * Contraste antes/después de una serie tratada y, si hay, diferencia-en-diferencias contra un control.
 * Devuelve `null` (con motivo) si no hay datos suficientes; nunca rellena huecos.
 * Ambas series deben tener la misma granularidad (anual o mensual) y los mismos `t`.
 */
export function contrasteAntesDespues(
  indicador: string,
  tratada: Punto[],
  control: Punto[] | null,
  o: OpcionesContraste,
): { resultado: ResultadoContraste | null; motivo?: string } {
  const min = o.minPuntos ?? 3;
  const ctlMap = control ? new Map(control.map((p) => [p.t, p.v])) : null;
  const filas = tratada
    .map((p) => ({ t: p.t, y: p.v, c: ctlMap ? (ctlMap.get(p.t) ?? null) : null }))
    .filter((f) => f.y !== null && Number.isFinite(f.y) && (!ctlMap || (f.c !== null && Number.isFinite(f.c))))
    .filter((f) => !(o.excluida && enVentana(f.t, o.excluida)));
  const A = filas.filter((f) => enVentana(f.t, o.antes));
  const D = filas.filter((f) => enVentana(f.t, o.despues));
  if (A.length < min || D.length < min) {
    return { resultado: null, motivo: `datos insuficientes: ${A.length} puntos antes y ${D.length} después (mínimo ${min} por ventana)` };
  }
  const advertencias: string[] = [];
  const yA = A.map((f) => f.y as number), yD = D.map((f) => f.y as number);
  const mt = difMedias(yA, yD);
  const tratadaRes = { mediaAntes: media(yA), mediaDespues: media(yD), diferencia: mt.dif, ic95: mt.ic95 };
  if (!ctlMap) {
    advertencias.push('Sin grupo de control: es un cambio observado, no un efecto atribuible.');
    return {
      resultado: {
        indicador, nAntes: A.length, nDespues: D.length, tratada: tratadaRes, control: null, did: null, didIc95: null,
        pretendencia: null, indistinguibleDeCero: mt.ic95 ? mt.ic95[0] <= 0 && mt.ic95[1] >= 0 : null, advertencias,
      },
    };
  }
  const cA = A.map((f) => f.c as number), cD = D.map((f) => f.c as number);
  const control_ = { mediaAntes: media(cA), mediaDespues: media(cD), diferencia: media(cD) - media(cA) };
  // DiD = media(d después) − media(d antes), con d = tratada − control.
  const dA = A.map((f, i) => (f.y as number) - cA[i]);
  const dD = D.map((f, i) => (f.y as number) - cD[i]);
  const dd = difMedias(dA, dD);
  // Pre-tendencia: pendiente de d en la ventana "antes", en pasos de la serie.
  const pt = pendiente(A.map((_, i) => i), dA);
  let pretendencia: ResultadoContraste['pretendencia'] = null;
  if (pt) {
    pretendencia = { pendientePorPaso: pt.b, errorEstandar: pt.se, n: dA.length, paralela: Math.abs(pt.b) <= 2 * pt.se };
    if (!pretendencia.paralela) advertencias.push('Las tendencias previas de tratada y control no son paralelas: el contraste es poco fiable.');
  } else {
    advertencias.push(`Pocos puntos previos (${dA.length}) para comprobar tendencias paralelas.`);
  }
  advertencias.push('El IC supone observaciones independientes; con series autocorrelacionadas la incertidumbre real es mayor.');
  return {
    resultado: {
      indicador, nAntes: A.length, nDespues: D.length, tratada: tratadaRes, control: control_,
      did: dd.dif, didIc95: dd.ic95, pretendencia,
      indistinguibleDeCero: dd.ic95 ? dd.ic95[0] <= 0 && dd.ic95[1] >= 0 : null,
      advertencias,
    },
  };
}

// ── Enlace al mapa ────────────────────────────────────────────────────────

/** El mapa solo tiene capas de satélite desde este año (ver lib/urlState.ts). */
export const PRIMER_ANIO_MAPA = 2013;

/**
 * Ruta `/?…` para "Ver en el mapa". Una zona tratada → esa zona; varias → el país;
 * ninguna → el punto aproximado (`centro`). El año se limita a lo que el mapa soporta.
 */
export function hrefMapa(h: Pick<Intervencion, 'zonasTratadas' | 'pais' | 'centro' | 'ventanaDespues' | 'mapa'>, anioActual = new Date().getFullYear()): string {
  const q = new URLSearchParams();
  if (h.zonasTratadas.length === 1) q.set('zona', h.zonasTratadas[0]);
  else if (h.zonasTratadas.length > 1) q.set('zona', h.pais);
  else if (h.centro) {
    q.set('lat', h.centro.lat.toFixed(4));
    q.set('lng', h.centro.lng.toFixed(4));
    q.set('z', '12');
  }
  q.set('layers', h.mapa?.capa === 'soilTemp' ? 'soilTemp' : 'ndvi');
  const desde = Number(h.ventanaDespues.inicio.slice(0, 4));
  q.set('years', String(Math.min(anioActual, Math.max(PRIMER_ANIO_MAPA, desde))));
  return `/?${q.toString()}`;
}
