/* ── scene.js · 场景采样器 ─────────────────────────────────────────────────
 * sampleScene(doc, frame, opt) → { prims[], meta }
 *
 * prims 是一组与渲染后端无关的绘制图元；PixiJS 编辑器与 Canvas2D 导出播放器
 * 各自实现 drawPrims()。拖动预览、逐帧检查、回放、导出视频、独立播放器
 * 走同一条采样路径 —— 松手后的回放与拖动预览必然一致。
 *
 * 图元类型：
 *   rect   { x,y,w,h, fill }                       fill: 颜色 | 线性渐变
 *   poly   { pts[], fill, alpha, stroke?, dashed? }
 *   circle { x,y,r, fill, alpha }
 *   line   { pts[], color, width, alpha, dash? }
 *   radial { x,y,r, stops[], alpha }               软性径向渐变（辉光 / 烟团）
 *   text   { x,y,text,size,color,weight,alpha,wrap? }
 * 渐变：{ type:'linear', x0,y0,x1,y1, stops:[[off,'#rrggbb'|'#rrggbbaa', alpha?]] }
 * ─────────────────────────────────────────────────────────────────────── */

import {
  clamp, lerp, smoothstep, hash01, fbm, coneSilhouette, coneFlankPoint, craterFloorOffset
} from './geom.js';
import { CONE_BY_ID, TEPHRA_BY_ID } from './presets.js';
import { phaseAtFrame, totalFrames, sampleTrackKeys } from './doc.js';

export const W = 1920;
export const H = 1080;
export const GROUND = 812;

/* ── 配色 ──────────────────────────────────────────────────────────────── */

const PAL = {
  skyTop: '#0d0f18',
  skyMid: '#251f2c',
  skyLow: '#5d3a30',
  skyGlow: '#b85c2c',
  ridgeFar: '#221d29',
  ridgeNear: '#191621',
  groundTop: '#332b32',
  groundBot: '#1d181e',
  groundLine: '#453943',
  ghost: '#8fc4ea',
  text: '#f4ece2',
  textDim: '#a79d9a',
  ash: '#8a939f'
};

const ROCK = [
  { dark: '#2b2732', mid: '#3a333f', light: '#4d4453' },
  { dark: '#3a2f2c', mid: '#4f3f38', light: '#6a5449' },
  { dark: '#4f3a2f', mid: '#6b4f3d', light: '#8a6850' },
  { dark: '#6b4a33', mid: '#8b6244', light: '#a97c56' }
];

function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex(r, g, b) {
  const c = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}
export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  return amt >= 0
    ? rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt)
    : rgbToHex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
}

function rockRamp(tone) {
  const t = clamp(tone, 0, 1) * (ROCK.length - 1);
  const i = Math.min(ROCK.length - 2, Math.floor(t));
  const f = t - i;
  return {
    dark: mixHex(ROCK[i].dark, ROCK[i + 1].dark, f),
    mid: mixHex(ROCK[i].mid, ROCK[i + 1].mid, f),
    light: mixHex(ROCK[i].light, ROCK[i + 1].light, f)
  };
}

/* ── 阶段采样 ───────────────────────────────────────────────────────────── */

export function samplePhase(phase, u) {
  const uu = clamp(u, 0, 1);
  const ck = sampleTrackKeys(phase.tracks.cone, 'cone', uu);
  const lk = sampleTrackKeys(phase.tracks.lava, 'lava', uu);
  const tk = sampleTrackKeys(phase.tracks.tephra, 'tephra', uu);
  const cone = phase.tracks.cone;
  const lava = phase.tracks.lava;
  const teph = phase.tracks.tephra;
  return {
    cone: { ...ck, presetId: cone.presetId, tone: cone.tone, visible: cone.visible },
    lava: { ...lk, visible: lava.visible, style: lava.style, tone: lava.tone },
    tephra: {
      ...tk, visible: teph.visible, presetId: teph.presetId,
      tone: teph.tone, grain: teph.grain, fall: teph.fall
    }
  };
}

/* ── 锥体几何 ───────────────────────────────────────────────────────────── */

export function coneGeom(state, phase) {
  const c = state.cone || state;
  const preset = CONE_BY_ID[c.presetId] || CONE_BY_ID.scoria;
  const hw = preset.size.hw * clamp(c.sx ?? 1, 0.15, 4);
  const h = preset.size.h * clamp(c.sy ?? 1, 0.15, 4);
  const cx = W / 2 + (c.dx ?? 0);
  const baseY = GROUND + (c.dy ?? 0);
  const world = coneSilhouette(preset.shape, hw, h).map(([x, y]) => [cx + x, baseY - y]);
  const cr = preset.shape.cr ?? 0.22;
  const depth = preset.shape.depth ?? 0.28;
  const rimY = baseY - h;
  const floorY = rimY + craterFloorOffset(h, preset.shape);
  return {
    preset, cx, baseY, hw, h,
    baseLeft: cx - hw, baseRight: cx + hw,
    rimY, floorY,
    crater: [cx, floorY],
    craterHalfW: hw * cr,
    poly: world
  };
}

/** 锥体右坡折线（火口右缘 → 右山脚），与轮廓共用 coneFlankPoint */
function flankPath(geom) {
  const N = 46;
  const pts = [];
  for (let i = N; i >= 0; i--) {
    const t = i / N; // 1 → 0 : 火口缘 → 山脚
    const [x, y] = coneFlankPoint(geom.preset.shape, geom.hw, geom.h, 'right', t);
    pts.push([geom.cx + x, geom.baseY - y]);
  }
  return pts;
}

/* ── 熔岩流几何 ─────────────────────────────────────────────────────────── */

/**
 * front: 以锥体右坡弧长归一。1.0 = 前缘恰好抵达右山脚；>1 越过锥缘进入平地。
 * 熔岩带贴合坡面（脊线本身就是坡面折线），因此不会悬空。
 */
export function lavaGeom(state, geom) {
  const st = state && state.lava ? state.lava : state;
  const flank = flankPath(geom);
  const cum = [0];
  let L = 0;
  for (let i = 1; i < flank.length; i++) {
    L += Math.hypot(flank[i][0] - flank[i - 1][0], flank[i][1] - flank[i - 1][1]);
    cum.push(L);
  }
  const toeX = flank[flank.length - 1][0];
  const at = (d) => {
    if (d <= 0) return flank[0].slice();
    if (d >= L) {
      const over = d - L;
      // 越过后贴地水平前伸，微微下压
      return [toeX + over, geom.baseY - Math.min(3, over * 0.06)];
    }
    for (let i = 1; i < flank.length; i++) {
      if (d <= cum[i]) {
        const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
        return [lerp(flank[i - 1][0], flank[i][0], t), lerp(flank[i - 1][1], flank[i][1], t)];
      }
    }
    return flank[flank.length - 1].slice();
  };

  const frontFrac = clamp(st.front ?? 0, 0, 2.2);
  const frontD = frontFrac * L;
  const tip = at(frontD);
  const baseW = geom.hw * 0.125 * clamp(st.width ?? 1, 0.25, 2.5);

  const n = 30;
  const spine = [];
  for (let i = 0; i <= n; i++) spine.push(at((frontD * i) / n));

  // 熔岩是一层贴着坡面/地面铺开的薄流，而不是悬空的管。
  // 上缘 = 脊线沿“朝上”的法线抬起厚度，下缘 = 脊线本身。
  // 厚度随坡度自适应：陡坡上熔岩薄贴，缓坡上略厚；盾状体不能被拉成悬空粗条
  const pRnow = geom.preset.shape.pR ?? 1;
  const slopeFactor = clamp(0.42 + 0.34 * pRnow, 0.42, 1.0);
  const th0 = geom.hw * 0.062 * slopeFactor * clamp(st.width ?? 1, 0.3, 2.2);
  const surf = [];       // 上表面
  const thick = [];
  for (let i = 0; i <= n; i++) {
    const p0 = spine[i];
    const q = spine[Math.min(n, i + 1)];
    const r = spine[Math.max(0, i - 1)];
    let tx = q[0] - r[0], ty = q[1] - r[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len; ty /= len;
    // 朝上的法线：n = (ty, -tx)，对自火口向右下泄的流向恒朝上
    const nx = ty, ny = -tx;
    const s2 = i / n;
    const tt = th0 * (0.32 + 0.78 * smoothstep(Math.pow(s2, 0.55) * 1.1))
      * (1 + 0.14 * fbm(s2 * 5.5, 3.1))
      * (1 - 0.92 * smoothstep((s2 - 0.8) * 5.5));
    thick.push(tt);
    surf.push([p0[0] + nx * tt, p0[1] + ny * tt]);
  }
  // 前缘：从上表面末端收成一个薄舌尖
  const tipTop = surf[n];
  const tipBot = spine[n];
  const capPts = [];
  const M = 9;
  for (let i = 1; i < M; i++) {
    const t = i / M;
    const ang = Math.PI * (1 - t);
    const rr = Math.hypot(tipTop[0] - tipBot[0], tipTop[1] - tipBot[1]);
    capPts.push([
      lerp(tipBot[0], tipTop[0], 0.5) + Math.cos(ang) * rr * 1.1 + rr * 0.5,
      lerp(tipBot[1], tipTop[1], 0.5) + Math.sin(ang) * rr * 0.6
    ]);
  }
  const ribbon = surf.concat(capPts, spine.slice().reverse());

  const overrun = frontFrac <= 1 ? 0 : Math.max(0, tip[0] - toeX);

  const midThick = thick[Math.floor(n * 0.7)] || th0;
  return {
    ribbon, spine, surf, thick, tip, cap: capPts,
    width: th0, thickness: midThick,
    frontD, flankLen: L, frontFrac,
    coneEdgeX: toeX, overrun,
    tipOnCone: frontFrac < 1,
    atCrater: spine[0]
  };
}

/* ── 碎屑层几何 ─────────────────────────────────────────────────────────── */

/**
 * 碎屑层由两部分组成：
 *  shell —— 锥体同形外扩，被锥体压住后只在锥坡两侧露出一圈披覆；
 *  apron —— 贴地堆积的碎屑裙，顶面随厚度起伏，边缘自然收薄到地面。
 */
function tephraGeom(st, geom) {
  const p = TEPHRA_BY_ID[st.presetId] || TEPHRA_BY_ID['ash-thin'];
  const amt = clamp(st.thickness ?? 0, 0, 1);
  const th = amt * p.thickness;
  const cover = clamp(st.cover ?? 0, 0, 1);

  // ① 披覆带：沿锥坡向外偏移 th 得到一层「贴坡的壳」。
  //    它与锥体轮廓之间那条等宽带，就是碎屑层的可见厚度。
  const shape = geom.preset.shape;
  const capL = [], capR = [];
  const N = 26;
  for (let i = 0; i <= N; i++) {
    const t = i / N;                       // 0=山脚，1=火口缘
    const [lx, ly] = coneFlankPoint(shape, geom.hw, geom.h, 'left', t);
    const [rx, ry] = coneFlankPoint(shape, geom.hw, geom.h, 'right', t);
    // 法向稠度：山脚最厚，向上迅速变薄并在坡上部消失（空降层不会在陡坡上积厚）
    const k = th * Math.pow(1 - t, 2.2) * 0.85;
    capL.push([geom.cx + lx - k, geom.baseY - ly]);
    capR.push([geom.cx + rx + k, geom.baseY - ry]);
  }
  // 两坡之间沿火口缘闭合，形成"披在山肩上的一层灰"
  const crHalf = geom.hw * (shape.cr ?? 0.22);
  const mantle = capL.concat([
    [geom.cx + crHalf, geom.rimY],
    [geom.cx + crHalf * 0.35, geom.rimY + th * 0.12],
    [geom.cx - crHalf * 0.35, geom.rimY + th * 0.12],
    [geom.cx - crHalf, geom.rimY]
  ]).concat(capR.slice().reverse());

  // ② 锥脚堆积楔：贴地向外铺开，向外收薄到 0；这是剖面里最易读的层厚
  const spread = geom.hw * (0.16 + 0.42 * cover) * (0.3 + 0.75 * amt);
  const top = [];
  const M = 40;
  const x0 = geom.baseLeft - spread, x1 = geom.baseRight + spread;
  for (let i = 0; i <= M; i++) {
    const t = i / M;
    const x = lerp(x0, x1, t);
    const u = Math.abs(t - 0.5) * 2;                          // 0=锥心
    const env = Math.pow(Math.cos(Math.min(1, u) * Math.PI * 0.5), 1.55);
    const grit = 1 + 0.22 * fbm(t * 8.5 + 2.3, 8.1, 3) + 0.06 * Math.sin(t * 23);
    top.push([x, geom.baseY - th * env * grit]);
  }
  const apron = top.slice();
  for (let i = M; i >= 0; i--) {
    const t = i / M;
    const x = lerp(x0, x1, t);
    const u = Math.abs(t - 0.5) * 2;
    const env = Math.pow(Math.cos(Math.min(1, u) * Math.PI * 0.5), 1.55);
    apron.push([x, geom.baseY + th * 0.22 * env + 1.5]);
  }

  return { mantle, apron, thickness: th, spread, preset: p, cover, capL, capR };
}

/* ── 喷发柱 ─────────────────────────────────────────────────────────────── */

/**
 * 以火口为原点向上构建喷发柱。柱体从火口边缘开始变宽，绝不回落到锥面上，
 * 因此不会把锥体“洗白”。烟团按 3 个深度层叠，近层小而实，远层大而淡。
 */
function plumePrims(geom, strength, timeSec, umbrella, seedOff) {
  const out = [];
  const cx = geom.cx;
  const cy = geom.rimY;            // 柱体自火口缘升起，避免横切火口
  const s = clamp(strength, 0, 1);
  if (s <= 0.02) return out;

  const craterW = Math.max(geom.craterHalfW * 0.95, 20);
  const height = 130 + s * 700;

  /* 主柱体：宽度从火口宽度起步，向上逐渐扩展并顺风倾斜 */
  const N = 22;
  const left = [], right = [];
  const axis = (t) => {
    const drift = Math.pow(t, 1.7) * (60 + t * 260 * s) + Math.sin(t * 2.6 + timeSec * 0.5) * 10 * t;
    const wob = Math.sin(t * 4.6 + timeSec * 0.85 + seedOff) * 9 * t;
    return cx + drift + wob;
  };
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = cy - t * height;
    const base = craterW * 0.62 + (14 + 104 * s) * Math.pow(t, 0.62);
    const turb = 1 + 0.2 * fbm(t * 4.5 + timeSec * 0.2, seedOff, 3);
    const w = base * turb;
    left.push([axis(t) - w, y]);
    right.push([axis(t) + w, y]);
  }
  const col = left.concat(right.slice().reverse());
  // 柱体只作极淡的整体雾底，避免出现硬边；形体由下面的柔和团块承担
  out.push({
    t: 'poly', pts: col,
    fill: {
      type: 'linear', x0: cx, y0: cy, x1: cx, y1: cy - height,
      stops: [
        [0, '#e7a06a', 0.10],
        [0.06, '#d3926a', 0.09],
        [0.25, '#9c9096', 0.07],
        [0.6, '#85818d', 0.045],
        [1, '#767482', 0]
      ]
    },
    alpha: 1
  });

  /* 烟团：沿柱轴密集排布，彼此重叠形成连续柱身；三层深度
     深处（大、淡）先画，浅处（小、实）后画，制造体积 */
  const axisW = (t) => craterW * 0.62 + (14 + 104 * s) * Math.pow(t, 0.62);
  const layers = [
    { n: 16, rMul: 2.15, aMul: 0.055, spread: 1.75 },
    { n: 20, rMul: 1.35, aMul: 0.075, spread: 1.15 },
    { n: 22, rMul: 0.85, aMul: 0.085, spread: 0.72 }
  ];
  for (let L = 0; L < layers.length; L++) {
    const lay = layers[L];
    const n = Math.round(lay.n * (0.5 + 0.62 * s));
    for (let i = 0; i < n; i++) {
      const ph = hash01(i * 1.37 + seedOff * 3.1 + L * 17.3);
      const t = clamp((i / n) + (ph - 0.5) * (1 / n), 0, 1);   // 沿轴均匀铺开
      const y = cy - t * height;
      const spreadPx = axisW(t) * lay.spread;
      const x = axis(t) + (hash01(i * 4.4 + 2 + L) - 0.5) * 2 * spreadPx;
      const r = (30 + 96 * s) * lay.rMul * (0.75 + 0.5 * hash01(i * 9.1 + L)) * (0.85 + 0.5 * Math.pow(t, 0.6));
      const warm = 1 - smoothstep(t * 2.3);
      const c = mixHex(L === 0 ? '#7e7b88' : L === 1 ? '#8f8b96' : '#a09ba6', '#ffb066', warm * 0.55);
      // 顶端收淡，避免柱顶一刀切
      const topFade = t > 0.72 ? 1 - smoothstep((t - 0.72) / 0.28) : 1;
      const a = lay.aMul * (0.55 + 0.75 * (1 - t)) * topFade * (0.55 + 0.7 * s);
      out.push({
        t: 'radial', x, y, r,
        stops: [[0, c, a], [0.45, c, a * 0.55], [1, c, 0]],
        alpha: 1
      });
    }
  }

  /* 伞状云顶 */
  if (umbrella && s > 0.4) {
    const uy = cy - height * 0.98;
    const uw = 190 + 330 * s;
    const uh = 54 + 52 * s;
    const ux = axis(1) + 40;
    for (let i = 0; i < 12; i++) {
      const a1 = hash01(i * 2.2 + 11) * Math.PI * 2;
      const rr = 0.2 + hash01(i * 5.1 + 3) * 0.85;
      const c = '#b0aeb8';
      out.push({
        t: 'radial',
        x: ux + Math.cos(a1) * uw * rr,
        y: uy + Math.sin(a1) * uh * rr,
        r: 95 + 125 * (1 - rr) + hash01(i * 3.3) * 55,
        stops: [[0, c, 0.19 * s], [0.6, c, 0.09 * s], [1, c, 0]],
        alpha: 1
      });
    }
  }
  return out;
}

/* ── 主采样 ─────────────────────────────────────────────────────────────── */

/**
 * @param {object} doc
 * @param {number} frame
 * @param {object} opt { ghost, ghostLava, ghostTephra, ghostAlpha, labels, showGround,
 *                       trackLegend, guides, tolerance, mode, fps }
 */
export function sampleScene(doc, frame, opt = {}) {
  const fps = opt.fps || doc.fps || 24;
  const total = totalFrames(doc);
  const F = clamp(frame, 0, Math.max(0, total - 1));
  const cur = phaseAtFrame(doc, F);
  const phase = cur.phase;
  const state = samplePhase(phase, cur.u);
  const geom = coneGeom(state, phase);
  const timeSec = F / fps;
  const prims = [];
  const rock = rockRamp(state.cone.tone);

  /* 天空 */
  prims.push({
    t: 'rect', x: 0, y: 0, w: W, h: H,
    fill: { type: 'linear', x0: 0, y0: 0, x1: 0, y1: H, stops: [[0, PAL.skyTop], [0.58, PAL.skyMid], [1, PAL.skyLow]] }
  });
  /* 火口辉光（大气散射） */
  const glowAmt = 0.25 + 0.75 * clamp(phase.plume, 0, 1);
  prims.push({
    t: 'radial', x: geom.crater[0], y: geom.crater[1] - 40, r: geom.hw * 2.4 + 460,
    stops: [[0, '#c8672f', 0.26 * glowAmt], [0.35, '#a9502b', 0.13 * glowAmt], [0.7, '#6b3a2a', 0.05 * glowAmt], [1, '#3a2626', 0]],
    alpha: 1
  });

  /* 远山两层 */
  prims.push({ t: 'poly', pts: ridgePoly(0, W, GROUND - 34, 170, 620, 5.2), fill: PAL.ridgeFar, alpha: 0.9 });
  prims.push({ t: 'poly', pts: ridgePoly(0, W, GROUND - 4, 92, 420, 9.7), fill: PAL.ridgeNear, alpha: 0.96 });

  /* 地面 */
  prims.push({
    t: 'rect', x: 0, y: GROUND - 2, w: W, h: H - GROUND + 2,
    fill: { type: 'linear', x0: 0, y0: GROUND, x1: 0, y1: H, stops: [[0, PAL.groundTop], [1, PAL.groundBot]] }
  });
  if (opt.showGround !== false) {
    for (let i = 0; i < 5; i++) {
      const y = GROUND + 40 + i * 52;
      prims.push({
        t: 'line', pts: [[0, y], [W, y + 6]], color: PAL.groundLine,
        width: 1.5, alpha: 0.16 - i * 0.026, dash: [26, 22]
      });
    }
  }

  /* ── 上一阶段参考叠影 ── */
  let ghostPrims = [];
  if (opt.ghost && cur.index > 0) {
    const prev = doc.phases[cur.index - 1];
    const pState = samplePhase(prev, 1);
    const pGeom = coneGeom(pState, prev);
    const ga = opt.ghostAlpha ?? 1;
    if (opt.ghostTephra && prev.tracks.tephra.visible && pState.tephra.thickness > 0.004) {
      const tg = tephraGeom(pState.tephra, pGeom);
      prims.push({ t: 'poly', pts: tg.apron, fill: PAL.ghost, alpha: 0.07 * ga });
    }
    if (opt.ghostLava && prev.tracks.lava.visible && pState.lava.front > 0.01) {
      const pg = lavaGeom(pState.lava, pGeom);
      prims.push({ t: 'poly', pts: pg.ribbon, fill: PAL.ghost, alpha: 0.10 * ga });
    }
    // 叠影填充（当前锥体之前）：仅作极淡的体块提示
    prims.push({ t: 'poly', pts: pGeom.poly, fill: PAL.ghost, alpha: 0.055 * ga });
    // 叠影描边（当前锥体之后，保证覆盖关系总能看清）
    ghostPrims.push({
      t: 'poly', pts: pGeom.poly, fill: null, alpha: 0,
      stroke: PAL.ghost, strokeW: 1.9, strokeAlpha: 0.5 * ga, dashed: true
    });
    // 火口/山脚参考标记
    ghostPrims.push({
      t: 'line', pts: [[pGeom.baseRight, pGeom.baseY + 6], [pGeom.baseRight, pGeom.baseY - 54]],
      color: PAL.ghost, width: 1.6, alpha: 0.55 * ga, dash: [6, 7]
    });
    ghostPrims.push({
      t: 'line', pts: [[pGeom.cx, pGeom.rimY - 40], [pGeom.cx, pGeom.rimY + 16]],
      color: PAL.ghost, width: 1.6, alpha: 0.5 * ga, dash: [6, 7]
    });
  }

  /* ── 当前阶段碎屑层（锥体之前：壳在锥后、楔在地表） ── */
  let teph = null;
  if (state.tephra.visible && state.tephra.thickness > 0.004) {
    teph = tephraGeom(state.tephra, geom);
    const ashBase = mixHex(PAL.ash, '#b8ac9c', clamp(state.tephra.tone, 0, 1) * 0.6);

    // 披覆壳：在锥体之后画出，贴坡那圈灰沿会从锥体边缘露出
    if (teph.cover > 0.15) {
      prims.push({
        t: 'poly', pts: teph.mantle,
        fill: {
          type: 'linear', x0: geom.cx - geom.hw, y0: geom.rimY, x1: geom.cx + geom.hw, y1: geom.baseY,
          stops: [[0, shade(ashBase, -0.34)], [0.5, shade(ashBase, -0.5)], [1, shade(ashBase, -0.62)]]
        },
        alpha: 0.28 + 0.42 * teph.cover
      });
    }

    // 锥脚堆积楔：带层理的地表堆积
    prims.push({
      t: 'poly', pts: teph.apron,
      fill: {
        type: 'linear', x0: geom.cx, y0: geom.baseY - teph.thickness * 1.1, x1: geom.cx, y1: geom.baseY + teph.thickness * 0.6,
        stops: [[0, shade(ashBase, 0.16)], [0.45, shade(ashBase, -0.04)], [1, shade(ashBase, -0.4)]]
      },
      alpha: 0.95
    });
    // 楔顶亮线，把「层厚」勾出来
    prims.push({
      t: 'line',
      pts: teph.apron.slice(0, 21).map(([x, y]) => [x, y + 1]),
      color: shade(ashBase, 0.34), width: 1.8, alpha: 0.55
    });
    // 层内颗粒 + 薄层理
    const gN = Math.round(34 * clamp(teph.cover, 0.2, 1));
    for (let i = 0; i < gN; i++) {
      const tt = hash01(i * 1.9 + 4);
      const x = lerp(geom.baseLeft - teph.spread, geom.baseRight + teph.spread, tt);
      const u = Math.abs(tt - 0.5) * 2;
      const env = Math.pow(Math.cos(Math.min(1, u) * Math.PI * 0.5), 1.55);
      const y = geom.baseY - teph.thickness * env * (0.15 + hash01(i * 3.7) * 0.8);
      prims.push({
        t: 'circle', x, y, r: 1.4 + hash01(i * 5.3) * 2.2,
        fill: shade(ashBase, -0.5), alpha: 0.4
      });
    }
    for (let li = 1; li <= 3; li++) {
      const f = li / 4;
      const y = geom.baseY - teph.thickness * f;
      const half = teph.spread * Math.sqrt(Math.max(0, 1 - f * f)) + geom.hw * 0.4;
      prims.push({
        t: 'line',
        pts: [[geom.cx - half, y + 3], [geom.cx, y - 1], [geom.cx + half, y + 3]],
        color: shade(ashBase, -0.55), width: 1.2, alpha: 0.3
      });
    }
  }

  /* ── 当前阶段锥体 ── */
  if (state.cone.visible) {
    // 主体：左坡受光，右坡背光
    prims.push({
      t: 'poly', pts: geom.poly,
      fill: {
        type: 'linear', x0: geom.baseLeft, y0: geom.baseY - geom.h * 0.25, x1: geom.baseRight, y1: geom.baseY - geom.h * 0.25,
        stops: [
          [0, shade(rock.light, 0.05)],
          [0.22, rock.mid],
          [0.5, rock.dark],
          [0.78, shade(rock.dark, -0.12)],
          [1, shade(rock.dark, -0.24)]
        ]
      }
    });
    // 层理：在给定高度上求左右坡交点，横切整面，越靠坡脚越密
    const isStrat = /strato/.test(geom.preset.id) || geom.preset.id === 'collapse' || geom.preset.id === 'scoria';
    const strata = isStrat ? 7 : 4;
    for (let i = 1; i <= strata; i++) {
      const hf = Math.pow(i / (strata + 1.15), 1.45);   // 高度比，下密上疏
      const pts = [];
      const pL = geom.preset.shape.pL ?? 1.05;
      const pR = geom.preset.shape.pR ?? 1.05;
      const tL = Math.pow(clamp(hf, 0, 1), 1 / pL);
      const tR = Math.pow(clamp(hf, 0, 1), 1 / pR);
      const [lx, ly] = coneFlankPoint(geom.preset.shape, geom.hw, geom.h, 'left', tL);
      const [rx, ry] = coneFlankPoint(geom.preset.shape, geom.hw, geom.h, 'right', tR);
      const yL = geom.baseY - ly, yR = geom.baseY - ry;
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const x = lerp(geom.cx + lx, geom.cx + rx, t);
        const y = lerp(yL, yR, t) + Math.sin(t * Math.PI * 3.2 + i) * 2.4;
        pts.push([x, y]);
      }
      prims.push({
        t: 'line', pts,
        color: i % 2 ? shade(rock.light, 0.14) : shade(rock.dark, -0.34),
        width: 1.3 + (i % 2) * 1.5, alpha: 0.13 + 0.03 * (i % 2)
      });
    }

    // 火口内壁暗部（在剖面凹陷内再压一层）
    prims.push({
      t: 'poly',
      pts: (() => {
        const crW2 = geom.craterHalfW;
        const pts = [];
        for (let i = 0; i <= 16; i++) {
          const t = i / 16;
          pts.push([geom.cx - crW2 + 2 * crW2 * t,
            geom.rimY + (geom.floorY - geom.rimY) * Math.pow(Math.sin(Math.PI * t), 2)]);
        }
        pts.push([geom.cx + crW2, geom.rimY + 1], [geom.cx - crW2, geom.rimY + 1]);
        return pts;
      })(),
      fill: shade(rock.dark, -0.46), alpha: 0.7
    });
    // 火口内热辉光
    const heat = clamp(0.22 + phase.plume * 0.95, 0.18, 1);
    prims.push({
      t: 'radial', x: geom.cx, y: geom.floorY - geom.h * 0.012,
      r: Math.max(geom.craterHalfW * 1.25, geom.hw * 0.1) + 22,
      stops: [[0, '#ffe8ba', 0.92 * heat], [0.3, '#ffa34c', 0.64 * heat], [0.62, '#d8511d', 0.24 * heat], [1, '#8a2f10', 0]],
      alpha: 1
    });
    // 火口唇高光
    const crw = geom.hw * (geom.preset.shape.cr ?? 0.2);
    const rimPts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      rimPts.push([geom.cx - crw + 2 * crw * t,
        geom.rimY + (geom.floorY - geom.rimY) * Math.pow(Math.sin(Math.PI * t), 2) * 0.62 - 1]);
    }
    prims.push({ t: 'line', pts: rimPts, color: shade(rock.light, 0.36), width: 1.9, alpha: 0.42 });
    // 碎屑薄披覆（覆盖度高时在锥坡上加一层灰）
    if (teph && teph.cover > 0.4) {
      prims.push({
        t: 'poly', pts: geom.poly, fill: mixHex(PAL.ash, '#f2e8d6', 0.5),
        alpha: 0.06 + 0.14 * teph.cover
      });
    }
  }

  /* ── 熔岩流 ── */
  let lava = null;
  if (state.lava.visible && (state.lava.front ?? 0) > 0.004) {
    lava = lavaGeom(state.lava, geom);
    const hot = clamp(0.35 + lava.frontFrac * 0.5, 0, 1);

    // 流层本体：沿流向由炽热亮黄过渡到暗红
    const a0 = lava.surf[0], a1 = lava.surf[lava.surf.length - 1];
    prims.push({
      t: 'poly', pts: lava.ribbon,
      fill: {
        type: 'linear', x0: a0[0], y0: a0[1], x1: a1[0], y1: a1[1],
        stops: [
          [0, mixHex('#fff0c0', '#fffbe8', hot * 0.55)],
          [0.28, mixHex('#ffc060', '#ffd98c', hot * 0.4)],
          [0.62, '#f4701f'],
          [0.87, '#c03a10'],
          [1, '#8f2a0b']
        ]
      },
      alpha: 0.97
    });
    // 表面亮线与结壳暗纹交替，读起来像流动的熔岩皮壳
    for (let i = 1; i < lava.surf.length - 1; i++) {
      const sT = lava.surf[i], bT = lava.spine[i];
      const t2 = i / (lava.surf.length - 1);
      if (i % 2 === 0) {
        prims.push({
          t: 'line', pts: [sT, bT], color: '#3d1305',
          width: 1.6, alpha: 0.16 + 0.1 * Math.sin(t2 * 9)
        });
      }
    }
    // 上表面高光
    prims.push({
      t: 'line', pts: lava.surf, color: mixHex('#ffcf8c', '#fffaea', hot),
      width: Math.max(1.7, lava.thickness * 0.3), alpha: 0.72
    });
    // 前缘热核
    prims.push({
      t: 'radial', x: lava.tip[0], y: lava.tip[1] - lava.thickness * 0.6,
      r: Math.max(30, lava.thickness * 3.4),
      stops: [[0, '#fff6d4', 0.8], [0.28, '#ffab52', 0.5], [0.66, '#e2581c', 0.17], [1, '#a8300f', 0]],
      alpha: 1
    });
    // 从火口溢出处的小亮源
    prims.push({
      t: 'radial', x: lava.surf[0][0], y: lava.surf[0][1] - 6, r: Math.max(34, geom.hw * 0.13),
      stops: [[0, '#fff0c8', 0.66 * hot], [0.35, '#ff9c45', 0.36 * hot], [1, '#c4440f', 0]],
      alpha: 1
    });
  }

  /* ── 叠影描边（置于锥体与熔岩之上） ── */
  if (ghostPrims.length) prims.push(...ghostPrims);

  /* ── 喷发柱 ── */
  prims.push(...plumePrims(geom, phase.plume, timeSec, phase.umbrella, cur.index + 1));

  /* ── 标注 ── */
  if (opt.labels) {
    prims.push({ t: 'text', x: 84, y: 76, text: doc.name || '未命名喷发', size: 36, color: PAL.text, weight: 700, alpha: 0.94 });
    prims.push({
      t: 'text', x: 86, y: 128,
      text: `阶段 ${cur.index + 1}/${doc.phases.length} · ${phase.name}`,
      size: 25, color: mixHex(PAL.text, '#ff9a3c', 0.55), alpha: 0.92
    });
    if (phase.note) prims.push({ t: 'text', x: 86, y: 164, text: phase.note, size: 19, color: PAL.textDim, alpha: 0.82, wrap: 700 });
  }

  return {
    frame: F,
    totalFrames: total,
    phaseIndex: cur.index,
    phaseStart: cur.start,
    local: cur.local,
    u: cur.u,
    phase,
    state,
    cone: geom,
    lava,
    tephra: teph,
    prims
  };
}

/* ── 工具 ───────────────────────────────────────────────────────────────── */

export const TRACK_LEG = [
  { key: 'cone', name: '锥体形态', color: '#e6a86b' },
  { key: 'lava', name: '熔岩流前缘', color: '#ff7a3c' },
  { key: 'tephra', name: '火山碎屑层', color: '#a9b8c9' }
];

function ridgePoly(x0, x1, baseY, amp, freq, seed) {
  const pts = [];
  const seg = 72;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const x = lerp(x0, x1, t);
    const n = fbm((t * (x1 - x0)) / freq + seed, seed, 4) * 0.5 + 0.5;
    pts.push([x, baseY - n * amp]);
  }
  pts.push([x1, H], [x0, H]);
  return pts;
}

/** 逐帧检查：返回该帧的可读诊断，供“退一格叠着看”使用 */
export function inspectFrame(doc, frame, opt = {}) {
  const s = sampleScene(doc, frame, { ...opt, labels: false });
  const issues = [];
  if (s.lava && s.lava.overrun > 0.6) {
    issues.push({
      kind: 'overrun',
      severity: s.lava.overrun > 30 ? 'warn' : 'info',
      text: `熔岩前缘越过锥体边 ${Math.round(s.lava.overrun)} px`
    });
  }
  if (s.lava && !s.lava.tipOnCone && s.lava.frontFrac < 1.001 && s.lava.frontFrac > 0.004) {
    issues.push({ kind: 'float', severity: 'warn', text: '前缘离开锥坡但未到锥缘' });
  }
  if (s.state.cone.sx < 0.2 || s.state.cone.sy < 0.2) {
    issues.push({ kind: 'cone', severity: 'warn', text: '锥体缩放到接近消失' });
  }
  return {
    frame,
    phaseIndex: s.phaseIndex,
    u: s.u,
    overrun: s.lava ? s.lava.overrun : 0,
    tip: s.lava ? s.lava.tip : null,
    frontFrac: s.lava ? s.lava.frontFrac : 0,
    issues
  };
}

export { PAL };
