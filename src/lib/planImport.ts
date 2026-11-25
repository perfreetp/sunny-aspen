import type { DeviceParams, ProjectState, TrackNode } from '../types';
import { createTrackCurve } from './trackGeometry';

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

function defaultDevice(over: Partial<DeviceParams> = {}): DeviceParams {
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function isProjectState(value: unknown): value is ProjectState {
  const obj = asRecord(value);
  return !!obj && !!obj.nodes && typeof obj.nodes === 'object' && Array.isArray(obj.rootIds) && !!obj.meta;
}

/** 将方案软件导出的棚体/轨道/设备清单交换 JSON 转成编排工程。 */
export function projectFromPlan(raw: unknown): ProjectState {
  const root = asRecord(raw);
  if (!root) throw new Error('文件不是有效的 JSON 对象');
  const rawTracks = Array.isArray(root.tracks) ? root.tracks : Array.isArray(root) ? root : [];
  if (!Array.isArray(rawTracks) || rawTracks.length === 0) throw new Error('方案中没有找到 tracks 轨道数组');

  const colors = ['#38bdf8', '#34d399', '#a78bfa', '#f59e0b', '#fb7185', '#22d3ee'];
  const tracks: TrackNode[] = rawTracks.slice(0, 12).map((item, index) => {
    const t = asRecord(item) ?? {};
    const strokeMm = Number(t.strokeMm ?? t.stroke ?? 5400);
    const z = Number(t.z ?? -7.5 + index * (15 / Math.max(1, rawTracks.length - 1)));
    const endpointA = Number(t.endpointA ?? 0.06);
    const curve = createTrackCurve(z);
    const endpointB = Math.min(0.96, endpointA + strokeMm / 1000 / curve.getLength());
    const speedMps = Number(t.speedMps ?? t.linearSpeed ?? 0.3);
    const openDuration = Number(t.openDuration ?? strokeMm / 1000 / speedMps + 1);
    return {
      kind: 'track',
      id: uid('trk'),
      name: String(t.name ?? `导入轨道 ${index + 1}`),
      code: String(t.code ?? `TRK-IMP-${String(index + 1).padStart(2, '0')}`),
      color: colors[index % colors.length],
      z: Number.isFinite(z) ? z : -7.5 + index * 3,
      fabricWidth: Number(t.fabricWidth ?? 2.2),
      visible: true,
      locked: false,
      endpointA,
      endpointB,
      start: index * 1.5,
      openDuration: Number.isFinite(openDuration) ? openDuration : 18,
      holdDuration: 5,
      closeDuration: Math.max(8, openDuration * 0.58),
      speedPoints: [
        { id: uid('sp'), x: 0, y: 0.65 },
        { id: uid('sp'), x: 0.35, y: 1.05 },
        { id: uid('sp'), x: 0.7, y: 1.3 },
        { id: uid('sp'), x: 1, y: 0.65 },
      ],
      pauses: [],
      device: defaultDevice({
        motorModel: String(t.motorModel ?? 'GH-RM750-380'),
        strokeMm: Number.isFinite(strokeMm) ? strokeMm : 5400,
        speedMps: Number.isFinite(speedMps) ? speedMps : 0.3,
        rampUpS: Number(t.rampUpS ?? 0.8),
        rampDownS: Number(t.rampDownS ?? 1.1),
      }),
    };
  });

  const groupId = uid('grp');
  const project: ProjectState = {
    meta: {
      projectName: String(root.projectName ?? root.name ?? '导入方案棚区'),
      planCode: String(root.planCode ?? `PLAN-IMPORT-${new Date().toISOString().slice(0, 10)}`),
      greenhouseModel: String(root.greenhouseModel ?? '方案导入棚体'),
      importedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      source: String(root.source ?? '导入的方案交换 JSON'),
    },
    nodes: {
      [groupId]: {
        kind: 'group', id: groupId, name: '方案轨道连动组', color: '#34d399', collapsed: false,
        children: tracks.map((t) => t.id),
      },
      ...Object.fromEntries(tracks.map((t) => [t.id, t])),
    },
    rootIds: [groupId],
  };
  return project;
}
