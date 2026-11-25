import { useAppStore } from '../store';

export function TopBar() {
  const meta = useAppStore((s) => s.project.meta);
  const presentMode = useAppStore((s) => s.presentMode);
  const { setExportOpen, setPresentMode } = useAppStore();

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" aria-hidden>
          <svg viewBox="0 0 48 48" width="34" height="34">
            <path d="M6 38 Q24 6 42 38" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
            <path d="M12 38 Q24 16 36 38" fill="none" stroke="currentColor" strokeWidth="2" opacity=".55" />
            <path d="M8 38 H40" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <path d="M15 34 C21 27 27 27 33 34" fill="none" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <h1>棚影 ShadeMotion</h1>
          <p>遮阳帘开合动画编排台 · 农业装备售前方案版</p>
        </div>
      </div>
      <div className="top-project">
        <strong>{meta.projectName}</strong>
        <span>{meta.planCode}</span>
      </div>
      <div className="top-actions">
        <button type="button" className={`btn subtle ${presentMode ? 'active' : ''}`} onClick={() => setPresentMode(!presentMode)}>
          {presentMode ? '退出演示布局' : '演示布局'}
        </button>
        <button type="button" className="btn primary" onClick={() => setExportOpen(true)}>导出验收演示</button>
      </div>
    </header>
  );
}
