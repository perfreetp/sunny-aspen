import { writable, derived, get } from 'svelte/store';
import { getDataset } from './data/generator.js';
import { CATEGORY_MAP } from './data/categories.js';

// ---- 角色与布局 ----
export const role = writable('instructor'); // engineer | instructor
export const splitView = writable(true); // 双视图并排

// ---- 地景要素配置（工程师维护，教员共享）----
const ds = getDataset();
export const config = writable(structuredClone(ds.config));

// 实时 LOD 档位统计：{ viewId: { lod0, lod1, lod2, visible } }，由各视图引擎上报
export const lodStats = writable({ overview: {}, detail: {} });

// ---- 选中要素（两个视图 + 列表三方同步的唯一数据源）----
export const selectedId = writable(null);
// 选中来源：{ id, viewId, kind:'map'|'list' }，另一视图据此自动飞行定位
export const selectionOrigin = writable(null);
export const hoverId = writable(null);

export function selectFeature(id, viewId = null, kind = 'map') {
  selectedId.set(id);
  selectionOrigin.set({ id, viewId, kind, t: Date.now() });
}

const featureIndex = new Map(ds.features.map((f) => [f.id, f]));
export function getFeature(id) {
  return featureIndex.get(id) ?? null;
}
export const selectedFeature = derived(selectedId, (id) => (id ? getFeature(id) : null));

// 图层显式开关（与 config 内 visible 双向同步，单独 store 方便引擎订阅）
export const layerVisibility = writable(
  Object.fromEntries(ds.config.categories.map((c) => [c.id, c.visible]))
);
config.subscribe((cfg) => {
  const next = Object.fromEntries(cfg.categories.map((c) => [c.id, c.visible]));
  layerVisibility.set(next);
});

// ---- 缺失清单（巡视中框选产生，工程师补录闭环）----
export const missingReports = writable([]);
let reportSeq = 0;

export function addMissingReport({ rect, categoryId, lineId, missingIds, viewId }) {
  reportSeq += 1;
  const report = {
    reportId: `MR-${String(reportSeq).padStart(3, '0')}`,
    createdAt: new Date().toISOString(),
    viewId,
    categoryId,
    lineId,
    categoryName: CATEGORY_MAP[categoryId]?.name ?? categoryId,
    rect,
    missingIds,
    status: 'open' // open -> resolved
  };
  missingReports.update((list) => [report, ...list]);
  return report;
}

export function resolveReport(reportId) {
  missingReports.update((list) => list.map((r) => (r.reportId === reportId ? { ...r, status: 'resolved' } : r)));
}

// 标记要素缺失/恢复（工程师补录）
export function setFeatureStatus(id, status) {
  const f = getFeature(id);
  if (!f) return;
  f.status = status;
  // 触发响应式刷新
  missingReports.update((v) => [...v]);
  featureTick.update((n) => n + 1);
}
export const featureTick = writable(0);

// ---- 要素列表过滤条件 ----
export const listFilter = writable({ categoryId: '', keyword: '', onlyMissing: false });

export const filteredFeatures = derived(
  [listFilter, layerVisibility, featureTick],
  ([filter]) => {
    const kw = filter.keyword.trim().toLowerCase();
    return ds.features.filter((f) => {
      if (filter.categoryId && f.categoryId !== filter.categoryId) return false;
      if (filter.onlyMissing && f.status !== 'missing') return false;
      if (kw && !f.id.toLowerCase().includes(kw) && !f.groupName.toLowerCase().includes(kw)) return false;
      return true;
    });
  }
);

export function currentCategoryConfig(catId) {
  return get(config).categories.find((c) => c.id === catId);
}
