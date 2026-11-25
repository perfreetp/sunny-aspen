import { useEffect, useRef, useCallback } from 'react';
import paper from 'paper';
import { buildView, LITH_STYLE } from '../render/viewBuilder.js';

// 在矩形范围内绘制岩性花纹单元
function drawPattern(scope, kind, color, bounds) {
  const g = new scope.Group();
  const step = 11;
  const mk = (fn) => {
    for (let y = bounds.y - step; y < bounds.y + bounds.h + step; y += step) {
      for (let x = bounds.x - step; x < bounds.x + bounds.w + step; x += step) {
        fn(x, y);
      }
    }
  };
  switch (kind) {
    case 'dots':
      mk((x, y) => g.addChild(new scope.Path.Circle({ center: [x + 4, y + 4], radius: 1.3, fillColor: '#5b4a2f' })));
      break;
    case 'v':
      mk((x, y) => {
        g.addChild(new scope.Path.Line({ from: [x + 4, y + 1], to: [x + 4, y + 7], strokeColor: '#3d4a5c', strokeWidth: 0.7 }));
        g.addChild(new scope.Path.Line({ from: [x + 1, y + 4], to: [x + 7, y + 4], strokeColor: '#3d4a5c', strokeWidth: 0.7 }));
      });
      break;
    case 'circles':
      mk((x, y) => g.addChild(new scope.Path.Circle({ center: [x + 5, y + 5], radius: 2.6, strokeColor: '#7a4a2e', strokeWidth: 0.7 })));
      break;
    case 'triangles':
      mk((x, y) => g.addChild(new scope.Path({
        segments: [[x + 5, y + 2], [x + 8, y + 7], [x + 2, y + 7]],
        closed: true, strokeColor: '#7a3a3a', strokeWidth: 0.7,
      })));
      break;
    case 'lines':
      mk((x, y) => {
        g.addChild(new scope.Path.Line({ from: [x, y + 3], to: [x + 10, y + 3], strokeColor: '#8a7a44', strokeWidth: 0.8 }));
        g.addChild(new scope.Path.Line({ from: [x, y + 8], to: [x + 10, y + 8], strokeColor: '#8a7a44', strokeWidth: 0.8 }));
      });
      break;
    case 'crosshatch':
      mk((x, y) => {
        g.addChild(new scope.Path.Line({ from: [x, y + 2], to: [x + 9, y + 11], strokeColor: '#5f6640', strokeWidth: 0.6 }));
        g.addChild(new scope.Path.Line({ from: [x, y + 9], to: [x + 9, y], strokeColor: '#5f6640', strokeWidth: 0.6 }));
      });
      break;
    case 'dashes':
      mk((x, y) => {
        g.addChild(new scope.Path.Line({ from: [x, y + 5], to: [x + 4, y + 5], strokeColor: '#3f6a5c', strokeWidth: 1 }));
        g.addChild(new scope.Path.Line({ from: [x + 6, y + 5], to: [x + 10, y + 5], strokeColor: '#3f6a5c', strokeWidth: 1 }));
      });
      break;
    case 'waves':
      mk((x, y) => g.addChild(new scope.Path({
        segments: [[x, y + 5], [x + 2.5, y + 2], [x + 5, y + 5], [x + 7.5, y + 8], [x + 10, y + 5]],
        strokeColor: '#454b6e', strokeWidth: 0.7,
      })));
      break;
    case 'blocks':
      mk((x, y) => g.addChild(new scope.Path.Rectangle({
        rectangle: new scope.Rectangle(x + 1.5, y + 1.5, 7, 7),
        strokeColor: '#6e5744', strokeWidth: 0.7,
      })));
      break;
    case 'plus':
      mk((x, y) => {
        g.addChild(new scope.Path.Line({ from: [x + 5, y + 1], to: [x + 5, y + 9], strokeColor: '#6a5e7c', strokeWidth: 0.7 }));
        g.addChild(new scope.Path.Line({ from: [x + 1, y + 5], to: [x + 9, y + 5], strokeColor: '#6a5e7c', strokeWidth: 0.7 }));
      });
      break;
    default:
      break;
  }
  return g;
}

// 逐字形绘制文字组（每个字形独立 Path，避免合并子路径的填充异常）
function drawTextGroup(scope, fontSet, lines, px, origin, color) {
  const group = new scope.Group();
  for (const gp of fontSet.glyphPaths(lines, px)) {
    const glyph = new scope.Path(gp.d);
    glyph.translate(origin);
    glyph.fillColor = color;
    glyph.strokeColor = null;
    group.addChild(glyph);
  }
  return group;
}

export default function SectionCanvas({
  section, transform, layout, style, fontSet, line,
  selectedLabelId, onSelectLabel, onDragLabel, meta, scopeRef,
}) {
  const canvasRef = useRef(null);
  const internalScope = useRef(null);
  const scopeRefEff = scopeRef ?? internalScope;
  const viewRef = useRef(null);
  const dragState = useRef(null);
  const canvasW = Math.round(Math.max(800, transform?.width ?? 900));
  const canvasH = Math.round(Math.max(500, transform?.height ?? 600));

  // 初始化 paper scope 与交互。StrictMode 双挂载时第一次的清理会完整释放，
  // 第二次重新 setup 同一 canvas —— paper 支持，关键是清理要彻底（remove scope 并清空对 canvas 的引用）。
  useEffect(() => {
    const canvas = canvasRef.current;
    const scope = new paper.PaperScope();
    scope.setup(canvas);
    scopeRefEff.current = scope;

    const tool = new scope.Tool();
    let panning = null;

    tool.onMouseDown = (e) => {
      const hit = scope.project.hitTest(e.point, {
        fill: true, stroke: true, tolerance: 6,
      });
      const labelGroup = hit?.item?._labelGroup;
      if (labelGroup) {
        const id = labelGroup._labelId;
        onSelectLabel(id);
        dragState.current = { id, start: e.point, moved: false };
        labelGroup.data.dragging = true;
      } else {
        panning = e.point;
        onSelectLabel(null);
      }
    };
    tool.onMouseDrag = (e) => {
      if (dragState.current) {
        const ds = dragState.current;
        if (!ds.moved && e.point.getDistance(ds.start) > 3) ds.moved = true;
        if (ds.moved) {
          const grp = scope.project.activeLayer.children.find((c) => c._labelId === ds.id);
          if (grp) grp.position = grp.position.add(e.delta);
        }
      } else if (panning) {
        scope.view.translate(e.delta);
      }
    };
    tool.onMouseUp = (e) => {
      if (dragState.current?.moved) {
        const ds = dragState.current;
        const grp = scope.project.activeLayer.children.find((c) => c._labelId === ds.id);
        if (grp) {
          // group.position 是中心，换算回左上角 rect
          const rect = {
            x: grp.position.x - grp.bounds.width / 2,
            y: grp.position.y - grp.bounds.height / 2,
            w: grp.bounds.width,
            h: grp.bounds.height,
          };
          const side = rect.x + rect.w / 2 < transform.width / 2 ? 'left' : 'right';
          onDragLabel(ds.id, { rect, side });
        }
      }
      dragState.current = null;
      panning = null;
    };

    const onWheel = (ev) => {
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
      const pt = scope.view.viewToProject(new scope.Point(ev.offsetX, ev.offsetY));
      const newZoom = Math.min(8, Math.max(0.25, scope.view.zoom * factor));
      scope.view.zoom = newZoom;
      const after = scope.view.viewToProject(new scope.Point(ev.offsetX, ev.offsetY));
      scope.view.translate(pt.subtract(after));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', onWheel);
      tool.remove();
      scope.project.remove();
      scope.remove();
      if (scopeRefEff.current === scope) scopeRefEff.current = null;
      // 清掉 paper 写在 canvas 上的内部标记，允许下一个 scope 重新 setup
      delete canvas._paperScope;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 每次数据变化重绘
  const redraw = useCallback(() => {
    const scope = scopeRefEff.current;
    try {
    if (!scope || !section || !fontSet || !layout) return;
    scope.project.clear();
    // 显式同步视图尺寸与 canvas，避免尺寸变化后视图错位/文字重影
    scope.view.viewSize = new scope.Size(canvasW, canvasH);
    scope.view.zoom = 1;
    scope.view.center = new scope.Point(transform.width / 2, transform.height / 2);

    const view = buildView(section, transform, layout, style);
    viewRef.current = view;

    // 网格
    if (view.gridLines.length) {
      const grid = new scope.Group();
      for (const g of view.gridLines) {
        grid.addChild(new scope.Path.Line({
          from: [g.a.x, g.a.y], to: [g.b.x, g.b.y],
          strokeColor: '#e3e7ec', strokeWidth: 0.6,
        }));
      }
    }

    // 岩层：底色多边形 + 花纹（用 clipMask 组裁剪，花纹限制在多边形范围内）
    view.layerViewPolys.forEach((poly, k) => {
      const lithStyle = LITH_STYLE[k];
      const mask = new scope.Path({
        segments: poly.map((p) => [p.x, p.y]),
        closed: true,
        clipMask: true,
      });
      const base = new scope.Path({
        segments: poly.map((p) => [p.x, p.y]),
        closed: true,
        fillColor: lithStyle.fill,
        strokeColor: lithStyle.stroke,
        strokeWidth: 0.8,
      });
      const pattern = drawPattern(scope, lithStyle.pattern, lithStyle.fill, base.bounds);
      // mask 必须是组内第一个子项，后续兄弟节点都会被其形状裁剪
      new scope.Group([mask, base, pattern]);
    });

    // 层界线（地形面加粗）
    view.interfaceViewPaths.forEach((pts, k) => {
      new scope.Path({
        segments: pts.map((p) => [p.x, p.y]),
        strokeColor: k === 0 ? '#1f2733' : '#2c3440',
        strokeWidth: k === 0 ? 1.8 : 1.0,
        strokeJoin: 'round',
      });
    });
    new scope.Path({
      segments: view.bottomPath.map((p) => [p.x, p.y]),
      strokeColor: '#2c3440', strokeWidth: 1.0,
    });

    // 图框
    new scope.Path.Rectangle({
      rectangle: new scope.Rectangle(view.frame.x, view.frame.y, view.frame.w, view.frame.h),
      strokeColor: '#2c3440', strokeWidth: 1.4, fillColor: null,
    });

    // 引线 + 锚点 + 成员支线
    const leaderGroup = new scope.Group();
    for (const lab of view.labels) {
      if (lab.leader) {
        leaderGroup.addChild(new scope.Path({
          segments: lab.leader.path.map((p) => [p.x, p.y]),
          strokeColor: '#1f2733', strokeWidth: 0.9, strokeCap: 'round',
        }));
      }
      if (lab.memberTaps) {
        for (const tap of lab.memberTaps) {
          leaderGroup.addChild(new scope.Path.Line({
            from: [lab.anchor.x, lab.anchor.y],
            to: [tap.point.x, tap.point.y],
            strokeColor: '#1f2733', strokeWidth: 0.8,
            dashArray: [3, 2],
          }));
        }
      }
      leaderGroup.addChild(new scope.Path.Circle({
        center: [lab.anchor.x, lab.anchor.y], radius: 2.3, fillColor: '#1f2733',
      }));
    }

    // 矢量文字标注（opentype path -> paper Path，缩放不糊）
    for (const lab of view.labels) {
      const grp = new scope.Group();
      const isSel = lab.id === selectedLabelId;
      const bg = new scope.Path.Rectangle({
        rectangle: new scope.Rectangle(lab.rect.x, lab.rect.y, lab.rect.w, lab.rect.h),
        fillColor: isSel ? '#fff4d6' : 'rgba(255,255,255,0.82)',
        strokeColor: isSel ? '#d98e04' : (lab.placement === 'outside' ? '#7c8aa0' : '#a9b4c2'),
        strokeWidth: isSel ? 1.6 : 0.9,
        radius: 3,
      });
      grp.addChild(bg);
      // 逐字形独立 Path 组成文字组（合并子路径会导致 paper 填充异常）
      const origin = new scope.Point(lab.rect.x + 8, lab.rect.y + 8);
      for (const gp of fontSet.glyphPaths(lab.lines, style.fontPx)) {
        const glyph = new scope.Path(gp.d);
        glyph.translate(origin);
        glyph.fillColor = '#161b22';
        glyph.strokeColor = null;
        glyph._labelGroup = grp;
        grp.addChild(glyph);
      }
      grp._labelId = lab.id;
      grp._labelGroup = grp;
      bg._labelGroup = grp;
      // 扩大命中区域
      const hit = new scope.Path.Rectangle({
        rectangle: grp.bounds.expand(4),
        fillColor: 'rgba(0,0,0,0)',
        strokeColor: null,
      });
      hit._labelGroup = grp;
      grp.addChild(hit);
    }

    // 标题与副标题（逐字形，矢量缩放不糊）；origin 为文字块顶部
    drawTextGroup(scope, fontSet, [line.name], 17, new scope.Point(view.frame.x, 8), '#161b22');
    drawTextGroup(
      scope, fontSet,
      [`比例尺 ${meta?.scale ?? '1:10000'}　垂直夸大 ×${style.vExag}　剖面长度 ${(section.length / 1000).toFixed(2)} km`],
      11, new scope.Point(view.frame.x, 36), '#55606c'
    );

    scope.view.update();
    } catch (e) {
      console.error('[canvas] 重绘失败', e);
    }
  }, [section, transform, layout, style, fontSet, line, selectedLabelId, meta, onSelectLabel, canvasW, canvasH]);

  useEffect(() => { redraw(); }, [redraw]);

  // 暴露给父组件取当前 scope（导出 PNG 用）
  useEffect(() => {
    if (scopeRefEff.current && viewRef.current) {
      scopeRefEff.current._viewData = viewRef.current;
    }
  });

  return (
    <div className="canvas-wrap">
      <canvas ref={canvasRef} width={canvasW} height={canvasH} style={{ width: canvasW, height: canvasH }} />
      <div className="canvas-hint">滚轮缩放 · 空白拖拽平移 · 拖动标注框调整位置（自动固定并重排引线）</div>
    </div>
  );
}
