import { DEFAULT_PARAMS_A, DEFAULT_PARAMS_B } from './domain/catalog.js';
import { normalizeParams } from './domain/geometry.js';

const STORAGE_KEY = 'silo-ventilation-workspace-v1';

function createScheme(id, name, params, generated = true) {
  return {
    id,
    name,
    params: { ...params },
    branchOverrides: {},
    removedVentIds: [],
    generated,
    handedOff: false,
    handoffNote: ''
  };
}

function createDefaultState() {
  return {
    view: 'design',
    activeId: 'A',
    winnerId: 'A',
    selectedBranchId: null,
    selectedVentId: null,
    toast: '',
    schemes: {
      A: createScheme('A', '方案 A', DEFAULT_PARAMS_A, true),
      B: createScheme('B', '方案 B', DEFAULT_PARAMS_B, true)
    }
  };
}

function loadState() {
  const fallback = createDefaultState();
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw);
    for (const id of ['A', 'B']) {
      if (saved?.schemes?.[id]?.params) {
        fallback.schemes[id] = {
          ...fallback.schemes[id],
          ...saved.schemes[id],
          params: normalizeParams({
            ...fallback.schemes[id].params,
            ...saved.schemes[id].params
          }),
          branchOverrides: saved.schemes[id].branchOverrides ?? {},
          removedVentIds: Array.isArray(saved.schemes[id].removedVentIds)
            ? saved.schemes[id].removedVentIds
            : []
        };
      }
    }
    fallback.winnerId = saved.winnerId === 'B' ? 'B' : 'A';
    fallback.view = ['design', 'compare', 'handoff'].includes(saved.view) ? saved.view : 'design';
    fallback.schemes[fallback.winnerId].handedOff = Boolean(saved.schemes?.[fallback.winnerId]?.handedOff);
    fallback.schemes[fallback.winnerId].handoffNote = saved.schemes?.[fallback.winnerId]?.handoffNote ?? '';
  } catch (error) {
    console.warn('无法读取本地方案，已使用默认参数', error);
  }
  return fallback;
}

export const workspace = $state(loadState());

let toastTimer = null;
export function showToast(message) {
  workspace.toast = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    workspace.toast = '';
  }, 2600);
}

export function persistWorkspace() {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(workspace));
  } catch (error) {
    console.warn('方案本地保存失败', error);
  }
}

export function setView(view) {
  workspace.view = view;
}

export function setActiveScheme(id) {
  workspace.activeId = id;
  workspace.selectedBranchId = null;
  workspace.selectedVentId = null;
}

export function activeScheme() {
  return workspace.schemes[workspace.activeId] ?? workspace.schemes.A;
}

export function updateParam(schemeId, key, value) {
  const scheme = workspace.schemes[schemeId];
  if (!scheme) return;
  scheme.params[key] = value;
}

export function commitNumericParam(schemeId, key) {
  const scheme = workspace.schemes[schemeId];
  if (!scheme) return;
  const normalized = normalizeParams(scheme.params);
  scheme.params[key] = normalized[key];
  // Lowering eave height can reduce the legal maximum grain-line elevation.
  if (key === 'eaveHeight') {
    scheme.params.grainLine = normalized.grainLine;
  }
}

export function generateNetwork(schemeId) {
  const scheme = workspace.schemes[schemeId];
  if (!scheme) return;
  scheme.params = normalizeParams(scheme.params);
  scheme.generated = true;
  workspace.selectedBranchId = null;
  workspace.selectedVentId = null;
  showToast(`方案 ${schemeId} 已按种子 ${scheme.params.seed} 生成；手改支路和已删风口保留`);
}

export function selectBranch(branchId) {
  workspace.selectedBranchId = branchId;
  workspace.selectedVentId = null;
}

export function selectVent(ventId) {
  workspace.selectedVentId = ventId;
  workspace.selectedBranchId = null;
}

export function clearSelection() {
  workspace.selectedBranchId = null;
  workspace.selectedVentId = null;
}

export function setBranchOverride(schemeId, branchId, patch) {
  const scheme = workspace.schemes[schemeId];
  if (!scheme) return;
  const current = scheme.branchOverrides[branchId] ?? {};
  scheme.branchOverrides[branchId] = { ...current, ...patch };
  workspace.selectedBranchId = branchId;
}

export function resetBranchOverride(schemeId, branchId) {
  const scheme = workspace.schemes[schemeId];
  if (!scheme) return;
  delete scheme.branchOverrides[branchId];
  if (workspace.selectedBranchId === branchId) workspace.selectedBranchId = null;
  showToast(`支路 ${branchId.toUpperCase()} 已恢复自动位置`);
}

export function removeVent(schemeId, ventId) {
  const scheme = workspace.schemes[schemeId];
  if (!scheme || scheme.removedVentIds.includes(ventId)) return;
  scheme.removedVentIds.push(ventId);
  if (workspace.selectedVentId === ventId) workspace.selectedVentId = null;
  showToast(`风口 ${ventId} 已删除；调整装粮线后不会恢复`);
}

export function restoreVent(schemeId, ventId) {
  const scheme = workspace.schemes[schemeId];
  if (!scheme) return;
  scheme.removedVentIds = scheme.removedVentIds.filter((id) => id !== ventId);
  showToast(`风口 ${ventId} 已恢复`);
}

export function restoreAllVents(schemeId) {
  const scheme = workspace.schemes[schemeId];
  if (!scheme) return;
  scheme.removedVentIds = [];
  showToast('全部风口已恢复');
}

export function resetManualLayout(schemeId) {
  const scheme = workspace.schemes[schemeId];
  if (!scheme) return;
  scheme.branchOverrides = {};
  scheme.removedVentIds = [];
  workspace.selectedBranchId = null;
  workspace.selectedVentId = null;
  showToast('已清除手改支路位置和风口删除记录');
}

export function chooseWinner(schemeId) {
  workspace.winnerId = schemeId;
  showToast(`已选定方案 ${schemeId}，可生成设备厂选型交接单`);
}

export function copySchemeAToB() {
  const a = workspace.schemes.A;
  const b = workspace.schemes.B;
  b.params = { ...a.params, seed: `${a.params.seed}-B` };
  b.branchOverrides = JSON.parse(JSON.stringify(a.branchOverrides));
  b.removedVentIds = [...a.removedVentIds];
  b.generated = true;
  showToast('已复制 A 的参数与手改记录到 B，可改种子形成对比');
}

export function confirmHandoff(note = '') {
  const winner = workspace.schemes[workspace.winnerId];
  if (!winner) return;
  winner.handedOff = true;
  winner.handoffNote = note;
  showToast(`方案 ${winner.id} 交接单已确认，可发给设备厂`);
}
