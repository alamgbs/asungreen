// WorldPop (CC BY 4.0): población 2020. Paraguay: 100 m "constrained" (BSGM, sólo píxeles construidos).
// Ciudades extranjeras: 1 km "Aggregated" (el servidor de WorldPop ignora Range → hay que bajar el archivo
// entero; los 100 m de EE. UU. pesan 494 MB, por eso 1 km). Descarga con caché en scripts/pipeline/.cache.
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fromFile } from 'geotiff';
import { ROOT } from '../lib/zonas.mjs';

const CACHE = join(ROOT, 'scripts', 'pipeline', '.cache', 'worldpop');
export const ISO3 = { PY: 'PRY', AR: 'ARG', BR: 'BRA', ES: 'ESP', US: 'USA', PA: 'PAN', MX: 'MEX', FR: 'FRA', DE: 'DEU', IT: 'ITA' };
export const URL_100M = (iso3) => `https://data.worldpop.org/GIS/Population/Global_2000_2020_Constrained/2020/BSGM/${iso3}/${iso3.toLowerCase()}_ppp_2020_constrained.tif`;
export const URL_1KM = (iso3) => `https://data.worldpop.org/GIS/Population/Global_2000_2020_1km/2020/${iso3}/${iso3.toLowerCase()}_ppp_2020_1km_Aggregated.tif`;

export async function descargar(url) {
  mkdirSync(CACHE, { recursive: true });
  const f = join(CACHE, url.split('/').pop());
  if (existsSync(f) && statSync(f).size > 1e5) return f;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`WorldPop ${res.status}: ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(f));
  return f;
}

/**
 * Recorre píxeles con población > 0 (centros) dentro de `bbox` ([w,s,e,n], opcional).
 * Llama a cb(lon, lat, pop). Lee por franjas de filas para no cargar 400 MB en memoria.
 */
export async function recorrerPixeles(archivo, cb, bbox) {
  const im = await (await fromFile(archivo)).getImage();
  const W = im.getWidth(), H = im.getHeight();
  const [ox, , , oy] = im.getBoundingBox();
  const [rx, ry] = im.getResolution(); // ry < 0
  const nodata = im.getGDALNoData();
  let x0 = 0, x1 = W, y0 = 0, y1 = H;
  if (bbox) {
    x0 = Math.max(0, Math.floor((bbox[0] - ox) / rx)); x1 = Math.min(W, Math.ceil((bbox[2] - ox) / rx));
    y0 = Math.max(0, Math.floor((bbox[3] - oy) / ry)); y1 = Math.min(H, Math.ceil((bbox[1] - oy) / ry));
  }
  const PASO = 200;
  for (let y = y0; y < y1; y += PASO) {
    const h = Math.min(PASO, y1 - y);
    const r = (await im.readRasters({ window: [x0, y, x1, y + h], samples: [0] }))[0];
    const w = x1 - x0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const v = r[j * w + i];
      if (v > 0 && v !== nodata) cb(ox + (x0 + i + 0.5) * rx, oy + (y + j + 0.5) * ry, v);
    }
  }
}
