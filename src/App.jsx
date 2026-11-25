import { useMemo, useReducer, useEffect, useRef, useCallback } from 'react';
import { createInitialState, reducer } from './state/reducer.js';
import {
  loadProject, saveProject, projectToJSON, projectFromJSON,
  clearSavedProject, defaultProject,
} from './state/projectStore.js';
import { buildSection, makeSectionTransform } from './model/section.js';
import { computeLayout } from './layout/engine.js';
import { whenFontsReady } from './fonts/fontManager.js';
import { buildView } from './render/viewBuilder.js';
import SectionCanvas from './components/SectionCanvas.jsx';
import SectionList from './components/SectionList.jsx';
import PropertiesPanel from './components/PropertiesPanel.jsx';
import LinePickerModal from './components/LinePickerModal.jsx';
import { buildSVG, downloadText } from './export/svgExport.js';
import { exportReviewBundle } from './export/bundle.js';

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState(loadProject()));
  const { project, selectedLabelId, fontReady, pickerOpen } = state;
  const fontSetRef = useRef(null);
  const fileInputRef = useRef(null);
  const paperScopeRef = useRef(null);

  // 载入 opentype 字体
  useEffect(() => {
    whenFontsReady().then((fs) => {
      fontSetRef.current = fs;
      dispatch({ type: 'SET_FONT_READY' });
    });
  }, []);

  // 自动保存（防抖）
  useEffect(() => {
    const t = setTimeout(() => saveProject(project), 400);
    return () => clearTimeout(t);
  }, [project]);

  const activeLine = project.lines.find((l) => l.id === project.activeLineId);
  const sd = project.sectionData[project.activeLineId];

  // 剖面 + 变换 + 排版：任一约束变化都会整版重算
  const { section, transform, layout, view } = useMemo(() => {
    if (!activeLine || !sd || !fontSetRef.current) {
      return { section: null, transform: null, layout: null, view: null };
    }
    const sec = buildSection(activeLine);
    const tr = makeSectionTransform(sec, { hScale: sd.style.hScale, vExag: sd.style.vExag });
    const lay = computeLayout(sec, tr, sd.records, fontSetRef.current, sd.style);
    const v = buildView(sec, tr, lay, sd.style);
    return { section: sec, transform: tr, layout: lay, view: v };
  }, [activeLine, sd, fontReady]);

  const handleDragLabel = useCallback((recordId, { rect, side }) => {
    dispatch({
      type: 'UPDATE_LABEL', lineId: project.activeLineId, recordId,
      patch: { pinned: { rect, side } },
    });
  }, [project.activeLineId]);

  const handleMergeThin = useCallback((layerIdxs) => {
    dispatch({ type: 'MERGE_LAYERS', lineId: project.activeLineId, layerIdxs });
  }, [project.activeLineId]);

  const handleUnmerge = useCallback((recordId) => {
    dispatch({ type: 'UNMERGE', lineId: project.activeLineId, recordId });
  }, [project.activeLineId]);

  const handleEditMeasuredLine = useCallback((lineId, endIdx, point) => {
    const line = project.lines.find((l) => l.id === lineId);
    if (!line) return;
    const points = line.points.map((p, i) => (i === endIdx ? point : p));
    dispatch({ type: 'UPDATE_LINE_POINTS', lineId, points });
  }, [project.lines]);

  // 导出当前剖面 SVG
  const handleExportSVG = () => {
    if (!view || !fontSetRef.current) return;
    const svg = buildSVG(view, fontSetRef.current, sd.style, project.meta);
    downloadText(`${activeLine.id}_${activeLine.name}.svg`, svg);
  };

  // 打包全部剖面评审材料（当前活动剖面附带高清 PNG，其余提供矢量 SVG）
  const handleExportBundle = async () => {
    if (!fontSetRef.current) return;
    const jobs = project.lines.map((line) => {
      const d = project.sectionData[line.id];
      const sec = buildSection(line);
      const tr = makeSectionTransform(sec, { hScale: d.style.hScale, vExag: d.style.vExag });
      const lay = computeLayout(sec, tr, d.records, fontSetRef.current, d.style);
      const v = buildView(sec, tr, lay, d.style);
      return {
        line, view: v, style: d.style, meta: project.meta,
        scope: line.id === project.activeLineId ? paperScopeRef.current : null,
      };
    });
    await exportReviewBundle(jobs, fontSetRef.current, project);
  };

  const handleSaveJSON = () => {
    downloadText('火山剖面标注稿.json', projectToJSON(project), 'application/json');
  };

  const handleImport = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = projectFromJSON(String(reader.result));
        dispatch({ type: 'LOAD_PROJECT', project: imported });
      } catch (e) {
        alert(`导入失败：${e.message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleReset = () => {
    if (confirm('将清空当前所有标注改动并恢复示例数据，确定？')) {
      clearSavedProject();
      dispatch({ type: 'LOAD_PROJECT', project: defaultProject() });
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">⛰</span>
          <div>
            <h1>火山剖面岩层标注排版系统</h1>
            <small>React · Paper.js · opentype.js 矢量标注</small>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn" disabled={!state.past.length} onClick={() => dispatch({ type: 'UNDO' })}>撤销</button>
          <button className="btn" disabled={!state.future.length} onClick={() => dispatch({ type: 'REDO' })}>重做</button>
          <span className="divider" />
          <button className="btn" onClick={() => fileInputRef.current?.click()}>导入项目稿</button>
          <button className="btn" onClick={handleSaveJSON}>保存可编辑稿</button>
          <button className="btn" onClick={handleExportSVG} disabled={!view}>导出当前 SVG</button>
          <button className="btn primary" onClick={handleExportBundle} disabled={!fontReady}>整理评审材料 (ZIP)</button>
          <button className="btn ghost" onClick={handleReset}>重置示例</button>
          <input
            ref={fileInputRef} type="file" accept=".json,application/json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ''; }}
          />
        </div>
      </header>

      <div className="workspace">
        <SectionList
          project={project}
          activeLineId={project.activeLineId}
          onSelect={(id) => dispatch({ type: 'SET_ACTIVE_LINE', lineId: id })}
          onOpenPicker={() => dispatch({ type: 'SET_PICKER', open: true })}
        />

        <main className="panel panel-center">
          <div className="center-head">
            <h2>{activeLine?.name ?? '未选择剖面'}</h2>
            {layout?.warnings?.length > 0 && (
              <div className="warnings">
                {layout.warnings.map((w, i) => <span key={i} className="warn">⚠ {w}</span>)}
              </div>
            )}
          </div>
          <div className="canvas-scroll">
            {!fontReady && <div className="loading">正在载入 opentype 矢量字体…</div>}
            {fontReady && section && transform && layout && (
              <SectionCanvas
                section={section}
                transform={transform}
                layout={layout}
                style={sd.style}
                fontSet={fontSetRef.current}
                line={activeLine}
                meta={project.meta}
                selectedLabelId={selectedLabelId}
                onSelectLabel={(id) => dispatch({ type: 'SELECT_LABEL', recordId: id })}
                onDragLabel={handleDragLabel}
                scopeRef={paperScopeRef}
              />
            )}
          </div>
        </main>

        <PropertiesPanel
          project={project}
          activeLineId={project.activeLineId}
          selectedLabelId={selectedLabelId}
          dispatch={dispatch}
          layout={layout}
          section={section}
          onMergeThin={handleMergeThin}
          onUnmerge={handleUnmerge}
        />
      </div>

      <LinePickerModal
        open={pickerOpen}
        onClose={() => dispatch({ type: 'SET_PICKER', open: false })}
        activeLineId={project.activeLineId}
        dispatch={dispatch}
        onEditMeasuredLine={handleEditMeasuredLine}
      />
    </div>
  );
}
