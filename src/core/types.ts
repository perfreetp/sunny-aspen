/**
 * Domain types for a greenhouse drip/sprinkler irrigation network.
 *
 * All geometry is stored in a canonical frame:
 *   u  — distance along the main line (from the headworks towards the house tail)
 *   v  — distance across the house (the direction the laterals / seedbeds run)
 *
 * `mainAxis` decides how (u, v) is mapped onto the real greenhouse footprint:
 *   'length' — main runs along the house length (棚长), laterals across the span
 *   'span'   — main runs across the span, laterals along the length
 * In both cases laterals follow the seedbed orientation by construction.
 */

export type MainAxis = 'length' | 'span';

export interface PipeSpec {
  id: string;
  /** nominal diameter, mm */
  dn: number;
  /** inner diameter, mm */
  innerMm: number;
  /** nominal pressure rating, MPa */
  pnMpa: number;
  /** what the pipe is normally used for, shown in the equipment panel */
  use: string;
}

export interface DripSpec {
  id: string;
  name: string;
  /** nominal flow per emitter, L/h */
  qnLph: number;
  /** head at which qn is quoted, m */
  hNomM: number;
  /** emitter discharge exponent x in q = k·h^x */
  exponent: number;
  /** manufacturing coefficient of variation */
  cv: number;
}

export interface SprinklerSpec {
  id: string;
  name: string;
  qLph: number;
  hNomM: number;
  exponent: number;
  /** wetted radius, m */
  radiusM: number;
}

export interface HeadworksSpec {
  id: string;
  name: string;
  /** loss through filter + valve + meter, kPa at design flow */
  lossKPa: number;
}

export interface GreenhouseParams {
  /** 棚长 m — full footprint length */
  lengthM: number;
  /** 棚宽(跨度) m */
  spanM: number;
  /** direction of the main line */
  mainAxis: MainAxis;
  /** distance from the head wall to the headworks, m */
  headMarginM: number;
  /** distance from the tail wall to the end of the main, m */
  tailMarginM: number;
  /** distance from the side wall to the main line, m */
  mainOffsetM: number;
}

export interface BedParams {
  /** 苗床宽 m (along the main axis) */
  widthM: number;
  /** 苗床间净距 m */
  gapM: number;
  /** 每 N 床设一道作业道 */
  bedsPerBlock: number;
  /** 作业道宽 m */
  aisleWidthM: number;
  /** first bed offset from the head wall, m */
  startMarginM: number;
  /** last bed offset from the tail wall, m */
  endMarginM: number;
}

export interface BranchParams {
  /** 支管间距 m */
  spacingM: number;
  /** first branch offset from the headworks, m */
  firstOffsetM: number;
  /** branch lateral pipe */
  diameterId: string;
  /** construction jitter ±, mm — driven by the seed */
  jitterMm: number;
  /** snap branches out of working aisles when generating */
  avoidAisles: boolean;
  /** lay each branch along a seedbed centre line instead of free spacing */
  followBeds: boolean;
  /** length of the sprinkler section at the branch tail, m (0 = none) */
  sprinklerZoneM: number;
}

export interface DripParams {
  specId: string;
  qnLph: number;
  hNomM: number;
  exponent: number;
  cv: number;
  /** 滴头间距 m */
  spacingM: number;
  /** 首滴头距支管起点 m */
  firstOffsetM: number;
  /** installation jitter ±, mm */
  jitterMm: number;
}

export interface SprinklerParams {
  specId: string;
  qLph: number;
  hNomM: number;
  exponent: number;
  radiusM: number;
  /** 喷头间距 = 射程 × 间距系数 */
  spacingFactor: number;
}

export interface MainParams {
  /** 首段主管管径 */
  headDiameterId: string;
  /** step the main down automatically as flow drops */
  autoTaper: boolean;
}

export interface HydraulicParams {
  /** pressure available at the water source, kPa */
  sourceKPa: number;
  /** target emitter flow deviation, % — sets the allowable drop on a branch */
  allowDropPct: number;
  /** allowable main-line drop, % of the emitter design head */
  mainDropPct: number;
  /** allowable velocity, m/s */
  maxVelocity: number;
  /** minor losses as a fraction of friction loss */
  minorLossFactor: number;
  /** Hazen-Williams C for PE */
  hazenC: number;
  /** ground fall towards the house tail, ‰ (positive = pressure gains downstream) */
  slopePermille: number;
  /** pressure band used for the main-line pressure zoning, kPa */
  zoneKPa: number;
}

export interface HeadworksParams {
  specId: string;
  lossKPa: number;
  /** 施肥系统 included in the BOM */
  fertigation: boolean;
}

export interface ProjectParams {
  greenhouse: GreenhouseParams;
  beds: BedParams;
  branch: BranchParams;
  drip: DripParams;
  sprinkler: SprinklerParams;
  main: MainParams;
  hydraulic: HydraulicParams;
  headworks: HeadworksParams;
}

/** Layout overrides the technician has made by hand. Never touched by hydraulic recomputation. */
export interface Overrides {
  /** branch index -> u offset, m (dragged position) */
  branchOffset: Record<string, number>;
  /** branch index -> emitter spacing, m (dragged emitter) */
  branchSpacing: Record<string, number>;
  /** branch index -> pipe id */
  branchDiameter: Record<string, string>;
}

export interface ProjectDoc {
  version: 1;
  name: string;
  params: ProjectParams;
  seed: number;
  overrides: Overrides;
}

export interface Rect {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export type ZoneType = 'drip' | 'sprinkler';

export interface BranchZone {
  type: ZoneType;
  /** distance from the branch inlet, m */
  from: number;
  to: number;
}

export interface Emitter {
  type: ZoneType;
  /** distance from the branch inlet, m */
  s: number;
  /** catalogue spec id */
  specId: string;
}

export interface Branch {
  id: string;
  /** stable override key, e.g. "b3" — survives regeneration */
  key: string;
  index: number;
  /** position along the main, m */
  u: number;
  /** position the generator would have used, before hand edits */
  nominalU: number;
  /** true when the technician dragged this branch */
  pinned: boolean;
  spacingM: number;
  /** true when spacing was set by hand (branch only, never neighbours) */
  spacingManual: boolean;
  diameterId: string;
  vFrom: number;
  vTo: number;
  lengthM: number;
  /** emitter spacing actually used for the drip zone of this branch */
  dripSpacingM: number;
  /** emitter spacing used for the sprinkler zone of this branch */
  sprinklerSpacingM: number;
  /** true when drip spacing was changed by hand */
  spacingOverridden: boolean;
  zones: BranchZone[];
  emitters: Emitter[];
}

export interface Layout {
  mainAxis: MainAxis;
  /** footprint in canonical coordinates */
  uExtent: number;
  vExtent: number;
  beds: Rect[];
  aisles: Rect[];
  main: { v: number; uFrom: number; uTo: number; headU: number };
  branches: Branch[];
  seed: number;
}

export interface AisleConflict {
  branchIndex: number;
  aisleIndex: number;
  aisle: Rect;
  /** suggested u offset that clears the aisle */
  suggestedU: number | null;
}

export type SegStatus = 'ok' | 'warn' | 'velocity' | 'idle';

export interface Segment {
  run: 'main' | 'branch';
  runIndex: number;
  index: number;
  from: number;
  to: number;
  lengthM: number;
  diameterId: string;
  innerMm: number;
  flowLph: number;
  velocity: number;
  /** friction + minor loss, m */
  hf: number;
  headIn: number;
  headOut: number;
  /** cumulative loss from the run inlet, m */
  cumLoss: number;
  /** allowable cumulative loss at this point, m */
  budget: number;
  status: SegStatus;
  advice?: string;
}

export interface PressureZone {
  index: number;
  uFrom: number;
  uTo: number;
  lengthM: number;
  /** pressure at the zone start, kPa */
  startKPa: number;
  /** pressure at the zone end, kPa — this is the number on the label */
  endKPa: number;
  branchCount: number;
  diameterId: string;
}

export interface BranchResult {
  index: number;
  diameterId: string;
  /** head needed at the branch inlet to serve every emitter at nominal pressure */
  requiredHead: number;
  inletHead: number;
  endHead: number;
  flowLph: number;
  segments: Segment[];
  /** emitters with the flow they actually deliver at their local pressure */
  emitters: (Emitter & { q: number })[];
  /** pressure at each emitter, m */
  emitterHeads: number[];
  /** (qmax - qmin) / qavg, % */
  flowDeviationPct: number;
  flags: number;
  /** worst pressure at an emitter, kPa */
  minKPa: number;
  maxKPa: number;
}

export interface MainResult {
  segments: Segment[];
  nodes: { u: number; head: number; kpa: number; branchIndex: number | null }[];
  zones: PressureZone[];
  totalFlowLph: number;
  flags: number;
  headworksHead: number;
  sourceHead: number;
  /** source pressure the design really needs, kPa */
  requiredSourceKPa: number;
}

export interface Solution {
  layout: Layout;
  main: MainResult;
  branches: BranchResult[];
  conflicts: AisleConflict[];
  warnings: Warning[];
  fingerprint: string;
  totals: {
    flowLph: number;
    dripCount: number;
    sprinklerCount: number;
    branchCount: number;
    pipeM: Record<string, number>;
  };
}

export interface Warning {
  id: string;
  kind: 'pressure' | 'velocity' | 'aisle' | 'layout';
  severity: 'warn' | 'error' | 'info';
  title: string;
  detail: string;
  /** what to do about it */
  advice?: string;
  branchIndex?: number;
  segmentIndex?: number;
  u?: number;
}
