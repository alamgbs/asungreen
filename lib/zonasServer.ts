// SOLO SERVIDOR (usa fs): resuelve cualquier id de zona (o id antiguo) a un `Aoi` con geometría real,
// para /api/gee-map. Los 15 AOI históricos usan la geometría muy simplificada de lib/aois.ts
// (misma que antes: va inline a GEE); el resto usa public/zonas/{nivel}.geojson.
// Nota: esas geometrías están simplificadas para el mapa (error de ~100 m); para estadísticas por zona
// del pipeline hay que usar los límites completos subidos como asset de GEE (Tarea 1.5).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AOIS, type Aoi } from './aois';
import { getZona, type NivelZona } from './zonas';

type Geom = Aoi['geometry'];
const cache = new Map<NivelZona, Map<string, Geom>>();

// Una lectura por nivel con ruta literal: el trazado de archivos de Next solo incluye estos 4 archivos.
function leer(nivel: NivelZona): string {
  switch (nivel) {
    case 'pais':         return readFileSync(join(process.cwd(), 'public', 'zonas', 'pais.geojson'), 'utf8');
    case 'departamento': return readFileSync(join(process.cwd(), 'public', 'zonas', 'departamento.geojson'), 'utf8');
    case 'distrito':     return readFileSync(join(process.cwd(), 'public', 'zonas', 'distrito.geojson'), 'utf8');
    case 'ciudad':       return readFileSync(join(process.cwd(), 'public', 'zonas', 'ciudad.geojson'), 'utf8');
  }
}

function cargarNivel(nivel: NivelZona): Map<string, Geom> {
  const hit = cache.get(nivel);
  if (hit) return hit;
  const fc = JSON.parse(leer(nivel)) as { features: { properties: { id: string }; geometry: Geom }[] };
  const m = new Map(fc.features.map((f) => [f.properties.id, f.geometry] as const));
  cache.set(nivel, m);
  return m;
}

/** AOI por id canónico de zona o por id antiguo; `undefined` si no existe. */
export function findAoi(id: string): Aoi | undefined {
  const legacy = AOIS.find((a) => a.id === id || a.zonaId === id);
  if (legacy) return legacy;
  const z = getZona(id);
  if (!z) return undefined;
  const geometry = cargarNivel(z.nivel).get(z.id);
  if (!geometry) return undefined;
  return {
    id: z.id, label: z.nombre, shortLabel: z.etiquetaCorta ?? z.nombre.slice(0, 8).toUpperCase(),
    hemisphere: z.hemisferio, geometry, zoom: z.zoom ?? 12, zonaId: z.id,
  };
}
