// lib/aois.ts
// AOI (Area of Interest) catalog — 15 city/region polygons.
// Geometries are simplified rectangular approximations of GADM administrative
// boundaries. Replace coordinates with actual GADM data for higher fidelity.

export type GeoJsonPolygon = { type: 'Polygon'; coordinates: number[][][] };
export type GeoJsonMultiPolygon = { type: 'MultiPolygon'; coordinates: number[][][][] };

export interface Aoi {
  id:         string;
  label:      string;
  shortLabel: string;  // ≤8 chars, used in compact pill display
  geometry:   GeoJsonPolygon | GeoJsonMultiPolygon;
  zoom:       number;
}

export const AOIS: Aoi[] = [
  {
    id: 'asuncion',
    label: 'Asunción',
    shortLabel: 'ASU',
    zoom: 12,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-57.720, -25.396], [-57.472, -25.396],
        [-57.472, -25.187], [-57.720, -25.187],
        [-57.720, -25.396],
      ]],
    },
  },
  {
    id: 'central-py',
    label: 'Depto. Central',
    shortLabel: 'CENTRAL',
    zoom: 10,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-58.150, -25.700], [-56.950, -25.700],
        [-56.950, -25.100], [-58.150, -25.100],
        [-58.150, -25.700],
      ]],
    },
  },
  {
    id: 'encarnacion',
    label: 'Encarnación',
    shortLabel: 'ENCARN.',
    zoom: 13,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-55.953, -27.420], [-55.790, -27.420],
        [-55.790, -27.278], [-55.953, -27.278],
        [-55.953, -27.420],
      ]],
    },
  },
  {
    id: 'cde',
    label: 'Ciudad del Este',
    shortLabel: 'CDE',
    zoom: 13,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-54.684, -25.572], [-54.545, -25.572],
        [-54.545, -25.468], [-54.684, -25.468],
        [-54.684, -25.572],
      ]],
    },
  },
  {
    id: 'buenos-aires',
    label: 'Buenos Aires',
    shortLabel: 'BUE.AIR',
    zoom: 11,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-58.531, -34.706], [-58.335, -34.706],
        [-58.335, -34.527], [-58.531, -34.527],
        [-58.531, -34.706],
      ]],
    },
  },
  {
    id: 'rio',
    label: 'Río de Janeiro',
    shortLabel: 'RIO',
    zoom: 11,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-43.796, -23.083], [-43.099, -23.083],
        [-43.099, -22.742], [-43.796, -22.742],
        [-43.796, -23.083],
      ]],
    },
  },
  {
    id: 'madrid',
    label: 'Madrid',
    shortLabel: 'MADRID',
    zoom: 11,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-3.848, 40.313], [-3.524, 40.313],
        [-3.524, 40.561], [-3.848, 40.561],
        [-3.848, 40.313],
      ]],
    },
  },
  {
    id: 'barcelona',
    label: 'Barcelona',
    shortLabel: 'BARNA',
    zoom: 12,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [2.052, 41.320], [2.228, 41.320],
        [2.228, 41.469], [2.052, 41.469],
        [2.052, 41.320],
      ]],
    },
  },
  {
    id: 'new-york',
    label: 'New York',
    shortLabel: 'NYC',
    zoom: 11,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-74.259, 40.477], [-73.700, 40.477],
        [-73.700, 40.917], [-74.259, 40.917],
        [-74.259, 40.477],
      ]],
    },
  },
  {
    id: 'panama',
    label: 'Panamá City',
    shortLabel: 'PANAMA',
    zoom: 12,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-79.602, 8.897], [-79.453, 8.897],
        [-79.453, 9.051], [-79.602, 9.051],
        [-79.602, 8.897],
      ]],
    },
  },
  {
    id: 'mexico-df',
    label: 'Ciudad de México',
    shortLabel: 'MEX.DF',
    zoom: 11,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-99.366, 19.183], [-98.940, 19.183],
        [-98.940, 19.592], [-99.366, 19.592],
        [-99.366, 19.183],
      ]],
    },
  },
  {
    id: 'paris',
    label: 'París',
    shortLabel: 'PARIS',
    zoom: 12,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [2.224, 48.815], [2.470, 48.815],
        [2.470, 48.902], [2.224, 48.902],
        [2.224, 48.815],
      ]],
    },
  },
  {
    id: 'heidelberg',
    label: 'Heidelberg',
    shortLabel: 'HEIDELB',
    zoom: 13,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [8.618, 49.351], [8.771, 49.351],
        [8.771, 49.460], [8.618, 49.460],
        [8.618, 49.351],
      ]],
    },
  },
  {
    id: 'berlin',
    label: 'Berlín',
    shortLabel: 'BERLIN',
    zoom: 11,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [13.088, 52.338], [13.761, 52.338],
        [13.761, 52.675], [13.088, 52.675],
        [13.088, 52.338],
      ]],
    },
  },
  {
    id: 'roma',
    label: 'Roma',
    shortLabel: 'ROMA',
    zoom: 12,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [12.352, 41.783], [12.648, 41.783],
        [12.648, 41.987], [12.352, 41.987],
        [12.352, 41.783],
      ]],
    },
  },
];

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
