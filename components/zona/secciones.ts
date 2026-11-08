/**
 * Registro de secciones del panel de zona. Permite que otros módulos (índices compuestos, historias,
 * etc.) agreguen su sección SIN editar PanelZona:
 *
 *   // components/zona/mi-seccion.tsx
 *   import { registrarSeccion } from './secciones';
 *   registrarSeccion({ id: 'indice-calor', titulo: 'Riesgo de calor', orden: 50, Componente: MiSeccion });
 *
 *   // components/zona/secciones-externas.ts  → añadir UNA línea:  import './mi-seccion';
 *
 * Convención de `orden`: 10 KPIs · 20 gráfico · 30 franjas · 40–80 libres para otros módulos · 90 fuente.
 * El componente recibe `ctx` y debe tolerar datos ausentes (serie null, indicador null).
 */
import type { ComponentType } from 'react';
import type { IndicadorDef } from '@/lib/indicadores';
import type { IndicadorSerie, ZonaSerie } from '@/lib/series';
import type { Gran } from '@/lib/comparar';
import type { Zona } from '@/lib/zonas';

export interface SeccionCtx {
  zona: Zona;
  /** Series de la zona (todos los indicadores); null si aún no existen. */
  serieZona: ZonaSerie | null;
  /** Indicador elegido en el selector (null si la zona no tiene ninguno). */
  indicador: IndicadorDef | null;
  /** Serie del indicador elegido (null si falta). */
  serie: IndicadorSerie | null;
  gran: Gran;
  /** Ids de indicador con datos en esta zona. */
  disponibles: string[];
}

export interface SeccionZona {
  id: string;
  titulo: string;
  orden: number;
  Componente: ComponentType<{ ctx: SeccionCtx }>;
  /** Por defecto: siempre visible. */
  visible?: (ctx: SeccionCtx) => boolean;
}

const registro = new Map<string, SeccionZona>();

/** Idempotente por `id` (un HMR o doble import no duplica la sección). */
export function registrarSeccion(s: SeccionZona): void {
  registro.set(s.id, s);
}

export function seccionesRegistradas(): SeccionZona[] {
  return [...registro.values()].sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id));
}
