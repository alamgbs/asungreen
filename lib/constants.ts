export const ASUNCION_CENTER: [number, number] = [-57.5759, -25.2867];

export const INITIAL_VIEW_STATE = {
  longitude: -57.5759,
  latitude: -25.2867,
  zoom: 12,
  pitch: 0,
  bearing: 0,
};

export const ASUNCION_BOUNDS: [[number, number], [number, number]] = [
  [-57.75, -25.50],
  [-57.40, -25.10],
];

// Traffic density by hour (0-23), 0-1 scale
export const TRAFFIC_BY_HOUR: number[] = [
  0.05, 0.03, 0.02, 0.02, 0.03, 0.10, // 0-5
  0.30, 0.70, 0.95, 0.80, 0.60, 0.55, // 6-11
  0.55, 0.58, 0.60, 0.65, 0.78, 0.98, // 12-17
  0.92, 0.75, 0.58, 0.40, 0.22, 0.10, // 18-23
];

// Main traffic corridors in Asunción [lng, lat] pairs
export const TRAFFIC_CORRIDORS = [
  // Av. Mariscal López (main artery N-S)
  [[-57.5620, -25.2420], [-57.5640, -25.2550], [-57.5660, -25.2700], [-57.5680, -25.2867], [-57.5710, -25.3050], [-57.5730, -25.3200]],
  // Av. España
  [[-57.5900, -25.2700], [-57.5800, -25.2720], [-57.5700, -25.2740], [-57.5600, -25.2760], [-57.5500, -25.2780]],
  // Av. Eusebio Ayala
  [[-57.6100, -25.3000], [-57.5950, -25.2950], [-57.5800, -25.2900], [-57.5650, -25.2850]],
  // Av. República Argentina
  [[-57.6200, -25.2600], [-57.6050, -25.2650], [-57.5900, -25.2700], [-57.5750, -25.2750]],
  // Av. Carlos Antonio López
  [[-57.5450, -25.2800], [-57.5500, -25.2850], [-57.5550, -25.2900], [-57.5600, -25.2950]],
  // Ruta 1 (south)
  [[-57.5800, -25.3200], [-57.5780, -25.3400], [-57.5760, -25.3600], [-57.5740, -25.3800]],
  // Downtown grid E-W
  [[-57.6100, -25.2867], [-57.5950, -25.2867], [-57.5800, -25.2867], [-57.5600, -25.2867], [-57.5450, -25.2867]],
  // Av. San Martín
  [[-57.5600, -25.2400], [-57.5700, -25.2500], [-57.5800, -25.2600], [-57.5900, -25.2700], [-57.6000, -25.2800]],
  // Fernando de la Mora connection
  [[-57.5750, -25.3100], [-57.5900, -25.3050], [-57.6050, -25.3000], [-57.6200, -25.2950]],
  // Av. Artigas
  [[-57.5580, -25.2600], [-57.5600, -25.2700], [-57.5620, -25.2800], [-57.5640, -25.2900]],
];

// NASA GIBS WMS URLs — served via WMS with EPSG:3857 bbox reprojection
// (NDVI and LST are not available in GIBS WMTS EPSG:3857, but the WMS endpoint supports it)
const GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&BBOX={bbox-epsg-3857}&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&STYLES=&FORMAT=image/png';

export const NASA_GIBS = {
  ndvi: {
    url: `${GIBS_WMS}&LAYERS=MODIS_Terra_NDVI_8Day&TIME=2024-08-04`,
    attribution: 'NASA MODIS Terra NDVI',
  },
  soilTemp: {
    url: `${GIBS_WMS}&LAYERS=MODIS_Terra_Land_Surface_Temp_Day&TIME=2024-08-10`,
    attribution: 'NASA MODIS Terra LST',
  },
};
