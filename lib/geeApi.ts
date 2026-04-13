/**
 * Google Earth Engine REST API v1 client.
 * Creates a visualization map for NDVI (Sentinel-2 10m) or LST (Landsat-8 100m)
 * and returns the tile base URL. Results are cached for the browser session.
 *
 * Tile URL format: `${tileBase}/${z}/${x}/${y}?key=${GEE_API_KEY}`
 */

const GEE_V1 = 'https://earthengine.googleapis.com/v1';

/** Populated by getGeeTileUrl(). Read by MapView.transformRequest. */
export const geeTileUrlCache: Partial<Record<'ndvi' | 'soilTemp', string>> = {};

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

/**
 * Serialized EE expression: Sentinel-2 SR median NDVI composite, last 90 days.
 * Palette: neon magenta → yellow → green → dark green (low → high NDVI)
 */
function ndviExpression(start: string, end: string) {
  return {
    result: '0',
    values: {
      '0': {
        functionInvocationValue: {
          functionName: 'Image.visualize',
          arguments: {
            input:   { valueReference: '1' },
            min:     { constantValue: -0.2 },
            max:     { constantValue: 0.8 },
            palette: { constantValue: ['ff2d78', 'ffe600', '00ff88', '00a855', '004d22'] },
          },
        },
      },
      '1': {
        functionInvocationValue: {
          functionName: 'Image.normalizedDifference',
          arguments: {
            input:     { valueReference: '2' },
            bandNames: { constantValue: ['B8', 'B4'] },
          },
        },
      },
      '2': {
        functionInvocationValue: {
          functionName: 'ImageCollection.median',
          arguments: { collection: { valueReference: '3' } },
        },
      },
      '3': {
        functionInvocationValue: {
          functionName: 'Collection.filter',
          arguments: {
            collection: { valueReference: '4' },
            filter: {
              functionInvocationValue: {
                functionName: 'Filter.lt',
                arguments: {
                  name:  { constantValue: 'CLOUDY_PIXEL_PERCENTAGE' },
                  value: { constantValue: 20 },
                },
              },
            },
          },
        },
      },
      '4': {
        functionInvocationValue: {
          functionName: 'ImageCollection.filterDate',
          arguments: {
            collection: { valueReference: '5' },
            start:      { constantValue: start },
            end:        { constantValue: end },
          },
        },
      },
      '5': {
        functionInvocationValue: {
          functionName: 'ImageCollection.load',
          arguments: { id: { constantValue: 'COPERNICUS/S2_SR_HARMONIZED' } },
        },
      },
    },
  };
}

/**
 * Serialized EE expression: Landsat-8 LST (Band ST_B10 → Celsius), least cloudy
 * scene in last 180 days.
 * Palette: neon blue → cyan → yellow → orange → magenta (cold → hot)
 * Celsius = ST_B10 × 0.00341802 − 124.15
 */
function lstExpression(start: string, end: string) {
  return {
    result: '0',
    values: {
      '0': {
        functionInvocationValue: {
          functionName: 'Image.visualize',
          arguments: {
            input:   { valueReference: '1' },
            min:     { constantValue: 15 },
            max:     { constantValue: 50 },
            palette: { constantValue: ['001aff', '00e5ff', 'ffe600', 'ff7c00', 'ff2d78'] },
          },
        },
      },
      '1': {
        functionInvocationValue: {
          functionName: 'Image.add',
          arguments: {
            image1: { valueReference: '2' },
            image2: { constantValue: -124.15 },
          },
        },
      },
      '2': {
        functionInvocationValue: {
          functionName: 'Image.multiply',
          arguments: {
            image1: { valueReference: '3' },
            image2: { constantValue: 0.00341802 },
          },
        },
      },
      '3': {
        functionInvocationValue: {
          functionName: 'Image.select',
          arguments: {
            input:         { valueReference: '4' },
            bandSelectors: { constantValue: ['ST_B10'] },
          },
        },
      },
      '4': {
        functionInvocationValue: {
          functionName: 'ImageCollection.first',
          arguments: { collection: { valueReference: '5' } },
        },
      },
      '5': {
        functionInvocationValue: {
          functionName: 'ImageCollection.sort',
          arguments: {
            collection: { valueReference: '6' },
            property:   { constantValue: 'CLOUD_COVER' },
          },
        },
      },
      '6': {
        functionInvocationValue: {
          functionName: 'ImageCollection.filterDate',
          arguments: {
            collection: { valueReference: '7' },
            start:      { constantValue: start },
            end:        { constantValue: end },
          },
        },
      },
      '7': {
        functionInvocationValue: {
          functionName: 'ImageCollection.load',
          arguments: { id: { constantValue: 'LANDSAT/LC08/C02/T1_L2' } },
        },
      },
    },
  };
}

/**
 * Calls GEE REST API to create a visualization map for the given layer.
 * Returns the tile base URL (without /{z}/{x}/{y}).
 * Result is cached in geeTileUrlCache — subsequent calls return cached value.
 *
 * If this throws, the GEE API key or project is not configured correctly,
 * or the Earth Engine API is not enabled for the project.
 */
export async function getGeeTileUrl(layer: 'ndvi' | 'soilTemp'): Promise<string> {
  if (geeTileUrlCache[layer]) return geeTileUrlCache[layer]!;

  const apiKey  = process.env.NEXT_PUBLIC_GEE_API_KEY ?? '';
  const project = process.env.NEXT_PUBLIC_GEE_PROJECT ?? '';

  if (!apiKey || !project) {
    throw new Error(
      'Missing NEXT_PUBLIC_GEE_API_KEY or NEXT_PUBLIC_GEE_PROJECT in .env.local'
    );
  }

  const expression =
    layer === 'ndvi'
      ? ndviExpression(isoDate(90), isoDate(0))
      : lstExpression(isoDate(180), isoDate(0));

  const res = await fetch(
    `${GEE_V1}/projects/${project}/maps?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expression }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GEE API ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { name: string };
  // data.name = "projects/{project}/maps/{mapId}"
  const tileBase = `${GEE_V1}/${data.name}/tiles`;
  geeTileUrlCache[layer] = tileBase;
  return tileBase;
}
