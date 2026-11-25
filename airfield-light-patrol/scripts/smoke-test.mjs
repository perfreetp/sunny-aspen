// 纯 Node 冒烟测试：数据规模、预置缺失、框选断号检测、LOD 分级计算
import { initDataset } from '../src/lib/data/generator.js';

const ds = initDataset();
let failures = 0;
const assert = (cond, msg) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    console.error(`  ✗ ${msg}`);
    failures++;
  }
};

console.log('1) 数据集规模');
console.log('   分类统计:', JSON.stringify(ds.stats.byCategory));
assert(ds.stats.total >= 20000, `要素总数 ${ds.stats.total} ≥ 20000（数万灯光要素）`);
assert(ds.stats.groupCount >= 100, `灯组数量 ${ds.stats.groupCount} ≥ 100`);
assert(ds.stats.missing === 13, `预置缺失 13 处（实际 ${ds.stats.missing}）`);

console.log('2) 预置缺失分布（A/E/K 滑行道边灯）');
const missing = ds.features.filter((f) => f.status === 'missing');
const byLine = missing.reduce((m, f) => ((m[f.lineId] = (m[f.lineId] || 0) + 1), m), {});
console.log('  ', JSON.stringify(byLine), missing.map((f) => f.id).join(', '));
assert(byLine.A === 5 && byLine.E === 4 && byLine.K === 4, 'A=5, E=4, K=4 断号');

// 复刻引擎 _runMarquee 的断号分析（含内部断号约束）
function runMarquee(rect) {
  const inside = ds.features.filter(
    (f) => f.x >= rect.minX && f.x <= rect.maxX && f.y >= rect.minY && f.y <= rect.maxY
  );
  const groups = new Map();
  for (const f of inside) {
    const side = /-(L|R)-\d+$/.test(f.id) ? f.id.match(/-(L|R)-\d+$/)[1] : 'X';
    const key = `${f.categoryId}|${f.lineId}|${side}`;
    if (!groups.has(key)) groups.set(key, { cat: f.categoryId, line: f.lineId, side, ok: [], missing: [] });
    const g = groups.get(key);
    (f.status === 'missing' ? g.missing : g.ok).push(f);
  }
  const reports = [];
  for (const g of groups.values()) {
    const ids = new Set(g.missing.map((f) => f.id));
    if (g.ok.length >= 2) {
      const idxs = g.ok.map((f) => f.designIndex);
      const present = new Set(idxs);
      const tmpl = g.ok[0].id.replace(/\d+$/, '');
      const pad = (g.ok[0].id.match(/(\d+)$/) || ['', '3'])[1].length;
      for (let i = Math.min(...idxs) + 1; i < Math.max(...idxs); i++) {
        if (!present.has(i) && present.has(i - 1) && present.has(i + 1)) {
          ids.add(`${tmpl}${String(i + 1).padStart(pad, '0')}`);
        }
      }
    }
    if (ids.size) reports.push({ line: g.line, side: g.side, cat: g.cat, ids: [...ids].sort() });
  }
  return { insideCount: inside.length, reports };
}

// 按某条滑行道的实际缺失要素构造紧凑框选矩形
function rectAround(lineId, pad = 40) {
  const fs = ds.features.filter((f) => f.lineId === lineId && f.status === 'missing');
  const xs = fs.map((f) => f.x);
  const ys = fs.map((f) => f.y);
  return { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minY: Math.min(...ys) - pad, maxY: Math.max(...ys) + pad };
}

console.log('3) 框选断号检测（内部断号规则，避免选区边界误报）');
for (const [line, expectCount] of [['A', 5], ['E', 4], ['K', 4]]) {
  const res = runMarquee(rectAround(line));
  const rep = res.reports.find((r) => r.line === line);
  assert(!!rep, `框选识别出滑行道 ${line} 边灯组`);
  assert(rep?.ids.length === expectCount, `滑行道 ${line} 列出 ${expectCount} 个缺失编号（实际 ${rep?.ids.length}）：${rep?.ids.join(', ')}`);
  const allTWE = (rep?.ids ?? []).every((id) => id.startsWith(`TWE-${line}-`));
  assert(allTWE, `滑行道 ${line} 编号前缀正确`);
  // 选区不得混入其它类别的误报
  const others = res.reports.filter((r) => r.line !== line);
  assert(others.length === 0, `滑行道 ${line} 框选无其它类别误报（误报 ${others.length} 组）`);
}

console.log('4) 完好区域无误报');
const clean = ds.features.filter((f) => f.categoryId === 'twr_edge' && f.status === 'ok').slice(200, 260);
const rect = {
  minX: Math.min(...clean.map((f) => f.x)) - 30,
  maxX: Math.max(...clean.map((f) => f.x)) + 30,
  minY: Math.min(...clean.map((f) => f.y)) - 30,
  maxY: Math.max(...clean.map((f) => f.y)) + 30
};
const resClean = runMarquee(rect);
assert(resClean.reports.length === 0, `完好灯段零误报（报告数 ${resClean.reports.length}）`);

console.log('5) LOD 分级（阈值 + 全局 bias 滑杆联动）');
const cfg = ds.config;
const cat = cfg.categories.find((c) => c.id === 'twr_edge');
function lodLevel(mpp, bias) {
  const t1 = cat.thresholds.lod1 * bias;
  const t2 = cat.thresholds.lod2 * bias;
  if (mpp >= t2) return 2;
  if (mpp >= t1) return 1;
  return 0;
}
assert(lodLevel(0.1, 1) === 0, '近处 mpp=0.1 → 完整灯组');
assert(lodLevel(0.5, 1) === 1, '中距 mpp=0.5 → 抽稀');
assert(lodLevel(3, 1) === 2, '远处 mpp=3 → 聚合');
assert(lodLevel(0.5, 0.5) === 2, '滑杆调强（bias=0.5）后同距离提前聚合');
assert(lodLevel(0.5, 2) === 0, '滑杆调弱（bias=2）后同距离恢复完整');
// 障碍灯最低级别=1，不应被聚合
const obs = cfg.categories.find((c) => c.id === 'obstruction');
assert(obs.minLevel === 1, '障碍灯配置最低级别为「保留至抽稀」');

console.log('6) 进近灯光构型');
const approach = ds.features.filter((f) => f.categoryId === 'approach');
const groups = new Set(approach.map((f) => f.groupId));
assert(groups.size === 4, `2 条主跑道 × 两端 = 4 套进近灯组（实际 ${groups.size}）`);
const sample = approach[0];
assert(typeof sample.lat === 'number' && typeof sample.lon === 'number', '要素带经纬度');
assert(sample.id && sample.groupName && sample.designIndex !== undefined, '要素带编号/灯组/序号');
const flash = approach.filter((f) => f.flash);
assert(flash.length === 20, `顺序闪光灯 4 组 × 5 盏 = 20（实际 ${flash.length}）`);

console.log('7) 配置结构');
assert(cfg.categories.length >= 10, `配置覆盖全部 ${cfg.categories.length} 个类别`);
assert(cfg.categories.every((c) => c.thresholds.lod1 > 0 && c.thresholds.lod2 > c.thresholds.lod1), '每类两级阈值合法且 lod2 > lod1');

console.log(failures === 0 ? '\n全部通过 ✔' : `\n${failures} 项失败 ✘`);
process.exit(failures === 0 ? 0 : 1);
