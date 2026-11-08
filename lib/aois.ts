// lib/aois.ts — alias COMPATIBLE de las "AOI" originales, ahora derivado de las zonas reales.
// Mantiene los 15 ids históricos (asuncion, central-py, madrid, …) y su forma `Aoi` con geometría,
// porque /api/gee-map y /reportes los usan. El código nuevo debe usar lib/zonas.ts.
//
// Las geometrías (data/zonas/aoi-geometrias.json, ~90 KB) son los límites reales muy simplificados:
// van en línea hacia Earth Engine, así que se mantienen pequeñas. Las geometrías del resto de las
// zonas se resuelven en el servidor con lib/zonasServer.ts.
import aoiGeoms from '../data/zonas/aoi-geometrias.json';
import { ZONAS } from './zonas';

export type GeoJsonPolygon = { type: 'Polygon'; coordinates: number[][][] };
export type GeoJsonMultiPolygon = { type: 'MultiPolygon'; coordinates: number[][][][] };

export interface Aoi {
  id:         string;
  label:      string;
  shortLabel: string;  // ≤8 chars, used in compact pill display
  /** Hemisphere decides which months map to each season (see /api/gee-map). */
  hemisphere: 'S' | 'N';
  geometry:   GeoJsonPolygon | GeoJsonMultiPolygon;
  zoom:       number;
  /** Id de la zona real correspondiente (lib/zonas.ts). */
  zonaId?:    string;
}

const GEOMS = aoiGeoms as unknown as Record<string, Aoi['geometry']>;

export const AOIS: Aoi[] = Object.keys(GEOMS).flatMap((legacyId) => {
  const z = ZONAS.find((x) => x.aliases?.includes(legacyId));
  if (!z) return [];
  return [{
    id: legacyId,
    label: z.nombre === 'Central' ? 'Depto. Central' : z.nombre,
    shortLabel: z.etiquetaCorta ?? legacyId.slice(0, 8).toUpperCase(),
    hemisphere: z.hemisferio,
    geometry: GEOMS[legacyId],
    zoom: z.zoom ?? 12,
    zonaId: z.id,
  }];
});

/**
 * Computes the bounding box of a GeoJSON polygon or multipolygon.
 * Returns [[west, south], [east, north]] — MapLibre fitBounds format.
 */
export function computeBbox(
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
): [[number, number], [number, number]] {
  const flat: number[][] =
    geometry.type === 'Polygon'
      ? geometry.coordinates[0]
      : geometry.coordinates.flatMap((poly) => poly[0]);

  const lngs = flat.map((c) => c[0]);
  const lats = flat.map((c) => c[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}
