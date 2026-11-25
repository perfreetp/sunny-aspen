/* ── render-pixi.js · 单一渲染实现（编辑器 / 回放 / 导出 / 独立播放器共用） ──
 * drawPrims() 把 sampleScene() 的图元画进 PixiJS。
 * 编辑器、逐帧检查、拖动预览、导出帧渲染、导出的独立播放器都调用它，
 * 因此“松手后回放和拖动预览一致”是结构保证，而非靠人工对齐。
 * ─────────────────────────────────────────────────────────────────────── */

import { Application, Container, Graphics, FillGradient, Text, TextStyle } from 'pixi.js';

/* ── 渐变缓存（键仅由色标决定；local 空间自动适配任意形状） ── */
const gradCache = new Map();

/**
 * Pixi 的 textureSpace:'local' 以「形状包围盒」为 0..1 空间，
 * 因此必须把图元里声明的世界坐标起止点换算到包围盒局部坐标，
 * 否则渐变方向会被忽略（曾导致喷发柱渐变反置）。
 */
function toPixiFill(fill, bbox, aMul = 1) {
  if (typeof fill === 'string') return fill;
  if (!fill || fill.type !== 'linear') return fill?.stops?.[0]?.[1] || '#888888';

  const bw = Math.max(1e-3, bbox.x1 - bbox.x0);
  const bh = Math.max(1e-3, bbox.y1 - bbox.y0);
  const sx = (fill.x0 - bbox.x0) / bw;
  const sy = (fill.y0 - bbox.y0) / bh;
  const ex = (fill.x1 - bbox.x0) / bw;
  const ey = (fill.y1 - bbox.y0) / bh;

  const key = `lin|${aMul.toFixed(3)}|${sx.toFixed(3)},${sy.toFixed(3)}|${ex.toFixed(3)},${ey.toFixed(3)}|`
    + fill.stops.map((st) => `${st[0]}/${st[1]}/${st[2] ?? 1}`).join('|');

  let g = gradCache.get(key);
  if (!g) {
    g = new FillGradient({
      type: 'linear',
      start: { x: sx, y: sy },
      end: { x: ex, y: ey },
      textureSpace: 'local',
      colorStops: fill.stops.map(([offset, color, alpha]) => ({
        offset: Math.max(0, Math.min(1, offset)),
        color: withAlpha(color, (alpha ?? 1) * aMul)
      }))
    });
    if (gradCache.size > 480) gradCache.clear();
    gradCache.set(key, g);
  }
  return g;
}

const radialCache = new Map();

function toRadialFill(stops, aMul = 1) {
  const key = 'r|' + aMul.toFixed(3) + '|' + stops.map((s) => `${s[0]}/${s[1]}/${s[2] ?? 1}`).join('|');
  let g = radialCache.get(key);
  if (!g) {
    g = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      textureSpace: 'local',
      colorStops: stops.map(([offset, color, alpha]) => ({
        offset,
        color: withAlpha(color, (alpha ?? 1) * aMul)
      }))
    });
    if (radialCache.size > 320) radialCache.clear();
    radialCache.set(key, g);
  }
  return g;
}

function withAlpha(hex, a) {
  const h = hex.replace('#', '');
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const al = Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
  return `#${s}${al}`;
}

function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[0] > x1) x1 = p[0];
    if (p[1] > y1) y1 = p[1];
  }
  return { x0, y0, x1, y1 };
}

function ptsArray(pts) {
  const out = new Array(pts.length * 2);
  for (let i = 0; i < pts.length; i++) {
    out[i * 2] = pts[i][0];
    out[i * 2 + 1] = pts[i][1];
  }
  return out;
}

/** 虚线（Pixi 无原生虚线，手动分段） */
function dashedPath(g, pts, dash = 10, gap = 8) {
  let carry = 0;
  let draw = true;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-6) continue;
    const ux = (bx - ax) / len, uy = (by - ay) / len;
    let d = 0;
    while (d < len - 1e-6) {
      const phaseLen = draw ? dash : gap;
      const step = Math.min(phaseLen - carry, len - d);
      if (draw) {
        g.moveTo(ax + ux * d, ay + uy * d);
        g.lineTo(ax + ux * (d + step), ay + uy * (d + step));
      }
      d += step;
      carry += step;
      if (carry >= phaseLen - 1e-6) {
        carry = 0;
        draw = !draw;
      }
    }
  }
}

/* ── 池化渲染器：复用 Graphics/Text，避免每帧新建对象 ─────────────────── */

const styleCache = new Map();

function textStyle(p) {
  const key = `${p.size}|${p.color}|${p.weight}|${p.wrap || 0}`;
  let st = styleCache.get(key);
  if (!st) {
    st = new TextStyle({
      fontFamily: 'system-ui, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif',
      fontSize: p.size || 24,
      fill: p.color || '#ffffff',
      fontWeight: String(p.weight || 400),
      wordWrap: !!p.wrap,
      wordWrapWidth: p.wrap || 800,
      lineHeight: Math.round((p.size || 24) * 1.45)
    });
    if (styleCache.size > 200) styleCache.clear();
    styleCache.set(key, st);
  }
  return st;
}

export class StageRenderer {
  constructor(root) {
    this.root = root;          // Container
    this.gfx = [];
    this.txt = [];
  }

  clear() {
    this.root.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.gfx = [];
    this.txt = [];
  }

  /**
   * @param {Array} prims
   */
  draw(prims) {
    let gi = 0, ti = 0;
    for (let i = 0; i < prims.length; i++) {
      const p = prims[i];
      if (p.t === 'text') {
        let t = this.txt[ti];
        if (!t) {
          t = new Text({ text: '', style: textStyle(p) });
          this.txt[ti] = t;
          this.root.addChild(t);
        }
        t.visible = true;
        const st = textStyle(p);
        if (t.style !== st) t.style = st;
        if (t.text !== p.text) t.text = p.text;
        t.x = p.x;
        t.y = p.y;
        t.alpha = p.alpha ?? 1;
        ti++;
        continue;
      }
      let g = this.gfx[gi];
      if (!g) {
        g = new Graphics();
        this.gfx[gi] = g;
        this.root.addChild(g);
      }
      g.visible = true;
      g.clear();
      g.alpha = 1;
      this.#drawOne(g, p);
      gi++;
    }
    for (let i = gi; i < this.gfx.length; i++) this.gfx[i].visible = false;
    for (let i = ti; i < this.txt.length; i++) this.txt[i].visible = false;
  }

  #drawOne(g, p) {
    if (p.t === 'rect') {
      g.rect(p.x, p.y, p.w, p.h);
      if (p.fill == null) return;
      if (typeof p.fill === 'object') {
        g.fill(toPixiFill(p.fill, { x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h }, p.alpha ?? 1));
      } else g.fill({ color: p.fill, alpha: p.alpha ?? 1 });
    } else if (p.t === 'circle') {
      g.circle(p.x, p.y, Math.max(0.2, p.r));
      if (p.fill == null) return;
      g.fill({ color: p.fill, alpha: p.alpha ?? 1 });
    } else if (p.t === 'radial') {
      g.circle(p.x, p.y, Math.max(1, p.r));
      g.fill(toRadialFill(p.stops, p.alpha ?? 1));
    } else if (p.t === 'poly') {
      if (p.pts.length < 3) return;
      const a = p.alpha ?? 1;
      const isGrad = p.fill && typeof p.fill === 'object';
      g.poly(ptsArray(p.pts));
      if (p.fill != null) {
        if (isGrad) g.fill(toPixiFill(p.fill, bboxOf(p.pts), a));
        else g.fill({ color: p.fill, alpha: a });
      }
      if (p.stroke) {
        if (p.dashed) dashedPath(g, p.pts.concat([p.pts[0]]), 11, 9);
        g.stroke({ width: p.strokeW || 2, color: p.stroke, alpha: p.strokeAlpha ?? 1 });
      }
    } else if (p.t === 'line') {
      if (!p.pts || p.pts.length < 2) return;
      if (p.dash) dashedPath(g, p.pts, p.dash[0], p.dash[1]);
      else {
        g.moveTo(p.pts[0][0], p.pts[0][1]);
        for (let i = 1; i < p.pts.length; i++) g.lineTo(p.pts[i][0], p.pts[i][1]);
      }
      g.stroke({ width: p.width || 2, color: p.color, alpha: p.alpha ?? 1, cap: 'round', join: 'round' });
    }
  }

  destroy() {
    this.clear();
  }
}

/* ── 应用生命周期 ─────────────────────────────────────────────────────── */

export async function createRenderer(host, width, height) {
  const app = new Application();
  await app.init({
    width, height,
    background: 0x0b0c12,
    antialias: true,
    resolution: Math.min(2, globalThis.devicePixelRatio || 1),
    autoDensity: true,
    preference: 'webgl',
    powerPreference: 'high-performance'
  });
  app.canvas.style.display = 'block';
  app.canvas.style.width = '100%';
  app.canvas.style.height = '100%';
  host.appendChild(app.canvas);
  const world = new Container();
  app.stage.addChild(world);
  return { app, world };
}

export function fitView(docW, docH, boxW, boxH, pad = 0) {
  const scale = Math.min((boxW - pad * 2) / docW, (boxH - pad * 2) / docH);
  return { scale, offsetX: (boxW - docW * scale) / 2, offsetY: (boxH - docH * scale) / 2 };
}

export function toWorld(px, py, view) {
  return { x: (px - (view.offsetX || 0)) / view.scale, y: (py - (view.offsetY || 0)) / view.scale };
}

export function applyViewWorld(world, view) {
  world.scale.set(view.scale);
  world.x = view.offsetX;
  world.y = view.offsetY;
}
