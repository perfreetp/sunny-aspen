/* svg.js · 把采样图元导出为 SVG（开发期自检 / 静态导出用，不参与打包） */
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
let gid = 0;

export function primToSvg(p) {
  const a = p.alpha ?? 1;
  if (p.t === 'text') {
    return `<text x="${p.x}" y="${p.y + (p.size || 24) * 0.85}" font-size="${p.size || 24}" fill="${p.color}" opacity="${a}" font-family="Microsoft YaHei,sans-serif" font-weight="${p.weight || 400}">${esc(p.text)}</text>`;
  }
  if (p.t === 'rect') {
    if (p.fill && typeof p.fill === 'object') {
      const id = 'g' + ++gid;
      const stops = p.fill.stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
      return `<defs><linearGradient id="${id}" x1="${p.fill.x0}" y1="${p.fill.y0}" x2="${p.fill.x1}" y2="${p.fill.y1}" gradientUnits="userSpaceOnUse">${stops}</linearGradient></defs><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="url(#${id})" opacity="${a}"/>`;
    }
    return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${p.fill}" opacity="${a}"/>`;
  }
  if (p.t === 'circle') return `<circle cx="${p.x}" cy="${p.y}" r="${Math.max(p.r,0.1)}" fill="${p.fill}" opacity="${a}"/>`;
  if (p.t === 'radial') {
    const id = 'g' + ++gid;
    const stops = p.stops.map(([o, c, al]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${al ?? 1}"/>`).join('');
    return `<defs><radialGradient id="${id}" cx="${p.x}" cy="${p.y}" r="${p.r}" gradientUnits="userSpaceOnUse">${stops}</radialGradient></defs><circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="url(#${id})" opacity="${a}"/>`;
  }
  if (p.t === 'poly') {
    if (p.pts.length < 3) return '';
    const d = 'M' + p.pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z';
    let defs = '', fill = p.fill;
    if (fill && typeof fill === 'object') {
      const id = 'g' + ++gid;
      const stops = fill.stops.map(([o, c, al]) => `<stop offset="${o}" stop-color="${c}"${al != null ? ` stop-opacity="${al}"` : ''}/>`).join('');
      defs = `<defs><linearGradient id="${id}" x1="${fill.x0}" y1="${fill.y0}" x2="${fill.x1}" y2="${fill.y1}" gradientUnits="userSpaceOnUse">${stops}</linearGradient></defs>`;
      fill = `url(#${id})`;
    }
    const stroke = p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.strokeW || 2}" stroke-opacity="${p.strokeAlpha ?? 1}" ${p.dashed ? 'stroke-dasharray="10 8"' : ''}` : '';
    const fa = fill ? `fill="${fill}" opacity="${a}"` : 'fill="none"';
    return `${defs}<path d="${d}" ${fa}${stroke}/>`;
  }
  if (p.t === 'line') {
    const d = 'M' + p.pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L');
    const dash = p.dash ? ` stroke-dasharray="${p.dash[0]} ${p.dash[1]}"` : '';
    return `<path d="${d}" fill="none" stroke="${p.color}" stroke-width="${p.width}" opacity="${a}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
  }
  return '';
}

export function sceneToSvg(scene, w = 1920, h = 1080) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#0b0c12"/>${scene.prims.map(primToSvg).join('')}</svg>`;
}
