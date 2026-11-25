import type { DeviceParams, GroupNode, ProjectState, TrackNode } from '../types';
import { createTrackCurve } from '../lib/trackGeometry';

let seq = 0;
const nid = (prefix: string): string => `${prefix}-${(seq += 1)}`;

const palette = ['#38bdf8', '#34d399', '#a78bfa', '#f59e0b', '#fb7185', '#22d3ee'];

function device(over: Partial<DeviceParams> = {}): DeviceParams {
  return {
    model: 'AG-Drive 600',
    motorModel: 'GH-RM750-380',
    voltageV: 380,
    powerKw: 0.75,
    strokeMm: 5400,
    speedMps: 0.3,
    rampUpS: 0.8,
    rampDownS: 1.1,
    startDelayS: 0.6,
    maxStartsPerHour: 24,
    ...over,
  };
}

interface TrackSeed {
  name: string;
  code: string;
  z: number;
  start: number;
  openDuration: number;
  colorIndex: number;
  points?: Array<[number, number]>;
  pauses?: Array<[number, number]>;
  strokeMm?: number;
  closeDuration?: number;
  holdDuration?: number;
}

function makeTrack(seed: TrackSeed): TrackNode {
  const id = nid('trk');
  const strokeMm = seed.strokeMm ?? 5400;
  const endpointA = 0.06;
  const curve = createTrackCurve(seed.z);
  const endpointB = Math.min(0.96, endpointA + strokeMm / 1000 / curve.getLength());
  return {
    kind: 'track',
    id,
    name: seed.name,
    code: seed.code,
    color: palette[seed.colorIndex % palette.length],
    z: seed.z,
    fabricWidth: 2.35,
    visible: true,
    locked: false,
    endpointA,
    endpointB,
    start: seed.start,
    openDuration: seed.openDuration,
    holdDuration: seed.holdDuration ?? 5,
    closeDuration: seed.closeDuration ?? Math.max(8, seed.openDuration * 0.58),
    speedPoints: (seed.points ?? [
      [0, 0.62],
      [0.22, 0.82],
      [0.52, 1.35],
      [0.78, 1.05],
      [1, 0.68],
    ]).map(([x, y]) => ({ id: nid('sp'), x, y })),
    pauses: (seed.pauses ?? []).map(([at, duration]) => ({ id: nid('pause'), at, duration })),
    device: device({ strokeMm }),
  };
}

export function createSeedProject(): ProjectState {
  seq = 0;
  const t1 = makeTrack({
    name: '1号拱架轨道', code: 'TRK-A01', z: -7.5, start: 0.5, openDuration: 19, colorIndex: 0,
    pauses: [[0.5, 3.2]],
    points: [[0, 0.55], [0.18, 0.72], [0.48, 1.45], [0.72, 1.18], [1, 0.62]],
  });
  const t2 = makeTrack({
    name: '2号拱架轨道', code: 'TRK-A02', z: -4.5, start: 3.0, openDuration: 22, colorIndex: 1,
    pauses: [[0.42, 2.4]],
    points: [[0, 0.8], [0.3, 1.2], [0.62, 0.72], [1, 1.35]],
  });
  const t3 = makeTrack({
    name: '入口加密轨道', code: 'TRK-A03', z: -1.5, start: 6.0, openDuration: 16, colorIndex: 2,
    pauses: [[0.62, 2.0]], strokeMm: 4800,
  });
  const t4 = makeTrack({
    name: '4号拱架轨道', code: 'TRK-B01', z: 1.5, start: 1.0, openDuration: 24, colorIndex: 3,
    points: [[0, 0.45], [0.25, 0.9], [0.55, 1.55], [0.82, 0.9], [1, 0.5]],
  });
  const t5 = makeTrack({
    name: '5号拱架轨道', code: 'TRK-B02', z: 4.5, start: 4.5, openDuration: 20, colorIndex: 4,
    pauses: [[0.5, 4.0]],
  });
  const t6 = makeTrack({
    name: '出口加密轨道', code: 'TRK-B03', z: 7.5, start: 8.0, openDuration: 18, colorIndex: 5,
    pauses: [[0.35, 2.2]], strokeMm: 5000,
  });

  const subA: GroupNode = { kind: 'group', id: nid('grp'), name: '入口嵌套子组', color: '#a78bfa', collapsed: false, children: [t3.id] };
  const groupA: GroupNode = { kind: 'group', id: nid('grp'), name: 'A区前跨连动组', color: '#38bdf8', collapsed: false, children: [t1.id, t2.id, subA.id] };
  const subB: GroupNode = { kind: 'group', id: nid('grp'), name: '出口嵌套子组', color: '#fb7185', collapsed: false, children: [t6.id] };
  const groupB: GroupNode = { kind: 'group', id: nid('grp'), name: 'B区后跨连动组', color: '#f59e0b', collapsed: false, children: [t4.id, t5.id, subB.id] };

  const nodes = Object.fromEntries(
    [t1, t2, t3, t4, t5, t6, subA, groupA, subB, groupB].map((n) => [n.id, n]),
  ) as ProjectState['nodes'];

  return {
    meta: {
      projectName: '西青番茄示范棚',
      planCode: 'PLAN-AG-2026-1126',
      greenhouseModel: 'GH-96 抛物拱棚 / 96m跨段示意',
      importedAt: '2026-11-26 09:20',
      source: '方案设计 V3.2 · 棚体骨架.dwg / 设备清单.xlsx',
    },
    nodes,
    rootIds: [groupA.id, groupB.id],
  };
}
