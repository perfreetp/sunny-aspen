// 确定性伪随机数（mulberry32），保证每次导入的测绘资料完全一致
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 沿折线按固定间距采样，输出带里程的点串
export function samplePolyline(points, spacing, opts = {}) {
  const out = [];
  let cum = 0;
  let next = opts.startOffset ?? spacing / 2;
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    while (next <= cum + len + 1e-9) {
      const d = next - cum;
      out.push({ x: x1 + ux * d, y: y1 + uy * d, ux, uy, mileage: next });
      next += spacing;
    }
    cum += len;
  }
  return out;
}

export function offsetPoint(p, sideOffset) {
  // 左法线方向偏移 (ux,uy) -> (-uy,ux)
  return { x: p.x + -p.uy * sideOffset, y: p.y + p.ux * sideOffset };
}

// 局部机场坐标(米) -> 经纬度（参考点 + 跑道方位旋转，等距圆柱近似）
export function localToLatLon(x, y, arp, azimuthDeg) {
  const az = (azimuthDeg * Math.PI) / 180;
  // 局部 +X 沿跑道方向，旋转到北东坐标系
  const east = x * Math.sin(az) + y * Math.cos(az);
  const north = x * Math.cos(az) - y * Math.sin(az);
  const lat = arp.lat + north / 111320;
  const lon = arp.lon + east / (111320 * Math.cos((arp.lat * Math.PI) / 180));
  return { lat, lon };
}
