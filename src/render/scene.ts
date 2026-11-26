import type { Solution } from '../core/types';
import { pipe } from '../core/catalogue';

/** Viewport: maps canonical metres to screen points. */
export interface Viewport {
  /** screen points per metre */
  scale: number;
  /** screen offset of canonical origin, points */
  ox: number;
  oy: number;
  width: number;
  height: number;
}

export const toScreen = (vp: Viewport, u: number, v: number) => ({
  x: vp.ox + u * vp.scale,
  y: vp.oy + v * vp.scale,
});

export const toWorld = (vp: Viewport, x: number, y: number) => ({
  u: (x - vp.ox) / vp.scale,
  v: (y - vp.oy) / vp.scale,
});

export function fitViewport(
  width: number,
  height: number,
  uExtent: number,
  vExtent: number,
  padPx = 64,
  padLeftPx = 0,
): Viewport {
  // Reserve vertical room for the pressure labels above and branch labels below
  // so the fit never clips them, then centre the house in what is left.
  const padY = Math.max(34, Math.min(96, height * 0.14));
  const aw = Math.max(20, width - padPx * 2 - padLeftPx);
  const ah = Math.max(20, height - padY * 2);
  const scale = Math.min(aw / Math.max(uExtent, 1e-6), ah / Math.max(vExtent, 1e-6));
  const drawnH = vExtent * scale;
  return {
    scale,
    ox: padLeftPx + (width - padLeftPx - uExtent * scale) / 2,
    oy: (height - drawnH) / 2,
    width,
    height,
  };
}

export type SegStatusDraw = 'ok' | 'warn' | 'velocity';

export interface DrawEmitter {
  x: number;
  y: number;
  r: number;
  type: 'drip' | 'sprinkler';
  branchIndex: number;
  emitterIndex: number;
  q: number;
  headKPa: number;
  fromZone: 'drip' | 'sprinkler';
}

export interface DrawBranchSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  status: SegStatusDraw;
  zone: 'drip' | 'sprinkler';
  from: number;
  to: number;
  flowLph: number;
  velocity: number;
  hf: number;
  diameterId: string;
}

export interface DrawBranch {
  index: number;
  key: string;
  u: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  selected: boolean;
  conflict: boolean;
  pinned: boolean;
  flags: number;
  segments: DrawBranchSegment[];
  emitters: DrawEmitter[];
  label: string;
  labelX: number;
  labelY: number;
  lengthM: number;
}

export interface DrawMainSegment {
  index: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  status: SegStatusDraw;
  dn: number;
  flowLph: number;
  velocity: number;
  hf: number;
  fromU: number;
  toU: number;
}

export interface DrawZone {
  index: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  endKPa: number;
  lengthM: number;
  branchCount: number;
}

export interface Scene {
  viewport: Viewport;
  house: { x: number; y: number; w: number; h: number };
  beds: { x: number; y: number; w: number; h: number; index: number }[];
  aisles: { x: number; y: number; w: number; h: number; index: number; conflict: boolean }[];
  main: { segments: DrawMainSegment[]; x1: number; y1: number; x2: number; y2: number };
  branches: DrawBranch[];
  zones: DrawZone[];
  /** headworks symbol, drawn outside the house wall */
  headworks: { x: number; y: number; sourceX: number; sourceY: number };
  /** where the main actually enters the house */
  houseEntry: { x: number; y: number };
  mainLabels: { x: number; y: number; text: string; status: SegStatusDraw }[];
  rangeCircles: { x: number; y: number; r: number }[];
  /** on-screen pitch between adjacent drip emitters, px — drives LOD */
  emitterPitchPx: number;
  branchFlags: { x: number; y: number; text: string; kind: 'warn' | 'danger' }[];
}

const clampWidth = (base: number, min: number, max: number) => Math.max(min, Math.min(max, base));

export function buildScene(
  solution: Solution,
  vp: Viewport,
  opts: { selectedBranch: number | null; sprinklerRadiusM?: number },
): Scene {
  const { layout } = solution;
  const P = (u: number, v: number) => toScreen(vp, u, v);
  const s = vp.scale;

  const conflictBranches = new Set(solution.conflicts.map((c) => c.branchIndex));
  const conflictAisles = new Set(solution.conflicts.map((c) => c.aisleIndex));

  const tl = P(0, 0);
  const house = { x: tl.x, y: tl.y, w: layout.uExtent * s, h: layout.vExtent * s };

  const beds = layout.beds.map((b, i) => {
    const p = P(b.u0, b.v0);
    return { x: p.x, y: p.y, w: (b.u1 - b.u0) * s, h: (b.v1 - b.v0) * s, index: i };
  });
  const aisles = layout.aisles.map((a, i) => {
    const p = P(a.u0, a.v0);
    return {
      x: p.x,
      y: p.y,
      w: (a.u1 - a.u0) * s,
      h: (a.v1 - a.v0) * s,
      index: i,
      conflict: conflictAisles.has(i),
    };
  });

  const mainWidthFor = (dn: number) => clampWidth(1.0 + dn / 11, 2.5, 16);
  const branchWidthFor = (dn: number) => clampWidth(0.8 + dn / 14, 1.8, 8);

  const mainSegments: DrawMainSegment[] = solution.main.segments.map((g) => {
    const a = P(g.from, layout.main.v);
    const b = P(g.to, layout.main.v);
    return {
      index: g.index,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      width: mainWidthFor(g.innerMm),
      status: (g.status === 'idle' ? 'ok' : g.status) as SegStatusDraw,
      dn: Math.round(g.innerMm),
      flowLph: g.flowLph,
      velocity: g.velocity,
      hf: g.hf,
      fromU: g.from,
      toU: g.to,
    };
  });
  const mainA = P(layout.main.uFrom, layout.main.v);
  const mainB = P(layout.main.uTo, layout.main.v);

  const branches: DrawBranch[] = layout.branches.map((br) => {
    const a = P(br.u, br.vFrom);
    const b = P(br.u, br.vTo);
    const res = solution.branches.find((r) => r.index === br.index);
    const dn = res?.segments[0]?.innerMm ?? 0;
    const segs: DrawBranchSegment[] =
      res?.segments.map((g) => {
        const zoneType =
          br.zones.find((z) => g.from >= z.from - 1e-9 && g.from < z.to - 1e-9)?.type ?? 'drip';
        return {
          x1: a.x,
          y1: a.y + g.from * s,
          x2: a.x,
          y2: a.y + g.to * s,
          status: (g.status === 'idle' ? 'ok' : g.status) as SegStatusDraw,
          zone: zoneType as 'drip' | 'sprinkler',
          from: g.from,
          to: g.to,
          flowLph: g.flowLph,
          velocity: g.velocity,
          hf: g.hf,
          diameterId: g.diameterId,
        };
      }) ?? [];
    const emitters: DrawEmitter[] =
      res?.emitters.map((e, i) => {
        const p = P(br.u, br.vFrom + e.s);
        return {
          x: p.x,
          y: p.y,
          r: e.type === 'sprinkler' ? 4 : 2,
          type: e.type,
          branchIndex: br.index,
          emitterIndex: i,
          q: e.q,
          headKPa: res.emitterHeads[i] * 9.81,
          fromZone: e.type,
        };
      }) ?? [];
    return {
      index: br.index,
      key: br.key,
      u: br.u,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      width: branchWidthFor(dn),
      selected: opts.selectedBranch === br.index,
      conflict: conflictBranches.has(br.index),
      pinned: br.pinned,
      flags: res?.flags ?? 0,
      segments: segs,
      emitters,
      label: `Z${br.index + 1}`,
      labelX: a.x,
      labelY: house.y + house.h + 13,
      lengthM: br.lengthM,
    };
  });

  const zones: DrawZone[] = solution.main.zones.map((z) => {
    const a = P(z.uFrom, layout.main.v);
    const b = P(z.uTo, layout.main.v);
    return {
      index: z.index,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      endKPa: z.endKPa,
      lengthM: z.lengthM,
      branchCount: z.branchCount,
    };
  });

  // Sit the headworks symbol outside the house wall so it never covers the beds;
  // the main is drawn from the wall entry out to it.
  const srcP = { x: house.x - 46, y: mainA.y };
  const houseEntry = { x: house.x, y: mainA.y };

  // One DN label per run of equal diameter, not per segment — otherwise a
  // 20-segment main prints 20 overlapping labels.
  const mainLabels: Scene['mainLabels'] = [];
  {
    const segs = solution.main.segments;
    let i = 0;
    while (i < segs.length) {
      let j = i;
      while (j + 1 < segs.length && segs[j + 1].diameterId === segs[i].diameterId) j++;
      const from = segs[i].from;
      const to = segs[j].to;
      const mid = P((from + to) / 2, layout.main.v);
      const widest = Math.max(...segs.slice(i, j + 1).map((g) => mainWidthFor(g.innerMm)));
      mainLabels.push({
        x: mid.x,
        y: mid.y + widest / 2 + 11,
        text: `DN${pipe(segs[i].diameterId).dn}`,
        status: (segs[i].status === 'idle' ? 'ok' : segs[i].status) as SegStatusDraw,
      });
      i = j + 1;
    }
  }

  const rangeCircles = branches.flatMap((b) =>
    b.emitters
      .filter((e) => e.type === 'sprinkler')
      .map((e) => ({ x: e.x, y: e.y, r: Math.max(4, (opts.sprinklerRadiusM ?? 2) * s) })),
  );

  const branchFlags: Scene['branchFlags'] = [];
  for (const br of solution.branches) {
    const branch = layout.branches.find((b) => b.index === br.index);
    if (!branch) continue;
    const vel = br.segments.find((g) => g.status === 'velocity');
    const warn = br.segments.find((g) => g.status === 'warn');
    if (vel || warn) {
      const p = P(branch.u, branch.vTo);
      branchFlags.push({
        x: p.x,
        y: p.y + 14,
        text: vel ? '流速超限' : '压降超限',
        kind: vel ? 'danger' : 'warn',
      });
    }
  }

  const emitterPitchPx = solution.layout.branches[0]?.emitters[1]
    ? Math.abs(
        solution.layout.branches[0].emitters[1].s - solution.layout.branches[0].emitters[0].s,
      ) * s
    : 99;

  return {
    viewport: vp,
    house,
    beds,
    aisles,
    main: {
      segments: mainSegments,
      x1: mainA.x,
      y1: mainA.y,
      x2: mainB.x,
      y2: mainB.y,
    },
    branches,
    zones,
    headworks: { x: srcP.x, y: srcP.y, sourceX: srcP.x - 40, sourceY: srcP.y },
    houseEntry,
    mainLabels,
    rangeCircles,
    emitterPitchPx,
    branchFlags,
  };
}
