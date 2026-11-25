// 平面地质图：模型网格着色 + 实测剖面线，点击/拖拽选择
import { useEffect, useRef } from 'react';
import paper from 'paper';
import { MODEL_EXTENT, sampleGrid, LITHOLOGIES, MEASURED_SECTIONS } from '../model/volcanoModel.js';

const MAP_PX = 520;

export default function PlanPicker({ activeLineId, onPick, onEditLine }) {
  const canvasRef = useRef(null);
  const apiRef = useRef(null);

  useEffect(() => {
    const scope = new paper.PaperScope();
    scope.setup(canvasRef.current);
    const grid = sampleGrid(46);
    const cellPx = MAP_PX / (grid.n - 1);
    const toPx = (x, y) => new scope.Point((x / MODEL_EXTENT) * MAP_PX, (y / MODEL_EXTENT) * MAP_PX);

    // 地质图底色：按地表岩性填格
    const cells = new scope.Group();
    for (let i = 0; i < grid.n - 1; i++) {
      for (let j = 0; j < grid.n - 1; j++) {
        const c = grid.cells[i][j];
        cells.addChild(new scope.Path.Rectangle({
          rectangle: new scope.Rectangle(i * cellPx, j * cellPx, cellPx + 0.6, cellPx + 0.6),
          fillColor: LITHOLOGIES[c.lith].color,
          strokeColor: null,
        }));
      }
    }

    // 等高线（地形等值，简化 marching）
    const contourGroup = new scope.Group();
    const levels = [];
    for (let z = 200; z <= 1500; z += 200) levels.push(z);
    for (const level of levels) {
      for (let i = 0; i < grid.n - 1; i++) {
        for (let j = 0; j < grid.n - 1; j++) {
          const c00 = grid.cells[i][j], c10 = grid.cells[i + 1][j];
          const c01 = grid.cells[i][j + 1], c11 = grid.cells[i + 1][j + 1];
          const pts = [];
          const edge = (a, b) => {
            const t = (level - a.z) / (b.z - a.z);
            if (t >= 0 && t <= 1) {
              pts.push(new scope.Point(
                (i + (a === c00 || a === c01 ? t : (a === c10 || a === c11 ? 1 - t : 0))) * cellPx,
                (j + (a === c00 || a === c10 ? t : (a === c01 || a === c11 ? 1 - t : 0))) * cellPx
              ));
            }
          };
          edge(c00, c10); edge(c10, c11); edge(c11, c01); edge(c01, c00);
          if (pts.length === 2) {
            contourGroup.addChild(new scope.Path.Line({
              from: pts[0], to: pts[1],
              strokeColor: 'rgba(60,52,40,0.35)', strokeWidth: 0.5,
            }));
          }
        }
      }
    }

    // 剖面线
    const lineGroup = new scope.Group();
    function renderLines() {
      lineGroup.removeChildren();
      for (const line of MEASURED_SECTIONS) {
        const pts = line.points.map((p) => toPx(p.x, p.y));
        const active = line.id === activeLineId;
        const path = new scope.Path.Line({
          from: pts[0], to: pts[1],
          strokeColor: active ? '#d93025' : '#1f4e8c',
          strokeWidth: active ? 2.6 : 1.6,
        });
        path._lineId = line.id;
        lineGroup.addChild(path);
        for (const [k, pt] of pts.entries()) {
          const handle = new scope.Path.Circle({
            center: pt, radius: active ? 5 : 3.6,
            fillColor: active ? '#d93025' : '#1f4e8c',
          });
          handle._lineId = line.id;
          handle._endIdx = k;
          lineGroup.addChild(handle);
        }
        const mid = pts[0].add(pts[1]).divide(2);
        const txt = new scope.PointText({
          point: mid.add(new scope.Point(6, -6)),
          content: line.id,
          fillColor: active ? '#d93025' : '#1f4e8c',
          fontSize: 11,
          fontFamily: 'sans-serif',
          fontWeight: active ? 'bold' : 'normal',
        });
        txt._lineId = line.id;
        lineGroup.addChild(txt);
      }
    }
    renderLines();

    // 图框
    new scope.Path.Rectangle({
      rectangle: new scope.Rectangle(0, 0, MAP_PX, MAP_PX),
      strokeColor: '#2c3440', strokeWidth: 1.2, fillColor: null,
    });

    const tool = new scope.Tool();
    let dragging = null;
    tool.onMouseDown = (e) => {
      const hit = scope.project.hitTest(e.point, { fill: true, stroke: true, tolerance: 8 });
      const id = hit?.item?._lineId;
      if (id) {
        onPick(id);
        if (hit.item._endIdx != null) {
          dragging = { id, endIdx: hit.item._endIdx };
        }
      }
    };
    tool.onMouseDrag = (e) => {
      if (!dragging) return;
      const p = e.point;
      const mx = Math.max(0, Math.min(MAP_PX, p.x)) / MAP_PX * MODEL_EXTENT;
      const my = Math.max(0, Math.min(MAP_PX, p.y)) / MAP_PX * MODEL_EXTENT;
      onEditLine(dragging.id, dragging.endIdx, { x: mx, y: my });
    };
    tool.onMouseUp = () => { dragging = null; };

    apiRef.current = { scope, renderLines };
    scope.view.update();
    return () => { tool.remove(); scope.project.clear(); scope.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    apiRef.current?.renderLines();
  }, [activeLineId]);

  return (
    <div className="picker-pane">
      <div className="picker-title">地质图实测剖面线（点击选择，拖端点改位置）</div>
      <canvas ref={canvasRef} width={MAP_PX} height={MAP_PX} />
      <div className="picker-legend">
        {LITHOLOGIES.slice(0, 4).map((l) => (
          <span key={l.idx} className="legend-item">
            <i style={{ background: l.color }} />{l.age} {l.name}
          </span>
        ))}
      </div>
    </div>
  );
}
