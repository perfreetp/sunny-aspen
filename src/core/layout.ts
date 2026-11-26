import { clamp } from './units';
import { hashString, makeRng, jitter } from './prng';
import type {
  Branch,
  BranchZone,
  DripParams,
  Emitter,
  GreenhouseParams,
  Layout,
  Overrides,
  ProjectParams,
  Rect,
  SprinklerParams,
} from './types';

export const BRANCH_TIP_CLEARANCE_M = 0.3;
const AISLE_CLEARANCE_M = 0.2;

export function canonicalExtent(g: GreenhouseParams): { u: number; v: number } {
  return g.mainAxis === 'length'
    ? { u: g.lengthM, v: g.spanM }
    : { u: g.spanM, v: g.lengthM };
}

/**
 * Seedbed / working-aisle layout, in canonical (u, v) coordinates.
 *
 * Beds and aisles follow the bed module (苗床宽 / 净距 / 每 N 床一道作业道),
 * which is set by the crop and the trolley, not by the pipe spacing. The two
 * rhythms are independent on purpose: when a branch lands in an aisle, that is
 * a real, reachable layout error and the checks report it.
 */
export function buildBeds(
  params: ProjectParams,
  uExtent: number,
  bedV0 = 0,
): { beds: Rect[]; aisles: Rect[] } {
  const { beds: b, greenhouse: g } = params;
  const vExtent = canonicalExtent(g).v;
  const beds: Rect[] = [];
  const aisles: Rect[] = [];
  const endMargin = Math.max(g.tailMarginM, b.endMarginM);
  const limit = uExtent - endMargin;
  let u = b.startMarginM;
  let inBlock = 0;
  let guard = 0;
  while (u + b.widthM <= limit + 1e-9 && guard++ < 400) {
    beds.push({ u0: u, u1: u + b.widthM, v0: bedV0, v1: vExtent });
    u += b.widthM;
    inBlock += 1;
    if (inBlock >= Math.max(1, Math.round(b.bedsPerBlock))) {
      inBlock = 0;
      if (u + b.aisleWidthM <= limit + 1e-9) {
        aisles.push({ u0: u, u1: u + b.aisleWidthM, v0: bedV0, v1: vExtent });
        u += b.aisleWidthM;
      }
    } else {
      u += b.gapM;
    }
  }
  return { beds, aisles };
}

function insideAisle(u: number, aisles: Rect[], pad = 0): number {
  for (let i = 0; i < aisles.length; i++) {
    const a = aisles[i];
    if (u > a.u0 - pad && u < a.u1 + pad) return i;
  }
  return -1;
}

/** Push a u position out of every aisle it falls into; deterministic. */
export function clearAisles(
  u: number,
  aisles: Rect[],
  lo: number,
  hi: number,
): number {
  let cur = u;
  for (let pass = 0; pass < 6; pass++) {
    const hit = insideAisle(cur, aisles, AISLE_CLEARANCE_M);
    if (hit < 0) return clamp(cur, lo, hi);
    const a = aisles[hit];
    const before = a.u0 - AISLE_CLEARANCE_M;
    const after = a.u1 + AISLE_CLEARANCE_M;
    const dBefore = Math.abs(cur - before);
    const dAfter = Math.abs(cur - after);
    cur = dBefore <= dAfter ? before : after;
  }
  return clamp(cur, lo, hi);
}

/**
 * Branch take-off positions along the main.
 *
 * With `followBeds` the branches ride the seedbed centre lines: walk the beds
 * in order and take the one nearest each nominal spacing slot, so both rhythms
 * stay intact and no two branches share a bed. Without it, plain uniform
 * spacing — an intentional option for the "branch in the aisle" case.
 */
export function nominalBranchUs(params: ProjectParams, bedCenters?: number[]): number[] {
  const g = params.greenhouse;
  const { u: uExtent } = canonicalExtent(g);
  const limit = uExtent - Math.max(g.tailMarginM, 0.2);
  const lo = g.headMarginM;
  const spacing = Math.max(0.3, params.branch.spacingM);
  const first = lo + Math.max(0.1, params.branch.firstOffsetM);

  if (!bedCenters || bedCenters.length === 0) {
    const us: number[] = [];
    for (let k = 0; k < 500; k++) {
      const u = first + k * spacing;
      if (u > limit + 1e-9) break;
      us.push(u);
    }
    return us;
  }

  const usable = bedCenters.filter((c) => c >= lo - 1e-9 && c <= limit + 1e-9);
  if (!usable.length) return [];
  // Choose one bed per spacing slot, monotonically, never reusing a bed.
  const minGap = Math.max(0.6, spacing * 0.62);
  const out: number[] = [];
  let cursor = 0;
  for (let k = 0; k < 500; k++) {
    const target = first + k * spacing;
    if (target > limit + 1e-9) break;
    let best = -1;
    let bestD = Infinity;
    for (let i = cursor; i < usable.length; i++) {
      if (out.length && usable[i] < out[out.length - 1] + minGap - 1e-9) continue;
      const d = Math.abs(usable[i] - target);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
      if (usable[i] > target + spacing) break;
    }
    if (best < 0) continue;
    out.push(usable[best]);
    cursor = best + 1;
  }
  return out;
}

/** Emitter spacing for a branch, after overrides and jitter. */
export function effectiveSpacing(
  base: number,
  branch: Branch,
  overrides: Overrides,
): number {
  const manual = overrides.branchSpacing[branch.key];
  return manual ?? base;
}

function seededRng(seed: number, key: string) {
  return makeRng(hashString(`${seed}::${key}`));
}

function emitterSpacingAt(
  params: ProjectParams,
  overrides: Overrides,
  branchKey: string,
  zone: 'drip' | 'sprinkler',
): number {
  if (zone === 'drip') {
    const manual = overrides.branchSpacing[branchKey];
    return Math.max(0.05, manual ?? params.drip.spacingM);
  }
  return Math.max(0.2, params.sprinkler.radiusM * params.sprinkler.spacingFactor);
}

function branchZones(params: ProjectParams, lengthM: number): BranchZone[] {
  const wantsSprinkler = params.branch.sprinklerZoneM > 0.2 && lengthM > 1.0;
  if (!wantsSprinkler) return [{ type: 'drip', from: 0, to: lengthM }];
  const spr = clamp(params.branch.sprinklerZoneM, 0.5, Math.max(0.5, lengthM - 0.5));
  return [
    { type: 'drip', from: 0, to: lengthM - spr },
    { type: 'sprinkler', from: lengthM - spr, to: lengthM },
  ];
}

/** Build emitters for one branch. Pure function of (params, overrides, seed, branch). */
export function buildEmitters(
  params: ProjectParams,
  overrides: Overrides,
  seed: number,
  branchKey: string,
  index: number,
  lengthM: number,
  zones: BranchZone[],
): Emitter[] {
  const out: Emitter[] = [];
  const dripJitterM = clamp(params.drip.jitterMm / 1000, 0, params.drip.spacingM * 0.35);
  // Sprinklers sit on a designed radius grid; only installation slop is allowed,
  // never a fraction of the pitch, or the overlap pattern stops matching the
  // catalogue's sprinkler spacing.
  const sprJitterM = 0.02;
  const rng = seededRng(seed, `branch:${index}:${branchKey}`);
  for (const zone of zones) {
    const spacing = emitterSpacingAt(params, overrides, branchKey, zone.type);
    const zoneLen = Math.max(0, zone.to - zone.from);
    if (zoneLen < 0.05) continue;
    let local = zone.type === 'drip' ? Math.max(0.05, params.drip.firstOffsetM) : spacing / 2;
    let first = true;
    let guard = 0;
    while (local <= zoneLen + 1e-6 && guard++ < 4000) {
      const s = zone.from + local;
      // Jitter is drawn for every emitter slot so that changing spacing on a
      // neighbouring zone never shifts this zone's stream.
      const j = zone.type === 'drip' ? jitter(rng, dripJitterM) : jitter(rng, sprJitterM);
      const pos = clamp(s + (first && zone.type !== 'drip' ? 0 : j), 0.02, lengthM - 0.02);
      const prev = out.length ? out[out.length - 1].s : -Infinity;
      if (pos - prev > 0.04) {
        out.push({
          type: zone.type,
          s: pos,
          specId: zone.type === 'drip' ? params.drip.specId : params.sprinkler.specId,
        });
      }
      first = false;
      local += spacing;
    }
  }
  return out;
}

export interface LayoutInput {
  params: ProjectParams;
  overrides: Overrides;
  seed: number;
}

export function buildLayout({ params, overrides, seed }: LayoutInput): Layout {
  const g = params.greenhouse;
  const { u: uExtent, v: vExtent } = canonicalExtent(g);

  const mainV = clamp(g.mainOffsetM, 0.35, Math.max(0.4, vExtent - 0.6));
  const mainUFrom = clamp(g.headMarginM, 0.2, uExtent - 0.8);
  const mainUTo = Math.max(mainUFrom + 0.5, uExtent - Math.max(g.tailMarginM, 0.2));

  // Seedbeds start past the head-wall service aisle the main runs in.
  const { beds, aisles } = buildBeds(params, uExtent, mainV + 0.45);
  const bedCenters = params.branch.followBeds
    ? beds.map((b) => (b.u0 + b.u1) / 2)
    : undefined;
  const nominalUs = nominalBranchUs(params, bedCenters);
  const jitterM = clamp(params.branch.jitterMm / 1000, 0, params.branch.spacingM * 0.2);

  const vFrom = mainV;
  const vTo = Math.max(mainV + 0.5, vExtent - BRANCH_TIP_CLEARANCE_M);
  const lengthM = vTo - vFrom;

  const branches: Branch[] = nominalUs.map((nominalU, i) => {
    const key = `b${i}`;
    // Per-branch stream: adding or removing later branches never shifts this
    // branch's jitter, so a seed reproduces the same layout.
    const brRng = makeRng(hashString(`${seed}::branch:${key}`));
    const handOffset = overrides.branchOffset[key];
    const pinned = handOffset !== undefined;
    let u = pinned ? handOffset : nominalU + jitter(brRng, jitterM);
    if (!pinned && params.branch.avoidAisles) {
      u = clearAisles(u, aisles, mainUFrom + 0.15, mainUTo - 0.15);
    }
    u = clamp(u, mainUFrom + 0.15, mainUTo - 0.15);

    const diameterId = overrides.branchDiameter[key] ?? params.branch.diameterId;
    const zones = branchZones(params, lengthM);
    const dripSpacingM = Math.max(
      0.05,
      overrides.branchSpacing[key] ?? params.drip.spacingM,
    );
    const sprinklerSpacingM = Math.max(
      0.2,
      params.sprinkler.radiusM * params.sprinkler.spacingFactor,
    );
    const emitters = buildEmitters(params, overrides, seed, key, i, lengthM, zones);
    return {
      id: key,
      key,
      index: i,
      u,
      nominalU,
      pinned,
      spacingM: dripSpacingM,
      spacingManual: overrides.branchSpacing[key] !== undefined,
      spacingOverridden: overrides.branchSpacing[key] !== undefined,
      diameterId,
      vFrom,
      vTo,
      lengthM,
      dripSpacingM,
      sprinklerSpacingM,
      zones,
      emitters,
    };
  });

  return {
    mainAxis: g.mainAxis,
    uExtent,
    vExtent,
    beds,
    aisles,
    main: { v: mainV, uFrom: mainUFrom, uTo: mainUTo, headU: mainUFrom },
    branches,
    seed,
  };
}

/** Drip / sprinkler catalogue values resolved into the layout for the UI. */
export function branchZoneSummary(branch: Branch): { drip: number; sprinkler: number } {
  let drip = 0;
  let sprinkler = 0;
  for (const e of branch.emitters) {
    if (e.type === 'drip') drip += 1;
    else sprinkler += 1;
  }
  return { drip, sprinkler };
}

export function flowPerEmitter(
  emitterType: 'drip' | 'sprinkler',
  params: ProjectParams,
): number {
  return emitterType === 'drip' ? params.drip.qnLph : params.sprinkler.qLph;
}

export function emitterHeadCurve(
  emitterType: 'drip' | 'sprinkler',
  params: ProjectParams,
): { qn: number; hNom: number; x: number } {
  if (emitterType === 'drip') {
    const d: DripParams = params.drip;
    return { qn: d.qnLph, hNom: d.hNomM, x: d.exponent };
  }
  const s: SprinklerParams = params.sprinkler;
  return { qn: s.qLph, hNom: s.hNomM, x: s.exponent };
}
