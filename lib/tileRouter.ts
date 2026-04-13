// Asunción bbox (from lib/constants.ts ASUNCION_BOUNDS)
const WEST  = -57.75;
const EAST  = -57.40;
const NORTH = -25.10;  // less negative = further north
const SOUTH = -25.50;

// Maximum zoom level for which local PNG tiles are pre-downloaded
export const MAX_LOCAL_ZOOM: Record<'ndvi' | 'soilTemp', number> = {
  ndvi:     14,  // Sentinel-2 10m ≈ 8.6 m/pixel at zoom 14 for lat -25°
  soilTemp: 12,  // Landsat 100m  ≈ 34 m/pixel at zoom 12
};

// Standard Web Mercator tile coordinate formulas
function lngToTile(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, z));
}

function latToTile(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      Math.pow(2, z)
  );
}

// Pre-compute tile ranges for zoom 10-15 so we don't recalculate per tile
type TileRange = { xMin: number; xMax: number; yMin: number; yMax: number };

const RANGES: Map<number, TileRange> = new Map();
for (let z = 10; z <= 15; z++) {
  RANGES.set(z, {
    xMin: lngToTile(WEST,  z),
    xMax: lngToTile(EAST,  z),
    yMin: latToTile(NORTH, z),  // north = smaller y (tiles go top-to-bottom)
    yMax: latToTile(SOUTH, z),
  });
}

/**
 * Returns true if the tile at (z, x, y) for the given layer should be served
 * from a pre-downloaded local PNG in /public/tiles/ instead of from GEE live.
 */
export function shouldUseLocalTile(
  layer: 'ndvi' | 'soilTemp',
  z: number,
  x: number,
  y: number
): boolean {
  if (z < 10 || z > MAX_LOCAL_ZOOM[layer]) return false;
  const range = RANGES.get(z);
  if (!range) return false;
  return x >= range.xMin && x <= range.xMax && y >= range.yMin && y <= range.yMax;
}
