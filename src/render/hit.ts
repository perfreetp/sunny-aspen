import type { Scene } from './scene';

export type Hit =
  | { kind: 'branch'; index: number }
  | { kind: 'emitter'; branchIndex: number; emitterIndex: number; s: number }
  | { kind: 'main'; index: number }
  | { kind: 'zone'; index: number }
  | null;

const distToSegment = (
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return { d: Math.hypot(px - x1, py - y1), t: 0 };
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)), t };
};

export function hitTest(
  scene: Scene,
  x: number,
  y: number,
  zoom = 1,
  _selectedBranch: number | null = null,
): Hit {
  // Emitters sit exactly on the branch line. At a fitted zoom their pitch is a
  // few pixels, so treating each dot as a target would make the branch itself
  // impossible to grab. Individual emitters therefore only become targets once
  // they are drawn far enough apart to be aimed at — zoom in to edit one; at
  // wide zoom the press belongs to the branch.
  const emittersAreTargets = scene.emitterPitchPx >= 7;

  let bestBranch: { d: number; index: number } | null = null;
  for (const br of scene.branches) {
    const { d } = distToSegment(x, y, br.x1, br.y1, br.x2, br.y2);
    if (d <= Math.max(9, br.width + 6) && (!bestBranch || d < bestBranch.d)) {
      bestBranch = { d, index: br.index };
    }
  }

  if (emittersAreTargets) {
    let bestEmitter: { d: number; branch: number; emitter: number } | null = null;
    for (const br of scene.branches) {
      for (const e of br.emitters) {
        const d = Math.hypot(x - e.x, y - e.y);
        const r = Math.min(7, Math.max(3.2, scene.emitterPitchPx * 0.45));
        if (d <= r && (!bestEmitter || d < bestEmitter.d)) {
          bestEmitter = { d, branch: e.branchIndex, emitter: e.emitterIndex };
        }
      }
    }
    if (bestEmitter) {
      return {
        kind: 'emitter',
        branchIndex: bestEmitter.branch,
        emitterIndex: bestEmitter.emitter,
        s: 0,
      };
    }
  }
  if (bestBranch) return { kind: 'branch', index: bestBranch.index };
  void zoom;

  for (const z of scene.zones) {
    if (Math.abs(x - z.x2) < 26 && y > z.y2 - 36 && y < z.y2 + 6) {
      return { kind: 'zone', index: z.index };
    }
  }

  const mainHit = Math.max(8, 6 / Math.max(zoom, 0.4));
  for (const seg of scene.main.segments) {
    const { d } = distToSegment(x, y, seg.x1, seg.y1, seg.x2, seg.y2);
    if (d <= Math.max(mainHit, seg.width / 2 + 3)) return { kind: 'main', index: seg.index };
  }
  return null;
}

/** Nearest branch within `maxPx` — used for snapping a drag. */
export function nearestBranch(scene: Scene, x: number, y: number, maxPx = 26) {
  let best: { d: number; index: number; u: number } | null = null;
  for (const br of scene.branches) {
    const { d } = distToSegment(x, y, br.x1, br.y1, br.x2, br.y2);
    if (d <= maxPx && (!best || d < best.d)) best = { d, index: br.index, u: br.u };
  }
  return best;
}
