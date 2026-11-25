import { circlePoints, type Point2, type ToothProfileId } from './gearGeometry';

export type { ToothProfileId } from './gearGeometry';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface DesignParams {
  module: number;
  pressureAngle: number;
  gearCount: number;
  baseTeeth: number;
  spacing: number;
  thickness: number;
  profile: ToothProfileId;
  boreDiameter: number;
  gridThickness: number;
  gridHeight: number;
  gridClearance: number;
  seed: number;
  batchCount: number;
}

export interface HolePattern {
  count: number;
  diameter: number;
  pcd: number;
  phase: number;
}

export interface GearPart {
  id: string;
  index: number;
  teeth: number;
  manual: boolean;
  module: number;
  pressureAngle: number;
  profile: ToothProfileId;
  thickness: number;
  boreDiameter: number;
  pitchRadius: number;
  outerRadius: number;
  rootRadius: number;
  rotationZ: number;
  position: Vec3;
  holeLoops: Array<{ radius: number; points: Point2[] }>;
  holePattern: HolePattern | null;
  specKey: string;
}

export interface RackPart {
  id: 'RACK';
  length: number;
  height: number;
  bodyHeight: number;
  thickness: number;
  toothPitch: number;
  toothCount: number;
  mountingHoleLoops: Array<{ radius: number; points: Point2[] }>;
  position: Vec3;
}

export interface GridLayout {
  width: number;
  height: number;
  centerY: number;
  frameWidth: number;
  thicknessMax: number;
  zFront: number;
  zRear: number;
  vertical: Array<{ x: number; length: number }>;
  horizontal: Array<{ y: number; length: number }>;
}

export interface BomRow {
  id: string;
  category: string;
  name: string;
  spec: string;
  material: string;
  unit: string;
  qtyPerSet: number;
  batchCount: number;
  qty: number;
  positions: string[];
}

export interface DesignModel {
  version: 1;
  params: DesignParams;
  overrides: Record<string, number>;
  gears: GearPart[];
  rack: RackPart;
  grid: GridLayout;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
  };
  bom: BomRow[];
  warnings: string[];
  fingerprint: string;
  seedCode: string;
}

export const PROFILE_LABELS: Record<ToothProfileId, string> = {
  involute: '渐开线',
  trapezoidal: '梯形齿',
  arc: '圆弧齿',
};

export const PARAM_LIMITS = {
  module: { min: 1, max: 6, step: 0.5 },
  pressureAngle: { min: 14.5, max: 25, step: 0.5 },
  gearCount: { min: 3, max: 16, step: 1 },
  baseTeeth: { min: 12, max: 64, step: 1 },
  spacing: { min: 24, max: 180, step: 1 },
  thickness: { min: 6, max: 40, step: 1 },
  boreDiameter: { min: 3, max: 48, step: 1 },
  gridThickness: { min: 2, max: 40, step: 1 },
  gridHeight: { min: 140, max: 700, step: 10 },
  gridClearance: { min: 12, max: 180, step: 2 },
  seed: { min: 0, max: 999_999_999, step: 1 },
  batchCount: { min: 1, max: 99, step: 1 },
} as const;

export function createDefaultParams(): DesignParams {
  return {
    module: 2,
    pressureAngle: 20,
    gearCount: 7,
    baseTeeth: 20,
    spacing: 40,
    thickness: 12,
    profile: 'involute',
    boreDiameter: 8,
    gridThickness: 8,
    gridHeight: 240,
    gridClearance: 42,
    seed: 20261126,
    batchCount: 1,
  };
}

export function gearId(indexZeroBased: number): string {
  return `G${indexZeroBased + 1}`;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clampInt(value: number, min: number, max: number): number {
  return Math.round(clampNumber(value, min, max));
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Construction rule for grille bars:
 * bar thickness may not exceed 42% of pitch and must leave at least 12 mm opening.
 */
export function maxGridThickness(spacing: number): number {
  return Math.min(
    PARAM_LIMITS.gridThickness.max,
    Math.max(2, Math.floor(Math.min(spacing * 0.42, spacing - 12))),
  );
}

export function standardCenterSpacing(params: DesignParams): number {
  return params.module * params.baseTeeth;
}

export function normalizeParams(input: Partial<DesignParams>): DesignParams {
  const base = createDefaultParams();
  const merged = { ...base, ...input };
  return {
    ...merged,
    module: clampNumber(merged.module, PARAM_LIMITS.module.min, PARAM_LIMITS.module.max),
    pressureAngle: clampNumber(
      merged.pressureAngle,
      PARAM_LIMITS.pressureAngle.min,
      PARAM_LIMITS.pressureAngle.max,
    ),
    gearCount: clampInt(merged.gearCount, PARAM_LIMITS.gearCount.min, PARAM_LIMITS.gearCount.max),
    baseTeeth: clampInt(merged.baseTeeth, PARAM_LIMITS.baseTeeth.min, PARAM_LIMITS.baseTeeth.max),
    spacing: clampNumber(merged.spacing, PARAM_LIMITS.spacing.min, PARAM_LIMITS.spacing.max),
    thickness: clampNumber(merged.thickness, PARAM_LIMITS.thickness.min, PARAM_LIMITS.thickness.max),
    boreDiameter: clampNumber(
      merged.boreDiameter,
      PARAM_LIMITS.boreDiameter.min,
      PARAM_LIMITS.boreDiameter.max,
    ),
    gridThickness: clampInt(
      merged.gridThickness,
      PARAM_LIMITS.gridThickness.min,
      PARAM_LIMITS.gridThickness.max,
    ),
    gridHeight: clampNumber(
      merged.gridHeight,
      PARAM_LIMITS.gridHeight.min,
      PARAM_LIMITS.gridHeight.max,
    ),
    gridClearance: clampNumber(
      merged.gridClearance,
      PARAM_LIMITS.gridClearance.min,
      PARAM_LIMITS.gridClearance.max,
    ),
    seed: clampInt(merged.seed, PARAM_LIMITS.seed.min, PARAM_LIMITS.seed.max),
    batchCount: clampInt(merged.batchCount, PARAM_LIMITS.batchCount.min, PARAM_LIMITS.batchCount.max),
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

export function shortHash(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(16).padStart(13, '0').slice(0, 12).toUpperCase();
}

function hashSeed(text: string): number {
  return Number.parseInt(shortHash(text).slice(0, 8), 16) >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeHoles(
  params: DesignParams,
  id: string,
  teeth: number,
  pitchRadius: number,
  rootRadius: number,
): Pick<GearPart, 'holeLoops' | 'holePattern' | 'boreDiameter'> {
  const maxBore = Math.max(4, rootRadius * 0.42);
  const boreDiameter = round1(Math.min(params.boreDiameter, maxBore * 2));
  const boreRadius = boreDiameter / 2;
  const holeLoops: GearPart['holeLoops'] = [
    { radius: boreRadius, points: circlePoints(0, 0, boreRadius, 36, true) },
  ];

  if (pitchRadius < 24) {
    return { holeLoops, holePattern: null, boreDiameter };
  }

  const rng = mulberry32(hashSeed(`${params.seed}:${id}:${params.module}:${teeth}:${params.profile}`));
  const count = 3 + Math.floor(rng() * 4);
  const pcdRadius = pitchRadius * (0.61 + rng() * 0.07);
  let diameter = params.module * (1.05 + rng() * 0.45);
  const edgeLimit = Math.min(pcdRadius - boreRadius - 2.5, (Math.PI * 2 * pcdRadius) / count * 0.31);
  diameter = Math.max(3, Math.min(diameter * 2, edgeLimit * 2));

  if (diameter < 4 || pcdRadius - diameter / 2 < boreRadius + 2) {
    return { holeLoops, holePattern: null, boreDiameter };
  }

  const radius = diameter / 2;
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < count; i += 1) {
    const angle = phase + (i / count) * Math.PI * 2;
    const cx = pcdRadius * Math.cos(angle);
    const cy = pcdRadius * Math.sin(angle);
    holeLoops.push({ radius, points: circlePoints(cx, cy, radius, 22, true) });
  }

  return {
    holeLoops,
    boreDiameter,
    holePattern: {
      count,
      diameter: round1(diameter),
      pcd: round1(pcdRadius * 2),
      phase: round2(phase),
    },
  };
}

function positionText(x: number, y: number, z = 0): string {
  return `X${round1(x) >= 0 ? '+' : ''}${round1(x)} / Y${round1(y) >= 0 ? '+' : ''}${round1(y)} / Z${round1(z)}`;
}

export function buildDesignModel(
  rawParams: DesignParams,
  rawOverrides: Record<string, number> = {},
): DesignModel {
  const params = normalizeParams(rawParams);
  const overrides: Record<string, number> = {};
  for (const [key, value] of Object.entries(rawOverrides)) {
    if (/^G\d+$/.test(key) && Number.isFinite(value)) {
      overrides[key] = clampInt(value, PARAM_LIMITS.baseTeeth.min, 120);
    }
  }

  const warnings: string[] = [];
  const standardStep = standardCenterSpacing(params);
  const spacingDelta = params.spacing - standardStep;

  const draftGears = Array.from({ length: params.gearCount }, (_, zeroIndex) => {
    const id = gearId(zeroIndex);
    const manual = Object.prototype.hasOwnProperty.call(overrides, id);
    const teeth = manual ? overrides[id] : params.baseTeeth;
    const pitchRadius = (params.module * teeth) / 2;
    const outerRadius = pitchRadius + params.module;
    const rootRadius = Math.max(params.module * 1.6, pitchRadius - 1.25 * params.module);
    return { id, index: zeroIndex, manual, teeth, pitchRadius, outerRadius, rootRadius };
  });

  let cursor = 0;
  const xList: number[] = [];
  draftGears.forEach((gear, i) => {
    if (i > 0) {
      const previous = draftGears[i - 1];
      // Horizontal component of the mesh center distance when every pitch circle
      // is tangent to the same horizontal rack pitch line.
      const meshHorizontal = 2 * Math.sqrt(previous.pitchRadius * gear.pitchRadius);
      cursor += Math.max(8, meshHorizontal + spacingDelta);
    }
    xList.push(cursor);
  });
  const xCenter = cursor / 2;

  const gears: GearPart[] = draftGears.map((draft, i) => {
    const x = round2(xList[i] - xCenter);
    const y = round2(draft.pitchRadius);
    const holeData = makeHoles(params, draft.id, draft.teeth, draft.pitchRadius, draft.rootRadius);
    const rotationZ = (i % 2) * (Math.PI / draft.teeth);
    const holeSpec = holeData.holePattern
      ? ` / 减重孔 ${holeData.holePattern.count}-Ø${holeData.holePattern.diameter} PCD${holeData.holePattern.pcd}`
      : '';
    const specKey = [
      params.module,
      params.pressureAngle,
      draft.teeth,
      params.profile,
      params.thickness,
      holeData.boreDiameter,
      holeData.holePattern ? `${holeData.holePattern.count}x${holeData.holePattern.diameter}@${holeData.holePattern.pcd}` : 'solid',
    ].join('|');

    return {
      id: draft.id,
      index: i,
      teeth: draft.teeth,
      manual: draft.manual,
      module: params.module,
      pressureAngle: params.pressureAngle,
      profile: params.profile,
      thickness: params.thickness,
      ...holeData,
      pitchRadius: round2(draft.pitchRadius),
      outerRadius: round2(draft.outerRadius),
      rootRadius: round2(draft.rootRadius),
      rotationZ: round2(rotationZ),
      position: { x, y, z: 0 },
      specKey: shortHash(specKey),
    };
  });

  const minGearX = Math.min(...gears.map((g) => g.position.x - g.outerRadius));
  const maxGearX = Math.max(...gears.map((g) => g.position.x + g.outerRadius));
  const maxOuterY = Math.max(...gears.map((g) => g.position.y + g.outerRadius));

  const rackLength = Math.ceil((maxGearX - minGearX + params.spacing * 2.4) / 10) * 10;
  const toothPitch = Math.PI * params.module;
  const rackToothCount = Math.max(8, Math.round(rackLength / toothPitch));
  const rackActualLength = rackToothCount * toothPitch;
  const rackBodyHeight = Math.max(12, params.module * 5.2);
  const rackBottomY = -1.25 * params.module - rackBodyHeight;

  const mountingHoleLoops: RackPart['mountingHoleLoops'] = [];
  const rackHoleRadius = clampNumber(params.module * 1.35, 2.5, 7);
  const firstHole = Math.ceil((-rackActualLength / 2 + params.spacing * 0.6) / params.spacing) * params.spacing;
  for (let x = firstHole; x <= rackActualLength / 2 - params.spacing * 0.6; x += params.spacing) {
    const y = -1.25 * params.module - rackBodyHeight * 0.48;
    mountingHoleLoops.push({
      radius: rackHoleRadius,
      points: circlePoints(x, y, rackHoleRadius, 24, true),
    });
  }

  const rack: RackPart = {
    id: 'RACK',
    length: round1(rackActualLength),
    height: round1(rackBodyHeight + 2.25 * params.module),
    bodyHeight: round1(rackBodyHeight),
    thickness: params.thickness,
    toothPitch: round2(toothPitch),
    toothCount: rackToothCount,
    mountingHoleLoops,
    position: { x: 0, y: 0, z: 0 },
  };

  const contentMinY = rackBottomY - 8;
  const contentMaxY = maxOuterY + 12;
  const contentHeight = contentMaxY - contentMinY;
  const gridHeight = Math.ceil(Math.max(params.gridHeight, contentHeight + 70) / 10) * 10;
  const gridCenterY = round1((contentMaxY + contentMinY) / 2);
  const gridWidth = Math.ceil((rackActualLength + params.spacing * 1.6) / 10) * 10;
  const frameWidth = Math.max(12, params.gridThickness * 1.8);
  const thicknessMax = maxGridThickness(params.spacing);
  const zFront = round1(params.thickness / 2 + params.gridClearance + params.gridThickness / 2);
  const zRear = -zFront;

  const vertical: GridLayout['vertical'] = [];
  const maxVerticalIndex = Math.floor((gridWidth / 2 - frameWidth * 1.4) / params.spacing);
  for (let i = -maxVerticalIndex; i <= maxVerticalIndex; i += 1) {
    vertical.push({ x: round1(i * params.spacing), length: round1(gridHeight - frameWidth * 2) });
  }

  const horizontal: GridLayout['horizontal'] = [];
  const minHorizontalY = gridCenterY - gridHeight / 2 + frameWidth * 1.6;
  const maxHorizontalY = gridCenterY + gridHeight / 2 - frameWidth * 1.6;
  for (let y = minHorizontalY; y <= maxHorizontalY + 0.01; y += params.spacing) {
    horizontal.push({ y: round1(y), length: round1(gridWidth - frameWidth * 2) });
  }

  const grid: GridLayout = {
    width: gridWidth,
    height: gridHeight,
    centerY: gridCenterY,
    frameWidth: round1(frameWidth),
    thicknessMax,
    zFront,
    zRear,
    vertical,
    horizontal,
  };

  const minX = -gridWidth / 2;
  const maxX = gridWidth / 2;
  const minY = gridCenterY - gridHeight / 2;
  const maxY = gridCenterY + gridHeight / 2;

  if (params.gridThickness > thicknessMax) {
    warnings.push(
      `栅格条厚度 ${params.gridThickness}mm 超过间距 ${params.spacing}mm 的可用上限 ${thicknessMax}mm，已钳制。`,
    );
  }
  if (Math.abs(spacingDelta) > 0.5) {
    warnings.push(
      `整组间距相对标准啮合节距 ${round1(standardStep)}mm 偏移 ${round1(spacingDelta)}mm；施工时按各齿轮实际 X 坐标和中心距配钻。`,
    );
  }
  const overBore = gears.some((g) => params.boreDiameter > g.boreDiameter + 0.05);
  if (overBore) {
    warnings.push('部分小齿轮的预设轴孔过大，模型与清单已采用安全最大轴孔；建议减小轴径或加大模数/齿数。');
  }
  if (params.pressureAngle !== 20 && params.pressureAngle !== 14.5 && params.pressureAngle !== 25) {
    warnings.push('当前压力角不是常用 14.5°/20°/25°，下料前需由刀具厂确认滚刀/插齿刀。');
  }

  const bom = buildBom(params, gears, rack, grid);
  const seedCode = `SEED-${String(params.seed).padStart(9, '0')}`;

  const model: DesignModel = {
    version: 1,
    params,
    overrides: { ...overrides },
    gears,
    rack,
    grid,
    bounds: {
      minX: round1(minX),
      maxX: round1(maxX),
      minY: round1(minY),
      maxY: round1(maxY),
      width: round1(maxX - minX),
      height: round1(maxY - minY),
    },
    bom,
    warnings,
    fingerprint: '',
    seedCode,
  };

  model.fingerprint = `FP-${shortHash(stableStringify(model))}`;
  return model;
}

function buildBom(
  params: DesignParams,
  gears: GearPart[],
  rack: RackPart,
  grid: GridLayout,
): BomRow[] {
  const rows: BomRow[] = [];

  const gearGroups = new Map<string, GearPart[]>();
  for (const gear of gears) {
    const list = gearGroups.get(gear.specKey) ?? [];
    list.push(gear);
    gearGroups.set(gear.specKey, list);
  }

  let groupNumber = 1;
  for (const group of gearGroups.values()) {
    const first = group[0];
    const manual = group.some((g) => g.manual);
    const holeText = first.holePattern
      ? `；减重孔 ${first.holePattern.count}-Ø${first.holePattern.diameter}，PCD Ø${first.holePattern.pcd}`
      : '；腹板无减重孔';
    rows.push({
      id: `BOM-GEAR-${groupNumber}`,
      category: '齿轮',
      name: manual ? `手调齿轮组 ${groupNumber}` : `标准齿轮组 ${groupNumber}`,
      spec: `模数 m${first.module}；压力角 ${first.pressureAngle}°；齿数 z${first.teeth}；${PROFILE_LABELS[first.profile]}；齿宽/厚度 ${first.thickness}mm；轴孔 Ø${first.boreDiameter}mm${holeText}`,
      material: '45# 调质钢，齿面高频淬火 HRC45-50',
      unit: '件',
      qtyPerSet: group.length,
      batchCount: params.batchCount,
      qty: group.length * params.batchCount,
      positions: group.map((g) => `${g.id}：${positionText(g.position.x, g.position.y)}`),
    });
    groupNumber += 1;
  }

  rows.push({
    id: 'BOM-RACK',
    category: '齿条',
    name: '配套模数齿条',
    spec: `m${params.module}；α${params.pressureAngle}°；${PROFILE_LABELS[params.profile]}齿形；总长 ${rack.length}mm；齿距 ${rack.toothPitch}mm；${rack.toothCount}齿；厚度 ${rack.thickness}mm；安装孔 ${rack.mountingHoleLoops.length}-Ø${round1((rack.mountingHoleLoops[0]?.radius ?? params.module * 1.35) * 2)}`,
    material: '45# 钢，齿面淬火',
    unit: '根',
    qtyPerSet: 1,
    batchCount: params.batchCount,
    qty: params.batchCount,
    positions: [`RACK：${positionText(0, 0)}（齿顶朝上，齿距基准线 Y=0）`],
  });

  rows.push({
    id: 'BOM-GRID-VERTICAL',
    category: '栅格遮挡件',
    name: '竖向栅条',
    spec: `截面 ${params.gridThickness}×${params.gridThickness}mm；长度 ${grid.vertical[0]?.length ?? 0}mm；间距 ${params.spacing}mm；每片 ${grid.vertical.length} 根，前后两片`,
    material: 'Q235B 方钢/扁钢，喷塑 RAL1018',
    unit: '根',
    qtyPerSet: grid.vertical.length * 2,
    batchCount: params.batchCount,
    qty: grid.vertical.length * 2 * params.batchCount,
    positions: grid.vertical.map(
      (bar) => `X${round1(bar.x)}：前 Z${grid.zFront} / 后 Z${grid.zRear}，中心 Y${grid.centerY}`,
    ),
  });

  rows.push({
    id: 'BOM-GRID-HORIZONTAL',
    category: '栅格遮挡件',
    name: '横向栅条',
    spec: `截面 ${params.gridThickness}×${params.gridThickness}mm；长度 ${grid.horizontal[0]?.length ?? 0}mm；间距 ${params.spacing}mm；每片 ${grid.horizontal.length} 根，前后两片`,
    material: 'Q235B 方钢/扁钢，喷塑 RAL1018',
    unit: '根',
    qtyPerSet: grid.horizontal.length * 2,
    batchCount: params.batchCount,
    qty: grid.horizontal.length * 2 * params.batchCount,
    positions: grid.horizontal.map(
      (bar) => `Y${round1(bar.y)}：前 Z${grid.zFront} / 后 Z${grid.zRear}，X 居中`,
    ),
  });

  rows.push({
    id: 'BOM-GRID-FRAME',
    category: '栅格遮挡件',
    name: '栅格边框组合',
    spec: `边框料宽 ${grid.frameWidth}mm；外廓 ${grid.width}×${grid.height}mm；前后各 1 片；含四角连接耳`,
    material: 'Q235B 矩形管 40×20×3，喷塑',
    unit: '套',
    qtyPerSet: 2,
    batchCount: params.batchCount,
    qty: 2 * params.batchCount,
    positions: [
      `前框：${positionText(0, grid.centerY, grid.zFront)}`,
      `后框：${positionText(0, grid.centerY, grid.zRear)}`,
    ],
  });

  const anchorCount = Math.max(4, Math.round(grid.width / params.spacing));
  rows.push({
    id: 'BOM-FASTENER',
    category: '标准件',
    name: '栅格固定螺栓与齿轮紧定螺钉',
    spec: `栅格 M8×30 螺栓/螺母/垫圈 ${anchorCount * 2} 套；齿轮轮毂紧定螺钉按轴孔配 M6/M8；齿条安装螺栓按现场滑轨配`,
    material: '8.8 级镀锌',
    unit: '批',
    qtyPerSet: 1,
    batchCount: params.batchCount,
    qty: params.batchCount,
    positions: ['栅格四角及边框压点；齿轮轴向固定于传动轴；齿条沿全长压平后配钻'],
  });

  return rows;
}
