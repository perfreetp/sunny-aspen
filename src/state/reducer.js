// 轻量 reducer：所有状态变更走这里，便于撤销/重做与整版重排触发
import {
  defaultProject, addObliqueLine, ensureSectionData,
  mergeLayers, unmergeRecord,
} from './projectStore.js';

export function createInitialState(saved) {
  const project = saved ?? defaultProject();
  return {
    project,
    past: [],
    future: [],
    selectedLabelId: null,
    fontReady: false,
    pickerOpen: false,
  };
}

function snapshot(project) {
  return JSON.parse(JSON.stringify(project));
}

export function reducer(state, action) {
  const pushHistory = (project) => ({
    ...state,
    project,
    past: [...state.past.slice(-40), snapshot(state.project)],
    future: [],
  });

  switch (action.type) {
    case 'SET_ACTIVE_LINE': {
      const project = { ...state.project, activeLineId: action.lineId };
      return { ...state, project, selectedLabelId: null };
    }
    case 'ADD_OBLIQUE_LINE': {
      const project = snapshot(state.project);
      addObliqueLine(project, action.points);
      return { ...pushHistory(project), selectedLabelId: null };
    }
    case 'UPDATE_LINE_POINTS': {
      const project = snapshot(state.project);
      const line = project.lines.find((l) => l.id === action.lineId);
      if (!line) return state;
      line.points = action.points;
      return pushHistory(project);
    }
    case 'UPDATE_RECORDS': {
      const project = snapshot(state.project);
      ensureSectionData(project, action.lineId);
      project.sectionData[action.lineId].records = action.records;
      return pushHistory(project);
    }
    case 'MERGE_LAYERS': {
      const project = snapshot(state.project);
      const sd = project.sectionData[action.lineId];
      sd.records = mergeLayers(sd.records, action.layerIdxs);
      return { ...pushHistory(project), selectedLabelId: null };
    }
    case 'UNMERGE': {
      const project = snapshot(state.project);
      const sd = project.sectionData[action.lineId];
      sd.records = unmergeRecord(sd.records, action.recordId);
      return { ...pushHistory(project), selectedLabelId: null };
    }
    case 'UPDATE_LABEL': {
      // 改一处约束（年代/名称/厚度/位置/侧别）-> 整版重排由渲染层监听 project 变化完成
      const project = snapshot(state.project);
      const sd = project.sectionData[action.lineId];
      sd.records = sd.records.map((r) => r.id === action.recordId ? { ...r, ...action.patch } : r);
      return pushHistory(project);
    }
    case 'UPDATE_STYLE': {
      const project = snapshot(state.project);
      const sd = project.sectionData[action.lineId];
      sd.style = { ...sd.style, ...action.patch };
      return pushHistory(project);
    }
    case 'SELECT_LABEL':
      return { ...state, selectedLabelId: action.recordId };
    case 'SET_PICKER':
      return { ...state, pickerOpen: action.open };
    case 'SET_FONT_READY':
      return { ...state, fontReady: true };
    case 'UNDO': {
      if (!state.past.length) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        project: previous,
        past: state.past.slice(0, -1),
        future: [snapshot(state.project), ...state.future],
        selectedLabelId: null,
      };
    }
    case 'REDO': {
      if (!state.future.length) return state;
      const next = state.future[0];
      return {
        ...state,
        project: next,
        future: state.future.slice(1),
        past: [...state.past, snapshot(state.project)],
        selectedLabelId: null,
      };
    }
    case 'LOAD_PROJECT':
      return {
        ...state,
        project: action.project,
        past: [],
        future: [],
        activeLineId: action.project.activeLineId,
        selectedLabelId: null,
      };
    case 'RESET_PROJECT':
      return createInitialState();
    default:
      return state;
  }
}
