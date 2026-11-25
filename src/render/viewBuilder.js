// 纸面条目构建：把剖面模型 + 排版结果转成与 paper 无关的视图数据，供渲染与 SVG 导出共用
import { LITHOLOGIES } from '../model/volcanoModel.js';

// 岩性花纹的 canvas/paper 绘制描述（与 svgExport 的 pattern 保持同源风格）
export const LITH_STYLE = Object.fromEntries(LITHOLOGIES.map((l) => [l.idx, {
  fill: l.color,
  pattern: l.pattern,
  stroke: '#2c3440',
}])) ;

export function buildView(section, transform, layout, style) {
  const { toView } = transform;
  const toViewPt = (p) => toView(p.s, p.z);

  const layerViewPolys = section.layerPolys.map((poly) => poly.map(toViewPt));
  const interfaceViewPaths = section.interfaces.map((iface) => iface.map(toViewPt));
  const bottomPath = section.bottom.map(toViewPt);

  // 水平/垂直网格（里程每 500m，高程每 200m）
  const gridLines = [];
  if (style.showGrid) {
    const len = section.length;
    for (let s = 0; s <= len; s += 500) {
      const a = toView(s, transform.minZ);
      const b = toView(s, transform.maxZ);
      gridLines.push({ a, b, kind: 'v', label: `${(s / 1000).toFixed(1)}km` });
    }
    const zStep = 200;
    for (let z = Math.ceil(transform.minZ / zStep) * zStep; z <= transform.maxZ; z += zStep) {
      const a = toView(0, z);
      const b = toView(len, z);
      gridLines.push({ a, b, kind: 'h', label: `${z}m` });
    }
  }

  const frame = {
    x: transform.padX,
    y: transform.padTop,
    w: section.length * transform.hScale,
    h: (transform.maxZ - transform.minZ) * transform.hScale * transform.vExag,
  };

  const labels = layout.items
    .filter((it) => !it.rec.hidden)
    .map((it) => ({
      id: it.id,
      lines: it.lines,
      rect: it.rect,
      placement: it.placement,
      anchor: it.anchor,
      labelAnchor: it.labelAnchor,
      leader: it.leader,
      memberTaps: it.memberTaps,
      rec: it.rec,
    }));

  return {
    width: transform.width,
    height: transform.height,
    layerViewPolys,
    interfaceViewPaths,
    bottomPath,
    gridLines,
    frame,
    labels,
    transform,
  };
}
