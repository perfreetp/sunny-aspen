/* ── geom.js · 确定性地形与轮廓几何 ─────────────────────────────────────────
 * 纯函数、无依赖。PixiJS 编辑器与 Canvas2D 导出播放器共用，保证同一份采样。
 * ──────────────────────────────────────────────────────────────────────── */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
export const round = (v, p = 2) => {
  const f = Math.pow(10, p);
  return Math.round(v * f) / f;
};

export function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

export function vnoise(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash01(i + seed * 57.13);
  const b = hash01(i + 1 + seed * 57.13);
  return lerp(a, b, smoothstep(f)) * 2 - 1;
}

export function fbm(x, seed = 0, oct = 3) {
  let v = 0, amp = 0.5, freq = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    v += vnoise(x * freq, seed + o * 3.7) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return v / norm;
}

export function polyBBox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    const x = p[0], y = p[1];
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function flatten(pts) {
  const out = new Array(pts.length * 2);
  for (let i = 0; i < pts.length; i++) {
    out[i * 2] = pts[i][0];
    out[i * 2 + 1] = pts[i][1];
  }
  return out;
}

/* ── 锥体轮廓 ─────────────────────────────────────────────────────────────
 * 局部坐标：原点 = 锥体底边中点，x 向右，y 向上为正（调用方翻转）。
 *
 * 关键：坡面只有唯一一处定义 coneFlankPoint()，轮廓与熔岩流坡道都调用它，
 * 因此熔岩前缘永远贴合锥体轮廓，不会“浮”在坡外或扎进坡里。
 * shape: { pL,pR 左右坡幂指数(>1 为上陡下缓的凹坡), cr 火口半径比, lean 风偏,
 *          seed 噪声种子, detail 边缘粗糙度 }
 */
export function coneFlankPoint(shape, hw, h, side, t) {
  const s = shape || {};
  const cr = s.cr ?? 0.22;
  const p = (side === 'left' ? s.pL : s.pR) ?? 1.05;
  const lean = s.lean ?? 0.02;
  const seed = s.seed ?? 1;
  const detail = s.detail ?? 0.012;
  const sign = side === 'left' ? -1 : 1;
  // t: 0 = 山脚，1 = 火口缘
  const x = lerp(sign * hw, sign * hw * cr, t);
  const y = h * Math.pow(clamp(t, 0, 1), p);
  const rough = fbm(t * 7 + seed + (side === 'left' ? 0 : 11), seed + (side === 'left' ? 0 : 2), 3)
    * h * detail * (1 - t * 0.5);
  return [x + h * lean * (side === 'left' ? t : 1 - t), y + rough];
}

export function coneSilhouette(shape, hw, h, seg = 40) {
  const s = shape || {};
  const cr = s.cr ?? 0.22;
  const depth = s.depth ?? 0.28;
  const lip = h * 0.01;
  const outer = [];
  // 左坡：山脚 → 火口左缘
  for (let i = 0; i <= seg; i++) {
    const [x, y] = coneFlankPoint(shape, hw, h, 'left', i / seg);
    outer.push([x, i === seg ? y - lip : y]);
  }
  // 火口剖面：浅碗。碗宽远小于锥底宽（真实火口直径约为锥基的 1/5–1/3），
  // 用 sin^2 让口沿处切线水平，避免把锥顶削成马鞍。
  const rimX = hw * cr;
  const floorY = h - h * Math.min(depth, 0.62);   // 唯一真源：火口底高度
  const bowlSeg = 18;
  for (let i = 1; i < bowlSeg; i++) {
    const t = i / bowlSeg;
    const x = lerp(-rimX, rimX, t);
    const dip = Math.pow(Math.sin(Math.PI * t), 2);
    outer.push([x, h - lip - (h - floorY) * dip]);
  }
  // 右坡：火口右缘 → 山脚
  for (let i = seg; i >= 0; i--) {
    const [x, y] = coneFlankPoint(shape, hw, h, 'right', i / seg);
    outer.push([x, i === seg ? y - lip : y]);
  }
  // 底边闭合
  outer.push([hw, -h * 0.004], [-hw, -h * 0.004]);
  return outer;
}

/* 火口底相对锥顶的下沉量（与轮廓完全一致，避免两处公式漂移） */
export function craterFloorOffset(h, shape) {
  return h * Math.min(shape?.depth ?? 0.28, 0.62);
}

/* ── 山脊线 / 简单多峰背景 ───────────────────────────────────────────────── */
export function ridgeLine(x0, x1, baseY, opts = {}) {
  const { amp = 60, freq = 150, seed = 5, seg = 64 } = opts;
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const x = lerp(x0, x1, t);
    const y = baseY - (fbm(t * (x1 - x0) / freq + seed, seed) * 0.5 + 0.5) * amp;
    pts.push([x, y]);
  }
  return pts;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

/* 射线法点内测试（用于“前缘压过锥体边”等判断） */
export function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}
