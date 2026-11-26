import { PIPES, pipe } from './catalogue';
import { headToKPa, kPaToHead } from './units';
import type {
  AisleConflict,
  Branch,
  BranchResult,
  Layout,
  MainResult,
  PressureZone,
  ProjectParams,
  Segment,
  SegStatus,
  Solution,
  Warning,
} from './types';
import { branchZoneSummary } from './layout';
import { hashNumbers } from './prng';

const lphToM3s = (q: number) => q / 3_600_000;

/** Hazen-Williams gradient (m/m), flow in m³/s, inner diameter in mm. */
export function hazenGradient(qM3s: number, innerMm: number, c: number): number {
  if (qM3s <= 0) return 0;
  const d = innerMm / 1000;
  const r = d / 4;
  const v = qM3s / ((Math.PI * d * d) / 4);
  return Math.pow(v / (0.849 * c * Math.pow(r, 0.63)), 1 / 0.54);
}

export function velocityOf(qM3s: number, innerMm: number): number {
  const d = innerMm / 1000;
  return qM3s / ((Math.PI * d * d) / 4);
}

const PIPE_SORTED = [...PIPES].sort((a, b) => a.innerMm - b.innerMm);

/** Next larger catalogue pipe, or null when already the largest. */
export function nextPipeUp(id: string): { id: string; dn: number; innerMm: number } | null {
  const i = PIPE_SORTED.findIndex((p) => p.id === id);
  if (i < 0 || i === PIPE_SORTED.length - 1) return null;
  return PIPE_SORTED[i + 1];
}

/**
 * Pick one diameter per main-line segment.
 *
 * The first segment is the diameter the technician selected at the headworks —
 * that is the one number they own. From there the main may step *down* as flow
 * drops, and it does so only as far as the pressure budget allows: each
 * downstream segment takes the smallest catalogue pipe whose friction, together
 * with the projected friction of the rest of the run, stays inside the budget.
 * Velocity is a hard cap on every segment.
 */
export function designMainDiameters(
  inputs: SegmentInput[],
  params: ProjectParams,
  budgetTotal: number,
): string[] {
  const { hazenC, minorLossFactor, maxVelocity } = params.hydraulic;
  const headPipe = pipe(params.main.headDiameterId);
  const q0 = inputs.length ? lphToM3s(inputs[0].flowLph) : 0;
  const floor = q0 > 0
    ? Math.min(headPipe.innerMm, pipe(chooseMainPipe(inputs[0].flowLph, maxVelocity, params.main.headDiameterId)).innerMm)
    : headPipe.innerMm;
  const candidates = PIPE_SORTED.filter(
    (p) => p.innerMm <= headPipe.innerMm + 1e-6 && p.innerMm >= floor - 1e-6,
  );
  const friction = (flowLph: number, innerMm: number, len: number) =>
    hazenGradient(lphToM3s(flowLph), innerMm, hazenC) * len * (1 + minorLossFactor);

  const velSafe = inputs.map((s) => chooseMainPipe(s.flowLph, maxVelocity, params.main.headDiameterId));

  const out: string[] = [params.main.headDiameterId];
  let spent = inputs.length
    ? friction(inputs[0].flowLph, headPipe.innerMm, inputs[0].to - inputs[0].from)
    : 0;

  for (let i = 1; i < inputs.length; i++) {
    const seg = inputs[i];
    const prevId = out[i - 1];
    const prevInner = pipe(prevId).innerMm;
    const q = lphToM3s(seg.flowLph);
    let chosen: string | null = null;

    for (const cand of candidates) {
      if (cand.innerMm > prevInner + 1e-6) continue; // never step up
      if (q > 0 && velocityOf(q, cand.innerMm) > maxVelocity + 1e-9) continue;
      let projected = spent + friction(seg.flowLph, cand.innerMm, seg.to - seg.from);
      for (let j = i + 1; j < inputs.length; j++) {
        const dj = inputs[j];
        const inner = Math.min(cand.innerMm, pipe(velSafe[j]).innerMm);
        projected += friction(dj.flowLph, inner, dj.to - dj.from);
      }
      if (projected <= budgetTotal + 1e-9) {
        chosen = cand.id;
        break;
      }
    }
    if (!chosen) chosen = prevId; // no taper fits; keep the upstream diameter
    out.push(chosen);
    spent += friction(seg.flowLph, pipe(chosen).innerMm, seg.to - seg.from);
  }
  return out;
}

/** Smallest pipe in [minId..capId] whose velocity stays acceptable. */
export function chooseMainPipe(
  flowLph: number,
  maxVelocity: number,
  capId: string,
  minId = 'pe20',
): string {
  const cap = pipe(capId);
  const floor = pipe(minId);
  const q = lphToM3s(flowLph);
  if (q <= 0) return capId;
  for (const p of PIPE_SORTED) {
    if (p.innerMm > cap.innerMm + 1e-6) break;
    if (p.innerMm < floor.innerMm - 1e-6) continue;
    if (velocityOf(q, p.innerMm) <= maxVelocity) return p.id;
  }
  return capId;
}

interface SegmentInput {
  from: number;
  to: number;
  diameterId: string;
  flowLph: number;
}

interface BuildOpts {
  /**
   * Allowable cumulative friction at a given distance along the run, m.
   * Branches get a flat allowance; the main gets a linearly growing one, so the
   * upstream segments are held to a proportionally small share of the budget.
   */
  budgetAt: (distance: number) => number;
  /** ground fall towards the run end, positive = pressure gain */
  slopePerM: number;
}

function buildSegments(
  run: 'main' | 'branch',
  runIndex: number,
  inputs: SegmentInput[],
  params: ProjectParams,
  inletHead: number,
  opts: BuildOpts,
): Segment[] {
  const { hazenC, minorLossFactor, maxVelocity } = params.hydraulic;
  let cum = 0;
  let head = inletHead;
  const out: Segment[] = [];
  inputs.forEach((input, index) => {
    const p = pipe(input.diameterId);
    const lengthM = Math.max(0, input.to - input.from);
    const q = lphToM3s(input.flowLph);
    const s = hazenGradient(q, p.innerMm, hazenC);
    const hf = s * lengthM * (1 + minorLossFactor);
    const vel = velocityOf(q, p.innerMm);
    const headIn = head;
    head = headIn - hf + opts.slopePerM * lengthM;
    cum += hf;
    const budget = opts.budgetAt(input.to);

    let status: SegStatus = 'ok';
    let advice: string | undefined;
    if (vel > maxVelocity + 1e-9) {
      status = 'velocity';
      const up = nextPipeUp(input.diameterId);
      advice = `流速 ${vel.toFixed(2)} m/s 超过上限 ${maxVelocity} m/s;${up ? `加大到 DN${up.dn}` : '已到目录最大管径,须降低流量'}。`;
    } else if (cum > budget + 1e-6) {
      status = 'warn';
      const up = nextPipeUp(input.diameterId);
      const ratio = up
        ? hazenGradient(q, up.innerMm, hazenC) / Math.max(s, 1e-12)
        : null;
      const localBudget = Math.max(1e-6, budget - (cum - hf));
      const maxLen = s > 0 ? localBudget / (s * (1 + minorLossFactor)) : Infinity;
      advice =
        up && ratio !== null
          ? `加粗到 DN${up.dn} 可把该段摩阻降到 ${(ratio * 100).toFixed(0)}%;或把该段缩短到 ${Math.max(0, maxLen).toFixed(1)} m 以内。`
          : `已到目录最大管径,只能缩短该段到 ${Math.max(0, maxLen).toFixed(1)} m 以内。`;
    }

    out.push({
      run,
      runIndex,
      index,
      from: input.from,
      to: input.to,
      lengthM,
      diameterId: input.diameterId,
      innerMm: p.innerMm,
      flowLph: input.flowLph,
      velocity: vel,
      hf,
      headIn,
      headOut: head,
      cumLoss: cum,
      budget,
      status,
      advice,
    });
  });
  return out;
}

/**
 * Allowable pressure drop for a target emitter flow deviation.
 *
 * For q ∝ h^x, a flow spread of ±d% needs h to stay within
 *   Δh/h = 1 - (1 - d)^(1/x)
 * of the design head. With d = 10% and x = 0.5 that is 19% of the head, which
 * is the familiar "支管允许压降" number in Chinese drip-design practice.
 */
export function allowableDropM(
  hNom: number,
  exponent: number,
  devPct: number,
): number {
  const d = Math.min(0.9, Math.max(0.005, devPct / 100));
  return hNom * (1 - Math.pow(1 - d, 1 / Math.max(0.05, exponent)));
}

/** The governing allowable drop for one branch: the strictest of the emitter
 *  types actually installed on it. */
export function designAllowableDrop(
  params: ProjectParams,
  types: { drip: boolean; sprinkler: boolean } = { drip: true, sprinkler: true },
): number {
  const dev = params.hydraulic.allowDropPct;
  const values: number[] = [];
  if (types.drip) values.push(allowableDropM(params.drip.hNomM, params.drip.exponent, dev));
  if (types.sprinkler)
    values.push(allowableDropM(params.sprinkler.hNomM, params.sprinkler.exponent, dev));
  return values.length ? Math.min(...values) : allowableDropM(10, 0.5, dev);
}

function emitterNominalFlow(type: 'drip' | 'sprinkler', params: ProjectParams): number {
  return type === 'drip' ? params.drip.qnLph : params.sprinkler.qLph;
}

function emitterNominalHead(type: 'drip' | 'sprinkler', params: ProjectParams): number {
  return type === 'drip' ? params.drip.hNomM : params.sprinkler.hNomM;
}

function emitterExponent(type: 'drip' | 'sprinkler', params: ProjectParams): number {
  return type === 'drip' ? params.drip.exponent : params.sprinkler.exponent;
}

function flowAtHead(nominal: number, h: number, hNom: number, x: number): number {
  if (h <= 0) return 0;
  return nominal * Math.pow(h / hNom, x);
}

function interpolateHead(segs: Segment[], fallback: number, s: number): number {
  if (!segs.length) return fallback;
  for (const g of segs) {
    if (s >= g.from - 1e-9 && s <= g.to + 1e-9) {
      const f = g.lengthM > 0 ? (s - g.from) / g.lengthM : 0;
      return g.headIn + (g.headOut - g.headIn) * f;
    }
  }
  return segs[segs.length - 1].headOut;
}

/** Design head a branch needs at its inlet to hold every emitter at nominal pressure. */
function requiredBranchInletHead(
  branch: Branch,
  params: ProjectParams,
  slopePerM: number,
): number {
  const p = pipe(branch.diameterId);
  const { hazenC, minorLossFactor } = params.hydraulic;
  const sorted = [...branch.emitters].sort((a, b) => a.s - b.s);
  let hDesign = 0;
  for (const e of sorted) hDesign = Math.max(hDesign, emitterNominalHead(e.type, params));
  let loss = 0;
  const bounds = [0, ...sorted.map((e) => e.s).filter((s) => s > 0.02), branch.lengthM];
  for (let i = 0; i < bounds.length - 1; i++) {
    let flow = 0;
    for (const e of sorted) if (e.s > bounds[i] + 1e-9) flow += emitterNominalFlow(e.type, params);
    loss +=
      hazenGradient(lphToM3s(flow), p.innerMm, hazenC) * (bounds[i + 1] - bounds[i]) * (1 + minorLossFactor);
  }
  return hDesign + loss - slopePerM * branch.lengthM;
}

export interface SolveInput {
  layout: Layout;
  params: ProjectParams;
}

export function solve({ layout, params }: SolveInput): Solution {
  const { hydraulic } = params;
  const sourceHead = kPaToHead(hydraulic.sourceKPa);
  const slopePerM = hydraulic.slopePermille / 1000;
  const warnings: Warning[] = [];

  const branchFlow = layout.branches.map((b) =>
    b.emitters.reduce((acc, e) => acc + emitterNominalFlow(e.type, params), 0),
  );

  // ---- main line ---------------------------------------------------------
  const sortedBranches = [...layout.branches].sort((a, b) => a.u - b.u);
  const positions: number[] = [layout.main.uFrom];
  for (const b of sortedBranches) {
    if (b.u > positions[positions.length - 1] + 1e-6) positions.push(b.u);
  }
  const tail = Math.max(layout.main.uTo, positions[positions.length - 1]);
  if (tail > positions[positions.length - 1] + 1e-6) positions.push(tail);

  const flowAt = (u: number) => {
    let q = 0;
    for (const b of sortedBranches) if (b.u >= u - 1e-9) q += branchFlow[b.index];
    return q;
  };

  const mainInputs: SegmentInput[] = [];
  for (let i = 0; i < positions.length - 1; i++) {
    mainInputs.push({
      from: positions[i],
      to: positions[i + 1],
      flowLph: flowAt(positions[i] + 1e-6),
      diameterId: params.main.headDiameterId,
    });
  }

  const totalFlow = branchFlow.reduce((a, b) => a + b, 0);
  const headworksLossM = params.headworks.lossKPa / 9.81;
  const mainInletHead = sourceHead - headworksLossM;
  const designHead = Math.max(params.drip.hNomM, params.sprinkler.hNomM);
  // The main may eat `mainDropPct` of the emitter design head over its whole
  // length; the allowance grows with distance so no single upstream segment can
  // spend the entire budget.
  const mainBudgetTotal = (hydraulic.mainDropPct / 100) * designHead;
  if (params.main.autoTaper) {
    const diameters = designMainDiameters(mainInputs, params, mainBudgetTotal);
    diameters.forEach((id, i) => {
      mainInputs[i].diameterId = id;
    });
  }
  const mainSegments = buildSegments('main', 0, mainInputs, params, mainInletHead, {
    budgetAt: () => mainBudgetTotal,
    slopePerM,
  });

  const headAtU = (u: number) => interpolateHead(mainSegments, mainInletHead, u);

  // ---- branches ----------------------------------------------------------
  const branchResults: BranchResult[] = layout.branches.map((branch) => {
    const sorted = [...branch.emitters].sort((a, b) => a.s - b.s);
    const bounds = [0, ...sorted.map((e) => e.s).filter((s) => s > 0.02), branch.lengthM];
    const inputs: SegmentInput[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      let flow = 0;
      for (const e of sorted) if (e.s > bounds[i] + 1e-9) flow += emitterNominalFlow(e.type, params);
      inputs.push({
        from: bounds[i],
        to: bounds[i + 1],
        diameterId: branch.diameterId,
        flowLph: flow,
      });
    }
    const inletHead = headAtU(branch.u);
    const hasDrip = sorted.some((e) => e.type === 'drip');
    const hasSpr = sorted.some((e) => e.type === 'sprinkler');
    const branchAllowance = designAllowableDrop(params, { drip: hasDrip, sprinkler: hasSpr });
    const segs = buildSegments('branch', branch.index, inputs, params, inletHead, {
      budgetAt: () => branchAllowance,
      slopePerM,
    });

    const emitterHeads = sorted.map((e) => interpolateHead(segs, inletHead, e.s));
    const emitters = sorted.map((e, i) => {
      const h = emitterHeads[i];
      return {
        ...e,
        q: flowAtHead(
          emitterNominalFlow(e.type, params),
          h,
          emitterNominalHead(e.type, params),
          emitterExponent(e.type, params),
        ),
      };
    });
    // Uniformity is judged per emitter type: a 250 L/h sprinkler next to a
    // 2 L/h drip is not 1000% non-uniform, they are two different devices. For
    // each type the deviation is (qmax - qmin) / qavg of that type alone.
    const uniformityOf = (type: 'drip' | 'sprinkler'): number => {
      const group = emitters.filter((e) => e.type === type).map((e) => e.q);
      if (group.length < 2) return 0;
      const avg = group.reduce((a, b) => a + b, 0) / group.length;
      if (avg <= 0) return 0;
      return ((Math.max(...group) - Math.min(...group)) / avg) * 100;
    };
    const dev = Math.max(uniformityOf('drip'), uniformityOf('sprinkler'));
    const heads = emitterHeads.length ? emitterHeads : [inletHead];
    return {
      index: branch.index,
      diameterId: branch.diameterId,
      requiredHead: requiredBranchInletHead(branch, params, slopePerM),
      inletHead,
      endHead: segs.length ? segs[segs.length - 1].headOut : inletHead,
      flowLph: branchFlow[branch.index],
      segments: segs,
      emitters,
      emitterHeads,
      flowDeviationPct: dev,
      flags: segs.filter((s) => s.status !== 'ok').length,
      minKPa: headToKPa(Math.min(...heads)),
      maxKPa: headToKPa(Math.max(...heads)),
    };
  });

  // ---- pressure zones from the source ------------------------------------
  const zones = buildPressureZones(mainSegments, sortedBranches, params);
  // Source must pay: headworks loss + the whole main run + the hungriest branch.
  const mainTotalLoss = mainSegments.length ? mainSegments[mainSegments.length - 1].cumLoss : 0;
  const worstBranchHead = Math.max(0, ...branchResults.map((b) => b.requiredHead));
  const requiredSourceKPa = headToKPa(headworksLossM + mainTotalLoss + worstBranchHead);

  // ---- warnings ----------------------------------------------------------
  for (const seg of mainSegments) {
    if (seg.status === 'velocity') {
      warnings.push({
        id: `main-vel-${seg.index}`,
        kind: 'velocity',
        severity: 'error',
        title: `主管第 ${seg.index + 1} 段流速超限`,
        detail: `${seg.flowLph.toFixed(0)} L/h 走 DN${pipe(seg.diameterId).dn},流速 ${seg.velocity.toFixed(2)} m/s。`,
        advice: seg.advice,
        u: seg.from,
        segmentIndex: seg.index,
      });
    } else if (seg.status === 'warn') {
      warnings.push({
        id: `main-drop-${seg.index}`,
        kind: 'pressure',
        severity: 'warn',
        title: `主管第 ${seg.index + 1} 段压降超限`,
        detail: `到 ${seg.to.toFixed(1)} m 处累计摩阻 ${seg.cumLoss.toFixed(2)} m,超过允许 ${seg.budget.toFixed(2)} m。`,
        advice: seg.advice,
        u: seg.from,
        segmentIndex: seg.index,
      });
    }
  }
  for (const br of branchResults) {
    if (br.flags === 0) continue;
    const worst = br.segments.find((s) => s.status === 'warn');
    warnings.push({
      id: `branch-${br.index}`,
      kind: 'pressure',
      severity: 'warn',
      title: `支管 ${br.index + 1} 压降超限(${br.flags} 段)`,
      detail: `入口 ${br.inletHead.toFixed(1)} m,末端 ${br.endHead.toFixed(
        1,
      )} m,灌水器出流偏差 ${br.flowDeviationPct.toFixed(0)}%。`,
      advice: worst?.advice,
      branchIndex: br.index,
    });
  }

  const conflicts = findAisleConflicts(layout);
  for (const c of conflicts) {
    const branch = layout.branches.find((b) => b.index === c.branchIndex);
    warnings.push({
      id: `aisle-${c.branchIndex}-${c.aisleIndex}`,
      kind: 'aisle',
      severity: 'warn',
      title: `支管 ${c.branchIndex + 1} 穿过作业道 ${c.aisleIndex + 1}`,
      detail: `支管在 ${(branch?.u ?? 0).toFixed(2)} m,作业道占 ${c.aisle.u0.toFixed(
        2,
      )}–${c.aisle.u1.toFixed(2)} m,整条支管横在通行面上。`,
      advice:
        c.suggestedU !== null
          ? `建议移到 ${c.suggestedU.toFixed(2)} m(贴作业道边),或把作业道挪到支管之间。`
          : '作业道横跨整个跨度,只能移动支管。',
      branchIndex: c.branchIndex,
    });
  }

  if (!layout.branches.length) {
    warnings.push({
      id: 'no-branches',
      kind: 'layout',
      severity: 'error',
      title: '没有生成支管',
      detail: '按当前棚长、首管偏移与支管间距算不出任何支管。',
      advice: '减小支管间距或首个支管偏移。',
    });
  }
  for (const b of layout.branches) {
    if (!b.emitters.length) {
      warnings.push({
        id: `branch-empty-${b.index}`,
        kind: 'layout',
        severity: 'warn',
        title: `支管 ${b.index + 1} 上没有灌水器`,
        detail: '滴头间距大于支管长度。',
        branchIndex: b.index,
      });
    }
    for (const r of branchResults) {
      if (r.index !== b.index) continue;
      for (const seg of r.segments) {
        if (seg.status === 'velocity') {
          warnings.push({
            id: `branch-vel-${b.index}-${seg.index}`,
            kind: 'velocity',
            severity: 'error',
            title: `支管 ${b.index + 1} 第 ${seg.index + 1} 段流速超限`,
            detail: `流速 ${seg.velocity.toFixed(2)} m/s。`,
            advice: seg.advice,
            branchIndex: b.index,
          });
        }
      }
    }
  }
  if (requiredSourceKPa > hydraulic.sourceKPa + 1) {
    warnings.push({
      id: 'source-short',
      kind: 'pressure',
      severity: 'error',
      title: '水源压力不足',
      detail: `设计要求水源 ${requiredSourceKPa.toFixed(0)} kPa,现有 ${hydraulic.sourceKPa} kPa。`,
      advice: '加粗主管、缩短支管,或在首部加压。',
    });
  }

  // ---- totals ------------------------------------------------------------
  const dripCount = layout.branches.reduce((a, b) => a + branchZoneSummary(b).drip, 0);
  const sprinklerCount = layout.branches.reduce((a, b) => a + branchZoneSummary(b).sprinkler, 0);
  const pipeM: Record<string, number> = {};
  for (const s of mainSegments) {
    pipeM[s.diameterId] = (pipeM[s.diameterId] ?? 0) + s.lengthM;
  }
  for (const br of branchResults) {
    for (const s of br.segments) {
      pipeM[s.diameterId] = (pipeM[s.diameterId] ?? 0) + s.lengthM;
    }
  }

  const fingerprint = hashNumbers([
    layout.seed,
    layout.uExtent,
    layout.vExtent,
    ...layout.branches.flatMap((b) => [
      b.u * 10,
      b.lengthM,
      b.emitters.length,
      ...b.emitters.map((e) => e.s * 100),
    ]),
  ]);

  const main: MainResult = {
    segments: mainSegments,
    nodes: positions.map((u) => ({
      u,
      head: headAtU(u),
      kpa: headToKPa(headAtU(u)),
      branchIndex: sortedBranches.find((b) => Math.abs(b.u - u) < 1e-6)?.index ?? null,
    })),
    zones,
    totalFlowLph: totalFlow,
    flags: mainSegments.filter((s) => s.status !== 'ok').length,
    headworksHead: mainInletHead,
    sourceHead,
    requiredSourceKPa,
  };

  return {
    layout,
    main,
    branches: branchResults,
    conflicts,
    warnings,
    fingerprint,
    totals: { flowLph: totalFlow, dripCount, sprinklerCount, branchCount: layout.branches.length, pipeM },
  };
}

/**
 * Pressure sections along the main, measured from the source. A new section
 * starts when the pressure crosses a `zoneKPa` band or when the pipe steps to a
 * new diameter, so each label sits at a real end-of-section (管径变化点或压力降一档).
 */
function buildPressureZones(
  mainSegments: Segment[],
  sortedBranches: Branch[],
  params: ProjectParams,
): PressureZone[] {
  const band = Math.max(2, params.hydraulic.zoneKPa);
  const zones: PressureZone[] = [];
  if (!mainSegments.length) return zones;

  const countsBranches = (from: number, to: number) =>
    sortedBranches.filter((b) => b.u >= from - 1e-9 && b.u < to - 1e-9).length;

  let group: Segment[] = [];
  const flush = () => {
    if (!group.length) return;
    const first = group[0];
    const last = group[group.length - 1];
    const startKPa = headToKPa(first.headIn);
    const endKPa = headToKPa(last.headOut);
    zones.push({
      index: zones.length,
      uFrom: first.from,
      uTo: last.to,
      lengthM: last.to - first.from,
      startKPa,
      endKPa,
      branchCount: countsBranches(first.from, last.to),
      diameterId: last.diameterId,
    });
    group = [];
  };

  for (const seg of mainSegments) {
    if (group.length) {
      const prev = group[group.length - 1];
      // Pressure is measured from the top of the zone, so the band test is
      // "did we fall a full band below where this zone started", not "did the
      // band index change" — the latter splits zones into slivers every time
      // friction crosses a boundary mid-zone.
      const bandCrossed =
        headToKPa(group[0].headIn) - headToKPa(seg.headOut) >= band - 1e-9;
      const diameterChanged = prev.diameterId !== seg.diameterId;
      if (bandCrossed || diameterChanged) flush();
    }
    group.push(seg);
  }
  flush();
  return zones.filter((z) => z.lengthM > 1e-6);
}

export function findAisleConflicts(layout: Layout): AisleConflict[] {
  const out: AisleConflict[] = [];
  for (const br of layout.branches) {
    layout.aisles.forEach((aisle, ai) => {
      if (br.u > aisle.u0 - 1e-9 && br.u < aisle.u1 + 1e-9) {
        const before = aisle.u0 - 0.2;
        const after = aisle.u1 + 0.2;
        const suggested = Math.abs(br.u - before) <= Math.abs(br.u - after) ? before : after;
        out.push({
          branchIndex: br.index,
          aisleIndex: ai,
          aisle,
          suggestedU:
            suggested > layout.main.uFrom + 0.15 && suggested < layout.main.uTo - 0.15
              ? suggested
              : null,
        });
      }
    });
  }
  return out;
}
