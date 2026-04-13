/**
 * Tile routing: always use GEE live tiles (no local tile cache).
 * Kept for future use — returns false unconditionally.
 */
export function shouldUseLocalTile(
  _layer: 'ndvi' | 'soilTemp',
  _z: number,
  _x: number,
  _y: number,
): boolean {
  return false;
}
