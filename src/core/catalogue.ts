import type { DripSpec, HeadworksSpec, PipeSpec, SprinklerSpec } from './types';

/**
 * PE pipe catalogue. Inner diameters follow GB/T 19812 / common HDPE PE100 SDR
 * dimensions; the values are what the hydraulic calculation needs.
 */
export const PIPES: PipeSpec[] = [
  { id: 'pe16', dn: 16, innerMm: 14.4, pnMpa: 0.4, use: '滴灌带 / 毛管' },
  { id: 'pe20', dn: 20, innerMm: 17.4, pnMpa: 0.4, use: '支管 / 毛管' },
  { id: 'pe25', dn: 25, innerMm: 21.8, pnMpa: 0.4, use: '支管' },
  { id: 'pe32', dn: 32, innerMm: 27.8, pnMpa: 0.4, use: '支管 / 分干管' },
  { id: 'pe40', dn: 40, innerMm: 34.8, pnMpa: 0.4, use: '分干管' },
  { id: 'pe50', dn: 50, innerMm: 43.6, pnMpa: 0.6, use: '干管' },
  { id: 'pe63', dn: 63, innerMm: 55.0, pnMpa: 0.6, use: '干管' },
  { id: 'pe75', dn: 75, innerMm: 65.4, pnMpa: 0.6, use: '干管' },
  { id: 'pe90', dn: 90, innerMm: 78.6, pnMpa: 0.6, use: '干管 / 主管' },
  { id: 'pe110', dn: 110, innerMm: 96.2, pnMpa: 0.6, use: '主管' },
  { id: 'pe125', dn: 125, innerMm: 109.4, pnMpa: 0.6, use: '主管' },
];

export const PIPE_BY_ID = new Map(PIPES.map((p) => [p.id, p]));

export function pipe(id: string): PipeSpec {
  const p = PIPE_BY_ID.get(id);
  if (!p) throw new Error(`unknown pipe ${id}`);
  return p;
}

export const DRIPS: DripSpec[] = [
  { id: 'drip-1.6', name: '内镶圆柱滴头 1.6 L/h', qnLph: 1.6, hNomM: 10, exponent: 0.5, cv: 0.03 },
  { id: 'drip-2.0', name: '内镶圆柱滴头 2.0 L/h', qnLph: 2.0, hNomM: 10, exponent: 0.5, cv: 0.03 },
  { id: 'drip-3.0', name: '压力补偿滴头 3.0 L/h', qnLph: 3.0, hNomM: 10, exponent: 0.25, cv: 0.02 },
  { id: 'drip-4.0', name: '滴灌带 4.0 L/h/孔', qnLph: 4.0, hNomM: 10, exponent: 0.55, cv: 0.05 },
];

export const SPRINKLERS: SprinklerSpec[] = [
  { id: 'spr-micro', name: '折射式微喷 60 L/h', qLph: 60, hNomM: 15, exponent: 0.5, radiusM: 1.6 },
  { id: 'spr-80', name: '旋转微喷 120 L/h', qLph: 120, hNomM: 20, exponent: 0.5, radiusM: 2.5 },
  { id: 'spr-250', name: '摇臂喷头 250 L/h', qLph: 250, hNomM: 25, exponent: 0.5, radiusM: 4.0 },
];

export const HEADWORKS: HeadworksSpec[] = [
  { id: 'hw-basic', name: '简易首部(叠片过滤+阀门)', lossKPa: 35 },
  { id: 'hw-std', name: '标准首部(砂石+叠片+施肥)', lossKPa: 60 },
  { id: 'hw-pro', name: '全自动反冲洗首部', lossKPa: 80 },
];

export const byId = <T extends { id: string }>(list: T[], id: string, fallback?: T): T => {
  const found = list.find((x) => x.id === id);
  if (found) return found;
  if (fallback) return fallback;
  if (!list.length) throw new Error('empty catalogue');
  return list[0];
};

/**
 * Pick a pipe for a given flow on the main. Returns the smallest DN whose
 * velocity stays at or below the design velocity, but never a larger DN than
 * the upstream pipe (a main never steps back up).
 */
export function pickPipeForFlow(
  flowLph: number,
  maxVelocity: number,
  maxInnerMm: number,
): PipeSpec {
  const q = flowLph / 3_600_000;
  if (q <= 0) return PIPES[0];
  const candidates = PIPES.filter((p) => p.innerMm <= maxInnerMm + 1e-6);
  for (const p of candidates) {
    const d = p.innerMm / 1000;
    const area = (Math.PI * d * d) / 4;
    if (q / area <= maxVelocity) return p;
  }
  return candidates[candidates.length - 1] ?? PIPES[PIPES.length - 1];
}
