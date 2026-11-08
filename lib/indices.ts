/**
 * Índices compuestos (Tarea 3.9): 'Riesgo de calor' e 'Índice ambiental urbano'.
 *
 * Reglas (todas visibles en la UI):
 *  - Cada componente sale de una serie anual de data/series (vía lib/series.ts): media de los
 *    últimos `VENTANA_ANIOS` años con dato (mínimo 2) de una MISMA ventana para todas las zonas.
 *  - Normalización min–max sobre las zonas del MISMO nivel (departamentos con departamentos…),
 *    orientada para que 1 = más riesgo (o mejor condición, según el índice).
 *  - Pesos explícitos y editables; se renormalizan a 100 %.
 *  - Componente sin datos en el nivel → se excluye y se avisa. Zona sin un componente que el
 *    resto sí tiene → se repondera con los demás, se marca "incompleta" y se avisa; si queda
 *    cubierto < 50 % del peso, no se calcula. Nunca se imputa un valor.
 *  - Sensibilidad: la posición de la zona con otros pesos (iguales, quitando un componente,
 *    duplicando uno). "Posición" es el orden según este modelo, no una clasificación oficial.
 */
import { ZONAS, getZona, type Zona } from './zonas';
import { getManifest, getZonaSerie, puntos, type IndicadorSerie } from './series';
import { nombreIndicador } from './timelapse';

export type IndiceId = 'riesgo-calor' | 'ambiental-urbano';

export interface ComponenteDef {
  id: string;
  nombre: string;
  descripcion: string;
  /** Ids de indicador del pipeline por orden de preferencia; se usa el primero con buena cobertura en el nivel. */
  candidatos: string[];
  /** 'mas': valores altos suben el índice; 'menos': valores altos lo bajan (se invierte). */
  sentido: 'mas' | 'menos';
  /** Peso de partida (no calibrado; ver limitaciones). */
  pesoBase: number;
}

export interface IndiceDef {
  id: IndiceId;
  nombre: string;
  descripcion: string;
  /** Cómo leer un puntaje alto. */
  lectura: string;
  /** 'alto-peor' = puntaje alto es peor (riesgo); 'alto-mejor' = puntaje alto es mejor. */
  orientacion: 'alto-peor' | 'alto-mejor';
  componentes: ComponenteDef[];
  limitaciones: string[];
}

export const VENTANA_ANIOS = 3;
export const COBERTURA_MIN_FUENTE = 0.5;
export const COBERTURA_MIN_ZONA = 0.5;
export const MIN_ZONAS = 3;

const VERDE = ['ndvi', 'ndvi-modis'];
const CALOR = ['lst', 'lst-modis', 'temp-aire'];

export const INDICES: Record<IndiceId, IndiceDef> = {
  'riesgo-calor': {
    id: 'riesgo-calor',
    nombre: 'Riesgo de calor',
    descripcion: 'Combina calor, falta de vegetación, densidad de población y vulnerabilidad socioeconómica para comparar zonas del mismo nivel.',
    lectura: '0 = menor riesgo relativo y 100 = mayor riesgo relativo entre las zonas comparadas. No es una medida absoluta ni un pronóstico.',
    orientacion: 'alto-peor',
    componentes: [
      { id: 'calor', nombre: 'Calor', descripcion: 'Temperatura superficial (LST) o, si falta, del aire (ERA5).', candidatos: CALOR, sentido: 'mas', pesoBase: 0.35 },
      { id: 'falta-verde', nombre: 'Falta de verde', descripcion: 'NDVI invertido: menos vegetación, más riesgo.', candidatos: VERDE, sentido: 'menos', pesoBase: 0.30 },
      { id: 'poblacion', nombre: 'Densidad poblacional', descripcion: 'Habitantes por km² (aún no está en el pipeline).', candidatos: ['densidad-poblacion'], sentido: 'mas', pesoBase: 0.20 },
      { id: 'vulnerabilidad', nombre: 'Vulnerabilidad (RWI)', descripcion: 'Índice de riqueza relativa (RWI) invertido: menos riqueza, más vulnerabilidad (aún no está en el pipeline).', candidatos: ['rwi'], sentido: 'menos', pesoBase: 0.15 },
    ],
    limitaciones: [
      'Los pesos iniciales son una elección razonada, no calibrada con datos de salud ni de impactos reales.',
      'La normalización min–max depende de qué zonas se comparan: agregar o quitar zonas mueve todos los puntajes.',
      'Con temperatura del aire (ERA5, ~25 km) varias zonas vecinas comparten el mismo valor y el calor no las distingue.',
      'El orden mide diferencias relativas entre zonas; no dice que una zona sea "segura" o "peligrosa" en términos absolutos.',
    ],
  },
  'ambiental-urbano': {
    id: 'ambiental-urbano',
    nombre: 'Índice ambiental urbano',
    descripcion: 'Resumen simple de verde, calor superficial y días de calor extremo (≥ 35 °C) por zona.',
    lectura: '0 = peor condición relativa y 100 = mejor condición relativa entre las zonas comparadas.',
    orientacion: 'alto-mejor',
    componentes: [
      { id: 'verde', nombre: 'Vegetación', descripcion: 'NDVI: más vegetación, mejor.', candidatos: VERDE, sentido: 'mas', pesoBase: 0.40 },
      { id: 'calor', nombre: 'Calor superficial', descripcion: 'LST o temperatura del aire: menos calor, mejor.', candidatos: CALOR, sentido: 'menos', pesoBase: 0.30 },
      { id: 'dias-calor', nombre: 'Días ≥ 35 °C', descripcion: 'Días al año con máxima ≥ 35 °C (ERA5): menos días, mejor.', candidatos: ['dias-35c'], sentido: 'menos', pesoBase: 0.30 },
    ],
    limitaciones: [
      'Es un resumen experimental de solo tres variables; no incluye calidad del aire, agua, ruido ni acceso a espacios verdes.',
      'Los pesos iniciales no están calibrados y son editables.',
      'Los días ≥ 35 °C provienen de ERA5 (~25 km): zonas vecinas pueden compartir el mismo valor.',
    ],
  },
};
export const INDICE_IDS = Object.keys(INDICES) as IndiceId[];

// ───────────────────────── tipos de datos y resultados ─────────────────────────

export interface FuenteComponente {
  indicador: string;
  nombre: string;
  unidad: string | null;
  /** [primer año, último año] de la ventana común. */
  ventana: [number, number];
  /** Fracción de zonas del nivel con valor. */
  cobertura: number;
}

export interface DatosComponente {
  def: ComponenteDef;
  fuente: FuenteComponente | null;
  /** zonaId → valor crudo (null = sin dato). */
  valores: Map<string, number | null>;
  /** Por qué no hay datos (si fuente es null). */
  motivo?: string;
}

export interface Aporte {
  id: string;
  crudo: number | null;
  /** 0–1, orientado según el índice; null = sin dato. */
  norm: number | null;
  /** Peso efectivo tras renormalizar entre los componentes disponibles de esta zona (0–1). */
  peso: number;
  /** Puntos que aporta al puntaje (0–100). */
  puntos: number;
}

export interface ResultadoZona {
  zonaId: string;
  puntaje: number | null;
  /** 1 = el mayor puntaje. */
  posicion: number | null;
  aportes: Aporte[];
  /** Componentes incluidos en el índice pero sin dato para esta zona. */
  faltantes: string[];
  incompleta: boolean;
  motivoSinPuntaje?: string;
}

export interface ResultadoIndice {
  zonas: ResultadoZona[];
  /** Zonas con puntaje. */
  n: number;
  /** Componentes incluidos (con datos, variación y peso > 0). */
  usados: string[];
  excluidos: { id: string; motivo: string }[];
  /** Peso final (0–1) por componente usado, tras renormalizar. */
  pesos: Record<string, number>;
  /** Mínimo y máximo crudos por componente (base de la normalización). */
  rangos: Record<string, [number, number]>;
  avisos: string[];
}

export type Pesos = Record<string, number>;

export const pesosBase = (def: IndiceDef): Pesos =>
  Object.fromEntries(def.componentes.map((c) => [c.id, c.pesoBase]));

// ───────────────────────── cálculo (puro) ─────────────────────────

export function calcularIndice(def: IndiceDef, datos: DatosComponente[], pesos: Pesos): ResultadoIndice {
  const excluidos: { id: string; motivo: string }[] = [];
  const rangos: Record<string, [number, number]> = {};
  const usables: DatosComponente[] = [];

  for (const d of datos) {
    const w = pesos[d.def.id] ?? 0;
    if (!d.fuente) { excluidos.push({ id: d.def.id, motivo: d.motivo ?? 'sin datos para este nivel' }); continue; }
    if (!(w > 0)) { excluidos.push({ id: d.def.id, motivo: 'peso en 0' }); continue; }
    const vals = [...d.valores.values()].filter((v): v is number => v != null);
    if (vals.length < MIN_ZONAS) { excluidos.push({ id: d.def.id, motivo: `solo ${vals.length} zonas con dato` }); continue; }
    const lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi === lo) { excluidos.push({ id: d.def.id, motivo: 'sin variación entre zonas' }); continue; }
    rangos[d.def.id] = [lo, hi];
    usables.push(d);
  }

  const totalW = usables.reduce((a, d) => a + pesos[d.def.id], 0);
  const pesosFinal: Record<string, number> = Object.fromEntries(usables.map((d) => [d.def.id, pesos[d.def.id] / totalW]));
  const zonaIds = new Set<string>();
  datos.forEach((d) => d.valores.forEach((_, z) => zonaIds.add(z)));

  const zonas: ResultadoZona[] = [...zonaIds].map((zonaId) => {
    const brutos = usables.map((d) => {
      const crudo = d.valores.get(zonaId) ?? null;
      const [lo, hi] = rangos[d.def.id];
      let norm: number | null = crudo == null ? null : (crudo - lo) / (hi - lo);
      if (norm != null && d.def.sentido === 'menos') norm = 1 - norm;
      return { id: d.def.id, crudo, norm, w: pesosFinal[d.def.id] };
    });
    const presentes = brutos.filter((b) => b.norm != null);
    const wPres = presentes.reduce((a, b) => a + b.w, 0);
    const faltantes = brutos.filter((b) => b.norm == null).map((b) => b.id);
    const base: Omit<ResultadoZona, 'puntaje' | 'posicion'> = {
      zonaId, faltantes, incompleta: faltantes.length > 0,
      aportes: brutos.map((b) => ({ id: b.id, crudo: b.crudo, norm: b.norm, peso: b.norm == null || wPres === 0 ? 0 : b.w / wPres, puntos: 0 })),
    };
    if (!usables.length) return { ...base, puntaje: null, posicion: null, motivoSinPuntaje: 'ningún componente tiene datos' };
    if (wPres < COBERTURA_MIN_ZONA) {
      return { ...base, puntaje: null, posicion: null, motivoSinPuntaje: `solo cubre ${Math.round(wPres * 100)} % del peso (mínimo ${COBERTURA_MIN_ZONA * 100} %)` };
    }
    let puntaje = 0;
    for (const a of base.aportes) {
      a.puntos = a.norm == null ? 0 : a.norm * a.peso * 100;
      puntaje += a.puntos;
    }
    return { ...base, puntaje, posicion: null };
  });

  // Posición por puntaje descendente (empates comparten posición).
  const ordenadas = zonas.filter((z) => z.puntaje != null).sort((a, b) => b.puntaje! - a.puntaje!);
  ordenadas.forEach((z, i) => {
    z.posicion = i > 0 && z.puntaje === ordenadas[i - 1].puntaje ? ordenadas[i - 1].posicion : i + 1;
  });

  const avisos: string[] = [];
  for (const e of excluidos) {
    const c = def.componentes.find((x) => x.id === e.id);
    avisos.push(`"${c?.nombre ?? e.id}" no entra al cálculo (${e.motivo}); los pesos se repartieron entre los demás componentes.`);
  }
  const inc = zonas.filter((z) => z.incompleta && z.puntaje != null).length;
  if (inc) avisos.push(`${inc} zona(s) tienen un puntaje reponderado porque les falta algún componente (marcadas "incompleta").`);
  const sin = zonas.filter((z) => z.puntaje == null).length;
  if (sin) avisos.push(`${sin} zona(s) sin puntaje por datos insuficientes.`);
  if (!usables.length) avisos.push('No hay datos suficientes para calcular este índice en este nivel.');

  return { zonas, n: ordenadas.length, usados: usables.map((d) => d.def.id), excluidos, pesos: pesosFinal, rangos, avisos };
}

// ───────────────────────── sensibilidad ─────────────────────────

export interface Escenario {
  nombre: string;
  pesos: Pesos;
  posicion: number | null;
  puntaje: number | null;
  /** Correlación de Spearman del orden completo contra el escenario actual (1 = mismo orden). */
  correlacion: number | null;
}

export interface Sensibilidad {
  escenarios: Escenario[];
  /** Mejor y peor posición de la zona entre todos los escenarios (incluye el actual). */
  minPos: number | null;
  maxPos: number | null;
  estable: boolean | null;
}

function spearman(a: Map<string, number>, b: Map<string, number>): number | null {
  const ids = [...a.keys()].filter((k) => b.has(k));
  const n = ids.length;
  if (n < 3) return null;
  const d2 = ids.reduce((s, k) => s + (a.get(k)! - b.get(k)!) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

export function analizarSensibilidad(def: IndiceDef, datos: DatosComponente[], pesosActuales: Pesos, zonaId: string): Sensibilidad {
  const base = calcularIndice(def, datos, pesosActuales);
  const usados = def.componentes.filter((c) => base.usados.includes(c.id));
  const iguales = Object.fromEntries(def.componentes.map((c) => [c.id, 1]));
  // Solo se varían los componentes que hoy entran al cálculo (los demás no cambiarían nada).
  const defs: { nombre: string; pesos: Pesos }[] = [
    { nombre: 'Pesos actuales', pesos: pesosActuales },
    { nombre: 'Pesos iguales', pesos: iguales },
    ...usados.flatMap((c) => [
      ...(usados.length > 1 ? [{ nombre: `Sin "${c.nombre}"`, pesos: { ...pesosActuales, [c.id]: 0 } }] : []),
      { nombre: `"${c.nombre}" ×2`, pesos: { ...pesosActuales, [c.id]: (pesosActuales[c.id] ?? 0) * 2 } },
    ]),
  ];
  const res = defs.map((d) => ({ d, r: calcularIndice(def, datos, d.pesos) }));
  const posiciones = (r: ResultadoIndice) => new Map(r.zonas.filter((z) => z.posicion != null).map((z) => [z.zonaId, z.posicion!]));
  const actual = posiciones(res[0].r);

  const escenarios: Escenario[] = res.map(({ d, r }) => {
    const z = r.zonas.find((x) => x.zonaId === zonaId);
    return { nombre: d.nombre, pesos: d.pesos, posicion: z?.posicion ?? null, puntaje: z?.puntaje ?? null, correlacion: spearman(actual, posiciones(r)) };
  });
  const pos = escenarios.map((e) => e.posicion).filter((p): p is number => p != null);
  if (!pos.length) return { escenarios, minPos: null, maxPos: null, estable: null };
  const minPos = Math.min(...pos), maxPos = Math.max(...pos);
  const n = res[0].r.n;
  return { escenarios, minPos, maxPos, estable: maxPos - minPos <= Math.max(3, Math.round(n * 0.1)) };
}

// ───────────────────────── carga de datos (cliente) ─────────────────────────

/** Zonas del mismo nivel que `zona`, sin duplicados ni artefactos de la fuente. */
export function paresDe(zona: Zona): Zona[] {
  return ZONAS.filter((z) => z.nivel === zona.nivel && !z.omitirSeries && !z.duplicaDe);
}

/** Media de los años de la ventana con dato; null si hay menos de 2. */
function mediaVentana(s: IndicadorSerie | undefined, ventana: [number, number]): number | null {
  if (!s?.anual) return null;
  const vals = puntos(s.anual).filter((p) => { const y = Number(p.t); return p.v != null && y >= ventana[0] && y <= ventana[1]; }).map((p) => p.v as number);
  return vals.length >= 2 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** Último año anual con valor en ≥ 50 % de las zonas; la ventana son los VENTANA_ANIOS años que terminan ahí. */
function ventanaComun(series: (IndicadorSerie | undefined)[]): [number, number] | null {
  const cuenta = new Map<number, number>();
  for (const s of series) {
    if (!s?.anual) continue;
    for (const p of puntos(s.anual)) if (p.v != null) cuenta.set(Number(p.t), (cuenta.get(Number(p.t)) ?? 0) + 1);
  }
  const fin = [...cuenta.entries()].filter(([, c]) => c >= series.length * COBERTURA_MIN_FUENTE).map(([y]) => y).sort((a, b) => b - a)[0];
  return fin == null ? null : [fin - VENTANA_ANIOS + 1, fin];
}

async function enLotes<T, R>(items: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await f(items[k]); }
  }));
  return out;
}

const cacheDatos = new Map<string, Promise<DatosComponente[]>>();

/**
 * Carga (con caché por nivel e índice) los valores de cada componente para todas las zonas del
 * nivel de `zonaId`. Lanza si el manifest de series no existe; la UI muestra el estado vacío.
 */
export function cargarDatosIndice(def: IndiceDef, zonaId: string): Promise<DatosComponente[]> {
  const zona = getZona(zonaId);
  if (!zona) return Promise.resolve(def.componentes.map((c) => ({ def: c, fuente: null, valores: new Map(), motivo: 'zona desconocida' })));
  const k = `${def.id}|${zona.nivel}`;
  let p = cacheDatos.get(k);
  if (!p) {
    p = construir(def, zona);
    p.catch(() => cacheDatos.delete(k));
    cacheDatos.set(k, p);
  }
  return p;
}

async function construir(def: IndiceDef, zona: Zona): Promise<DatosComponente[]> {
  const manifest = await getManifest();
  const pares = paresDe(zona).filter((z) => manifest.zonas[z.id]?.length);
  const idsNecesarios = new Set(def.componentes.flatMap((c) => c.candidatos));
  const conAlguno = pares.filter((z) => manifest.zonas[z.id].some((i) => idsNecesarios.has(i)));
  const series = new Map<string, Awaited<ReturnType<typeof getZonaSerie>>>();
  await enLotes(conAlguno, 6, async (z) => { try { series.set(z.id, await getZonaSerie(z.id)); } catch { series.set(z.id, null); } });

  return def.componentes.map((c): DatosComponente => {
    for (const cand of c.candidatos) {
      const per = conAlguno.map((z) => series.get(z.id)?.indicadores[cand]);
      const ventana = ventanaComun(per);
      if (!ventana) continue;
      const valores = new Map<string, number | null>(conAlguno.map((z) => [z.id, mediaVentana(series.get(z.id)?.indicadores[cand], ventana)]));
      const con = [...valores.values()].filter((v) => v != null).length;
      const cobertura = pares.length ? con / pares.length : 0;
      if (cobertura < COBERTURA_MIN_FUENTE) continue;
      // Las zonas del nivel sin serie quedan como null explícito (no se imputan).
      pares.forEach((z) => { if (!valores.has(z.id)) valores.set(z.id, null); });
      return { def: c, valores, fuente: { indicador: cand, nombre: nombreIndicador(cand), unidad: manifest.indicadores[cand]?.unidad ?? null, ventana, cobertura } };
    }
    const hay = c.candidatos.some((cand) => manifest.indicadores[cand]);
    return {
      def: c, fuente: null, valores: new Map(pares.map((z) => [z.id, null])),
      motivo: hay ? 'cobertura insuficiente en este nivel (menos de la mitad de las zonas)' : 'este indicador aún no está en el pipeline',
    };
  });
}
