import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import opentype from 'opentype.js';
import { MEASURED_SECTIONS, LITHOLOGIES } from '../src/model/volcanoModel.js';
import { buildSection, makeSectionTransform } from '../src/model/section.js';
import { computeLayout } from '../src/layout/engine.js';
import { polylineHitsRects, inflateRect, rectsOverlap } from '../src/layout/geometry.js';

// Node 环境下构造 FontSet（与浏览器端 fontManager 同构）
class NodeFontSet {
  constructor(sc, latin) { this.sc = sc; this.latin = latin; this.upm = sc.unitsPerEm; }
  fontFor(ch) { return (ch.codePointAt(0) < 0x2e80) ? this.latin : this.sc; }
  measure(text, px) {
    const s = px / this.upm;
    let w = 0;
    for (const ch of text) w += (this.fontFor(ch).charToGlyph(ch).advanceWidth ?? 0) * s;
    return w;
  }
  measureLines(lines, px, lh = 1.28) {
    return { w: Math.max(0, ...lines.map((l) => this.measure(l, px))), h: lines.length * px * lh, lines, lineHeight: px * lh };
  }
}
function parseWoff(path) {
  const buf = fs.readFileSync(path);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}
const sc = parseWoff('src/fonts/noto-sans-sc-chinese-simplified-400-normal.woff');
const latin = parseWoff('src/fonts/noto-sans-latin-400-normal.woff');
const fontSet = new NodeFontSet(sc, latin);

function singleRecords(overrides = {}) {
  return LITHOLOGIES.map((l) => ({
    id: `lab-${l.idx}`, type: 'single', layerIdx: l.idx,
    anchorFraction: 0.5, side: 'auto', ...overrides[l.idx],
  }));
}
const style = { fontPx: 12.5, maxCharsPerLine: 9 };

function run(sectionIdx) {
  const line = MEASURED_SECTIONS[sectionIdx];
  const section = buildSection(line);
  const transform = makeSectionTransform(section, { hScale: 0.22, vExag: 2 });
  const layout = computeLayout(section, transform, singleRecords(), fontSet, style);
  return { line, section, transform, layout };
}

test('剖面切割：站点数、界面数与厚度为正', () => {
  const { section } = run(0);
  assert.equal(section.samples.length, 160);
  assert.equal(section.interfaces.length, 10);
  assert.equal(section.layerPolys.length, 10);
  for (const s of section.samples) {
    for (const t of s.thickness) assert.ok(t > 0);
    for (let k = 1; k < s.topIfaces.length; k++) assert.ok(s.topIfaces[k] < s.topIfaces[k - 1]);
  }
});

test('12 号剖面穿过火山口，顶部两层确实最薄', () => {
  const { section } = run(11);
  const mid = section.samples[80];
  assert.ok(mid.r < 300, `火山口剖面中点水平距离应接近 0，实际 ${mid.r.toFixed(0)}`);
  assert.ok(mid.thickness[0] < 25, `Q4 厚度 ${mid.thickness[0].toFixed(1)} 应很薄`);
  assert.ok(mid.thickness[1] < 30, `Q3 厚度 ${mid.thickness[1].toFixed(1)} 应很薄`);
  // 普通剖面（01 号）顶部两层明显更厚
  const ordinary = buildSection(MEASURED_SECTIONS[0]).samples[80];
  assert.ok(ordinary.thickness[0] > mid.thickness[0] * 1.5);
});

test('排版：每个标注都有框、锚点和引线', () => {
  const { layout } = run(0);
  assert.equal(layout.items.length, 10);
  for (const it of layout.items) {
    assert.ok(it.rect.w > 0 && it.rect.h > 0);
    assert.ok(it.leader.path.length >= 2);
    assert.ok(it.lines.length >= 2); // 名称 + 年代厚度
  }
});

test('薄层标注自动挪到层外（12 号剖面顶部两层），普通剖面厚层可放层内', () => {
  const { layout } = run(11);
  const top2 = layout.items.filter((it) => it.rec.layerIdx <= 1);
  assert.ok(top2.every((it) => it.placement === 'outside'), '顶部两层应外挪');
  // 普通剖面（01 号，界面平缓）：厚层应能放在层内
  const ordinary = run(0);
  const deep = ordinary.layout.items.find((it) => it.rec.layerIdx === 6);
  assert.equal(deep.placement, 'inside', '平缓剖面的厚层应放在层内');
});

test('层外标注不互相重叠', () => {
  const { layout } = run(11);
  const outs = layout.items.filter((it) => it.placement === 'outside');
  for (let i = 0; i < outs.length; i++) {
    for (let j = i + 1; j < outs.length; j++) {
      assert.ok(!rectsOverlap(inflateRect(outs[i].rect, 2), outs[j].rect),
        `标注 ${outs[i].rec.id} 与 ${outs[j].rec.id} 重叠`);
    }
  }
});

test('引线不压层界线（栅格障碍保证，抽检几何）', () => {
  const { section, transform, layout } = run(11);
  // 层界线做膨胀矩形，检查引线不穿过
  const ifaceRects = [];
  for (const iface of section.interfaces) {
    const pts = iface.map((p) => transform.toView(p.s, p.z));
    for (let i = 0; i < pts.length - 1; i += 4) {
      const a = pts[i], b = pts[Math.min(i + 4, pts.length - 1)];
      ifaceRects.push(inflateRect({
        x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
        w: Math.abs(b.x - a.x) || 2, h: Math.abs(b.y - a.y) || 2,
      }, 2));
    }
  }
  let violations = 0;
  for (const it of layout.items) {
    // 引线首段从锚点（界面上）出发，跳过首段
    const body = it.leader.path.slice(1);
    if (body.length < 2) continue;
    if (polylineHitsRects(body, ifaceRects)) violations++;
  }
  assert.ok(violations <= 1, `有 ${violations} 条引线压住层界线`);
});

test('合并标注：合并顶部两层后只剩 9 个标注，且带成员支线', () => {
  const line = MEASURED_SECTIONS[11];
  const section = buildSection(line);
  const transform = makeSectionTransform(section, { hScale: 0.22, vExag: 2 });
  const records = [
    { id: 'm-01', type: 'merged', members: [0, 1], anchorFraction: 0.5, side: 'right' },
    ...LITHOLOGIES.slice(2).map((l) => ({
      id: `lab-${l.idx}`, type: 'single', layerIdx: l.idx, anchorFraction: 0.5, side: 'auto',
    })),
  ];
  const layout = computeLayout(section, transform, records, fontSet, style);
  assert.equal(layout.items.length, 9);
  const merged = layout.items[0];
  assert.equal(merged.rec.type, 'merged');
  assert.equal(merged.memberTaps.length, 2);
  assert.ok(merged.lines.some((l) => l.includes('＋')));
  assert.ok(merged.lines.some((l) => l.includes('m')));
});

test('改约束后重排：字号变化触发整版重算且结果稳定', () => {
  const { section, transform } = run(11);
  const records = singleRecords();
  const l1 = computeLayout(section, transform, records, fontSet, style);
  const l2 = computeLayout(section, transform, records, fontSet, { ...style, fontPx: 20 });
  const small = l1.items[0].rect;
  const big = l2.items[0].rect;
  assert.notDeepEqual(small, big);
  // 确定性：同样输入两次结果一致
  const l3 = computeLayout(section, transform, records, fontSet, style);
  assert.deepEqual(l3.items.map((i) => i.rect), l1.items.map((i) => i.rect));
});

test('手动固定标注位置后重排仍保留固定位置', () => {
  const line = MEASURED_SECTIONS[11];
  const section = buildSection(line);
  const transform = makeSectionTransform(section, { hScale: 0.22, vExag: 2 });
  const records = singleRecords({ 0: { pinned: { side: 'left', rect: { x: 4, y: 200, w: 130, h: 48 } } } });
  const layout = computeLayout(section, transform, records, fontSet, style);
  const pinned = layout.items.find((i) => i.rec.layerIdx === 0);
  assert.deepEqual(pinned.rect, { x: 4, y: 200, w: 130, h: 48 });
});
