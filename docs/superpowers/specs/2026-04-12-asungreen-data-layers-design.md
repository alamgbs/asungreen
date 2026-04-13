# AsunGreen — Sub-proyecto 2: Capas de Datos Reales
**Fecha:** 2026-04-12
**Estado:** Aprobado
**Scope:** GEE tiles máxima resolución + pre-cache Asunción + red vial OSM + fixes

---

## Visión

Reemplazar las capas de datos simuladas/baja-resolución por fuentes reales de máxima calidad:
- NDVI: NASA MODIS 250m → **Sentinel-2 SR 10m** vía Google Earth Engine
- LST: NASA MODIS 1km → **Landsat-8/9 100m** vía Google Earth Engine
- Tráfico: corredores hardcodeados → **red vial real OSM** (Overpass API)

La zona de Asunción (bbox fijo) se sirve desde tiles PNG pre-descargados en `/public/`. El resto del mundo carga tiles live desde GEE. El routing es transparente para MapLibre vía `transformRequest`.

---

## Bugs incluidos en este sub-proyecto

### Bug 1 — NDVI/soilTemp siempre invisibles
**Causa:** `mapReadyRef` es un `useRef`, no un `useState`. Cuando el mapa dispara el evento `load` y setea `mapReadyRef.current = true`, React no re-renderiza, por lo que el `useEffect` que sincroniza opacidades (que depende de `activeLayers`) nunca corre con `mapReadyRef.current === true`. Las capas quedan en `raster-opacity: 0` para siempre.

**Fix:** Aplicar las opacidades iniciales directamente dentro del handler `map.on('load', ...)`, en vez de depender del effect externo.

### Bug 2 — Partículas de tráfico no escalan con zoom
**Causa:** `ScatterplotLayer` usa `radiusUnits: 'meters'`, que mantiene el tamaño físico real pero no el tamaño visual. A zoom 12 las partículas se ven razonables, pero a zoom 8 son invisibles y a zoom 16 son gigantes.

**Fix:** Cambiar a `radiusUnits: 'pixels'` con un radio fijo de 4px, independiente del zoom. El color ya encode la densidad del tráfico.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│  Build time (scripts, corren una vez)                           │
│                                                                 │
│  scripts/generate-tiles.mjs                                     │
│    └── GEE REST API → PNG tiles → public/tiles/{layer}/{z}/{x}/{y}.png │
│                                                                 │
│  scripts/fetch-osm-roads.mjs                                    │
│    └── Overpass API → GeoJSON → public/data/asuncion-roads.geojson │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Runtime (browser)                                              │
│                                                                 │
│  MapView.transformRequest                                       │
│    ├── tile en Asunción bbox + zoom ≤ maxLocal?                 │
│    │     → /tiles/{layer}/{z}/{x}/{y}.png   (local, instantáneo)│
│    └── fuera de Asunción o zoom mayor?                          │
│          → GEE tile URL live (lib/geeApi.ts)                    │
│                                                                 │
│  trafficSim                                                     │
│    └── fetch /data/asuncion-roads.geojson → corredores reales   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Archivos

| Acción | Archivo | Responsabilidad |
|--------|---------|-----------------|
| Crear | `lib/geeApi.ts` | GEE REST API client: obtiene tile URL por capa, cachea en módulo |
| Crear | `lib/tileRouter.ts` | Lógica bbox: z/x/y en Asunción → local, sino → GEE |
| Crear | `scripts/generate-tiles.mjs` | Descarga PNG tiles de GEE para Asunción, guarda en `/public/tiles/` |
| Crear | `scripts/fetch-osm-roads.mjs` | Descarga red vial OSM de Overpass, guarda en `/public/data/` |
| Modificar | `lib/trafficSim.ts` | Carga corredores desde GeoJSON, `radiusUnits: 'pixels'`, fix zoom |
| Modificar | `components/MapView.tsx` | `transformRequest`, fuentes GEE, fix opacidad en `load` handler |
| Modificar | `lib/constants.ts` | Eliminar `TRAFFIC_CORRIDORS` hardcodeados |
| Modificar | `lib/types.ts` | Agregar `OsmRoad`, actualizar `TrafficParticle` si es necesario |

---

## Spec detallado por componente

### `lib/geeApi.ts`

Obtiene una tile URL template de GEE para NDVI o LST. Se llama una vez por capa por sesión de browser. La tile URL resultante tiene el formato:
```
https://earthengine.googleapis.com/v1/projects/{project}/maps/{mapId}/tiles/{z}/{x}/{y}
```

**Autenticación:** API key via query param `?key={NEXT_PUBLIC_GEE_API_KEY}`.

**Expresión NDVI (Sentinel-2 SR, 10m):**
```
ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterDate(90 días atrás, hoy)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
  .median()
  .normalizedDifference(['B8', 'B4'])
  .visualize({ min: -0.2, max: 0.8, palette: ['#ff2d78','#ffe600','#00ff88','#00a855','#004d22'] })
```

**Expresión LST (Landsat-8/9, 100m):**
```
ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .merge(ImageCollection('LANDSAT/LC09/C02/T1_L2'))
  .filterDate(180 días atrás, hoy)
  .sort('CLOUD_COVER')
  .first()
  .select('ST_B10')
  .multiply(0.00341802).add(149.0).subtract(273.15)  // → Celsius
  .visualize({ min: 15, max: 50, palette: ['#001aff','#00e5ff','#ffe600','#ff7c00','#ff2d78'] })
```

**Interface:**
```typescript
export async function getGeeTileUrl(layer: 'ndvi' | 'soilTemp'): Promise<string>
```

Cache: variable de módulo `const tileUrlCache: Partial<Record<...>> = {}`. Si ya tiene el URL, lo devuelve sin llamar GEE.

---

### `lib/tileRouter.ts`

Determina si un tile z/x/y debe servirse local o desde GEE.

**Constantes pre-calculadas (no recalculadas por tile):**
```typescript
const ASU_BOUNDS = { west: -57.75, east: -57.40, south: -25.50, north: -25.10 };
const MAX_LOCAL_ZOOM = { ndvi: 15, soilTemp: 14 };

// Para cada zoom 10-15, pre-computar xMin, xMax, yMin, yMax
// usando: x = floor((lng + 180) / 360 * 2^z)
//         y = floor((1 - ln(tan(lat*π/180) + sec(lat*π/180)) / π) / 2 * 2^z)
```

**Export:**
```typescript
export function shouldUseLocalTile(
  layer: 'ndvi' | 'soilTemp',
  z: number, x: number, y: number
): boolean
```

---

### `scripts/generate-tiles.mjs`

Corre con `node scripts/generate-tiles.mjs`. Requiere `NEXT_PUBLIC_GEE_API_KEY` y `NEXT_PUBLIC_GEE_PROJECT` en `.env.local`.

**Proceso:**
1. Lee `.env.local` para obtener `GEE_API_KEY` y `GEE_PROJECT`
2. Llama GEE REST API para obtener tile URLs de `ndvi` y `soilTemp`
3. Para cada capa, calcula todos los z/x/y tiles del bbox de Asunción:
   - NDVI: zoom 10–15 (~350 tiles)
   - soilTemp: zoom 10–14 (~87 tiles)
4. Descarga cada PNG con fetch, concurrencia máxima 5 requests paralelos
5. Guarda en `public/tiles/{layer}/{z}/{x}/{y}.png`, creando directorios si no existen
6. Imprime progreso y resumen final

**Manejo de errores:** Si un tile devuelve 4xx/5xx, lo loguea como warning y continúa. El tile simplemente no existirá localmente y se servirá desde GEE en runtime.

---

### `scripts/fetch-osm-roads.mjs`

Corre con `node scripts/fetch-osm-roads.mjs`.

**Query Overpass:**
```
[out:json][timeout:30];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential)$"]
  (-25.50,-57.75,-25.10,-57.40);
out geom;
```

**Conversión:** Cada `way` de OSM tiene `.geometry` (array de `{lat, lon}`). El script convierte a `[lng, lat][]` (GeoJSON order). Filtra ways con menos de 2 nodos.

**Output:** `public/data/asuncion-roads.geojson` con formato:
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "highway": "primary", "name": "Av. Mariscal López" },
      "geometry": { "type": "LineString", "coordinates": [[-57.562, -25.242], ...] }
    }
  ]
}
```

---

### `lib/trafficSim.ts` (modificado)

**Cambios:**
1. `TRAFFIC_CORRIDORS` se carga desde el GeoJSON en vez de ser hardcodeado
2. Nueva función `loadCorridors(): Promise<[number,number][][]>` — fetch `/data/asuncion-roads.geojson`, extrae coordinates de cada LineString
3. `initParticles(corridors: [number,number][][])` — recibe los corredores como parámetro (no hardcodeados)
4. `particleRadius()` — eliminado. El radio se define en MapView como constante 4px

**`lib/constants.ts`:** Eliminar `TRAFFIC_CORRIDORS`. Mantener `TRAFFIC_BY_HOUR`.

---

### `components/MapView.tsx` (modificado)

**Cambios:**

1. **Fix opacidad en `load` handler** (Bug 1):
```typescript
map.on('load', async () => {
  applyNeonTheme(map);
  // ... agregar sources y layers ...

  // Aplicar opacidades iniciales directamente (fix: no depender de mapReadyRef)
  map.setPaintProperty('soil-temp-layer', 'raster-opacity',
    activeLayers.soilTemp ? 0.75 : 0);
  map.setPaintProperty('ndvi-layer', 'raster-opacity',
    activeLayers.ndvi ? 0.78 : 0);

  mapRef.current = map;
  mapReadyRef.current = true;
});
```

2. **`transformRequest`** — añadido al constructor de Map:
```typescript
transformRequest: (url) => {
  if (!url.startsWith('env-tile://')) return undefined;
  // 'env-tile://ndvi/12/1234/5678' → strip prefix → ['ndvi','12','1234','5678']
  const [layer, z, x, y] = url.replace('env-tile://', '').split('/');
  const zi = +z, xi = +x, yi = +y;
  if (shouldUseLocalTile(layer as LayerType, zi, xi, yi)) {
    return { url: `/tiles/${layer}/${zi}/${xi}/${yi}.png` };
  }
  const geeUrl = geeTileUrlCache[layer as 'ndvi' | 'soilTemp'];
  if (!geeUrl) return undefined;
  return { url: `${geeUrl}/${zi}/${xi}/${yi}` };
}
```

3. **Fuentes MapLibre** usan el nuevo esquema de URL:
```typescript
map.addSource('soil-temp-source', {
  type: 'raster',
  tiles: ['env-tile://soilTemp/{z}/{x}/{y}'],
  tileSize: 256,
  minzoom: 0, maxzoom: 18,
  attribution: 'Landsat-8/9 via Google Earth Engine',
});
// ídem para ndvi-source
```

4. **GEE tile URLs** — `geeTileUrlCache` es una variable de módulo en `lib/geeApi.ts` (`export const geeTileUrlCache: Partial<Record<'ndvi'|'soilTemp', string>> = {}`). Tanto `transformRequest` como el `useEffect` la leen/escriben directamente. Se inicializan al montar el componente:
```typescript
useEffect(() => {
  Promise.all([
    getGeeTileUrl('ndvi'),
    getGeeTileUrl('soilTemp'),
  ]).then(([ndviUrl, lstUrl]) => {
    geeTileUrlCache.ndvi = ndviUrl;
    geeTileUrlCache.soilTemp = lstUrl;
    // Forzar re-render de tiles si el mapa ya está listo
    if (mapRef.current && mapReadyRef.current) {
      mapRef.current.getSource('ndvi-source')?.setTiles(
        ['env-tile://ndvi/{z}/{x}/{y}']
      );
    }
  });
}, []);
```

5. **Fix partículas zoom** (Bug 2) en `animateTraffic`:
```typescript
new ScatterplotLayer({
  ...
  getRadius: 4,
  radiusUnits: 'pixels',   // ← cambiado de 'meters'
  ...
})
```

6. **OSM roads** se cargan al montar:
```typescript
useEffect(() => {
  loadCorridors().then((corridors) => {
    particlesRef.current = initParticles(corridors);
  });
}, []);
```

---

## Variables de entorno requeridas

En `.env.local`:
```
NEXT_PUBLIC_GEE_API_KEY=...      # ya existe
NEXT_PUBLIC_GEE_PROJECT=...      # Google Cloud project ID con EE habilitado
```

Los scripts de generación leen estas variables vía `dotenv`.

---

## Criterios de éxito

- [ ] `node scripts/fetch-osm-roads.mjs` genera `public/data/asuncion-roads.geojson` con calles reales
- [ ] `node scripts/generate-tiles.mjs` descarga tiles PNG para Asunción de GEE
- [ ] NDVI layer visible al activar (neon green/purple gradient sobre Asunción)
- [ ] soilTemp layer visible al activar (gradient azul→magenta sobre Asunción)
- [ ] Tiles dentro de Asunción se sirven desde `/public/tiles/` (verificable en Network tab: URL local)
- [ ] Al hacer zoom/pan fuera de Asunción, tiles se cargan desde GEE
- [ ] Partículas de tráfico mantienen tamaño visual constante en todos los zooms
- [ ] Corredores de tráfico siguen calles reales de Asunción (verificable visualmente)
- [ ] Sin errores en consola relacionados a capas de datos
