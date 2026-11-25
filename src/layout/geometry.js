// 纯几何工具：不依赖 paper.js / DOM，可直接在 Node 测试中使用
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
export const dist2 = (p, q) => (p.x - q.x) ** 2 + (p.y - q.y) ** 2;

export function bbox(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function inflateRect(r, pad) {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function rectContainsPoint(r, p) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

// 射线法点在多边形内
export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

// 线段相交（含端点）
export function segmentsIntersect(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

// 点到线段的距离与最近点
export function pointSegDist(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const l2 = vx * vx + vy * vy;
  let t = l2 === 0 ? 0 : ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2;
  t = clamp(t, 0, 1);
  const q = { x: a.x + vx * t, y: a.y + vy * t };
  return { d: dist(p, q), q, t };
}

export function nearestPointOnPolyline(p, pts) {
  let best = { d: Infinity, q: pts[0], t: 0, seg: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const r = pointSegDist(p, pts[i], pts[i + 1]);
    if (r.d < best.d) best = { ...r, seg: i };
  }
  return best;
}

// 按固定间距对折线重采样，返回累计里程
export function resamplePolyline(points, stationCount) {
  const segLen = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const l = dist(points[i], points[i + 1]);
    segLen.push(l);
    total += l;
  }
  const out = [];
  let seg = 0, acc = 0;
  for (let k = 0; k < stationCount; k++) {
    const target = (total * k) / (stationCount - 1);
    while (seg < segLen.length - 1 && acc + segLen[seg] < target) {
      acc += segLen[seg];
      seg++;
    }
    const l = segLen[seg] || 1;
    const t = clamp((target - acc) / l, 0, 1);
    const a = points[seg], b = points[seg + 1] ?? points[seg];
    out.push({
      s: target,
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
    });
  }
  return { stations: out, length: total };
}

// 去除共线点
export function simplifyPolyline(pts, eps = 0.5) {
  if (pts.length <= 2) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(cross) > eps) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// 矩形与线段是否相交（用于引线净空检测）
export function segmentHitsRect(a, b, r) {
  if (rectContainsPoint(r, a) || rectContainsPoint(r, b)) return true;
  const corners = [
    { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h },
  ];
  for (let i = 0; i < 4; i++) {
    if (segmentsIntersect(a, b, corners[i], corners[(i + 1) % 4])) return true;
  }
  return false;
}

// 折线路径是否穿过任一矩形（用于判断正交肘形引线是否净空）
export function polylineHitsRects(poly, rects) {
  for (let i = 0; i < poly.length - 1; i++) {
    for (const r of rects) {
      if (segmentHitsRect(poly[i], poly[i + 1], r)) return true;
    }
  }
  return false;
}

// 折线到点的最短距离
export function distToPolyline(p, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    best = Math.min(best, pointSegDist(p, pts[i], pts[i + 1]).d);
  }
  return best;
}
