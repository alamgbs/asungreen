import { TRAFFIC_BY_HOUR } from './constants';
import type { TrafficParticle } from './types';

// Module-level corridors — set by initParticles, used by updateParticles.
// Starts empty; MapView loads OSM roads and calls initParticles(corridors).
let activeCorridors: [number, number][][] = [];

const PARTICLES_BASE = 600;

function lerpPoint(
  a: [number, number],
  b: [number, number],
  t: number
): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Fetches /data/asuncion-roads.geojson and returns corridors as
 * arrays of [lng, lat] coordinate pairs.
 * Call once at app start; result is passed to initParticles.
 */
export async function loadCorridors(): Promise<[number, number][][]> {
  const res = await fetch('/data/asuncion-roads.geojson');
  if (!res.ok) throw new Error(`Failed to load roads: ${res.status}`);
  const geojson = await res.json() as {
    features: Array<{
      geometry: { type: string; coordinates: number[][] };
    }>;
  };
  return geojson.features
    .filter(
      (f) =>
        f.geometry.type === 'LineString' &&
        f.geometry.coordinates.length >= 2
    )
    .map((f) => f.geometry.coordinates as [number, number][]);
}

/**
 * Creates traffic particles distributed over the provided corridors.
 * Also stores corridors in the module-level activeCorridors for updateParticles.
 * Pass an empty array [] before OSM data loads — results in no particles.
 */
export function initParticles(corridors: [number, number][][]): TrafficParticle[] {
  activeCorridors = corridors;
  if (corridors.length === 0) return [];

  const particles: TrafficParticle[] = [];
  let id = 0;

  for (let ci = 0; ci < corridors.length; ci++) {
    const corridor = corridors[ci];
    if (corridor.length < 2) continue;
    const count = Math.max(1, Math.floor(PARTICLES_BASE / corridors.length));
    for (let i = 0; i < count; i++) {
      const segIdx = Math.floor(Math.random() * (corridor.length - 1));
      const t = Math.random();
      const speed = 0.002 + Math.random() * 0.003;
      particles.push({
        id: id++,
        position: lerpPoint(corridor[segIdx], corridor[segIdx + 1], t),
        corridorIndex: ci,
        segmentIndex: segIdx,
        t,
        speed,
      });
    }
  }

  return particles;
}

export function updateParticles(
  particles: TrafficParticle[],
  hour: number,
  delta: number
): TrafficParticle[] {
  if (activeCorridors.length === 0) return particles;
  const density = TRAFFIC_BY_HOUR[Math.round(hour) % 24];

  return particles.map((p) => {
    const corridor = activeCorridors[p.corridorIndex];
    if (!corridor || corridor.length < 2) return p;
    const effectiveSpeed = p.speed * density * delta * 60;
    let newT = p.t + effectiveSpeed;
    let newSeg = p.segmentIndex;

    while (newT >= 1) {
      newT -= 1;
      newSeg++;
      if (newSeg >= corridor.length - 1) {
        newSeg = 0;
        newT = Math.random() * 0.5;
      }
    }

    const pos = lerpPoint(
      corridor[newSeg],
      corridor[newSeg + 1],
      newT
    );

    return { ...p, position: pos, segmentIndex: newSeg, t: newT };
  });
}

export function particleColor(hour: number): [number, number, number, number] {
  const density = TRAFFIC_BY_HOUR[Math.round(hour) % 24];
  if (density < 0.3)  return [20,  184, 166, 200];
  if (density < 0.6)  return [250, 204, 21,  220];
  if (density < 0.85) return [249, 115, 22,  230];
  return                      [239, 68,  68,  255];
}
