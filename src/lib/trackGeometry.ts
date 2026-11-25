import * as THREE from 'three';

export const GREENHOUSE = {
  length: 20,
  zMin: -10,
  zMax: 10,
  halfWidth: 4.2,
  trackHalfWidth: 3.95,
  eaveY: 1.85,
  rise: 2.85,
  roofClearance: 0.22,
} as const;

/** 抛物拱棚屋面高度。 */
export function roofY(x: number): number {
  const q = x / GREENHOUSE.halfWidth;
  return GREENHOUSE.eaveY + GREENHOUSE.rise * Math.max(0, 1 - q * q);
}

/** 轨道位于棚顶下方，保证帘布与棚顶之间有稳定净距。 */
export function trackY(x: number): number {
  return roofY(x) - GREENHOUSE.roofClearance;
}

export class ArchTrackCurve extends THREE.Curve<THREE.Vector3> {
  z: number;
  clearance: number;

  constructor(z: number, clearance: number = GREENHOUSE.roofClearance) {
    super();
    this.z = z;
    this.clearance = clearance;
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const x = -GREENHOUSE.trackHalfWidth + GREENHOUSE.trackHalfWidth * 2 * t;
    return target.set(x, roofY(x) - this.clearance, this.z);
  }
}

export function createTrackCurve(z: number): ArchTrackCurve {
  return new ArchTrackCurve(z, GREENHOUSE.roofClearance);
}

export function createFrameCurve(z: number): ArchTrackCurve {
  return new ArchTrackCurve(z, 0);
}

export function nearestArcU(curve: THREE.Curve<THREE.Vector3>, point: THREE.Vector3, samples = 240): number {
  let bestU = 0;
  let bestD = Number.POSITIVE_INFINITY;
  const p = new THREE.Vector3();
  for (let i = 0; i <= samples; i += 1) {
    const u = i / samples;
    curve.getPointAt(u, p);
    const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
    if (d < bestD) {
      bestD = d;
      bestU = u;
    }
  }
  return bestU;
}

export interface ClearanceResult {
  min: number;
  ok: boolean;
  samples: number;
}

/** 对帘布可能到达的位置做屋面高度采样，作为防穿出校验。 */
export function validateFabricClearance(
  z: number,
  endpointA: number,
  endpointB: number,
  foldAmplitude = 0.045,
): ClearanceResult {
  const curve = createTrackCurve(z);
  const p = new THREE.Vector3();
  let min = Number.POSITIVE_INFINITY;
  let samples = 0;
  const from = Math.min(endpointA, endpointB);
  const to = Math.max(endpointA, endpointB);
  for (let i = 0; i <= 120; i += 1) {
    const u = from + ((to - from) * i) / 120;
    curve.getPointAt(u, p);
    const tangent = curve.getTangentAt(u);
    const nx = -tangent.y;
    const ny = tangent.x;
    for (const fold of [-foldAmplitude, 0, foldAmplitude]) {
      const x = p.x + nx * fold;
      const y = p.y + ny * fold - 0.025;
      min = Math.min(min, roofY(x) - y);
      samples += 1;
    }
  }
  return { min, ok: min >= 0.08, samples };
}
