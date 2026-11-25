// 左栏：剖面线列表
export default function SectionList({ project, activeLineId, onSelect, onOpenPicker }) {
  const active = project.lines.find((l) => l.id === activeLineId);
  const measured = project.lines.filter((l) => l.origin === 'measured');
  const oblique = project.lines.filter((l) => l.origin === 'oblique');

  const Group = ({ title, lines }) => (
    <div className="list-group">
      <div className="list-group-title">{title}</div>
      {lines.map((line) => {
        const sd = project.sectionData[line.id];
        const merged = sd?.records.filter((r) => r.type === 'merged').length ?? 0;
        const hidden = sd?.records.filter((r) => r.hidden).length ?? 0;
        return (
          <button
            key={line.id}
            className={`list-item ${line.id === activeLineId ? 'active' : ''}`}
            onClick={() => onSelect(line.id)}
          >
            <span className="list-item-id">{line.id}</span>
            <span className="list-item-name">{line.name.replace(/^\d+\s*号?/, '').replace(line.id, '').trim() || line.name}</span>
            <span className="list-item-badges">
              {merged > 0 && <em className="badge merge">{merged} 合并</em>}
              {hidden > 0 && <em className="badge hide">{hidden} 隐藏</em>}
              {line.origin === 'oblique' && <em className="badge ob">斜切</em>}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <aside className="panel panel-left">
      <div className="panel-header">
        <h2>剖面线列表</h2>
        <button className="btn primary small" onClick={onOpenPicker}>＋ 选择 / 斜切</button>
      </div>
      <div className="panel-body">
        <Group title="地质图实测剖面" lines={measured} />
        {oblique.length > 0 && <Group title="三维斜切剖面" lines={oblique} />}
      </div>
      <div className="panel-footer">
        当前：<b>{active?.name ?? '—'}</b>
      </div>
    </aside>
  );
}
