/**
 * Lectura y cálculo de historias (solo servidor / build): lee data/intervenciones/*.json y
 * data/series/*.json del disco. Las páginas /historias son estáticas, así que esto corre al build.
 * Funciones puras y esquema: lib/intervenciones.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { INDICADORES } from './indicadores';
import {
  contrasteAntesDespues, promediarZonas, validarIntervencion,
  type Intervencion, type Punto, type ResultadoContraste,
} from './intervenciones';
import { ZONAS, getZona } from './zonas';

const DIR = path.join(process.cwd(), 'data', 'intervenciones');
const SERIES_DIR = path.join(process.cwd(), 'data', 'series');

export function getAllIntervenciones(): Intervencion[] {
  if (!fs.existsSync(DIR)) return [];
  const ids = new Set(ZONAS.map((z) => z.id));
  const out: Intervencion[] = [];
  for (const f of fs.readdirSync(DIR).sort()) {
    if (!f.endsWith('.json') || f.startsWith('_') || f.startsWith('.')) continue;
    const raw: unknown = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const v = validarIntervencion(raw, { zonaIdsValidos: ids });
    if (!v.ok) throw new Error(`[historias] ${f}: ${v.errores.join('; ')}`);
    if (path.basename(f, '.json') !== (raw as Intervencion).id) throw new Error(`[historias] ${f}: el id no coincide con el nombre de archivo`);
    out.push(raw as Intervencion);
  }
  const orden = { publicada: 0, verificada: 1, borrador: 2 } as const;
  return out.sort((a, b) => orden[a.estado] - orden[b.estado] || a.inicio.localeCompare(b.inicio));
}

export function getIntervencion(slug: string): Intervencion | undefined {
  return getAllIntervenciones().find((h) => h.id === slug);
}

export function nombreZona(id: string): string {
  return getZona(id)?.nombre ?? id;
}

interface SerieDisco { indicadores: Record<string, { anual?: { inicio: number; v: (number | null)[] } | null }> }

function leerAnual(zonaId: string, indicador: string): Punto[] | null {
  const f = path.join(SERIES_DIR, `${zonaId}.json`);
  if (!fs.existsSync(f)) return null;
  let z: SerieDisco;
  try { z = JSON.parse(fs.readFileSync(f, 'utf8')) as SerieDisco; } catch { return null; } // el pipeline puede estar escribiendo
  const a = z.indicadores?.[indicador]?.anual;
  if (!a) return null;
  return a.v.map((v, k) => ({ t: String(a.inicio + k), v }));
}

function grupo(zonaIds: string[], indicador: string): { serie: Punto[] | null; faltan: string[] } {
  const series: Punto[][] = [];
  const faltan: string[] = [];
  for (const id of zonaIds) {
    const s = leerAnual(id, indicador);
    if (s) series.push(s); else faltan.push(id);
  }
  return faltan.length ? { serie: null, faltan } : { serie: promediarZonas(series), faltan };
}

export interface CalculoIndicador {
  id: string;
  nombre: string;
  unidad: string;
  adecuacionSensor: 'buena' | 'limitada' | 'mala';
  /** null = no se pudo calcular; `motivo` dice por qué. */
  resultado: ResultadoContraste | null;
  motivo: string | null;
  /** Series anuales para el gráfico (solo si existen en data/series). */
  grafico: { tratada: Punto[]; control: Punto[] | null } | null;
}

/** Calcula cada indicador de la historia con las series reales; null + motivo si no hay datos. */
export function calcularHistoria(h: Intervencion): CalculoIndicador[] {
  return h.indicadores.map((ind) => {
    const def = INDICADORES[ind.id];
    const base = { id: ind.id, nombre: def?.nombre ?? ind.id, unidad: def?.unidad ?? '', adecuacionSensor: ind.adecuacionSensor };
    if (ind.adecuacionSensor === 'mala') {
      return { ...base, resultado: null, grafico: null, motivo: 'La resolución de este indicador no permite ver la intervención; no se calcula ningún contraste para no mostrar un número engañoso.' };
    }
    if (h.zonasTratadas.length === 0) {
      return { ...base, resultado: null, grafico: null, motivo: 'La historia no tiene una zona de la app asociada, así que no hay serie que calcular.' };
    }
    const t = grupo(h.zonasTratadas, ind.id);
    if (!t.serie) {
      return { ...base, resultado: null, grafico: null, motivo: `Aún no hay serie de ${base.nombre} para: ${t.faltan.map(nombreZona).join(', ')} (la genera el pipeline).` };
    }
    let ctl: Punto[] | null = null;
    let motivoControl: string | null = null;
    if (h.control.tipo !== 'ninguno' && h.control.zonaIds?.length) {
      const c = grupo(h.control.zonaIds, ind.id);
      if (c.serie) ctl = c.serie;
      else motivoControl = `Falta la serie del grupo de control (${c.faltan.map(nombreZona).join(', ')}).`;
    }
    const grafico = { tratada: t.serie, control: ctl };
    if (motivoControl) {
      return { ...base, resultado: null, grafico, motivo: `${motivoControl} No se calcula el contraste para no presentar un cambio sin control como si lo tuviera.` };
    }
    const r = contrasteAntesDespues(ind.id, t.serie, ctl, { antes: h.ventanaAntes, despues: h.ventanaDespues, excluida: h.ventanaExcluida });
    return { ...base, resultado: r.resultado, grafico, motivo: r.motivo ?? null };
  });
}
