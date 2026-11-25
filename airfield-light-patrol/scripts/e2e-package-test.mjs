// 端到端闭环：框选缺失 → 清单入库 → 补录关闭 → 场景要素包 ZIP 结构校验
import { initDataset } from '../src/lib/data/generator.js';
import JSZip from 'jszip';

// 模拟浏览器侧的打包逻辑（与 MissingPanel.exportPackage 保持同构）
const ds = initDataset();
let failures = 0;
const assert = (c, m) => { if (c) console.log('  ✓', m); else { console.error('  ✗', m); failures++; } };

// 1) 框选 A/E/K 三段，生成报告（复刻引擎分组+内部断号）
function marquee(rect) {
  const inside = ds.features.filter(f => f.x >= rect.minX && f.x <= rect.maxX && f.y >= rect.minY && f.y <= rect.maxY);
  const groups = new Map();
  for (const f of inside) {
    const side = /-(L|R)-\d+$/.test(f.id) ? f.id.match(/-(L|R)-\d+$/)[1] : 'X';
    const key = `${f.categoryId}|${f.lineId}|${side}`;
    if (!groups.has(key)) groups.set(key, { cat: f.categoryId, line: f.lineId, ok: [], missing: [] });
    const g = groups.get(key);
    (f.status === 'missing' ? g.missing : g.ok).push(f);
  }
  const reports = [];
  for (const g of groups.values()) {
    const ids = new Set(g.missing.map(f => f.id));
    if (ids.size) reports.push({ reportId: `MR-${reports.length + 1}`, categoryId: g.cat, lineId: g.line, missingIds: [...ids].sort(), status: 'open' });
  }
  return reports;
}
const allReports = [];
for (const line of ['A', 'E', 'K']) {
  const fs = ds.features.filter(f => f.lineId === line && f.status === 'missing');
  const rect = {
    minX: Math.min(...fs.map(f => f.x)) - 40, maxX: Math.max(...fs.map(f => f.x)) + 40,
    minY: Math.min(...fs.map(f => f.y)) - 40, maxY: Math.max(...fs.map(f => f.y)) + 40
  };
  allReports.push(...marquee(rect));
}
assert(allReports.length === 3, `框选产生 3 份缺失报告（实际 ${allReports.length}）`);
const totalMissing = allReports.reduce((n, r) => n + r.missingIds.length, 0);
assert(totalMissing === 13, `清单合计 13 个缺失编号（实际 ${totalMissing}）`);

// 2) 工程师补录：要素状态恢复，报告关闭
for (const r of allReports) {
  for (const id of r.missingIds) {
    const f = ds.features.find(x => x.id === id);
    if (f) f.status = 'ok';
  }
  r.status = 'resolved';
}
const stillMissing = ds.features.filter(f => f.status === 'missing').length;
assert(stillMissing === 0, '补录后要素全部恢复正常');
assert(allReports.every(r => r.status === 'resolved'), '报告全部关闭');

// 3) 打包场景要素包（与 MissingPanel 同构）
const zip = new JSZip();
zip.file('feature-config.json', JSON.stringify(ds.config, null, 2));
zip.file('missing-list.json', JSON.stringify({ exportedAt: '2026-11-26T00:00:00Z', reports: allReports }, null, 2));
const rows = [['报告号', '线路', '缺失编号']];
for (const r of allReports) rows.push([r.reportId, r.lineId, r.missingIds.join(';')]);
zip.file('missing-list.csv', '﻿' + rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n'));
zip.file('README.txt', '机场灯光场景要素包\n交付对象：模拟机运维');

const blob = await zip.generateAsync({ type: 'nodebuffer' });
assert(blob.length > 500, `ZIP 生成成功（${blob.length} 字节）`);

// 4) 回读 ZIP 校验结构与内容
const reopened = await JSZip.loadAsync(blob);
const names = Object.keys(reopened.files);
assert(['feature-config.json', 'missing-list.json', 'missing-list.csv', 'README.txt'].every(n => names.includes(n)), '包含 4 个交付文件');
const cfgText = await reopened.file('feature-config.json').async('string');
const cfgParsed = JSON.parse(cfgText);
assert(cfgParsed.categories?.length === 11, '配置 JSON 含 11 个要素类别');
const listParsed = JSON.parse(await reopened.file('missing-list.json').async('string'));
assert(listParsed.reports.length === 3 && listParsed.reports[0].missingIds[0].startsWith('TWE-'), '缺失清单 JSON 内容正确');
const csv = await reopened.file('missing-list.csv').async('string');
assert(csv.includes('TWE-A-L-015') && csv.includes('TWE-K-R-021'), 'CSV 含具体缺失编号');

console.log(failures === 0 ? '\n端到端闭环全部通过 ✔' : `\n${failures} 项失败 ✘`);
process.exit(failures ? 1 : 0);
