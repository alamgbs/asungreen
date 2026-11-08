import { INDICADORES, type IndicadorDef } from '@/lib/indicadores';

export const COLOR_COMPARAR = ['#00e5ff', '#ff2d78', '#ffe600'] as const;

/** Color de acento por grupo de indicador (neón, con buen contraste sobre #030804). */
export function colorIndicador(def: IndicadorDef | null | undefined): string {
  if (!def) return '#00e5ff';
  return def.grupo === 'vegetacion' ? '#00ff88' : def.grupo === 'superficie' ? '#ff7c00' : '#00e5ff';
}

/** Orden de preferencia al abrir una zona. */
export const ORDEN_PREFERIDO = ['temp-aire', 'ndvi', 'lst', 'ndvi-modis', 'lst-modis', 'temp-max-aire', 'dias-35c', 'precipitacion', 'anomalia-temp-aire'];

export function indicadoresDisponibles(ids: string[]): IndicadorDef[] {
  const reg = Object.keys(INDICADORES);
  return ids.filter((i) => i in INDICADORES)
    .sort((a, b) => (ORDEN_PREFERIDO.indexOf(a) + 100) % 100 - (ORDEN_PREFERIDO.indexOf(b) + 100) % 100 || reg.indexOf(a) - reg.indexOf(b))
    .map((i) => INDICADORES[i as keyof typeof INDICADORES]);
}

/** Unidad que significa `n` según la fuente. */
export function unidadN(def: IndicadorDef | null | undefined): string {
  return def?.calculo === 'modis' ? 'compuestos' : def?.calculo === 'gee' ? 'obs.' : 'días';
}

/** Lo que se ve de los indicadores con unidad larga, p. ej. "índice (−1 a 1)" → "índice". */
export const unidadCorta = (u: string) => u.replace(/\s*\(.*\)$/, '');

export function descargarTexto(nombre: string, texto: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['﻿', texto], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
