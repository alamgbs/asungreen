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

// ── Fase 3 (capas sociales) ────────────────────────────────────────────
const WP = { fuente: 'WorldPop 2020 (Paraguay: 100 m constrained/BSGM; ciudades: 1 km Aggregated)', url: 'https://hub.worldpop.org/', licencia: 'CC BY 4.0 (WorldPop, Univ. Southampton)' };
const OSM = { url: 'https://www.openstreetmap.org/copyright', licencia: 'ODbL 1.0 © OpenStreetMap contributors' };
const OSMF = (d) => ({ ...OSM, fuente: `OpenStreetMap vía Overpass (corte ${d})` });
Object.assign(CATALOGO, {
  'poblacion':            { unidad: 'habitantes', agregacion: 'suma',  decimales: 0, ...WP, nota: 'Estimación modelada 2020 (no censo). Suma de píxeles con centro dentro de la zona.' },
  'densidad-poblacion':   { unidad: 'hab/km²',    agregacion: 'media', decimales: 1, ...WP, nota: 'población / área de la zona (área total, no sólo urbana).' },
  'areas-verdes-osm-ha':  { unidad: 'ha',   agregacion: 'suma',  decimales: 1, ...OSMF('actual'), nota: 'leisure=park|playground|common y landuse=recreation_ground|village_green. Áreas superpuestas se cuentan dos veces; cada área se asigna a la zona de su centroide.' },
  'areas-verdes-osm-pct': { unidad: '%',    agregacion: 'media', decimales: 2, ...OSMF('actual'), nota: 'área verde OSM / área de la zona.' },
  'verde-osm-m2-hab':     { unidad: 'm²/hab', agregacion: 'media', decimales: 1, ...OSMF('actual'), nota: 'Área verde de uso público mapeada en OSM / población WorldPop 2020. Depende de qué tan completo esté OSM. No es una norma ni la referencia OMS.' },
  'centros-salud-osm':    { unidad: 'n', agregacion: 'suma', decimales: 0, ...OSMF('actual'), nota: 'amenity=hospital|clinic|doctors o healthcare=hospital|clinic|centre. 0 puede significar «sin mapear».' },
  'escuelas-osm':         { unidad: 'n', agregacion: 'suma', decimales: 0, ...OSMF('actual'), nota: 'amenity=school|kindergarten.' },
  'paradas-transporte-osm': { unidad: 'n', agregacion: 'suma', decimales: 0, ...OSMF('actual'), nota: 'highway=bus_stop, estaciones/apeaderos/tranvía. Poco mapeado fuera de ciudades.' },
  'pob-800m-verde':       { unidad: '%', agregacion: 'media', decimales: 1, ...OSMF('actual'), nota: 'Sólo Paraguay. % de población (WorldPop 100 m) a ≤800 m en línea recta de un borde de área verde. Simplificación del «15 min a pie»; no usa red vial.' },
  'pob-800m-salud':       { unidad: '%', agregacion: 'media', decimales: 1, ...OSMF('actual'), nota: 'Sólo Paraguay. % de población a ≤800 m en línea recta de un centro de salud OSM.' },
  'pob-800m-escuela':     { unidad: '%', agregacion: 'media', decimales: 1, ...OSMF('actual'), nota: 'Sólo Paraguay. % de población a ≤800 m en línea recta de una escuela OSM.' },
  'pob-800m-transporte':  { unidad: '%', agregacion: 'media', decimales: 1, ...OSMF('actual'), nota: 'Sólo Paraguay. % de población a ≤800 m en línea recta de una parada OSM.' },
  'rwi': { unidad: 'índice', agregacion: 'media', decimales: 3, fuente: 'Relative Wealth Index (Meta/HDX), celdas de 2,4 km, corte 2021', url: 'https://data.humdata.org/dataset/relative-wealth-index', licencia: 'CC BY-NC 4.0 (solo uso no comercial)', nota: 'Relativo dentro del país; no es ingreso. Promedio simple de celdas cuyo centro cae en la zona (null si ninguna).' },
  'incendios-viirs':      { unidad: 'detecciones', agregacion: 'suma', decimales: 0, fuente: 'NASA FIRMS VIIRS S-NPP 375 m, archivos anuales por país, confianza ≠ baja, type=0', url: 'https://firms.modaps.eosdis.nasa.gov/download/', licencia: 'NASA EOSDIS, uso libre con cita', nota: '2012–2025 (el año en curso no está publicado sin MAP_KEY). Detecciones ≠ hectáreas quemadas.' },
  'incendios-frp-viirs':  { unidad: 'MW', agregacion: 'suma', decimales: 1, fuente: 'NASA FIRMS VIIRS S-NPP (FRP)', url: 'https://firms.modaps.eosdis.nasa.gov/download/', licencia: 'NASA EOSDIS, uso libre con cita', nota: 'Potencia radiativa total de las detecciones; sumada, no media.' },
});
