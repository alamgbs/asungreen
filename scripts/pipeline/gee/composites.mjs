// Composites mensuales (mediana) con máscara de nubes POR PÍXEL, como expresiones de la REST API.
// MANTENER SINCRONIZADO con app/api/gee-map/route.ts (buildComposite): misma máscara y misma conversión,
// para que el mapa en vivo y las series precalculadas sean el mismo cálculo. Allí se verificó por
// probe que las funciones existan; aquí NO hay fallback sin máscara: si GEE rechaza la expresión,
// el pipeline falla en voz alta (mezclar series con y sin máscara rompería la comparabilidad).
//
// NDVI : Sentinel-2 SR Harmonized + Cloud Score+ (cs_cdf ≥ 0.6), desde 2017-03. Banda de salida 'nd_median'.
// LST  : Landsat 8+9 C2 L2, ST_B10 → °C, máscara QA_PIXEL (bits 1-4 = 30), desde 2013-04. Banda 'ST_B10_median'.
// Cada composite añade una banda de nº de observaciones válidas por píxel (…_count) → n_obs.

export const c = (v) => ({ constantValue: v });
export const inv = (functionName, args) => ({ functionInvocationValue: { functionName, arguments: args } });
export const arr = (values) => ({ arrayValue: { values } });
const imgConst = (v) => inv('Image.constant', { value: c(v) });
const lt = (field, v) => inv('Filter.lt', { leftField: c(field), rightValue: c(v) });
const filtrar = (collection, filter) => inv('Collection.filter', { collection, filter });

/** Collection.map(img => cuerpo(img)); el cuerpo se guarda como valor con nombre en `values`. */
function mapear(values, nombre, collection, cuerpo) {
  values[nombre] = cuerpo({ argumentReference: `${nombre}_arg` });
  return inv('Collection.map', {
    collection,
    baseAlgorithm: { functionDefinitionValue: { argumentNames: [`${nombre}_arg`], body: nombre } },
  });
}

export const INICIO = { ndvi: '2017-03', lst: '2013-04' };

function filtroMes(y, m) {
  const t0 = Date.UTC(y, m - 1, 1), t1 = Date.UTC(y, m, 1);
  return inv('Filter.and', { filters: arr([
    inv('Filter.gte', { leftField: c('system:time_start'), rightValue: c(t0) }),
    inv('Filter.lt',  { leftField: c('system:time_start'), rightValue: c(t1) }),
  ]) });
}

/** Devuelve { image, values, banda, bandaN }: imagen de 2 bandas [valor, nº obs] y los valores con nombre. */
export function compositeMes(indicador, y, m) {
  const values = {};
  const fecha = filtroMes(y, m);
  let coleccion, banda, bandaN;
  if (indicador === 'ndvi') {
    let col = filtrar(filtrar(inv('ImageCollection.load', { id: c('COPERNICUS/S2_SR_HARMONIZED') }), fecha), lt('CLOUDY_PIXEL_PERCENTAGE', 70));
    col = inv('ImageCollection.linkCollection', {
      input: col, imageCollection: inv('ImageCollection.load', { id: c('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED') }),
      linkedBands: c(['cs_cdf']),
    });
    coleccion = mapear(values, 'ndviMask', col, (img) => inv('Image.normalizedDifference', {
      input: inv('Image.updateMask', { image: img, mask: inv('Image.gte', {
        image1: inv('Image.select', { input: img, bandSelectors: c(['cs_cdf']) }), image2: imgConst(0.6) }) }),
      bandNames: c(['B8', 'B4']),
    }));
    banda = 'nd_median'; bandaN = 'nd_count';
  } else if (indicador === 'lst') {
    const col = filtrar(filtrar(inv('ImageCollection.merge', {
      collection1: inv('ImageCollection.load', { id: c('LANDSAT/LC08/C02/T1_L2') }),
      collection2: inv('ImageCollection.load', { id: c('LANDSAT/LC09/C02/T1_L2') }),
    }), fecha), lt('CLOUD_COVER', 60));
    coleccion = mapear(values, 'lstMask', col, (img) => inv('Image.updateMask', {
      image: inv('Image.select', { input: img, bandSelectors: c(['ST_B10']) }),
      mask: inv('Image.eq', { image1: inv('Image.bitwiseAnd', {
        image1: inv('Image.select', { input: img, bandSelectors: c(['QA_PIXEL']) }), image2: imgConst(30) }), image2: imgConst(0) }),
    }));
    banda = 'ST_B10_median'; bandaN = 'ST_B10_count';
  } else throw new Error(`indicador GEE desconocido: ${indicador}`);

  const mediana = inv('ImageCollection.reduce', { collection: coleccion, reducer: inv('Reducer.median', {}) });
  const cuenta  = inv('ImageCollection.reduce', { collection: coleccion, reducer: inv('Reducer.count', {}) });
  let valor = mediana;
  if (indicador === 'lst') { // DN→°C (escala 0.00341802, offset 149 K); lineal, conmuta con la mediana
    valor = inv('Image.subtract', {
      image1: inv('Image.add', { image1: inv('Image.multiply', { image1: mediana, image2: imgConst(0.00341802) }), image2: imgConst(149.0) }),
      image2: imgConst(273.15) });
  }
  return { image: inv('Image.addBands', { dstImg: valor, srcImg: cuenta }), values, banda, bandaN };
}
