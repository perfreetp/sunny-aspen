import { createStore, produce } from 'solid-js/store';
import {
  buildDesignModel,
  clampInt,
  clampNumber,
  createDefaultParams,
  maxGridThickness,
  PARAM_LIMITS,
  type DesignParams,
} from '../lib/design';

export interface ToastMessage {
  id: number;
  tone: 'warning' | 'success' | 'info';
  text: string;
}

export interface SchemeSnapshot {
  id: string;
  name: string;
  savedAt: string;
  params: DesignParams;
  overrides: Record<string, number>;
  fingerprint: string;
  seedCode: string;
  gearCount: number;
  totalBomQty: number;
}

interface StudioState {
  params: DesignParams;
  overrides: Record<string, number>;
  selectedGearId: string | null;
  toast: ToastMessage | null;
  snapshots: SchemeSnapshot[];
  refreshNonce: number;
  batchFlash: boolean;
}

const STORAGE_KEY = 'transmission-studio-snapshots-v1';

function loadSnapshots(): SchemeSnapshot[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SchemeSnapshot[];
    return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
  } catch {
    return [];
  }
}

function persistSnapshots(snapshots: SchemeSnapshot[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
  } catch {
    // localStorage can be unavailable in privacy mode; in-memory snapshots still work.
  }
}

export const [studioState, setStudioState] = createStore<StudioState>({
  params: createDefaultParams(),
  overrides: { G3: 28 },
  selectedGearId: 'G3',
  toast: null,
  snapshots: loadSnapshots(),
  refreshNonce: 0,
  batchFlash: false,
});

let toastTimer: number | undefined;

export function notify(text: string, tone: ToastMessage['tone'] = 'info'): void {
  window.clearTimeout(toastTimer);
  setStudioState('toast', { id: Date.now(), text, tone });
  toastTimer = window.setTimeout(() => setStudioState('toast', null), 4200);
}

type NumericParamKey = {
  [K in keyof DesignParams]: DesignParams[K] extends number ? K : never;
}[keyof DesignParams];

export function setNumericParam(key: NumericParamKey, rawValue: number): void {
  if (key === 'spacing') {
    const spacing = clampNumber(rawValue, PARAM_LIMITS.spacing.min, PARAM_LIMITS.spacing.max);
    const thicknessMax = maxGridThickness(spacing);
    const previousThickness = studioState.params.gridThickness;
    const gridThickness = Math.min(previousThickness, thicknessMax);

    setStudioState(
      'params',
      produce((params) => {
        params.spacing = spacing;
        params.gridThickness = gridThickness;
      }),
    );

    if (gridThickness < previousThickness) {
      notify(
        `间距变为 ${spacing}mm：栅格条厚度上限 ${thicknessMax}mm，已从 ${previousThickness}mm 卡在 ${gridThickness}mm。手调齿数全部保留，仅重算位置。`,
        'warning',
      );
    }
    return;
  }

  if (key === 'gridThickness') {
    const requested = Math.round(rawValue);
    const thicknessMax = maxGridThickness(studioState.params.spacing);
    const gridThickness = clampInt(
      Math.min(requested, thicknessMax),
      PARAM_LIMITS.gridThickness.min,
      thicknessMax,
    );

    setStudioState('params', 'gridThickness', gridThickness);

    if (requested > thicknessMax) {
      notify(
        `当前间距 ${studioState.params.spacing}mm 允许的栅格厚度上限是 ${thicknessMax}mm，已卡在 ${gridThickness}mm。`,
        'warning',
      );
    }
    return;
  }

  const limit = PARAM_LIMITS[key as keyof typeof PARAM_LIMITS];
  if (limit && typeof limit === 'object' && 'min' in limit && 'max' in limit) {
    const isInteger = (limit.step as number) >= 1;
    const value = isInteger
      ? clampInt(rawValue, limit.min as number, limit.max as number)
      : clampNumber(rawValue, limit.min as number, limit.max as number);
    setStudioState('params', key, value as never);
    return;
  }

  setStudioState('params', key, rawValue as never);
}

export function setProfile(profile: DesignParams['profile']): void {
  setStudioState('params', 'profile', profile);
}

export function adoptStandardSpacing(): void {
  const spacing = studioState.params.module * studioState.params.baseTeeth;
  setNumericParam('spacing', spacing);
  notify(`已采用 m×z₀ = ${spacing}mm 作为标准啮合/栅格基准间距。`, 'success');
}

export function setGearTeeth(gearId: string, rawTeeth: number): void {
  const teeth = clampInt(rawTeeth, PARAM_LIMITS.baseTeeth.min, 120);
  setStudioState('overrides', gearId, teeth);
  setStudioState('selectedGearId', gearId);
}

export function nudgeGearTeeth(gearId: string, delta: number): void {
  const current = studioState.overrides[gearId] ?? studioState.params.baseTeeth;
  setGearTeeth(gearId, current + delta);
}

export function resetGearOverride(gearId: string): void {
  setStudioState(
    'overrides',
    produce((overrides) => {
      delete overrides[gearId];
    }),
  );
  notify(`${gearId} 已恢复为整组基础齿数 ${studioState.params.baseTeeth}。`, 'info');
}

export function resetAllOverrides(): void {
  setStudioState('overrides', {});
  notify('全部手调齿数已清除；全局参数和种子保持不变。', 'info');
}

export function selectGear(gearId: string | null): void {
  setStudioState('selectedGearId', gearId);
}

export function randomizeSeed(): void {
  const array = new Uint32Array(1);
  window.crypto.getRandomValues(array);
  setStudioState('params', 'seed', array[0] % 1_000_000_000);
  notify('已换种子；保存方案快照后可逐项比对两版差异。', 'success');
}

export function runBatchRefresh(): void {
  setStudioState('refreshNonce', studioState.refreshNonce + 1);
  setStudioState('batchFlash', true);
  window.setTimeout(() => setStudioState('batchFlash', false), 900);
  const model = buildDesignModel(studioState.params, studioState.overrides);
  notify(
    `整排已一起刷新：${model.gears.length} 个齿轮、1 根齿条、${model.grid.vertical.length * 2 + model.grid.horizontal.length * 2} 根栅条，清单总量 ×${studioState.params.batchCount} 套。`,
    'success',
  );
}

export function saveSnapshot(name?: string): SchemeSnapshot {
  const model = buildDesignModel(studioState.params, studioState.overrides);
  const snapshot: SchemeSnapshot = {
    id: `SCHEME-${Date.now().toString(36).toUpperCase()}`,
    name: name?.trim() || `方案 ${studioState.snapshots.length + 1} · ${model.seedCode}`,
    savedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    params: structuredClone(studioState.params),
    overrides: structuredClone(studioState.overrides),
    fingerprint: model.fingerprint,
    seedCode: model.seedCode,
    gearCount: model.gears.length,
    totalBomQty: model.bom.reduce((sum, row) => sum + row.qty, 0),
  };

  setStudioState('snapshots', (items) => [snapshot, ...items].slice(0, 12));
  persistSnapshots(studioState.snapshots);
  notify(`已保存「${snapshot.name}」，可在方案比对中打开第二版。`, 'success');
  return snapshot;
}

export function loadSnapshot(id: string): void {
  const snapshot = studioState.snapshots.find((item) => item.id === id);
  if (!snapshot) return;
  setStudioState(
    produce((state) => {
      state.params = structuredClone(snapshot.params);
      state.overrides = structuredClone(snapshot.overrides);
      state.selectedGearId = null;
    }),
  );
  notify(`已载入「${snapshot.name}」。同参数同种子将完全复现。`, 'success');
}

export function deleteSnapshot(id: string): void {
  setStudioState(
    'snapshots',
    produce((items) => {
      const index = items.findIndex((item) => item.id === id);
      if (index >= 0) items.splice(index, 1);
    }),
  );
  persistSnapshots(studioState.snapshots);
}

export function resetWorkspace(): void {
  setStudioState(
    produce((state) => {
      state.params = createDefaultParams();
      state.overrides = { G3: 28 };
      state.selectedGearId = 'G3';
    }),
  );
  notify('参数已恢复为示例初始状态。', 'info');
}
