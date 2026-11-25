// 伪三维立体图：地形网格斜投影，在模型上斜拉一条剖面线
import { useEffect, useRef, useState } from 'react';
import paper from 'paper';
import { MODEL_EXTENT, sampleGrid, LITHOLOGIES } from '../model/volcanoModel.js';

const W = 560, H = 520;
const TILT = 0.62;   // 俯视倾角
const ZSCALE = 0.16; // 高程垂直压缩
const OX = 70, OY = 120;

function project(x, y, z) {
  // 等距-ish 斜投影：模型 x 向右，模型 y 向右下，高程向上
  return {
    x: OX + (x - y) * 0.105,
    y: OY + (x + y) * 0.052 * TILT - z * ZSCALE,
  };
}

export default function ReliefPicker({ onCreateOblique }) {
  const canvasRef = useRef(null);
  const scopeRef = useRef(null);
  const redraftRef = useRef(null);
  const [draft, setDraft] = useState(null); // [{x,y}...] 模型坐标
  const draftRef = useRef(null);
  draftRef.current = draft;

  useEffect(() => {
    const scope = new paper.PaperScope();
    scope.setup(canvasRef.current);
    scopeRef.current = scope;
    const grid = sampleGrid(34);
    const n = grid.n;

    // 地形面：三角网着色
    const surface = new scope.Group();
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < n - 1; j++) {
        const c00 = grid.cells[i][j], c10 = grid.cells[i + 1][j];
        const c01 = grid.cells[i][j + 1], c11 = grid.cells[i + 1][j + 1];
        const p = (c) => project(c.x, c.y, c.z);
        const shade = 0.86 + 0.14 * Math.max(0, Math.min(1, c00.z / 1500));
        const color = new scope.Color(LITHOLOGIES[c00.lith].color);
        color.brightness = shade;
        surface.addChild(new scope.Path({
          segments: [p(c00), p(c10), p(c11), p(c01)].map((q) => [q.x, q.y]),
          closed: true,
          fillColor: color,
          strokeColor: 'rgba(0,0,0,0.08)',
          strokeWidth: 0.4,
        }));
      }
    }

    // 侧面裙边（增强立体感）
    const skirt = new scope.Group();
    const baseZ = -60;
    for (let i = 0; i < n - 1; i++) {
      const a = grid.cells[i][0], b = grid.cells[i + 1][0];
      skirt.addChild(new scope.Path({
        segments: [project(a.x, a.y, a.z), project(b.x, b.y, b.z), project(b.x, b.y, baseZ), project(a.x, a.y, baseZ)]
          .map((q) => [q.x, q.y]),
        closed: true, fillColor: '#b9b2a6', strokeColor: '#8e877c', strokeWidth: 0.4,
      }));
    }

    // 火山口标记
    const summit = project(2000, 2000, 1480);
    new scope.Path.Circle({ center: [summit.x, summit.y], radius: 5, fillColor: '#d93025' });
    new scope.PointText({
      point: [summit.x + 9, summit.y + 4],
      content: '火山口', fillColor: '#d93025', fontSize: 11, fontFamily: 'sans-serif',
    });

    // 屏幕坐标 -> 模型平面坐标（z=0 反投影）
    const screenToModel = (pt) => {
      const a = (pt.x - OX) / 0.105;
      const b = (pt.y - OY) / (0.052 * TILT);
      const x = (a + b) / 2, y = (b - a) / 2;
      return {
        x: Math.max(0, Math.min(MODEL_EXTENT, x)),
        y: Math.max(0, Math.min(MODEL_EXTENT, y)),
      };
    };

    const draftGroup = new scope.Group();
    const drawDraft = () => {
      draftGroup.removeChildren();
      const pts = draftRef.current ?? [];
      if (pts.length === 0) { scope.view.update(); return; }
      const viewed = pts.map((p) => {
        const gi = Math.max(0, Math.min(n - 1, Math.round((p.x / MODEL_EXTENT) * (n - 1))));
        const gj = Math.max(0, Math.min(n - 1, Math.round((p.y / MODEL_EXTENT) * (n - 1))));
        const z = grid.cells[gi][gj].z + 12;
        return project(p.x, p.y, z);
      });
      if (viewed.length >= 2) {
        draftGroup.addChild(new scope.Path({
          segments: viewed.map((q) => [q.x, q.y]),
          strokeColor: '#d93025', strokeWidth: 2.4,
        }));
      }
      viewed.forEach((q, k) => {
        draftGroup.addChild(new scope.Path.Circle({
          center: [q.x, q.y], radius: k === 0 ? 5 : 4,
          fillColor: k === viewed.length - 1 ? '#fff' : '#d93025',
          strokeColor: '#d93025', strokeWidth: 1.6,
        }));
      });
      scope.view.update();
    };
    redraftRef.current = drawDraft;

    const tool = new scope.Tool();
    tool.onMouseDown = (e) => {
      const m = screenToModel(e.point);
      setDraft((d) => (d ? [...d, m] : [m]));
    };

    scope.view.update();
    return () => { tool.remove(); scope.project.clear(); scope.remove(); scopeRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { redraftRef.current?.(); }, [draft]);

  return (
    <div className="picker-pane">
      <div className="picker-title">三维立体图斜拉剖面（在地形上依次点击取点，双击或按钮完成）</div>
      <canvas
        ref={canvasRef} width={W} height={H}
        onDoubleClick={() => { if (draft && draft.length >= 2) { onCreateOblique(draft); setDraft(null); } }}
      />
      <div className="picker-actions">
        <span className="hint">已取 {draft?.length ?? 0} 个点（至少 2 个）</span>
        <button
          className="btn primary"
          disabled={!draft || draft.length < 2}
          onClick={() => { onCreateOblique(draft); setDraft(null); }}
        >生成斜切剖面</button>
        <button className="btn" disabled={!draft?.length} onClick={() => setDraft(null)}>清除</button>
      </div>
    </div>
  );
}
