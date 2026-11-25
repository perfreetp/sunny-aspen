import { KIND_LABEL } from '../types';
import type { Project } from '../types';
import { downloadTextFile, escapeHtml } from './format';

export interface ParameterRow {
  order: number;
  name: string;
  kind: string;
  texture: string;
  assetName: string;
  start: number;
  duration: number;
  end: number;
  opacityPercent: number;
  blendMode: string;
  x: number;
  y: number;
  scalePercent: string;
  rotation: number;
  visible: string;
  maskStrokes: number;
  fx: string;
}

export function buildParameterRows(project: Project): ParameterRow[] {
  // project.layers is bottom-to-top; the sheet is read top-to-bottom.
  return [...project.layers].reverse().map((layer, index) => ({
    order: index + 1,
    name: layer.name,
    kind: KIND_LABEL[layer.kind],
    texture: layer.texture,
    assetName: layer.assetName ?? (layer.texture.startsWith('bg-') ? '内置示例底图' : layer.texture),
    start: layer.start,
    duration: layer.duration,
    end: Math.round((layer.start + layer.duration) * 100) / 100,
    opacityPercent: Math.round(layer.opacity * 100),
    blendMode: layer.blendMode,
    x: Math.round(layer.x),
    y: Math.round(layer.y),
    scalePercent: `${Math.round(layer.scaleX * 100)}% / ${Math.round(layer.scaleY * 100)}%`,
    rotation: Math.round(layer.rotation * 10) / 10,
    visible: layer.visible ? '是' : '否',
    maskStrokes: layer.strokes.length,
    fx:
      layer.kind === 'light'
        ? `频闪 ${layer.effect.frequency}Hz；强度 ${Math.round(layer.effect.intensity * 100)}%`
        : layer.kind === 'smoke'
          ? `扩散 ${layer.effect.spread.toFixed(2)}；密度 ${layer.effect.density.toFixed(2)}；漂移 ${layer.effect.drift.toFixed(2)}`
          : layer.kind === 'spark'
            ? `密度 ${layer.effect.density.toFixed(2)}；速度 ${layer.effect.speed.toFixed(2)}`
            : '—',
  }));
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function exportParameterCsv(project: Project): void {
  const rows = buildParameterRows(project);
  const headers: { key: keyof ParameterRow; label: string }[] = [
    { key: 'order', label: '顶层顺序(1=最上)' },
    { key: 'kind', label: '层级类型' },
    { key: 'name', label: '层名称' },
    { key: 'start', label: '触发时间(s)' },
    { key: 'duration', label: '持续(s)' },
    { key: 'end', label: '结束(s)' },
    { key: 'opacityPercent', label: '透明度(%)' },
    { key: 'blendMode', label: '混合模式' },
    { key: 'x', label: '中心X(1920×1080)' },
    { key: 'y', label: '中心Y(1920×1080)' },
    { key: 'scalePercent', label: '缩放X/Y' },
    { key: 'rotation', label: '旋转(°)' },
    { key: 'maskStrokes', label: '蒙版笔划数' },
    { key: 'fx', label: '效果参数' },
    { key: 'visible', label: '启用' },
    { key: 'assetName', label: '素材/底图' },
  ];

  const lines = [
    ['特效参数表', project.name, `总时长 ${project.duration}s`].map(csvCell).join(','),
    headers.map((header) => csvCell(header.label)).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header.key])).join(',')),
    '',
    ['剧情节奏表'].map(csvCell).join(','),
    ['时间(s)', '节点', '现场/调试备注'].map(csvCell).join(','),
    ...[...project.cues]
      .sort((a, b) => a.time - b.time)
      .map((cue) => [cue.time, cue.title, cue.note ?? ''].map(csvCell).join(',')),
  ];

  // BOM makes Excel open Chinese as UTF-8.
  downloadTextFile(`${project.name}-特效参数表.csv`, `﻿${lines.join('\n')}`, 'text/csv;charset=utf-8');
}

export function exportParameterJson(project: Project): void {
  downloadTextFile(
    `${project.name}-特效参数.json`,
    JSON.stringify(
      {
        schema: 'mechanism-fx-sheet/v1',
        exportedAt: new Date().toISOString(),
        stage: { width: project.width, height: project.height, duration: project.duration },
        renderOrderTopToBottom: buildParameterRows(project),
        cues: [...project.cues].sort((a, b) => a.time - b.time),
        layersTopToBottom: [...project.layers].reverse(),
      },
      null,
      2,
    ),
    'application/json;charset=utf-8',
  );
}

export function printParameterSheet(project: Project): void {
  const rows = buildParameterRows(project);
  const cues = [...project.cues].sort((a, b) => a.time - b.time);
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" />
<title>${escapeHtml(project.name)} · 特效参数表</title>
<style>
  @page { size: A3 landscape; margin: 12mm; }
  body { font-family: "Microsoft YaHei", system-ui, sans-serif; color: #17202a; margin: 24px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .meta { color: #52606d; margin-bottom: 18px; }
  h2 { font-size: 18px; margin: 24px 0 8px; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; }
  th, td { border: 1px solid #9aa7b4; padding: 6px 7px; text-align: left; vertical-align: top; }
  th { background: #e8eef5; }
  tr:nth-child(even) td { background: #f7f9fc; }
  .tag { display: inline-block; border: 1px solid #6b7a8d; border-radius: 999px; padding: 1px 8px; }
  .grid { display: grid; grid-template-columns: 1.2fr .8fr; gap: 24px; }
  @media print { .no-print { display: none; } body { margin: 0; } }
</style></head><body>
<div class="no-print"><button onclick="window.print()" style="padding:10px 18px;font-size:15px">打印 / 另存 PDF</button></div>
<h1>${escapeHtml(project.name)} · 现场特效参数表</h1>
<div class="meta">画布 ${project.width}×${project.height} · 总时长 ${project.duration}s · 导出时间 ${new Date().toLocaleString('zh-CN')}</div>
<h2>一、层级 / 时间 / 透明度参数（1 为最上层）</h2>
<table><thead><tr>
<th>顺序</th><th>类型</th><th>层名称</th><th>触发</th><th>持续/结束</th><th>透明度</th><th>混合</th><th>位置 X,Y</th><th>缩放</th><th>旋转</th><th>蒙版</th><th>效果参数</th><th>素材</th>
</tr></thead><tbody>
${rows
  .map(
    (r) => `<tr>
<td><b>${r.order}</b></td><td><span class="tag">${r.kind}</span></td><td>${escapeHtml(r.name)}</td>
<td>${r.start.toFixed(2)}s</td><td>${r.duration.toFixed(2)}s / ${r.end.toFixed(2)}s</td>
<td><b>${r.opacityPercent}%</b></td><td>${r.blendMode}</td><td>${r.x}, ${r.y}</td><td>${r.scalePercent}</td><td>${r.rotation}°</td>
<td>${r.maskStrokes} 笔</td><td>${escapeHtml(r.fx)}</td><td>${escapeHtml(r.assetName)}</td></tr>`,
  )
  .join('')}
</tbody></table>
<h2>二、剧情节奏 / Cue 表</h2>
<table><thead><tr><th>时间</th><th>节点</th><th>调试备注</th></tr></thead><tbody>
${cues
  .map(
    (cue) =>
      `<tr><td><b>${cue.time.toFixed(2)}s</b></td><td>${escapeHtml(cue.title)}</td><td>${escapeHtml(cue.note ?? '')}</td></tr>`,
  )
  .join('')}
</tbody></table>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script>
</body></html>`;
  const printWindow = window.open('', '_blank', 'width=1280,height=900');
  if (!printWindow) {
    downloadTextFile('特效参数表.html', html, 'text/html;charset=utf-8');
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
