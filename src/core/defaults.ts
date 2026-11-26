import type { ProjectDoc, ProjectParams } from './types';

export const defaultParams = (): ProjectParams => ({
  greenhouse: {
    lengthM: 60,
    spanM: 10,
    mainAxis: 'length',
    headMarginM: 1.2,
    tailMarginM: 0.8,
    mainOffsetM: 1.0,
  },
  beds: {
    widthM: 1.1,
    gapM: 0.6,
    bedsPerBlock: 4,
    aisleWidthM: 1.2,
    startMarginM: 1.0,
    endMarginM: 0.8,
  },
  branch: {
    spacingM: 3.4,
    firstOffsetM: 2.2,
    diameterId: 'pe25',
    jitterMm: 6,
    avoidAisles: true,
    followBeds: true,
    sprinklerZoneM: 2.5,
  },
  drip: {
    specId: 'drip-2.0',
    qnLph: 2.0,
    hNomM: 10,
    exponent: 0.5,
    cv: 0.03,
    spacingM: 0.3,
    firstOffsetM: 0.3,
    jitterMm: 4,
  },
  sprinkler: {
    specId: 'spr-micro',
    qLph: 60,
    hNomM: 15,
    exponent: 0.5,
    radiusM: 1.6,
    spacingFactor: 1.2,
  },
  main: { headDiameterId: 'pe32', autoTaper: true },
  hydraulic: {
    sourceKPa: 250,
    allowDropPct: 10,
    mainDropPct: 40,
    maxVelocity: 1.5,
    minorLossFactor: 0.12,
    hazenC: 130,
    slopePermille: 0,
    zoneKPa: 10,
  },
  headworks: { specId: 'hw-std', lossKPa: 60, fertigation: true },
});

export const newProject = (name = '1号温室 滴灌管网'): ProjectDoc => ({
  version: 1,
  name,
  params: defaultParams(),
  seed: 20261126,
  overrides: { branchOffset: {}, branchSpacing: {}, branchDiameter: {} },
});

export interface Preset {
  id: string;
  name: string;
  description: string;
  build: () => { params: ProjectParams; seed: number };
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const PRESETS: Preset[] = [
  {
    id: 'standard',
    name: '标准日光温室 60×10',
    description: '18 条支管,滴灌为主,末端 2.5 m 微喷区。',
    build: () => ({ params: defaultParams(), seed: 20261126 }),
  },
  {
    id: 'overdrop',
    name: '压降超限(示警)',
    description: '细支管 + 加密滴头,支管末端摩阻超预算,用于演示标黄与加粗/缩短建议。',
    build: () => {
      const params = defaultParams();
      params.greenhouse.spanM = 24;
      params.branch.diameterId = 'pe16';
      params.drip.spacingM = 0.12;
      params.drip.qnLph = 8;
      params.drip.hNomM = 10;
      params.branch.spacingM = 10;
      params.branch.sprinklerZoneM = 0;
      params.branch.followBeds = false;
      params.hydraulic.allowDropPct = 8;
      params.branch.jitterMm = 0;
      return { params, seed: 71021 };
    },
  },
  {
    id: 'aisle',
    name: '支管穿作业道(示警)',
    description: '支管间距与苗床区块错位,3 条支管落进作业道,用于演示红框与清单。',
    build: () => {
      const params = defaultParams();
      params.branch.followBeds = false;
      params.branch.avoidAisles = false;
      params.branch.spacingM = 2.0;
      params.branch.firstOffsetM = 3.3;
      return { params, seed: 4451 };
    },
  },
  {
    id: 'sprinkler',
    name: '喷灌为主 80×12',
    description: '整条支管为喷头区段,按射程 4 m 排布摇臂喷头,主管自动变径。',
    build: () => {
      const params = defaultParams();
      params.greenhouse.lengthM = 80;
      params.greenhouse.spanM = 12;
      params.branch.spacingM = 4.2;
      params.branch.sprinklerZoneM = 30;
      params.hydraulic.maxVelocity = 1.8;
      params.sprinkler = {
        specId: 'spr-250',
        qLph: 250,
        hNomM: 25,
        exponent: 0.5,
        radiusM: 4,
        spacingFactor: 1.2,
      };
      params.main.headDiameterId = 'pe75';
      params.hydraulic.sourceKPa = 340;
      return { params, seed: 90210 };
    },
  },
];

export function applyPreset(id: string): { params: ProjectParams; seed: number } {
  const preset = PRESETS.find((p) => p.id === id) ?? PRESETS[0];
  return clone(preset.build());
}

export { clone };
