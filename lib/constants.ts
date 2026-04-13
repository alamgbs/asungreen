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
