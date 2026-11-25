// opentype.js 字体管理：载入 woff（opentype 1.x 不支持 woff2），
// 提供文字测量与矢量路径生成。文字全部转路径绘制，缩放不糊。
import opentype from 'opentype.js';
import { wrapText } from '../layout/textUtil.js';
import scWoff from './noto-sans-sc-chinese-simplified-400-normal.woff?url';
import scBoldWoff from './noto-sans-sc-chinese-simplified-700-normal.woff?url';
import latinWoff from './noto-sans-latin-400-normal.woff?url';
import latinBoldWoff from './noto-sans-latin-700-normal.woff?url';

export { wrapText };

const cache = new Map();

async function loadFont(url) {
  if (cache.has(url)) return cache.get(url);
  const resp = await fetch(url);
  const buf = await resp.arrayBuffer();
  const font = opentype.parse(buf);
  cache.set(url, font);
  return font;
}

let regularPromise = null;
let boldPromise = null;

export function loadFonts() {
  regularPromise ??= Promise.all([loadFont(scWoff), loadFont(latinWoff)])
    .then(([sc, latin]) => new FontSet(sc, latin));
  boldPromise ??= Promise.all([loadFont(scBoldWoff), loadFont(latinBoldWoff)])
    .then(([sc, latin]) => new FontSet(sc, latin));
  return Promise.all([regularPromise, boldPromise]).then(([r, b]) => ({ regular: r, bold: b }));
}

// 拉丁字形优先用 Noto Sans Latin，缺字（含中文）回退到 Noto Sans SC
export class FontSet {
  constructor(sc, latin) {
    this.sc = sc;
    this.latin = latin;
    this.upm = sc.unitsPerEm;
  }

  fontFor(ch) {
    if (!ch) return this.sc;
    const code = ch.codePointAt(0);
    // 拉丁、数字、常用标点走 latin 字体（字形更窄更精致）
    if (code < 0x2e80) return this.latin;
    return this.sc;
  }

  // 像素字号下的文字宽度（含字间微调）
  measure(text, pxSize) {
    const scale = pxSize / this.upm;
    let width = 0;
    for (const ch of text) {
      const f = this.fontFor(ch);
      const g = f.charToGlyph(ch);
      width += (g.advanceWidth ?? 0) * scale;
    }
    return width;
  }

  // 多行文字测量：{ w, h, lines }
  measureLines(lines, pxSize, lineHeight = 1.28) {
    const widths = lines.map((l) => this.measure(l, pxSize));
    return {
      w: Math.max(0, ...widths),
      h: lines.length * pxSize * lineHeight,
      lines,
      lineHeight: pxSize * lineHeight,
    };
  }

  // 生成 SVG path 字符串；锚点为文本块左上角，基线按行排列
  toSVGPath(lines, pxSize, lineHeight = 1.28) {
    const scale = 1 / this.upm; // getPath 内再乘 pxSize
    const parts = [];
    lines.forEach((line, li) => {
      const baseline = (li + 0.78) * pxSize * lineHeight;
      let penX = 0;
      for (const ch of line) {
        const f = this.fontFor(ch);
        const g = f.charToGlyph(ch);
        const p = g.getPath(penX, baseline, pxSize);
        const d = p.toPathData(2);
        if (d) parts.push(d);
        penX += (g.advanceWidth ?? 0) * pxSize * scale;
      }
    });
    return parts.join(' ');
  }

  // 逐字形返回独立 path 数据（避免多子路径合并到单个 paper.Path 时填充异常）
  // 返回 [{ d, x, y }]，d 为局部坐标 path，x/y 为该字形在文本块内的偏移
  glyphPaths(lines, pxSize, lineHeight = 1.28) {
    const scale = 1 / this.upm;
    const out = [];
    lines.forEach((line, li) => {
      const baseline = (li + 0.78) * pxSize * lineHeight;
      let penX = 0;
      for (const ch of line) {
        const f = this.fontFor(ch);
        const g = f.charToGlyph(ch);
        const p = g.getPath(penX, baseline, pxSize);
        const d = p.toPathData(2);
        if (d) out.push({ d, advance: (g.advanceWidth ?? 0) * pxSize * scale });
        penX += (g.advanceWidth ?? 0) * pxSize * scale;
      }
    });
    return out;
  }
}

export const FONT_STATUS = { ready: false };
export async function whenFontsReady() {
  const { regular } = await loadFonts();
  FONT_STATUS.ready = true;
  FONT_STATUS.regular = regular;
  return regular;
}
