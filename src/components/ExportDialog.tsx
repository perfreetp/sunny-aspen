import { useMemo } from 'react';
import { useAppStore } from '../store';
import { buildDemoHtml, downloadProjectJson, downloadTextFile } from '../lib/exportDemo';

export function ExportDialog() {
  const open = useAppStore((s) => s.exportOpen);
  const setOpen = useAppStore((s) => s.setExportOpen);
  const project = useAppStore((s) => s.project);
  const html = useMemo(() => (open ? buildDemoHtml(project) : ''), [open, project]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onPointerDown={() => setOpen(false)}>
      <div className="modal export-modal" role="dialog" aria-modal="true" aria-label="导出验收演示" onPointerDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>导出整段开合动画</h2>
            <p>单个离线 HTML：包含三维示意动画、验收清单和农户开帘时间表，可直接发给甲方。</p>
          </div>
          <button type="button" className="btn icon-btn" onClick={() => setOpen(false)}>×</button>
        </header>
        <div className="export-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => downloadTextFile(`${project.meta.planCode}-开合验收演示.html`, html, 'text/html;charset=utf-8')}
          >
            下载甲方验收 + 农户讲解 HTML
          </button>
          <button type="button" className="btn secondary" onClick={() => downloadProjectJson(project)}>
            下载可再导入的编排 JSON
          </button>
        </div>
        <div className="export-preview">
          <iframe title="验收演示预览" srcDoc={html} sandbox="allow-scripts" />
        </div>
      </div>
    </div>
  );
}
