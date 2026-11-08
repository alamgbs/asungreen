'use client';

/**
 * Carga de series para el panel de zona. Tolera:
 *  - manifest ausente (el pipeline puede estar corriendo y aún no haberlo escrito): se pide
 *    /series/{zona}.json directamente, sin validar versión;
 *  - zonas o indicadores sin datos (null → estado vacío);
 *  - series incompletas (nulos explícitos).
 */
import { useEffect, useState } from 'react';
import { getManifest, getZonaSerie, type SeriesManifest, type ZonaSerie } from '@/lib/series';
import { ZONAS, ZONA_POR_ID, type Zona } from '@/lib/zonas';

let manifestP: Promise<SeriesManifest | null> | null = null;
export function manifestOpcional(): Promise<SeriesManifest | null> {
  manifestP ??= getManifest().catch(() => null);
  return manifestP;
}

const cache = new Map<string, Promise<ZonaSerie | null>>();

/** Serie completa de una zona, o null si no existe (aún). Lanza solo ante errores de red/formato. */
export function cargarZonaSerie(id: string): Promise<ZonaSerie | null> {
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      const m = await manifestOpcional();
      if (m) {
        if (!m.zonas[id]) return null;
        return getZonaSerie(id);
      }
      const r = await fetch(`/series/${encodeURIComponent(id)}.json`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as ZonaSerie;
    })();
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

export type EstadoCarga = 'cargando' | 'ok' | 'vacio' | 'error';
export interface ZonaSerieEstado { estado: EstadoCarga; datos: ZonaSerie | null; error?: string }

export function useZonaSerie(id: string | null | undefined, intento = 0): ZonaSerieEstado {
  const [res, setRes] = useState<{ id: string | null | undefined; intento: number; s: ZonaSerieEstado } | null>(null);
  useEffect(() => {
    if (!id) return;
    let vivo = true;
    if (intento > 0) cache.delete(id);
    cargarZonaSerie(id).then(
      (datos) => { if (vivo) setRes({ id, intento, s: { estado: datos ? 'ok' : 'vacio', datos } }); },
      (e: unknown) => { if (vivo) setRes({ id, intento, s: { estado: 'error', datos: null, error: String(e instanceof Error ? e.message : e) } }); },
    );
    return () => { vivo = false; };
  }, [id, intento]);
  if (!id) return { estado: 'vacio', datos: null };
  if (!res || res.id !== id || res.intento !== intento) return { estado: 'cargando', datos: null };
  return res.s;
}

/** Zonas del mismo nivel con las que se compara la posición relativa (máx. 40). */
export function paresDe(zona: Zona): Zona[] {
  const base = ZONAS.filter((z) => z.id !== zona.id && z.nivel === zona.nivel && !z.omitirSeries && !z.duplicaDe);
  const mismos = zona.nivel === 'distrito' ? base.filter((z) => z.padre === zona.padre) : base;
  return mismos.slice(0, 40);
}

/** Valores de un indicador (último año de la zona) en sus pares que ya tienen serie. */
export function usePares(zona: Zona | undefined, indicador: string | null, anio: number | null) {
  const [res, setRes] = useState<{ clave: string; valores: number[] } | null>(null);
  const clave = zona && indicador && anio != null ? `${zona.id}|${indicador}|${anio}` : '';
  useEffect(() => {
    if (!zona || !indicador || anio == null) return;
    let vivo = true;
    (async () => {
      const m = await manifestOpcional();
      const cands = paresDe(zona).filter((z) => !m || m.zonas[z.id]?.includes(indicador));
      const series = await Promise.all(cands.map((z) => cargarZonaSerie(z.id).catch(() => null)));
      const valores: number[] = [];
      for (const s of series) {
        const a = s?.indicadores[indicador]?.anual;
        if (!a) continue;
        const v = a.v[anio - a.inicio];
        if (v != null) valores.push(v);
      }
      if (vivo) setRes({ clave, valores });
    })();
    return () => { vivo = false; };
  }, [zona, indicador, anio, clave]);
  if (!clave) return { cargando: false, valores: [] as number[] };
  return res?.clave === clave ? { cargando: false, valores: res.valores } : { cargando: true, valores: [] as number[] };
}

export const nombreZona = (id: string) => ZONA_POR_ID.get(id)?.nombre ?? id;

/** Carga varias zonas a la vez (modo comparar). Clave = id de zona. */
export function useVariasZonas(ids: string[], intento = 0): Record<string, ZonaSerieEstado> {
  const clave = ids.join(',');
  const [res, setRes] = useState<{ clave: string; intento: number; r: Record<string, ZonaSerieEstado> } | null>(null);
  useEffect(() => {
    if (!ids.length) return;
    let vivo = true;
    const lista = clave.split(',');
    if (intento > 0) lista.forEach((i) => cache.delete(i));
    Promise.all(lista.map((id) => cargarZonaSerie(id).then(
      (datos): [string, ZonaSerieEstado] => [id, { estado: datos ? 'ok' : 'vacio', datos }],
      (e: unknown): [string, ZonaSerieEstado] => [id, { estado: 'error', datos: null, error: String(e instanceof Error ? e.message : e) }],
    ))).then((pares) => { if (vivo) setRes({ clave, intento, r: Object.fromEntries(pares) }); });
    return () => { vivo = false; };
  }, [clave, intento]); // eslint-disable-line react-hooks/exhaustive-deps
  const out: Record<string, ZonaSerieEstado> = {};
  const listo = res && res.clave === clave && res.intento === intento;
  for (const id of ids) out[id] = listo ? res.r[id] : { estado: 'cargando', datos: null };
  return out;
}
