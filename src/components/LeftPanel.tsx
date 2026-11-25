import { useRef } from 'react';
import { useAppStore } from '../store';
import { isGroup } from '../lib/tree';
import { isProjectState, projectFromPlan } from '../lib/planImport';
import type { ID } from '../types';

function TreeRow({ id, depth }: { id: ID; depth: number }) {
  const node = useAppStore((s) => s.project.nodes[id]);
  const selectedId = useAppStore((s) => s.selectedId);
  const checkedIds = useAppStore((s) => s.checkedIds);
  const { select, toggleChecked, toggleCollapsed, toggleVisible } = useAppStore();
  if (!node) return null;
  const selected = selectedId === id;

  if (isGroup(node)) {
    return (
      <>
        <div className={`tree-row group-row ${selected ? 'selected' : ''}`} style={{ paddingLeft: 8 + depth * 16 }}>
          <button type="button" className="collapse-btn" onClick={() => toggleCollapsed(id)} aria-label="折叠/展开">
            {node.collapsed ? '▸' : '▾'}
          </button>
          <button type="button" className="tree-main" onClick={() => select(id)}>
            <span className="tree-icon group" style={{ color: node.color }}>▣</span>
            <span className="tree-name">{node.name}</span>
            <em>{node.children.length}</em>
          </button>
        </div>
        {!node.collapsed ? node.children.map((child) => <TreeRow key={child} id={child} depth={depth + 1} />) : null}
      </>
    );
  }

  const checked = checkedIds.includes(id);
  return (
    <div className={`tree-row track-row ${selected ? 'selected' : ''}`} style={{ paddingLeft: 12 + depth * 16 }}>
      <input type="checkbox" checked={checked} onChange={() => toggleChecked(id)} onClick={(e) => e.stopPropagation()} aria-label={`选择 ${node.name}`} />
      <button type="button" className="tree-main" onClick={() => select(id)}>
        <span className="color-chip" style={{ background: node.color }} />
        <span className="tree-name">{node.name}</span>
        <span className="tree-code">{node.code}</span>
      </button>
      <button type="button" className="eye-btn" onClick={() => toggleVisible(id)} title={node.visible ? '隐藏轨道' : '显示轨道'}>
        {node.visible ? '◉' : '○'}
      </button>
    </div>
  );
}

export function LeftPanel() {
  const project = useAppStore((s) => s.project);
  const checkedCount = useAppStore((s) => s.checkedIds.length);
  const { groupChecked, clearChecked, loadProject, notify } = useAppStore();
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function loadSampleExchange() {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}sample-plan.json`);
      if (!response.ok) throw new Error('示例方案文件不可用');
      loadProject(projectFromPlan(await response.json()), '已读取方案交换样例并生成轨道组');
    } catch (error) {
      notify(error instanceof Error ? error.message : '示例方案读取失败', 'warn');
    }
  }

  async function handleFile(file: File) {
    try {
      const raw = JSON.parse(await file.text());
      if (isProjectState(raw)) loadProject(raw, '验收工程 JSON 已载入');
      else loadProject(projectFromPlan(raw), '方案交换文件已解析：棚体骨架与轨道已带入');
    } catch (error) {
      notify(error instanceof Error ? error.message : '导入失败，请检查 JSON 格式', 'warn');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <aside className="panel left-panel">
      <section className="side-card plan-card">
        <div className="eyebrow">方案数据链路</div>
        <h2>{project.meta.projectName}</h2>
        <p className="plan-code">{project.meta.planCode}</p>
        <dl className="meta-list">
          <div><dt>棚体</dt><dd>{project.meta.greenhouseModel}</dd></div>
          <div><dt>来源</dt><dd title={project.meta.source}>{project.meta.source}</dd></div>
          <div><dt>带入时间</dt><dd>{project.meta.importedAt}</dd></div>
        </dl>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <button type="button" className="btn secondary block" onClick={() => fileRef.current?.click()}>导入方案 / 验收 JSON</button>
        <button type="button" className="btn ghost block sample-link" onClick={loadSampleExchange}>读取内置方案交换样例</button>
      </section>

      <section className="side-card tree-card">
        <div className="card-head">
          <h2>轨道与编组</h2>
          <span>{checkedCount ? `已勾 ${checkedCount}` : '勾选多条'}</span>
        </div>
        <div className="tree-list">
          {project.rootIds.map((id) => <TreeRow key={id} id={id} depth={0} />)}
        </div>
        <div className="group-actions">
          <button type="button" className="btn primary" disabled={checkedCount < 2} onClick={groupChecked}>
            编为一组{checkedCount >= 2 ? `（${checkedCount}）` : ''}
          </button>
          <button type="button" className="btn ghost" disabled={!checkedCount} onClick={clearChecked}>清空</button>
        </div>
        <p className="tiny-hint">组内可在右侧检查器继续新建嵌套子组、加入其他轨道。</p>
      </section>

      <section className="side-card farmer-card">
        <div className="eyebrow">农户讲解视角</div>
        <h2>什么时候开帘？</h2>
        <ul>
          <li><b>升温降湿：</b>分段慢开，避免冷风直吹作物。</li>
          <li><b>正午强光：</b>全开遮阳，按光照曲线保持。</li>
          <li><b>傍晚低温：</b>按收拢时长关闭，帮助棚室保温。</li>
        </ul>
        <p>导出的验收 HTML 内含甲方验收演示和农户讲解页。</p>
      </section>
    </aside>
  );
}
