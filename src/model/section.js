// 剖面切割：沿剖面折线采样模型，生成岩层界面、厚度、层多边形
import { LITHOLOGIES, sampleModel } from './volcanoModel.js';
import { resamplePolyline } from '../layout/geometry.js';

export const STATION_COUNT = 160;

// 沿剖面线切出剖面
export function buildSection(line) {
  const { stations, length } = resamplePolyline(line.points, STATION_COUNT);
  const samples = stations.map((st) => {
    const m = sampleModel(st.x, st.y);
    return { ...st, ...m };
  });

  // 界面折线（剖面坐标系 s, z），含地形面
  const nLayer = LITHOLOGIES.length;
  const interfaces = [];
  for (let k = 0; k < nLayer; k++) {
    interfaces.push(samples.map((s) => ({ s: s.s, z: s.topIfaces[k] })));
  }
  // 最深层的底面（闭合多边形用）
  const bottom = samples.map((s) => ({
    s: s.s,
    z: s.topIfaces[nLayer - 1] - s.thickness[nLayer - 1],
  }));

  // 每层多边形：顶面 interface[k] + 底面（反向）
  const layerPolys = [];
  for (let k = 0; k < nLayer; k++) {
    const lower = k < nLayer - 1 ? interfaces[k + 1] : bottom;
    const poly = interfaces[k].concat(lower.slice().reverse());
    layerPolys.push(poly);
  }

  // 每层中点（里程）处的统计厚度（垂直厚度与法向近似）
  const mid = Math.floor(samples.length / 2);
  const stats = LITHOLOGIES.map((l, k) => {
    const vert = samples[mid].thickness[k];
    let mean = 0, min = Infinity, max = 0;
    for (const s of samples) {
      mean += s.thickness[k];
      min = Math.min(min, s.thickness[k]);
      max = Math.max(max, s.thickness[k]);
    }
    mean /= samples.length;
    return { idx: k, ...l, thicknessMid: vert, thicknessMean: mean, min, max };
  });

  return {
    lineId: line.id,
    length,
    samples,
    stations,
    interfaces,
    bottom,
    layerPolys,
    stats,
  };
}

// 剖面坐标 (s,z) -> paper 视图坐标。x=s*hs, 高度经垂直夸大后向上
export function makeSectionTransform(section, opts) {
  const { hScale, vExag, padX = 145, padTop = 78, padBottom = 95 } = opts;
  let maxZ = -Infinity;
  for (const s of section.samples) maxZ = Math.max(maxZ, s.top);
  const minZ = Math.min(...section.bottom.map((p) => p.z));
  const width = section.length * hScale;
  const height = (maxZ - minZ) * hScale * vExag;
  const toView = (s, z) => ({
    x: padX + s * hScale,
    y: padTop + (maxZ - z) * hScale * vExag,
  });
  return {
    hScale, vExag, padX, padTop, padBottom,
    width: width + padX * 2,
    height: height + padTop + padBottom,
    minZ, maxZ,
    toView,
  };
}
