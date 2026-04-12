import type maplibregl from 'maplibre-gl';

/**
 * Patches an OpenFreeMap dark style to use AsunGreen neon terminal palette.
 * Uses source-layer names from the OpenMapTiles spec (stable across style versions).
 */
export function applyNeonTheme(map: maplibregl.Map): void {
  const { layers } = map.getStyle();

  layers.forEach((layer) => {
    try {
      const sourceLayer = (layer as Record<string, unknown>)['source-layer'] as string | undefined ?? '';
      const id = layer.id;

      if (layer.type === 'background') {
        map.setPaintProperty(id, 'background-color', '#030804');
        return;
      }

      if (layer.type === 'fill') {
        if (sourceLayer === 'water') {
          map.setPaintProperty(id, 'fill-color', '#001820');
          map.setPaintProperty(id, 'fill-opacity', 0.95);
        } else if (sourceLayer === 'building') {
          map.setPaintProperty(id, 'fill-color', '#0a0f0a');
          map.setPaintProperty(id, 'fill-outline-color', '#152e1a');
          map.setPaintProperty(id, 'fill-opacity', 1);
        } else if (sourceLayer === 'park' || sourceLayer === 'landuse') {
          map.setPaintProperty(id, 'fill-color', '#040d05');
          map.setPaintProperty(id, 'fill-opacity', 0.85);
        } else {
          map.setPaintProperty(id, 'fill-color', '#030804');
        }
        return;
      }

      if (layer.type === 'line') {
        if (sourceLayer === 'waterway' || sourceLayer === 'water') {
          map.setPaintProperty(id, 'line-color', '#00e5ff');
          map.setPaintProperty(id, 'line-opacity', 0.5);
        } else if (sourceLayer === 'transportation') {
          const isMajor =
            id.includes('primary') || id.includes('secondary') ||
            id.includes('motorway') || id.includes('trunk') ||
            id.includes('major') || id.includes('highway');
          map.setPaintProperty(id, 'line-color', '#00ff88');
          map.setPaintProperty(id, 'line-opacity', isMajor ? 0.75 : 0.18);
        } else if (sourceLayer === 'boundary') {
          map.setPaintProperty(id, 'line-color', '#0d2b12');
          map.setPaintProperty(id, 'line-opacity', 0.6);
        } else {
          map.setPaintProperty(id, 'line-opacity', 0.1);
        }
        return;
      }

      if (layer.type === 'symbol') {
        map.setPaintProperty(id, 'text-color', '#2d5c35');
        map.setPaintProperty(id, 'text-halo-color', '#030804');
        map.setPaintProperty(id, 'text-halo-width', 1);
        if (sourceLayer === 'place') {
          map.setPaintProperty(id, 'text-color', '#a8ffb0');
        }
      }
    } catch {
      // Skip read-only or incompatible layers
    }
  });
}
