// 项目状态：剖面线、标注记录、样式参数；带撤销/重做与 localStorage 自动保存
import { MEASURED_SECTIONS, nextObliqueId, LITHOLOGIES } from '../model/volcanoModel.js';

const STORAGE_KEY = 'volcano-section-project-v1';
export const SCHEMA_VERSION = 1;

export function defaultRecords() {
  return LITHOLOGIES.map((l) => ({
    id: `lab-${l.idx}`,
    type: 'single',
    layerIdx: l.idx,
    anchorFraction: 0.5,
    side: 'auto',
    pinned: null,
    nameOverride: null,
    ageOverride: null,
    thicknessOverride: null,
    hidden: false,
  }));
}

export function defaultProject() {
  return {
    version: SCHEMA_VERSION,
    meta: { title: '火山岩区地质剖面标注稿', author: '', scale: '1:10000', createdAt: new Date().toISOString() },
    lines: MEASURED_SECTIONS.map((l) => ({ ...l, points: l.points.map((p) => ({ ...p })) })),
    activeLineId: 'S12',
    // 每条剖面独立的标注记录与样式
    sectionData: Object.fromEntries(
      MEASURED_SECTIONS.map((l) => [l.id, {
        records: defaultRecords(),
        style: { fontPx: 12.5, maxCharsPerLine: 9, vExag: 2, hScale: 0.22, showGrid: true, showThickness: true },
      }])
    ),
    obliqueCounter: 13,
  };
}

// 为新增剖面线初始化数据
export function ensureSectionData(project, lineId) {
  if (!project.sectionData[lineId]) {
    project.sectionData[lineId] = {
      records: defaultRecords(),
      style: { fontPx: 12.5, maxCharsPerLine: 9, vExag: 2, hScale: 0.22, showGrid: true, showThickness: true },
    };
  }
}

export function addObliqueLine(project, points) {
  const id = nextObliqueId();
  const line = { id, name: `${id} 斜切剖面`, origin: 'oblique', points };
  project.lines.push(line);
  ensureSectionData(project, id);
  project.activeLineId = id;
  return line;
}

// 合并相邻层标注：把 records 中给定层号替换为一条 merged 记录
export function mergeLayers(records, layerIdxs) {
  const idxs = [...layerIdxs].sort((a, b) => a - b);
  const firstPos = records.findIndex((r) =>
    r.type === 'single' && idxs.includes(r.layerIdx) && !r.hidden);
  const merged = {
    id: `merge-${idxs.join('-')}-${Date.now()}`,
    type: 'merged',
    members: idxs,
    anchorFraction: 0.5,
    side: 'auto',
    pinned: null,
    hidden: false,
  };
  const next = records.filter((r) => !(r.type === 'single' && idxs.includes(r.layerIdx)));
  next.splice(Math.max(0, firstPos), 0, merged);
  return next;
}

// 拆分合并标注
export function unmergeRecord(records, mergedId) {
  const pos = records.findIndex((r) => r.id === mergedId);
  if (pos < 0) return records;
  const merged = records[pos];
  const restored = merged.members.map((idx) => ({
    id: `lab-${idx}`,
    type: 'single',
    layerIdx: idx,
    anchorFraction: 0.5,
    side: 'auto',
    pinned: null,
    nameOverride: null,
    ageOverride: null,
    thicknessOverride: null,
    hidden: false,
  }));
  return [...records.slice(0, pos), ...restored, ...records.slice(pos + 1)];
}

// ---- 持久化 ----
export function saveProject(project) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    return true;
  } catch (e) {
    console.warn('自动保存失败', e);
    return false;
  }
}

export function loadProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== SCHEMA_VERSION) return null;
    return data;
  } catch (e) {
    console.warn('读取存档失败', e);
    return null;
  }
}

export function clearSavedProject() {
  localStorage.removeItem(STORAGE_KEY);
}

export function projectToJSON(project) {
  return JSON.stringify(project, null, 2);
}

export function projectFromJSON(text) {
  const data = JSON.parse(text);
  if (!data.version || !Array.isArray(data.lines) || typeof data.sectionData !== 'object') {
    throw new Error('文件结构不符合剖面标注稿格式');
  }
  // 补齐缺失的剖面数据（向前兼容）
  for (const line of data.lines) ensureSectionData(data, line.id);
  return data;
}
