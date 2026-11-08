/**
 * Registro de indicadores: ÚNICA fuente de verdad de nombre, unidad, fuente,
 * escala fija y licencia. Lo leen la UI (leyenda, modal), la API y el pipeline.
 *
 * Verificado el 2026-11-08:
 *  - IDs y rangos temporales de GEE: catálogo STAC público
 *    (storage.googleapis.com/earthengine-stac/catalog/...).
 *  - Open-Meteo archive (ERA5, malla de 0,25°): consulta real; datos desde 1940-01-01.
 * No verificado (no hay credenciales de GEE aquí): cifras de costo/latencia de GEE.
 */
import type { LayerType } from './types';

export type IndicadorId =
  | 'ndvi' | 'lst'
  | 'temp-aire' | 'temp-max-aire' | 'anomalia-temp-aire' | 'precipitacion' | 'dias-35c'
  | 'ndvi-modis' | 'lst-modis';

/** Agrupa los indicadores en el selector del panel de zona. */
export type GrupoIndicador = 'clima' | 'vegetacion' | 'superficie';

/** Cambio de sensor/fuente dentro de la serie: se marca en el eje del gráfico. */
export interface CambioSensor { t: string; etiqueta: string }

export interface IndicadorDef {
  id: IndicadorId;
  nombre: string;
  /** Texto extra para la UI (qué es y qué no es). */
  descripcion: string;
  unidad: string;
  fuente: {
    dataset: string;
    coleccion?: string;
    /** Fuentes que cubren otros períodos (p. ej. Landsat antes de Sentinel-2). */
    alternas?: { dataset: string; coleccion: string; desde: string; hasta?: string }[];
    url: string;
    escalaM: number;
  };
  resolucion: string;
  licencia: string;
  cobertura: { desde: string; hasta?: string; granularidad: Array<'diaria' | 'mensual' | 'anual'> };
  agregacion: 'media' | 'mediana' | 'suma' | 'p95' | 'razon';
  paleta: string[];
  /** Rango FIJO de la escala; igual para todas las zonas para poder compararlas. */
  rango: [number, number];
  /** Sentido de la mejora: 'alto' = más es mejor, 'bajo' = menos es mejor. */
  mejorEs: 'alto' | 'bajo' | 'neutro';
  limitaciones: string[];
  /** 'gee' = Earth Engine (necesita GEE_SA_JSON); 'openmeteo' = API abierta sin clave; 'derivado'. */
  calculo: 'gee' | 'openmeteo' | 'modis' | 'derivado';
  dependeDe?: IndicadorId[];
  /** true si el pipeline puede producirlo hoy sin credenciales de GEE. */
  ejecutableSinGee: boolean;
  /** 'activo' = ya está en la app; 'pipeline' = el pipeline lo calcula, aún sin capa en el mapa. */
  estado: 'activo' | 'pipeline' | 'planificado';
  grupo?: GrupoIndicador;
  /** Decimales para mostrar valores. */
  decimales?: number;
  /** 'anomalia': la escala es divergente alrededor de 0 (se dibuja la línea base en 0). */
  tipo?: 'valor' | 'anomalia';
  /** Marcas de cambio de sensor (AAAA-MM) verificadas en el catálogo de GEE. */
  cambiosSensor?: CambioSensor[];
  /** Id de capa de mapa (LayerType) cuando existe. */
  capa?: LayerType;
}

export const INDICADORES: Record<IndicadorId, IndicadorDef> = {
  ndvi: {
    id: 'ndvi',
    nombre: 'Vegetación (NDVI)',
    descripcion: 'Verdor de la vegetación: (NIR − Rojo) / (NIR + Rojo). No distingue especies ni salud del arbolado.',
    unidad: 'índice (−1 a 1)',
    fuente: {
      dataset: 'Sentinel-2 MSI SR Harmonized + Cloud Score+',
      coleccion: 'COPERNICUS/S2_SR_HARMONIZED',
      alternas: [
        { dataset: 'Landsat 5 C2 L2', coleccion: 'LANDSAT/LT05/C02/T1_L2', desde: '1984-03', hasta: '2012-05' },
        { dataset: 'Landsat 8 C2 L2', coleccion: 'LANDSAT/LC08/C02/T1_L2', desde: '2013-03' },
      ],
      url: 'https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED',
      escalaM: 10,
    },
    resolucion: '10 m (Sentinel-2); 30 m en la serie larga Landsat',
    licencia: 'Copernicus Sentinel data (libre, con atribución); Landsat: dominio público USGS/NASA',
    cobertura: { desde: '2017-03', granularidad: ['mensual', 'anual'] },
    agregacion: 'media',
    paleta: ['ff2d78', 'ffe600', '00ff88', '00a855', '004d22'],
    rango: [-0.2, 0.8],
    mejorEs: 'alto',
    limitaciones: [
      'Las nubes dejan huecos; se usa la mediana de escenas válidas y se guarda n_obs.',
      'Entre sensores (Landsat ↔ Sentinel-2) hay diferencias; no se mezclan sin marcarlo.',
      'Cultivos y pasto estacional cambian mucho entre estaciones.',
    ],
    calculo: 'gee',
    ejecutableSinGee: false,
    estado: 'activo',
    capa: 'ndvi',
    grupo: 'vegetacion',
    decimales: 2,
    cambiosSensor: [{ t: '2017-03', etiqueta: 'Desde aquí Sentinel-2 (antes, solo Landsat)' }],
  },

  lst: {
    id: 'lst',
    nombre: 'Temp. superficial (LST)',
    descripcion: 'Temperatura de la superficie vista desde el satélite (techos, asfalto, copas). No es la temperatura del aire.',
    unidad: '°C',
    fuente: {
      dataset: 'Landsat 8/9 Collection 2 Level-2 (banda térmica ST_B10)',
      coleccion: 'LANDSAT/LC08/C02/T1_L2',
      alternas: [
        { dataset: 'Landsat 9 C2 L2', coleccion: 'LANDSAT/LC09/C02/T1_L2', desde: '2021-10' },
        { dataset: 'Landsat 5 C2 L2 (ST_B6)', coleccion: 'LANDSAT/LT05/C02/T1_L2', desde: '1984-03', hasta: '2012-05' },
        { dataset: 'Landsat 7 C2 L2 (ST_B6)', coleccion: 'LANDSAT/LE07/C02/T1_L2', desde: '1999-05' },
      ],
      url: 'https://developers.google.com/earth-engine/datasets/catalog/LANDSAT_LC08_C02_T1_L2',
      escalaM: 30,
    },
    resolucion: '30 m (producto remuestreado desde 100 m térmicos)',
    licencia: 'Dominio público (USGS/NASA)',
    cobertura: { desde: '2013-03', granularidad: ['mensual', 'anual'] },
    agregacion: 'media',
    paleta: ['001aff', '00e5ff', 'ffe600', 'ff7c00', 'ff2d78'],
    rango: [15, 50],
    mejorEs: 'bajo',
    limitaciones: [
      'Mide la superficie, no el aire; incluye techos y asfalto.',
      'El satélite pasa cerca de las 10:00 locales: no es el pico de calor de la tarde.',
      'Landsat 5/7 (ST_B6) y 8/9 (ST_B10) tienen sensores distintos: marcar el cambio en series largas.',
      'Las nubes dejan huecos mensuales.',
    ],
    calculo: 'gee',
    ejecutableSinGee: false,
    estado: 'activo',
    capa: 'soilTemp', // id interno histórico de la capa
    grupo: 'superficie',
    decimales: 1,
    cambiosSensor: [{ t: '2021-10', etiqueta: 'Se suma Landsat 9' }],
  },

  'temp-aire': {
    id: 'temp-aire',
    nombre: 'Temperatura del aire (ERA5)',
    descripcion: 'Temperatura del aire a 2 m, media mensual, del reanálisis ERA5. Es un valor de malla, no una estación.',
    unidad: '°C',
    fuente: {
      dataset: 'ERA5 (reanálisis ECMWF/Copernicus) vía Open-Meteo Historical Weather API',
      coleccion: 'temperature_2m_mean (models=era5)',
      url: 'https://open-meteo.com/en/docs/historical-weather-api',
      escalaM: 25000,
    },
    resolucion: 'Malla de 0,25° (~25 km); las zonas pequeñas comparten celda',
    licencia: 'Open-Meteo: CC BY 4.0 con atribución; API gratuita solo para uso no comercial. Datos ERA5 © Copernicus/ECMWF',
    cobertura: { desde: '1940-01', granularidad: ['diaria', 'mensual', 'anual'] },
    agregacion: 'media',
    paleta: ['001aff', '00e5ff', 'ffe600', 'ff7c00', 'ff2d78'],
    rango: [8, 34],
    mejorEs: 'bajo',
    limitaciones: [
      'Resolución gruesa (~25 km): no ve diferencias entre barrios; sirve para tendencia regional.',
      'Es reanálisis (modelo + observaciones), no una medición de estación.',
      'Para zonas menores a una celda el valor es el de la celda más cercana al centroide.',
    ],
    calculo: 'openmeteo',
    ejecutableSinGee: true,
    estado: 'pipeline',
    grupo: 'clima',
    decimales: 1,
  },

  precipitacion: {
    id: 'precipitacion',
    nombre: 'Precipitación (ERA5)',
    descripcion: 'Lluvia acumulada del mes según el reanálisis ERA5.',
    unidad: 'mm/mes',
    fuente: {
      dataset: 'ERA5 vía Open-Meteo Historical Weather API',
      coleccion: 'precipitation_sum (models=era5)',
      url: 'https://open-meteo.com/en/docs/historical-weather-api',
      escalaM: 25000,
    },
    resolucion: 'Malla de 0,25° (~25 km)',
    licencia: 'Open-Meteo: CC BY 4.0 con atribución; uso no comercial. Datos ERA5 © Copernicus/ECMWF',
    cobertura: { desde: '1940-01', granularidad: ['diaria', 'mensual', 'anual'] },
    agregacion: 'suma',
    paleta: ['f7fbff', '9ecae1', '4292c6', '08519c', '08306b'],
    rango: [0, 400],
    mejorEs: 'neutro',
    limitaciones: [
      'La lluvia es muy local (tormentas): un reanálisis de 25 km suaviza los extremos.',
      'No sustituye datos de pluviómetros (DMH).',
    ],
    calculo: 'openmeteo',
    ejecutableSinGee: true,
    estado: 'pipeline',
    grupo: 'clima',
    decimales: 0,
  },

  'dias-35c': {
    id: 'dias-35c',
    nombre: 'Días con máxima ≥ 35 °C (ERA5)',
    descripcion: 'Cantidad de días del mes en que la temperatura máxima diaria del aire llegó a 35 °C o más.',
    unidad: 'días/mes',
    fuente: {
      dataset: 'ERA5 vía Open-Meteo Historical Weather API',
      coleccion: 'temperature_2m_max (models=era5), umbral ≥ 35 °C',
      url: 'https://open-meteo.com/en/docs/historical-weather-api',
      escalaM: 25000,
    },
    resolucion: 'Malla de 0,25° (~25 km)',
    licencia: 'Open-Meteo: CC BY 4.0 con atribución; uso no comercial. Datos ERA5 © Copernicus/ECMWF',
    cobertura: { desde: '1940-01', granularidad: ['mensual', 'anual'] },
    agregacion: 'suma',
    paleta: ['ffe600', 'ff7c00', 'ff2d78', 'bf5fff'],
    rango: [0, 31],
    mejorEs: 'bajo',
    limitaciones: [
      'El umbral de 35 °C es una convención; la percepción de calor depende también de la humedad.',
      'ERA5 puede subestimar máximas en zonas urbanas por su resolución de 25 km.',
      'El rango [0, 31] es mensual; para sumas anuales usar un rango propio.',
    ],
    calculo: 'openmeteo',
    ejecutableSinGee: true,
    estado: 'pipeline',
    grupo: 'clima',
    decimales: 0,
  },

  'temp-max-aire': {
    id: 'temp-max-aire',
    nombre: 'Temperatura máxima del aire (ERA5)',
    descripcion: 'Media mensual de la temperatura máxima diaria del aire a 2 m (reanálisis ERA5). Valor de malla, no una estación.',
    unidad: '°C',
    fuente: {
      dataset: 'ERA5 vía Open-Meteo Historical Weather API',
      coleccion: 'temperature_2m_max (models=era5)',
      url: 'https://open-meteo.com/en/docs/historical-weather-api',
      escalaM: 25000,
    },
    resolucion: 'Malla de 0,25° (~25 km); las zonas pequeñas comparten celda',
    licencia: 'Open-Meteo: CC BY 4.0 con atribución; API gratuita solo para uso no comercial. Datos ERA5 © Copernicus/ECMWF',
    cobertura: { desde: '1940-01', granularidad: ['mensual', 'anual'] },
    agregacion: 'media',
    paleta: ['001aff', '00e5ff', 'ffe600', 'ff7c00', 'ff2d78'],
    rango: [14, 42],
    mejorEs: 'bajo',
    limitaciones: [
      'Resolución gruesa (~25 km): no distingue barrios y subestima extremos urbanos.',
      'Es reanálisis (modelo + observaciones), no una medición de estación.',
      'Un mes con menos del 90 % de sus días queda sin dato (el mes en curso siempre).',
    ],
    calculo: 'openmeteo',
    ejecutableSinGee: true,
    estado: 'pipeline',
    grupo: 'clima',
    decimales: 1,
  },

  'anomalia-temp-aire': {
    id: 'anomalia-temp-aire',
    nombre: 'Anomalía de temperatura del aire (ERA5)',
    descripcion: 'Diferencia entre la temperatura media del mes y la media del mismo mes en 1991–2020 (anual: contra la media anual de 1991–2020).',
    unidad: '°C',
    fuente: {
      dataset: 'ERA5 vía Open-Meteo Historical Weather API',
      coleccion: 'temperature_2m_mean (models=era5), línea base 1991–2020',
      url: 'https://open-meteo.com/en/docs/historical-weather-api',
      escalaM: 25000,
    },
    resolucion: 'Malla de 0,25° (~25 km)',
    licencia: 'Open-Meteo: CC BY 4.0 con atribución; API gratuita solo para uso no comercial. Datos ERA5 © Copernicus/ECMWF',
    cobertura: { desde: '1991-01', granularidad: ['mensual', 'anual'] },
    agregacion: 'media',
    paleta: ['2166ac', 'f7f7f7', 'b2182b'],
    rango: [-5, 5],
    mejorEs: 'bajo',
    limitaciones: [
      'La línea base es 1991–2020: es una referencia reciente, no el clima preindustrial.',
      'Con base 1991–2020 los años recientes tienden a salir positivos por la tendencia de largo plazo.',
      'Resolución de ~25 km.',
    ],
    calculo: 'openmeteo',
    ejecutableSinGee: true,
    estado: 'pipeline',
    grupo: 'clima',
    decimales: 2,
    tipo: 'anomalia',
  },

  'ndvi-modis': {
    id: 'ndvi-modis',
    nombre: 'Vegetación (NDVI MODIS)',
    descripcion: 'NDVI de MODIS (compuestos de 16 días) en una muestra de unos 2 km alrededor del centroide de la zona. No es el promedio de la zona.',
    unidad: 'índice (−1 a 1)',
    fuente: {
      dataset: 'MODIS MOD13Q1 v6.1 (NDVI, 250 m, compuestos de 16 días) vía ORNL DAAC MODIS Web Service',
      coleccion: 'MOD13Q1 · 250m_16_days_NDVI',
      url: 'https://modis.ornl.gov/data/modis_webservice.html',
      escalaM: 250,
    },
    resolucion: '250 m; media de los píxeles en ~2 km alrededor del centroide',
    licencia: 'Datos NASA LP DAAC (libres). Servicio ORNL DAAC MODIS Web Service',
    cobertura: { desde: '2000-02', granularidad: ['mensual', 'anual'] },
    agregacion: 'media',
    paleta: ['ff2d78', 'ffe600', '00ff88', '00a855', '004d22'],
    rango: [0, 1],
    mejorEs: 'alto',
    limitaciones: [
      'Es una muestra del entorno del centroide, no el promedio de la zona.',
      'Sensor distinto de Sentinel-2/Landsat: no se mezcla con el indicador NDVI de 10 m.',
      'El mes de un compuesto es el de su fecha de inicio.',
      'Sin banda de calidad en este pipeline: se confía en el algoritmo de compuesto.',
    ],
    calculo: 'modis',
    ejecutableSinGee: true,
    estado: 'pipeline',
    grupo: 'vegetacion',
    decimales: 2,
  },

  'lst-modis': {
    id: 'lst-modis',
    nombre: 'Temp. superficial (LST MODIS)',
    descripcion: 'Temperatura de la superficie diurna de MODIS (~10:30 locales) en una muestra de 3×3 píxeles alrededor del centroide. No es la temperatura del aire.',
    unidad: '°C',
    fuente: {
      dataset: 'MODIS MOD11A2 v6.1 (LST diurna, 1 km, compuestos de 8 días) vía ORNL DAAC MODIS Web Service',
      coleccion: 'MOD11A2 · LST_Day_1km',
      url: 'https://modis.ornl.gov/data/modis_webservice.html',
      escalaM: 1000,
    },
    resolucion: '1 km; media de 3×3 píxeles alrededor del centroide',
    licencia: 'Datos NASA LP DAAC (libres). Servicio ORNL DAAC MODIS Web Service',
    cobertura: { desde: '2000-02', granularidad: ['mensual', 'anual'] },
    agregacion: 'media',
    paleta: ['001aff', '00e5ff', 'ffe600', 'ff7c00', 'ff2d78'],
    rango: [10, 45],
    mejorEs: 'bajo',
    limitaciones: [
      'Mide la superficie (incluye techos y asfalto), no el aire.',
      'Solo píxeles despejados: los nublados se descartan y pueden dejar meses sin dato.',
      'Es una muestra del centroide, no el promedio de la zona; 1 km no ve diferencias entre barrios.',
      'Sensor distinto de Landsat: no se mezcla con el indicador LST de 30 m.',
    ],
    calculo: 'modis',
    ejecutableSinGee: true,
    estado: 'pipeline',
    grupo: 'superficie',
    decimales: 1,
  },
};
export const INDICADOR_IDS = Object.keys(INDICADORES) as IndicadorId[];

export const esIndicadorId = (x: string): x is IndicadorId => x in INDICADORES;

export const GRUPO_LABEL: Record<GrupoIndicador, string> = {
  clima: 'Clima (ERA5)', vegetacion: 'Vegetación', superficie: 'Superficie',
};

/** Indicador asociado a un id de capa del mapa ('soilTemp' → 'lst'). */
export function indicadorDeCapa(capa: LayerType): IndicadorDef | undefined {
  return INDICADOR_IDS.map((i) => INDICADORES[i]).find((d) => d.capa === capa);
}

/** Rango fijo en el formato histórico { min, max } que usa /api/gee-map. */
export function rangoMinMax(id: IndicadorId): { min: number; max: number } {
  const [min, max] = INDICADORES[id].rango;
  return { min, max };
}
