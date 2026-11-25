// 评审材料打包：每条剖面一份 SVG + PNG + 可再编辑 JSON，附索引页
import JSZip from 'jszip';
import { buildSVG, downloadBlob } from './svgExport.js';

function safeName(name) {
  return String(name).replace(/[\\/:*?"<>|\s]+/g, '_');
}

// 由 paper scope 导出高分辨率 PNG（dataURL -> blob）
export function paperToPNG(scope, scale = 2) {
  const svg = scope.project.exportSVG({ asString: true, bounds: 'content' });
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => resolve(b), 'image/png');
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * 批量打包
 * @param {object[]} jobs [{ line, view, layout, style, scope }]
 * @param fontSet 已载入字体
 * @param project 完整项目（写入可编辑稿）
 */
export async function exportReviewBundle(jobs, fontSet, project) {
  const zip = new JSZip();
  const folder = zip.folder('火山剖面评审材料');
  const index = ['# 火山剖面标注评审材料', '', `生成时间：${new Date().toLocaleString('zh-CN')}`, '', '## 图件清单', ''];

  for (const job of jobs) {
    const { line, view, style, scope, meta } = job;
    const base = safeName(line.id + '_' + line.name);
    const svg = buildSVG(view, fontSet, style, meta);
    folder.file(`${base}.svg`, svg);
    try {
      const png = await paperToPNG(scope, 2.5);
      folder.file(`${base}.png`, png);
    } catch (e) {
      console.warn('PNG 导出失败', line.id, e);
    }
    index.push(`- **${line.name}**（${line.id}）：${base}.svg / ${base}.png`);
  }

  // 可再编辑的整稿（结构不丢，专家意见回来后可直接打开继续改）
  folder.file('可再编辑项目稿.json', JSON.stringify(project, null, 2));
  index.push('', '## 复用说明', '', '打开应用后选择「导入项目稿」，载入 `可再编辑项目稿.json` 即可继续编辑全部剖面与标注。');
  folder.file('README.md', index.join('\n'));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  downloadBlob(`火山剖面评审材料_${new Date().toISOString().slice(0, 10)}.zip`, blob);
}
