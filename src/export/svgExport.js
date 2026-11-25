// SVG 导出：矢量文字（opentype path）+ 岩性花纹 + 引线，可直接进 Illustrator/评审材料
import { LITHOLOGIES } from '../model/volcanoModel.js';

const XML_NS = 'http://www.w3.org/2000/svg';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// 岩性花纹 pattern 定义
function patternDefs() {
  const defs = [];
  for (const l of LITHOLOGIES) {
    const id = `pat-${l.key}`;
    let body = '';
    switch (l.pattern) {
      case 'dots':
        body = `<circle cx="4" cy="4" r="1.3" fill="#5b4a2f"/>`;
        break;
      case 'v':
        body = `<path d="M4 1 L4 7 M1 4 L7 4" stroke="#3d4a5c" stroke-width="0.8"/>`;
        break;
      case 'circles':
        body = `<circle cx="5" cy="5" r="2.6" fill="none" stroke="#7a4a2e" stroke-width="0.8"/>`;
        break;
      case 'triangles':
        body = `<path d="M5 2 L8 7 L2 7 Z" fill="none" stroke="#7a3a3a" stroke-width="0.8"/>`;
        break;
      case 'lines':
        body = `<path d="M0 3 H10 M0 8 H10" stroke="#8a7a44" stroke-width="0.9"/>`;
        break;
      case 'crosshatch':
        body = `<path d="M-1 2 L8 11 M2 -1 L11 8 M-1 8 L8 -1 M2 11 L11 2" stroke="#5f6640" stroke-width="0.7"/>`;
        break;
      case 'dashes':
        body = `<path d="M0 5 H4 M6 5 H10" stroke="#3f6a5c" stroke-width="1.1"/>`;
        break;
      case 'waves':
        body = `<path d="M0 5 Q2.5 2 5 5 T10 5" fill="none" stroke="#454b6e" stroke-width="0.8"/>`;
        break;
      case 'blocks':
        body = `<rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="#6e5744" stroke-width="0.8"/>`;
        break;
      case 'plus':
        body = `<path d="M5 1 V9 M1 5 H9" stroke="#6a5e7c" stroke-width="0.8"/>`;
        break;
      default:
        body = '';
    }
    defs.push(
      `<pattern id="${id}" patternUnits="userSpaceOnUse" width="10" height="10">` +
      `<rect width="10" height="10" fill="${l.color}"/>${body}</pattern>`
    );
  }
  return defs.join('');
}

function polyPoints(pts) {
  return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

/**
 * 生成独立 SVG 文件字符串
 * @param view 纸面条目（含 layerPolys 视图坐标、interfaces 视图坐标、labels、grid、frame）
 * @param fontSet 已载入的 FontSet
 * @param style 字号等
 */
export function buildSVG(view, fontSet, style, meta) {
  const { width, height, layerViewPolys, interfaceViewPaths, labels, gridLines, frame, title } = view;
  const parts = [];
  parts.push(`<svg xmlns="${XML_NS}" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="0 0 ${width.toFixed(1)} ${height.toFixed(1)}">`);
  parts.push('<defs>' + patternDefs() + '</defs>');
  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);

  // 网格
  if (gridLines?.length) {
    parts.push('<g stroke="#e3e7ec" stroke-width="0.6">');
    for (const g of gridLines) {
      parts.push(`<line x1="${g.a.x.toFixed(1)}" y1="${g.a.y.toFixed(1)}" x2="${g.b.x.toFixed(1)}" y2="${g.b.y.toFixed(1)}"/>`);
    }
    parts.push('</g>');
  }

  // 岩层多边形（底色 + 花纹）
  parts.push('<g stroke="none">');
  layerViewPolys.forEach((poly, k) => {
    const lith = LITHOLOGIES[k];
    parts.push(`<polygon points="${polyPoints(poly)}" fill="url(#pat-${lith.key})" opacity="0.94"/>`);
  });
  parts.push('</g>');

  // 层界线
  parts.push('<g fill="none" stroke="#2c3440" stroke-width="1.1" stroke-linejoin="round">');
  for (const iface of interfaceViewPaths) {
    const d = iface.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    parts.push(`<path d="${d}"/>`);
  }
  parts.push('</g>');

  // 引线（含合并标注成员支线）
  parts.push('<g fill="none" stroke="#1f2733" stroke-width="0.9" stroke-linecap="round">');
  for (const lab of labels) {
    if (lab.leader) {
      const d = lab.leader.path.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
      parts.push(`<path d="${d}"/>`);
    }
    if (lab.memberTaps) {
      for (const tap of lab.memberTaps) {
        parts.push(`<line x1="${lab.anchor.x.toFixed(1)}" y1="${lab.anchor.y.toFixed(1)}" x2="${tap.point.x.toFixed(1)}" y2="${tap.point.y.toFixed(1)}" stroke-dasharray="3 2"/>`);
      }
    }
    // 锚点圆点
    parts.push(`<circle cx="${lab.anchor.x.toFixed(1)}" cy="${lab.anchor.y.toFixed(1)}" r="2.2" fill="#1f2733"/>`);
  }
  parts.push('</g>');

  // 矢量文字（逐字形 path，缩放不糊，可在 Illustrator 中编辑轮廓）
  parts.push('<g fill="#161b22">');
  for (const lab of labels) {
    const ox = lab.rect.x + 8, oy = lab.rect.y + 8;
    for (const gp of fontSet.glyphPaths(lab.lines, style.fontPx)) {
      parts.push(`<path d="${gp.d}" transform="translate(${ox},${oy})"/>`);
    }
  }
  parts.push('</g>');

  // 图框与标题
  if (frame) {
    parts.push(`<rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" fill="none" stroke="#2c3440" stroke-width="1.4"/>`);
  }
  if (title) {
    for (const gp of fontSet.glyphPaths([title.text], 18)) {
      parts.push(`<path d="${gp.d}" transform="translate(${title.x},${title.y})" fill="#161b22"/>`);
    }
    if (meta?.scale) {
      const sub = [`比例尺 ${meta.scale}　垂直夸大 ×${style.vExag}`];
      for (const gp of fontSet.glyphPaths(sub, 12)) {
        parts.push(`<path d="${gp.d}" transform="translate(${title.x},${title.y + 22})" fill="#55606c"/>`);
      }
    }
  }
  parts.push('</svg>');
  return parts.join('\n');
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadText(filename, text, mime = 'image/svg+xml') {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}

export { esc };
