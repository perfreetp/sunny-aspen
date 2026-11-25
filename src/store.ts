import { create } from 'zustand';
import type { GroupNode, ID, Notice, PlaybackRange, ProjectState, TrackNode } from './types';
import { createSeedProject } from './data/seed';
import { createTrackCurve } from './lib/trackGeometry';
import { mechanicalOpenDuration } from './lib/timing';
import {
  findParentGroupId,
  getTimelineInterval,
  isGroup,
  scaleSubtreeTiming,
} from './lib/tree';

export const uid = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const initialProject = createSeedProject();
const initialSelectedId = Object.values(initialProject.nodes).find((n) => n.kind === 'track')?.id ?? null;

interface AppState {
  project: ProjectState;
  selectedId: ID | null;
  checkedIds: ID[];
  currentTime: number;
  isPlaying: boolean;
  rate: number;
  loop: boolean;
  playbackRange: PlaybackRange | null;
  roofVisible: boolean;
  presentMode: boolean;
  exportOpen: boolean;
  notices: Notice[];

  select: (id: ID | null) => void;
  toggleChecked: (id: ID) => void;
  clearChecked: () => void;
  notify: (text: string, tone?: Notice['tone']) => void;
  dismissNotice: (id: number) => void;

  updateTrack: (id: ID, patch: Partial<TrackNode>) => void;
  renameNode: (id: ID, name: string) => void;
  toggleCollapsed: (id: ID) => void;
  toggleVisible: (id: ID) => void;
  changeOpenDuration: (id: ID, nextDuration: number) => void;
  moveTrackStart: (id: ID, nextStart: number) => void;
  updateDevice: (id: ID, patch: Partial<TrackNode['device']>) => void;
  setEndpoint: (id: ID, endpoint: 'A' | 'B', value: number) => void;
  addSpeedPoint: (trackId: ID, x?: number, y?: number) => void;
  updateSpeedPoint: (trackId: ID, pointId: ID, patch: { x?: number; y?: number }) => void;
  removeSpeedPoint: (trackId: ID, pointId: ID) => void;
  resetSpeedCurve: (trackId: ID) => void;
  applyRhythmPreset: (trackId: ID, preset: 'soft' | 'standard' | 'fast') => void;
  addPause: (trackId: ID) => void;
  updatePause: (trackId: ID, pauseId: ID, patch: { at?: number; duration?: number; label?: string }) => void;
  removePause: (trackId: ID, pauseId: ID) => void;

  groupChecked: () => void;
  createSubgroup: (parentId: ID, ids?: ID[]) => void;
  ungroup: (groupId: ID) => void;
  removeFromParent: (id: ID) => void;
  addToGroup: (groupId: ID, childId: ID) => void;

  seek: (time: number) => void;
  tick: (deltaSeconds: number) => void;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;
  setRate: (rate: number) => void;
  toggleLoop: () => void;
  playGroup: (groupId: ID) => void;
  clearPlaybackRange: () => void;

  setRoofVisible: (visible: boolean) => void;
  setPresentMode: (open: boolean) => void;
  setExportOpen: (open: boolean) => void;
  loadProject: (project: ProjectState, message?: string) => void;
  resetProject: () => void;
}

function mutateProject(set: (partial: Partial<AppState>) => void, get: () => AppState, fn: (draft: ProjectState) => void) {
  const project = structuredClone(get().project);
  fn(project);
  set({ project });
}

function removeFromCurrentParent(project: ProjectState, id: ID) {
  for (const node of Object.values(project.nodes)) {
    if (isGroup(node)) {
      node.children = node.children.filter((child) => child !== id);
    }
  }
  project.rootIds = project.rootIds.filter((rootId) => rootId !== id);
}

function isDescendant(project: ProjectState, maybeAncestorId: ID, id: ID): boolean {
  let current: ID | undefined = id;
  const guard = new Set<ID>();
  while (current && !guard.has(current)) {
    if (current === maybeAncestorId) return true;
    guard.add(current);
    const parent = Object.values(project.nodes).find((n) => isGroup(n) && n.children.includes(current as ID));
    current = parent?.id;
  }
  return false;
}

/** 修改一条轨道展开时长，并按比例重排其所在组的全部关键帧。 */
function rescaleAroundTrack(draft: ProjectState, trackId: ID, nextDuration: number) {
  const track = draft.nodes[trackId];
  if (!track || track.kind !== 'track') return;
  const oldDuration = track.openDuration;
  const safeDuration = Math.min(120, Math.max(2, Number.isFinite(nextDuration) ? nextDuration : oldDuration));
  const ratio = safeDuration / oldDuration;
  if (Math.abs(ratio - 1) < 0.0001) return;

  const parentId = findParentGroupId(draft, trackId);
  if (parentId) {
    const anchor = getTimelineInterval(draft, parentId).start;
    scaleSubtreeTiming(draft.nodes[parentId] as GroupNode, draft, anchor, ratio);
  } else {
    const anchor = track.start;
    track.start = anchor + (track.start - anchor) * ratio;
    track.openDuration = safeDuration;
    track.holdDuration = Math.max(0, track.holdDuration * ratio);
    track.closeDuration = Math.max(0.5, track.closeDuration * ratio);
    for (const pause of track.pauses) pause.duration = Math.max(0.4, pause.duration * ratio);
  }
}

function syncEndpointToStroke(track: TrackNode) {
  const curve = createTrackCurve(track.z);
  const length = curve.getLength();
  const strokeFraction = Math.min(0.94, track.device.strokeMm / 1000 / length);
  track.endpointA = Math.min(track.endpointA, 0.98 - strokeFraction);
  track.endpointB = Math.min(0.99, track.endpointA + strokeFraction);
  if (track.endpointB - track.endpointA < strokeFraction - 0.001) {
    track.endpointA = Math.max(0.01, track.endpointB - strokeFraction);
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  project: initialProject,
  selectedId: initialSelectedId,
  checkedIds: [],
  currentTime: 8,
  isPlaying: false,
  rate: 1,
  loop: true,
  playbackRange: null,
  roofVisible: true,
  presentMode: false,
  exportOpen: false,
  notices: [],

  select: (id) => set({ selectedId: id }),
  toggleChecked: (id) =>
    set((s) => ({
      checkedIds: s.checkedIds.includes(id) ? s.checkedIds.filter((x) => x !== id) : [...s.checkedIds, id],
    })),
  clearChecked: () => set({ checkedIds: [] }),

  notify: (text, tone = 'ok') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    set((s) => ({ notices: [...s.notices.slice(-3), { id, text, tone }] }));
    if (typeof window !== 'undefined') {
      window.setTimeout(() => get().dismissNotice(id), 3600);
    }
  },
  dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),

  updateTrack: (id, patch) =>
    mutateProject(set, get, (draft) => {
      const node = draft.nodes[id];
      if (node?.kind === 'track') Object.assign(node, patch);
    }),

  renameNode: (id, name) =>
    mutateProject(set, get, (draft) => {
      const node = draft.nodes[id];
      if (node) node.name = name;
    }),

  toggleCollapsed: (id) =>
    mutateProject(set, get, (draft) => {
      const node = draft.nodes[id];
      if (node?.kind === 'group') node.collapsed = !node.collapsed;
    }),

  toggleVisible: (id) =>
    mutateProject(set, get, (draft) => {
      const node = draft.nodes[id];
      if (node?.kind === 'track') node.visible = !node.visible;
    }),

  changeOpenDuration: (id, nextDuration) =>
    mutateProject(set, get, (draft) => rescaleAroundTrack(draft, id, nextDuration)),

  moveTrackStart: (id, nextStart) =>
    mutateProject(set, get, (draft) => {
      const track = draft.nodes[id];
      if (track?.kind === 'track') track.start = Math.max(0, Math.round(nextStart * 10) / 10);
    }),

  updateDevice: (id, patch) =>
    mutateProject(set, get, (draft) => {
      const track = draft.nodes[id];
      if (track?.kind !== 'track') return;
      Object.assign(track.device, patch);
      if (patch.strokeMm !== undefined) {
        track.device.strokeMm = Math.round(Math.min(30000, Math.max(1000, track.device.strokeMm)));
        syncEndpointToStroke(track);
      }
      if (patch.speedMps !== undefined) track.device.speedMps = Math.min(1.2, Math.max(0.05, track.device.speedMps));
      const mechanical = mechanicalOpenDuration(track.device);
      rescaleAroundTrack(draft, id, mechanical);
    }),

  setEndpoint: (id, endpoint, value) =>
    mutateProject(set, get, (draft) => {
      const track = draft.nodes[id];
      if (track?.kind !== 'track') return;
      const u = Math.min(0.99, Math.max(0.01, value));
      if (endpoint === 'A') track.endpointA = Math.min(u, track.endpointB - 0.03);
      else track.endpointB = Math.max(u, track.endpointA + 0.03);
      const curve = createTrackCurve(track.z);
      track.device.strokeMm = Math.round(Math.abs(track.endpointB - track.endpointA) * curve.getLength() * 1000);
      const mechanical = mechanicalOpenDuration(track.device);
      rescaleAroundTrack(draft, id, mechanical);
    }),

  addSpeedPoint: (trackId, x = 0.5, y = 1.1) =>
    mutateProject(set, get, (draft) => {
      const track = draft.nodes[trackId];
      if (track?.kind === 'track') track.speedPoints.push({ id: uid('sp'), x, y });
    }),

  updateSpeedPoint: (trackId, pointId, patch) =>
    mutateProject(set, get, (draft) => {
      const track = draft.nodes[trackId];
      const point = track?.kind === 'track' ? track.speedPoints.find((p) => p.id === pointId) : undefined;
      if (!point) return;
      if (patch.x !== undefined) point.x = Math.min(0.98, Math.max(0.02, patch.x));
      if (patch.y !== undefined) point.y = Math.min(3, Math.max(0.2, patch.y));
    }),

  removeSpeedPoint: (trackId, pointId) =>
    mutateProject(set, get, (draft) => {
      const track = draft.nodes[trackId];
      if (track?.kind !== 'track' || track.speedPoints.length <= 2) return;
      track.speedPoints = track.speedPoints.filter((p) => p.id !== pointId);
    }),

  resetSpeedCurve: (trackId) =>
    mutateProject(set, get, (draft) => {
      const track = draft.nodes[trackId];
      if (track?.kind === 'track') {
        track.speedPoints = [
          { id: uid('sp'), x: 0, y: 0.65 },
          { id: uid('sp'), x: 0.3, y: 0.9 },
          { id: uid('sp'), x: 0.62, y: 1.35 },
          { id: uid('sp'), x: 1, y: 0.7 },
        ];
      }
    }),

  applyRhythmPreset: (trackId, preset) =>
    mutateProject(set, get, (draft) => {
      const track = draft.nodes[trackId];
      if (track?.kind !== 'track') return;
      if (preset === 'soft') {
        track.device.rampUpS = 1.6;
        track.device.rampDownS = 2.0;
        track.speedPoints = [
          { id: uid('sp'), x: 0, y: 0.35 },
          { id: uid('sp'), x: 0.18, y: 0.72 },
          { id: uid('sp'), x: 0.5, y: 1.25 },
          { id: uid('sp'), x: 0.84, y: 0.72 },
          { id: uid('sp'), x: 1, y: 0.35 },
        ];
      } else if (preset === 'fast') {
        track.device.rampUpS = 0.3;
        track.device.rampDownS = 0.5;
        track.speedPoints = [
          { id: uid('sp'), x: 0, y: 0.9 },
          { id: uid('sp'), x: 0.5, y: 1.15 },
          { id: uid('sp'), x: 1, y: 0.9 },
        ];
      } else {
        track.device.rampUpS = 0.8;
        track.device.rampDownS = 1.1;
        track.speedPoints = [
          { id: uid('sp'), x: 0, y: 0.62 },
          { id: uid('sp'), x: 0.25, y: 0.9 },
          { id: uid('sp'), x: 0.6, y: 1.35 },
          { id: uid('sp'), x: 1, y: 0.68 },
        ];
      }
    }),

  addPause: (trackId) =>
    mutateProject(set, get, (draft) => {
      const track = draft.nodes[trackId];
      if (track?.kind === 'track') track.pauses.push({ id: uid('pause'), at: 0.5, duration: 2.5, label: '中途检查' });
    }),

  updatePause: (trackId, pauseId, patch) =>
    mutateProject(set, get, (draft) => {
      const track = draft.nodes[trackId];
      const pause = track?.kind === 'track' ? track.pauses.find((p) => p.id === pauseId) : undefined;
      if (!pause) return;
      if (patch.at !== undefined) pause.at = Math.min(0.95, Math.max(0.05, patch.at));
      if (patch.duration !== undefined) pause.duration = Math.min(30, Math.max(0.5, patch.duration));
      if (patch.label !== undefined) pause.label = patch.label;
    }),

  removePause: (trackId, pauseId) =>
    mutateProject(set, get, (draft) => {
      const track = draft.nodes[trackId];
      if (track?.kind === 'track') track.pauses = track.pauses.filter((p) => p.id !== pauseId);
    }),

  groupChecked: () => {
    const ids = get().checkedIds.filter((id) => get().project.nodes[id]?.kind === 'track');
    if (ids.length < 2) {
      get().notify('请先勾选至少两条轨道再编组', 'warn');
      return;
    }
    mutateProject(set, get, (draft) => {
      const group: GroupNode = {
        kind: 'group',
        id: uid('grp'),
        name: `新编组 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
        color: '#4ade80',
        collapsed: false,
        children: [],
      };
      for (const id of ids) {
        removeFromCurrentParent(draft, id);
        group.children.push(id);
      }
      draft.nodes[group.id] = group;
      draft.rootIds.push(group.id);
      set({ selectedId: group.id, checkedIds: [] });
    });
    get().notify(`已将 ${ids.length} 条轨道编入新组，可继续拖入子组`);
  },

  createSubgroup: (parentId, ids = []) =>
    mutateProject(set, get, (draft) => {
      const parent = draft.nodes[parentId];
      if (!isGroup(parent)) return;
      const group: GroupNode = {
        kind: 'group', id: uid('grp'), name: '嵌套子组', color: '#c084fc', collapsed: false, children: [],
      };
      for (const id of ids) {
        if (!draft.nodes[id] || id === parentId) continue;
        removeFromCurrentParent(draft, id);
        group.children.push(id);
      }
      draft.nodes[group.id] = group;
      parent.children.push(group.id);
      set({ selectedId: group.id });
    }),

  ungroup: (groupId) =>
    mutateProject(set, get, (draft) => {
      const group = draft.nodes[groupId];
      if (!isGroup(group)) return;
      const parent = Object.values(draft.nodes).find((n) => isGroup(n) && n.children.includes(groupId));
      if (parent && isGroup(parent)) {
        const index = parent.children.indexOf(groupId);
        parent.children.splice(index, 1, ...group.children);
      } else {
        const index = draft.rootIds.indexOf(groupId);
        draft.rootIds.splice(index, 1, ...group.children);
      }
      delete draft.nodes[groupId];
      set({ selectedId: null });
    }),

  removeFromParent: (id) =>
    mutateProject(set, get, (draft) => {
      removeFromCurrentParent(draft, id);
      draft.rootIds.push(id);
    }),

  addToGroup: (groupId, childId) =>
    mutateProject(set, get, (draft) => {
      const group = draft.nodes[groupId];
      if (!isGroup(group) || !draft.nodes[childId] || groupId === childId) return;
      if (isDescendant(draft, childId, groupId)) {
        get().notify('不能把父级组拖入它自己的子组', 'warn');
        return;
      }
      removeFromCurrentParent(draft, childId);
      group.children.push(childId);
    }),

  seek: (time) => set({ currentTime: Math.max(0, time), isPlaying: false }),

  tick: (deltaSeconds) => {
    const s = get();
    if (!s.isPlaying) return;
    const duration = (() => {
      let end = 12;
      for (const n of Object.values(s.project.nodes)) {
        if (n.kind === 'track') end = Math.max(end, n.start + n.openDuration + n.closeDuration + n.holdDuration + n.pauses.reduce((a, p) => a + p.duration, 0) + n.device.startDelayS);
      }
      return end + 1.5;
    })();
    let t = s.currentTime + deltaSeconds * s.rate;
    const range = s.playbackRange;
    if (range) {
      if (t >= range.end) {
        if (s.loop) t = range.start + ((t - range.start) % Math.max(0.1, range.end - range.start));
        else {
          set({ currentTime: range.end, isPlaying: false });
          return;
        }
      }
    } else if (t >= duration) {
      if (s.loop) t = t % duration;
      else {
        set({ currentTime: duration, isPlaying: false });
        return;
      }
    }
    set({ currentTime: t });
  },

  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying, playbackRange: s.isPlaying ? s.playbackRange : null })),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setRate: (rate) => set({ rate }),
  toggleLoop: () => set((s) => ({ loop: !s.loop })),

  playGroup: (groupId) => {
    const interval = getTimelineInterval(get().project, groupId);
    set({
      playbackRange: { start: Math.max(0, interval.start - 0.25), end: interval.end + 0.6, groupId },
      currentTime: Math.max(0, interval.start - 0.25),
      isPlaying: true,
    });
  },

  clearPlaybackRange: () => set({ playbackRange: null }),
  setRoofVisible: (roofVisible) => set({ roofVisible }),
  setPresentMode: (presentMode) => set({ presentMode }),
  setExportOpen: (exportOpen) => set({ exportOpen }),

  loadProject: (project, message) => {
    set({ project, selectedId: null, checkedIds: [], currentTime: 0, isPlaying: false, playbackRange: null });
    get().notify(message ?? '方案已载入，棚体、轨道和设备参数已同步');
  },

  resetProject: () => {
    set({ project: createSeedProject(), selectedId: null, checkedIds: [], currentTime: 0, isPlaying: false, playbackRange: null });
    get().notify('已恢复内置示例方案', 'info');
  },
}));
