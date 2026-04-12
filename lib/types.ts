export type LayerType = 'soilTemp' | 'traffic' | 'ndvi';

export interface LayerConfig {
  id: LayerType;
  name: string;
  subtitle: string;
  icon: string;
  color: string;
  active: boolean;
}

export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
  transitionDuration?: number;
}

export interface TrafficParticle {
  id: number;
  position: [number, number];
  corridorIndex: number;
  segmentIndex: number;
  t: number; // 0-1 progress along current segment
  speed: number;
}

export interface LegendEntry {
  label: string;
  color: string;
}

export interface LayerLegend {
  title: string;
  unit: string;
  entries: LegendEntry[];
}
