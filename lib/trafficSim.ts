import { TRAFFIC_CORRIDORS, TRAFFIC_BY_HOUR } from './constants';
import type { TrafficParticle } from './types';

const PARTICLES_BASE = 600;

function lerpPoint(
  a: [number, number],
  b: [number, number],
  t: number
): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function initParticles(corridors?: [number, number][][]): TrafficParticle[] {
  const corridorsToUse = (corridors && corridors.length > 0) ? corridors : TRAFFIC_CORRIDORS;
  const particles: TrafficParticle[] = [];
  let id = 0;

  for (let ci = 0; ci < corridorsToUse.length; ci++) {
    const corridor = corridorsToUse[ci];
    const count = Math.floor(PARTICLES_BASE / corridorsToUse.length);
    for (let i = 0; i < count; i++) {
      const segIdx = Math.floor(Math.random() * (corridor.length - 1));
      const t = Math.random();
      const speed = 0.002 + Math.random() * 0.003;
      particles.push({
        id: id++,
        position: lerpPoint(
          corridor[segIdx] as [number, number],
          corridor[segIdx + 1] as [number, number],
          t
        ),
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
  const density = TRAFFIC_BY_HOUR[Math.round(hour) % 24];

  return particles.map((p) => {
    const corridor = TRAFFIC_CORRIDORS[p.corridorIndex];
    const effectiveSpeed = p.speed * density * delta * 60;
    let newT = p.t + effectiveSpeed;
    let newSeg = p.segmentIndex;

    while (newT >= 1) {
      newT -= 1;
      newSeg++;
      if (newSeg >= corridor.length - 1) {
        // Reset to start of corridor
        newSeg = 0;
        newT = Math.random() * 0.5;
      }
    }

    const pos = lerpPoint(
      corridor[newSeg] as [number, number],
      corridor[newSeg + 1] as [number, number],
      newT
    );

    return { ...p, position: pos, segmentIndex: newSeg, t: newT };
  });
}

export function particleColor(hour: number): [number, number, number, number] {
  const density = TRAFFIC_BY_HOUR[Math.round(hour) % 24];
  if (density < 0.3) return [20, 184, 166, 200];   // teal (low)
  if (density < 0.6) return [250, 204, 21, 220];    // yellow (medium)
  if (density < 0.85) return [249, 115, 22, 230];   // orange (high)
  return [239, 68, 68, 255];                         // red (peak)
}
