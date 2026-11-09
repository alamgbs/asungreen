// Estadística zonal por lotes: una expresión value:compute por (indicador, mes, lote de zonas) que
// devuelve una lista de reduceRegion (media + conteo de píxeles válidos), a escala 100 m (30 m ciudades).
// Se usa geometría inline simplificada (public/zonas/*.geojson) en lotes pequeños; la alternativa con
// asset de FeatureCollection + Image.reduceRegions + Export (plan 1.5) queda como mejora: ver docs/pipeline.md.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../lib/zonas.mjs';
import { arr, c, inv } from './composites.mjs';
import { compute } from './gee.mjs';

/** Mapa zonaId → geometría GeoJSON, leído de public/zonas/*.geojson (propiedad id | zona | feature.id). */
export function cargarGeometrias() {
  const dir = join(ROOT, 'public', 'zonas');
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.geojson'))) {
    const gj = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    for (const ft of gj.features ?? []) {
      const id = ft.properties?.id ?? ft.properties?.zona ?? ft.id;
      if (id && ft.geometry) out.set(String(id), ft.geometry);
    }
  }
  return out;
}

const REDUCTOR = inv('Reducer.combine', {
  reducer1: inv('Reducer.mean', {}), reducer2: inv('Reducer.count', {}), outputPrefix: c(''), sharedInputs: c(true),
});

/**
 * Devuelve Map(zonaId → { media, pixeles, obs }) para un composite y un lote de [{id, geometry, escala}].
 * Las claves del diccionario de GEE se buscan por sufijo (`_mean`, `_count`) porque el prefijo
 * depende de la banda; no se asume el nombre exacto.
 */
export async function estadisticasLote(sa, comp, lote) {
  const values = { ...comp.values };
  const nodos = lote.map((z) => inv('Image.reduceRegion', {
    input: comp.image, reducer: REDUCTOR, geometry: { functionInvocationValue: { functionName: z.geometry.type === 'MultiPolygon' ? 'GeometryConstructors.MultiPolygon' : 'GeometryConstructors.Polygon', arguments: { coordinates: { constantValue: z.geometry.coordinates }, geodesic: { constantValue: false } } } },
    scale: c(z.escala), bestEffort: c(true), maxPixels: c(1e9),
  }));
  values.result = arr(nodos);
  const { json } = await compute(sa, { result: 'result', values });
  const lista = json?.values?.[json.result]?.arrayValue?.values;
  if (!lista || lista.length !== lote.length) throw new Error('value:compute: respuesta de lote inesperada');
  const out = new Map();
  lote.forEach((z, i) => {
    const d = lista[i]?.dictionaryValue?.values ?? {};
    const pick = (re) => Object.entries(d).find(([k]) => re.test(k))?.[1]?.constantValue;
    const media = pick(new RegExp(`^${comp.banda}_mean$`));
    const pixeles = pick(new RegExp(`^${comp.banda}_count$`));
    const obs = pick(new RegExp(`^${comp.bandaN}_mean$`));
    out.set(z.id, {
      media: typeof media === 'number' ? media : null,
      pixeles: typeof pixeles === 'number' ? pixeles : 0,
      obs: typeof obs === 'number' ? Math.round(obs * 10) / 10 : 0,
    });
  });
  return out;
}
