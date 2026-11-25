// 右栏：标注属性编辑 + 剖面样式参数
import { LITHOLOGIES } from '../model/volcanoModel.js';

export default function PropertiesPanel({
  project, activeLineId, selectedLabelId, dispatch, layout, section,
  onMergeThin, onUnmerge,
}) {
  const sd = project.sectionData[activeLineId];
  if (!sd) return <aside className="panel panel-right"><div className="panel-body">无剖面数据</div></aside>;
  const { records, style } = sd;
  const selected = records.find((r) => r.id === selectedLabelId);

  const patchLabel = (patch) => dispatch({
    type: 'UPDATE_LABEL', lineId: activeLineId, recordId: selectedLabelId, patch,
  });

  // 薄层检测：布局中 spacePx 小于框高的层
  const thinItems = layout?.items.filter((it) => it.spacePx < it.box.h && it.rec.type === 'single') ?? [];
  const thinIdxs = [...new Set(thinItems.map((it) => it.rec.layerIdx))].sort((a, b) => a - b);

  return (
    <aside className="panel panel-right">
      <div className="panel-header"><h2>标注属性</h2></div>
      <div className="panel-body">

        {!selected && (
          <div className="prop-empty">
            <p>在中间画布点击任一标注框，可编辑其岩性名称、年代、厚度、放置侧别与固定位置。</p>
            {thinIdxs.length >= 2 && (
              <div className="thin-tip">
                <b>检测到 {thinIdxs.length} 个薄层标注拥挤</b>
                <p>涉及层位：{thinIdxs.map((i) => LITHOLOGIES[i].age).join('、')}</p>
                <button className="btn primary" onClick={() => onMergeThin(thinIdxs)}>
                  合并这 {thinIdxs.length} 层标注并重排
                </button>
              </div>
            )}
          </div>
        )}

        {selected && selected.type === 'single' && (
          <div className="prop-form">
            <div className="prop-title">
              {LITHOLOGIES[selected.layerIdx].age} · {LITHOLOGIES[selected.layerIdx].name}
            </div>
            <label>岩性名称
              <input
                value={selected.nameOverride ?? LITHOLOGIES[selected.layerIdx].name}
                onChange={(e) => patchLabel({ nameOverride: e.target.value })}
              />
            </label>
            <label>年代
              <input
                value={selected.ageOverride ?? LITHOLOGIES[selected.layerIdx].age}
                onChange={(e) => patchLabel({ ageOverride: e.target.value })}
              />
            </label>
            <label>厚度 (m)
              <input
                type="number" step="0.1"
                value={selected.thicknessOverride ?? section.stats[selected.layerIdx].thicknessMid}
                onChange={(e) => patchLabel({ thicknessOverride: Number(e.target.value) })}
              />
            </label>
            <label>放置方式
              <select
                value={selected.side}
                onChange={(e) => patchLabel({ side: e.target.value, pinned: null })}
              >
                <option value="auto">自动（层内优先，薄层外挪）</option>
                <option value="left">强制左侧层外</option>
                <option value="right">强制右侧层外</option>
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox" checked={!!selected.hidden}
                onChange={(e) => patchLabel({ hidden: e.target.checked })}
              /> 隐藏该标注
            </label>
            {selected.pinned && (
              <button className="btn" onClick={() => patchLabel({ pinned: null })}>
                解除位置固定（恢复自动排版）
              </button>
            )}
            <button className="btn danger" onClick={() => dispatch({
              type: 'UPDATE_LABEL', lineId: activeLineId, recordId: selected.id,
              patch: { nameOverride: null, ageOverride: null, thicknessOverride: null, pinned: null, side: 'auto' },
            })}>重置为默认</button>
          </div>
        )}

        {selected && selected.type === 'merged' && (
          <div className="prop-form">
            <div className="prop-title">合并标注</div>
            <p className="muted">成员层位：{selected.members.map((i) => LITHOLOGIES[i].age).join('、')}</p>
            <label>放置侧别
              <select value={selected.side} onChange={(e) => patchLabel({ side: e.target.value })}>
                <option value="auto">自动</option>
                <option value="left">左侧</option>
                <option value="right">右侧</option>
              </select>
            </label>
            <button className="btn primary" onClick={() => onUnmerge(selected.id)}>
              拆分，恢复逐层标注
            </button>
          </div>
        )}

        <div className="prop-section">
          <div className="prop-section-title">剖面样式（改动触发整版重排）</div>
          <label>字号 (px)
            <input
              type="number" min="8" max="28" step="0.5" value={style.fontPx}
              onChange={(e) => dispatch({
                type: 'UPDATE_STYLE', lineId: activeLineId, patch: { fontPx: Number(e.target.value) },
              })}
            />
          </label>
          <label>每行最大字数
            <input
              type="number" min="4" max="16" value={style.maxCharsPerLine}
              onChange={(e) => dispatch({
                type: 'UPDATE_STYLE', lineId: activeLineId, patch: { maxCharsPerLine: Number(e.target.value) },
              })}
            />
          </label>
          <label>垂直夸大
            <input
              type="number" min="1" max="6" step="0.5" value={style.vExag}
              onChange={(e) => dispatch({
                type: 'UPDATE_STYLE', lineId: activeLineId, patch: { vExag: Number(e.target.value) },
              })}
            />
          </label>
          <label>水平比例 (px/m)
            <input
              type="number" min="0.08" max="0.5" step="0.01" value={style.hScale}
              onChange={(e) => dispatch({
                type: 'UPDATE_STYLE', lineId: activeLineId, patch: { hScale: Number(e.target.value) },
              })}
            />
          </label>
          <label className="check">
            <input
              type="checkbox" checked={style.showGrid}
              onChange={(e) => dispatch({
                type: 'UPDATE_STYLE', lineId: activeLineId, patch: { showGrid: e.target.checked },
              })}
            /> 显示里程/高程网格
          </label>
        </div>

        <div className="prop-section">
          <div className="prop-section-title">标注清单</div>
          <div className="record-list">
            {records.map((r) => (
              <button
                key={r.id}
                className={`record-row ${r.id === selectedLabelId ? 'active' : ''} ${r.hidden ? 'hidden' : ''}`}
                onClick={() => dispatch({ type: 'SELECT_LABEL', recordId: r.id })}
              >
                {r.type === 'merged'
                  ? `合并：${r.members.map((i) => LITHOLOGIES[i].age).join('＋')}`
                  : `${LITHOLOGIES[r.layerIdx].age} ${LITHOLOGIES[r.layerIdx].name}`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
