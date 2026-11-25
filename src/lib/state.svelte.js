import { createSampleProject } from './sampleProject.js';
import { idbGet, idbSet } from './db.js';

const PROJECT_KEY = 'current-volcano-project-v1';
const CHANNEL_NAME = 'volcano-lava-review-v1';

let rawProject = $state.raw(createSampleProject());

export const projectState = $state({
  hydrated: false,
  reloadToken: 0,
  saving: false,
  lastSavedAt: null,
  storageMessage: '正在检查本地工程…'
});

export const ui = $state({
  mode: 'split', // split | mapper | assessor
  activeView: 'mapper',
  activeTool: { mapper: 'pan', assessor: 'pan' },
  showImportHelp: false,
  briefingOpen: false,
  listPayload: null,
  activeBuiltinZoneIds: ['v-g-nangou'],
  toast: '',
  toastTimer: null,
  hover: null
});

export const viewSettings = $state({
  mapper: createDefaultViewSettings('all'),
  assessor: createDefaultViewSettings('p0')
});

function createDefaultViewSettings(periodId) {
  return {
    periodId,
    onlyPeriod: periodId !== 'all',
    hiddenPeriodIds: [],
    layers: {
      terrain: true,
      tephra: true,
      clasts: true,
      flows: true,
      units: true,
      boundaries: true,
      periodBoundaries: true,
      cone: true,
      gullies: true,
      villages: true,
      refuges: true,
      fronts: true,
      labels: true
    }
  };
}

export const PEER_META = {
  mapper: {
    role: 'mapper',
    name: '编图组 · 林工',
    shortName: '编图',
    color: '#22d3ee',
    tabId: `tab-${Math.random().toString(36).slice(2, 8)}`
  },
  assessor: {
    role: 'assessor',
    name: '评估组 · 王工',
    shortName: '评估',
    color: '#f472b6',
    tabId: `tab-${Math.random().toString(36).slice(2, 8)}`
  }
};

export const collab = $state({
  peers: {
    mapper: { ...PEER_META.mapper, ids: [], at: null },
    assessor: { ...PEER_META.assessor, ids: [], at: null }
  },
  activity: [
    { id: 'init-1', text: '同一工程已在本地协同总线就绪；可另开标签页分别担任编图/评估。', at: nowTime(), tone: 'system' }
  ]
});

export const mapApis = {};

export function registerMapApi(role, api) {
  mapApis[role] = api;
}

export function showToast(message, duration = 2600) {
  ui.toast = message;
  if (ui.toastTimer) clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => {
    ui.toast = '';
  }, duration);
}

function nowTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

function addActivity(text, tone = 'system') {
  collab.activity = [
    { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, at: nowTime(), tone },
    ...collab.activity
  ].slice(0, 14);
}

let channel = null;
if (typeof BroadcastChannel !== 'undefined') {
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = async (event) => {
    const message = event.data || {};
    if (message.type === 'selection') {
      const peer = collab.peers[message.role];
      if (!peer) return;
      peer.ids = message.ids || [];
      peer.at = message.at;
      addActivity(`${message.name || PEER_META[message.role]?.name} 选中 ${peer.ids.length} 个单元`, message.role);
    }
    if (message.type === 'project-updated') {
      if (message.revision > rawProject.revision) {
        await reloadProjectFromDb({ announce: false });
        addActivity(`收到工程修订 r${message.revision}，已刷新界线与分层`, 'project');
      }
    }
  };
}

export function getProject() {
  return rawProject;
}

export async function hydrateProject() {
  try {
    const saved = await idbGet(PROJECT_KEY);
    if (saved && saved.schema === 'volcano-lava-overview/1') {
      rawProject = saved;
      projectState.storageMessage = '工程已从本机 IndexedDB 载入';
    } else {
      await persistProject({ announce: false });
      projectState.storageMessage = '示范工程已建立并保存到本机';
    }
  } catch (error) {
    console.warn('IndexedDB hydrate failed; using in-memory project.', error);
    projectState.storageMessage = '浏览器存储不可用，当前仅内存运行';
  } finally {
    projectState.hydrated = true;
    projectState.reloadToken += 1;
  }
}

export async function persistProject({ announce = true, broadcast = true } = {}) {
  projectState.saving = true;
  try {
    rawProject.updatedAt = new Date().toISOString();
    rawProject.revision = (rawProject.revision || 1) + (announce ? 1 : 0);
    const snapshot = rawProject;
    await idbSet(PROJECT_KEY, snapshot);
    projectState.lastSavedAt = nowTime();
    projectState.storageMessage = `已保存 r${rawProject.revision}`;
    if (broadcast && channel) {
      channel.postMessage({
        type: 'project-updated',
        projectId: rawProject.id,
        revision: rawProject.revision,
        at: rawProject.updatedAt
      });
    }
  } catch (error) {
    console.warn('Persist failed', error);
    projectState.storageMessage = '保存失败：可导出工程 JSON 备份';
    showToast('本机存储写入失败，请使用“导出工程”备份');
  } finally {
    projectState.saving = false;
  }
}

export function commitProjectChange(mutator, description) {
  mutator(rawProject);
  rawProject = { ...rawProject };
  addActivity(description, 'project');
  void persistProject({ announce: true });
}

export async function reloadProjectFromDb({ announce = true } = {}) {
  const saved = await idbGet(PROJECT_KEY);
  if (saved) {
    rawProject = saved;
    projectState.reloadToken += 1;
    projectState.lastSavedAt = nowTime();
    if (announce) {
      showToast(`已重新载入工程 r${saved.revision}`);
      addActivity(`手动刷新工程到 r${saved.revision}`, 'project');
    }
  } else if (announce) {
    showToast('本机没有已保存工程');
  }
}

export function replaceImportedProject(project, description = '导入新工程') {
  rawProject = project;
  projectState.reloadToken += 1;
  void persistProject({ announce: false });
  addActivity(description, 'project');
  showToast('工程已导入并保存，另一视图/标签页将收到刷新通知');
}

export function selectUnits(role, ids, { source = 'local', silent = false } = {}) {
  const peer = collab.peers[role];
  if (!peer) return;
  peer.ids = [...ids];
  peer.at = nowTime();
  if (!silent) {
    addActivity(`${PEER_META[role].name} ${ids.length ? `选中 ${ids.length} 个单元` : '取消选择'}`, role);
  }
  if (source === 'local' && channel) {
    channel.postMessage({
      type: 'selection',
      role,
      ids: [...peer.ids],
      at: String(peer.at || ''),
      name: String(PEER_META[role].name)
    });
  }
}

export function setMode(mode) {
  ui.mode = mode;
  if (mode !== 'split') ui.activeView = mode;
}

export function setActiveView(role) {
  ui.activeView = role;
}

export function setTool(role, tool) {
  ui.activeTool[role] = tool;
  if (tool !== 'pan') showToast(tool === 'edit' ? '编图修边：拖动青色顶点，松开即保存修订' : '圈画避险范围：逐点单击，双击闭合');
}

export function resetAllSelections() {
  selectUnits('mapper', [], { silent: true });
  selectUnits('assessor', [], { silent: true });
}
