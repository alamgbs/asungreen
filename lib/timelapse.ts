/**
 * Lógica del slider temporal / timelapse (Tarea 2.6). Pura salvo el store de fotograma.
 *
 * - `frameStore`: fotograma activo (año/mes/indicador/zona). Lo escribe <TimeSlider/> y lo
 *   puede leer cualquier componente (p. ej. el gráfico de la zona, para resaltar el año activo)
 *   con `useFrame()`, sin pasar props por MapClient.
 * - Las capas GEE en vivo cuestan cuota: el avance automático espera `LIVE_MIN_DWELL_MS`
 *   por fotograma y a que no haya peticiones pendientes (ver `geeStatus` en lib/geeApi.ts).
 *   /api/gee-map admite 20 peticiones sin caché por minuto y cada cambio de `years`
 *   pide 2 capas (NDVI y LST): 7 s por fotograma ≈ 17 peticiones/min como máximo.
 */
import { useSyncExternalStore } from 'react';
import { puntos, type IndicadorSerie } from './series';

export type Granularidad = 'anual' | 'mensual';

export interface Fotograma {
  /** Clave estable: '2019' (anual) o '2019-07' (mensual). */
  t: string;
  year: number;
  /** 1–12 o null en anual. */
  month: number | null;
  v: number | null;
}

/** Primer año con imágenes de las capas en vivo (coincide con MIN_YEAR de lib/urlState.ts). */
export const LIVE_MIN_YEAR = 2013;
export const LIVE_MIN_DWELL_MS = 7000;

export const VELOCIDADES = [
  { id: 'lenta', etiqueta: '0,5×', ms: 2000 },
  { id: 'normal', etiqueta: '1×', ms: 1000 },
  { id: 'rapida', etiqueta: '2×', ms: 500 },
] as const;
export type VelocidadId = (typeof VELOCIDADES)[number]['id'];

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Nombres legibles de indicadores del pipeline (el registro lib/indicadores.ts no los cubre todos). */
const NOMBRES: Record<string, string> = {
  ndvi: 'Vegetación (NDVI, Sentinel-2)',
  lst: 'Temp. superficial (LST, Landsat)',
  'ndvi-modis': 'Vegetación (NDVI, MODIS)',
  'lst-modis': 'Temp. superficial (LST, MODIS)',
  'temp-aire': 'Temperatura del aire (ERA5)',
  'temp-max-aire': 'Temp. máxima del aire (ERA5)',
  precipitacion: 'Precipitación (ERA5)',
  'dias-35c': 'Días ≥ 35 °C (ERA5)',
  'anomalia-temp-aire': 'Anomalía de temp. del aire (ERA5)',
};
export const nombreIndicador = (id: string) => NOMBRES[id] ?? id;

/** Orden de preferencia para el indicador inicial del slider. */
export const INDICADORES_PREFERIDOS = ['lst', 'lst-modis', 'ndvi', 'ndvi-modis', 'temp-aire'];

export function tieneDatos(s: IndicadorSerie | undefined | null, g: Granularidad): boolean {
  const x = s?.[g];
  return !!x && x.v.some((v) => v != null);
}

/** Fotogramas entre el primer y el último valor no nulo (los huecos intermedios se conservan como null). */
export function fotogramas(s: IndicadorSerie | null | undefined, g: Granularidad): Fotograma[] {
  const serie = s?.[g];
  if (!serie) return [];
  const pts = puntos(serie);
  const ok = pts.map((p, i) => (p.v != null ? i : -1)).filter((i) => i >= 0);
  if (!ok.length) return [];
  return pts.slice(ok[0], ok[ok.length - 1] + 1).map((p) => {
    const [y, m] = p.t.split('-');
    return { t: p.t, year: Number(y), month: m ? Number(m) : null, v: p.v };
  });
}

/** Fotogramas anuales sin valor, solo para animar capas en vivo cuando no hay serie de la zona. */
export function fotogramasVivos(hoy = new Date().getFullYear()): Fotograma[] {
  const out: Fotograma[] = [];
  for (let y = LIVE_MIN_YEAR; y <= hoy; y++) out.push({ t: String(y), year: y, month: null, v: null });
  return out;
}

export const enRangoVivo = (year: number, hoy = new Date().getFullYear()) =>
  year >= LIVE_MIN_YEAR && year <= hoy;

export const etiquetaFotograma = (f: Fotograma) =>
  f.month ? `${MESES[f.month - 1]} ${f.year}` : String(f.year);

/** Milisegundos que debe permanecer un fotograma antes de avanzar. */
export function dwellMs(velocidad: VelocidadId, vivo: boolean, reducirMovimiento: boolean): number {
  let ms: number = VELOCIDADES.find((v) => v.id === velocidad)!.ms;
  if (reducirMovimiento) ms = Math.max(ms, 1500);
  return vivo ? Math.max(ms, LIVE_MIN_DWELL_MS) : ms;
}

/** Siguiente índice, con vuelta al inicio. */
export const siguiente = (i: number, n: number) => (n <= 0 ? 0 : (i + 1) % n);

export function prefiereMenosMovimiento(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

// ── Store del fotograma activo ──────────────────────────────────────────

export interface EstadoFotograma {
  zona: string | null;
  indicador: string | null;
  granularidad: Granularidad;
  year: number | null;
  month: number | null;
  reproduciendo: boolean;
}

const VACIO: EstadoFotograma = { zona: null, indicador: null, granularidad: 'anual', year: null, month: null, reproduciendo: false };
let estado: EstadoFotograma = VACIO;
const oyentes = new Set<() => void>();

export const getFotograma = () => estado;
export function setFotograma(parcial: Partial<EstadoFotograma>) {
  const next = { ...estado, ...parcial };
  if ((Object.keys(next) as (keyof EstadoFotograma)[]).every((k) => next[k] === estado[k])) return;
  estado = next;
  oyentes.forEach((f) => f());
}
const suscribir = (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; };

/** Fotograma activo del slider temporal (año/mes/indicador); `year` es null si el slider no está activo. */
export function useFrame(): EstadoFotograma {
  return useSyncExternalStore(suscribir, getFotograma, () => VACIO);
}
