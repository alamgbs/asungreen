// Metadatos de las series que produce el pipeline abierto (sin credenciales).
// Los ids que ya están en lib/indicadores.ts (temp-aire, precipitacion, dias-35c) coinciden con él.
// Los demás (temp-max-aire, anomalia-temp-aire, ndvi-modis, lst-modis) todavía NO están en el registro
// de la app: registrarlos allí para que aparezcan en el selector (ver docs/pipeline.md).
export const OPEN_METEO = {
  fuente: 'ERA5 vía Open-Meteo Historical Weather API (models=era5, malla 0,25°)',
  url: 'https://open-meteo.com/en/docs/historical-weather-api',
  licencia: 'Open-Meteo CC BY 4.0 (API gratuita solo uso no comercial). Datos ERA5 © Copernicus/ECMWF',
};
export const MODIS = {
  url: 'https://modis.ornl.gov/data/modis_webservice.html',
  licencia: 'Datos NASA LP DAAC (libres). Servicio ORNL DAAC MODIS Web Service',
};
export const BASE = { desde: 1991, hasta: 2020 }; // línea base climática para anomalías

export const CATALOGO = {
  'temp-aire':          { unidad: '°C',     agregacion: 'media', decimales: 2, ...OPEN_METEO, nota: 'Media mensual de la temperatura media diaria a 2 m.' },
  'temp-max-aire':      { unidad: '°C',     agregacion: 'media', decimales: 2, ...OPEN_METEO, nota: 'Media mensual de la máxima diaria a 2 m.' },
  'precipitacion':      { unidad: 'mm',     agregacion: 'suma',  decimales: 1, ...OPEN_METEO, nota: 'Suma mensual (mm/mes); anual = suma de 12 meses.' },
  'dias-35c':           { unidad: 'días',   agregacion: 'suma',  decimales: 0, ...OPEN_METEO, nota: 'Días con máxima diaria ≥ 35 °C.' },
  'anomalia-temp-aire': { unidad: '°C',     agregacion: 'media', decimales: 2, ...OPEN_METEO, nota: `Temperatura media menos la media del mismo mes en ${BASE.desde}–${BASE.hasta} (anual: vs. media anual ${BASE.desde}–${BASE.hasta}).` },
  'ndvi-modis': {
    unidad: 'índice', agregacion: 'media', decimales: 3, ...MODIS,
    fuente: 'MODIS MOD13Q1 v6.1 (NDVI, 250 m, compuestos de 16 días), media de los píxeles en ~2 km alrededor del centroide',
    nota: 'Mes = fecha de inicio del compuesto. Es una MUESTRA del entorno del centroide, no el promedio de la zona. Sensor distinto de Sentinel-2/Landsat: no mezclar con el indicador ndvi.',
  },
  'lst-modis': {
    unidad: '°C', agregacion: 'media', decimales: 2, ...MODIS,
    fuente: 'MODIS MOD11A2 v6.1 (LST diurna, 1 km, compuestos de 8 días; ~10:30 hora local), media de 3×3 píxeles alrededor del centroide',
    nota: 'Solo píxeles despejados (los nublados vienen como relleno y se descartan). Muestra del centroide, no promedio de la zona. Sensor distinto de Landsat: no mezclar con el indicador lst.',
  },
};
