/** Textos compartidos de capas (Sidebar, Legend, modal "Cómo se calcula"). */
import type { LayerType } from './types';

export const SIM_BADGE = 'SIMULACIÓN · no son datos reales';

export const LAYER_INFO: Record<LayerType, {
  name: string;
  subtitle: string;
  note?: string;
  source: string;
  resolution: string;
  how: string;
  limits: string[];
}> = {
  soilTemp: {
    name: 'TEMP. SUPERFICIAL (LST)',
    subtitle: 'Landsat 8/9 · 30 m',
    note: 'Incluye techos y asfalto; no es temperatura del aire ni del suelo.',
    source: 'Landsat 8 y 9 Collection 2 Level-2 (banda térmica ST_B10), vía Google Earth Engine.',
    resolution: '30 m (remuestreada desde 100 m térmicos). Revisita de ~8 días con ambos satélites.',
    how: 'Mediana de las escenas con poca nubosidad en las estaciones y años elegidos, con máscara de nubes/sombras (QA_PIXEL). La banda se convierte a °C.',
    limits: [
      'Mide la temperatura de la superficie vista desde el satélite (techos, asfalto, copas de árboles), no la del aire.',
      'Pasa cerca de las 10:00 hora local: no representa el pico de calor de la tarde.',
      'Las nubes pueden dejar huecos; la mediana de pocas escenas es menos estable.',
      'Disponible desde 2013 (Landsat 8).',
    ],
  },
  traffic: {
    name: 'TRÁFICO (SIMULADO)',
    subtitle: 'Simulación sobre vías OSM',
    note: SIM_BADGE,
    source: 'Partículas animadas sobre la red vial de OpenStreetMap con un perfil horario fijo inventado.',
    resolution: 'No aplica: no hay mediciones.',
    how: 'La densidad por hora sale de una tabla fija (picos 8:00 y 17:00). No usa sensores, GPS ni datos de movilidad.',
    limits: [
      'SIMULACIÓN: no son datos reales de tránsito.',
      'No debe usarse para decisiones, reportes ni comparaciones.',
      'Las partículas siguen una muestra de calles; no representan flujo real por calle.',
    ],
  },
  ndvi: {
    name: 'VEGETACIÓN (NDVI)',
    subtitle: 'Sentinel-2 · 10 m',
    source: 'Sentinel-2 SR Harmonized (bandas B8 y B4) con Cloud Score+, vía Google Earth Engine.',
    resolution: '10 m. Revisita de ~5 días.',
    how: 'NDVI = (NIR − Rojo) / (NIR + Rojo) sobre la mediana de escenas sin nubes en las estaciones y años elegidos.',
    limits: [
      'Valores altos indican vegetación densa; no distingue especies ni salud del arbolado.',
      'Cultivos y pasto estacional cambian mucho entre estaciones.',
      'Sombras y nubes finas pueden alterar el valor.',
      'Disponible desde 2017.',
    ],
  },
};
