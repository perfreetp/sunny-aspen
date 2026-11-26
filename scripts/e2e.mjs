import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5179';
const outDir = process.env.SHOT_DIR ?? 'shots-e2e';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('canvas.canvas');
await page.waitForTimeout(700);

const stat = (label) =>
  page.evaluate((l) => {
    const els = [...document.querySelectorAll('.stat')];
    const el = els.find((e) => e.querySelector('.stat-label')?.textContent?.includes(l));
    return el?.querySelector('.stat-value')?.textContent ?? null;
  }, label);

const num = (s) => Number(String(s ?? '').replace(/[^\d.-]/g, '')) || 0;

const shot = async (n) => page.screenshot({ path: `${outDir}/${n}.png` });

const scene = () => page.evaluate(() => window.__irrigationScene);
const canvasRect = () => page.locator('canvas.canvas').boundingBox();

/** Scene coords are canvas CSS px; convert to page coords. */
const toPage = async (pt) => {
  const r = await canvasRect();
  return { x: r.x + pt.x, y: r.y + pt.y };
};

/** A point on the branch line that is clear of any emitter dot. */
const clearPointOnBranch = async (index) => {
  const s = await scene();
  const b = s.branches.find((x) => x.index === index);
  const ys = b.emitters.map((e) => e.y).sort((a, c) => a - c);
  for (let f = 0.15; f < 0.9; f += 0.05) {
    const y = b.y1 + (b.y2 - b.y1) * f;
    if (ys.every((ey) => Math.abs(ey - y) > 9)) return { x: b.x1, y };
  }
  return { x: b.x1, y: b.y1 + 12 };
};

const clickBranch = async (index) => {
  const pt = await clearPointOnBranch(index);
  const p = await toPage(pt);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(220);
};

const preset = async (id) => {
  await page.selectOption('.preset-select', id);
  await page.waitForTimeout(750);
};

const facts = () =>
  page.evaluate(() => {
    const out = {};
    for (const f of document.querySelectorAll('.facts .fact')) {
      const k = f.querySelector('dt')?.textContent?.trim();
      const v = f.querySelector('dd')?.textContent?.trim();
      if (k) out[k] = v;
    }
    return out;
  });

// ── 1. main from headworks to tail, sized pipe ───────────────────────────────
const pipes1 = await page.$$eval('.project-panel tbody tr', (rows) =>
  rows.map((r) => [...r.children].map((c) => c.textContent.trim())),
);
const hasDn = pipes1.length > 0 && pipes1.every((r) => /^DN\d+$/.test(r[0]));
check(
  '1 主管自首部至棚尾、管径取自设备参数',
  hasDn,
  pipes1.map((r) => `${r[0]} ${r[1]}m`).join(', ') || '无管材',
);

// ── 2/3. auto laterals, auto emitters ────────────────────────────────────────
const branchCount = num(await stat('支管'));
const dripCount = num(await stat('滴头'));
const sprCount = num(await stat('喷头'));
check('2 主管上按支管间距自动分出支管', branchCount >= 8, `${branchCount} 条支管`);
check(
  '3 支管自动排滴头、喷头区段按射程排布',
  dripCount > 100 && sprCount > 0,
  `滴头 ${dripCount} 个 / 喷头 ${sprCount} 个`,
);

// verify emitters really sit inside the sprinkler zone and are spaced by radius
// Sprinkler pitch must equal 射程 × 间距系数. The default branch only carries one
// sprinkler, so measure on the sprinkler-heavy preset (4 m × 1.2 = 4.8 m).
await page.selectOption('.preset-select', 'sprinkler');
await page.waitForTimeout(800);
const layoutCheck = await page.evaluate(() => {
  const s = window.__irrigationScene;
  const br = s.branches.find((b) => b.emitters.filter((e) => e.type === 'sprinkler').length > 1) ??
    s.branches[0];
  const spr = br.emitters.filter((e) => e.type === 'sprinkler');
  const gaps = spr.slice(1).map((e, i) => e.s - spr[i].s);
  const mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  return { spr: spr.length, meanPitchM: mean };
});
const sprPitchOk = Math.abs(layoutCheck.meanPitchM - 4.8) < 0.2;
check(
  '3b 喷头按射程 × 间距系数排布',
  sprPitchOk,
  `${layoutCheck.spr} 个喷头/支管,平均间距 ${layoutCheck.meanPitchM.toFixed(2)} m (射程 4 m × 1.2 = 4.80 m)`,
);
await page.selectOption('.preset-select', 'standard');
await page.waitForTimeout(700);

// ── 8. pressure zoning + end labels ─────────────────────────────────────────
const zoneInfo = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('.pressure-cell')];
  return cells.map((c) => c.querySelector('b')?.textContent);
});
check(
  '8 首部起压力分段、每段末端挂压力标注',
  zoneInfo.length >= 2 && zoneInfo.every((v) => Number(v) > 0),
  `${zoneInfo.length} 段 ${zoneInfo.join('/')} kPa`,
);

// ── 4. over-limit → yellow + advice ─────────────────────────────────────────
await preset('overdrop');
const yellow = await page.evaluate(() => {
  // the plan colours over-budget segments amber; sample the canvas pixels
  const c = document.querySelector('canvas');
  const ctx = c.getContext('2d');
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  let amber = 0;
  let red = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (r > 195 && r < 245 && g > 140 && g < 200 && b < 110) amber += 1;
    if (r > 150 && g < 90 && b < 90) red += 1;
  }
  return { amber, red };
});
await page.locator('.tab', { hasText: '校核' }).click();
await page.waitForTimeout(250);
const adviceTexts = await page.$$eval('.warning-advice', (els) => els.map((e) => e.textContent));
await shot('e2e-04-overdrop');
check(
  '4 超允许压降的段标黄并提示加粗/缩短',
  yellow.amber > 200 && adviceTexts.some((t) => /DN\d|缩短/.test(t)),
  `黄色像素 ${yellow.amber},建议「${adviceTexts.find((t) => /DN|缩短/.test(t))?.slice(2, 54) ?? '无'}」`,
);

// ── 5. change upstream diameter → downstream recomputed, hand edits kept ─────
await preset('standard');
await clickBranch(6);
await page.locator('.tab', { hasText: '工程' }).click();
await page.waitForTimeout(200);
const pinnedBefore = (await facts())['手动修改'];
const branchBefore = (await scene()).branches.find((b) => b.index === 6);
const kpaBefore = await page.$$eval('.pressure-cell b', (els) => els.map((e) => e.textContent).join(','));

// drag branch 6 along the main by 40 px
const from = await toPage(await clearPointOnBranch(6));
await page.mouse.move(from.x, from.y);
await page.mouse.down();
await page.mouse.move(from.x + 44, from.y, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(500);
const movedU = (await scene()).branches.find((b) => b.index === 6).u;
const chip = await page.evaluate(() => document.querySelector('.selection-chip')?.textContent ?? '');
check(
  '5a 拖动支管 → 记为该支管的手动位置',
  /手动定位/.test(chip) && Math.abs(movedU - branchBefore.u) > 0.1,
  `u ${branchBefore.u.toFixed(2)} → ${movedU.toFixed(2)} m`,
);

// change the head diameter
const pipeSel = page.locator('.param-group .field', { hasText: '首部主管管径' }).locator('select');
await pipeSel.selectOption('pe63');
await page.waitForTimeout(800);
const afterBig = await scene();
const movedAfter = afterBig.branches.find((b) => b.index === 6).u;
const kpaAfter = await page.$$eval('.pressure-cell b', (els) => els.map((e) => e.textContent).join(','));
// the drag switched the panel to 支管; go back to 工程 to read the override count
await page.locator('.tab', { hasText: '工程' }).click();
await page.waitForTimeout(250);
const pinnedAfter = (await facts())['手动修改'];
await shot('e2e-05-bigger-main');
check(
  '5 改上游主管管径 → 下游自动重算,手调支管保留',
  Math.abs(movedAfter - movedU) < 0.02 && kpaAfter !== kpaBefore && pinnedAfter === '1 处',
  `支管仍在 ${movedAfter.toFixed(2)} m;压力段 ${kpaBefore} → ${kpaAfter};手动 ${pinnedBefore} → ${pinnedAfter}`,
);

// ── 7. seed reproducibility ─────────────────────────────────────────────────
await preset('standard');
await page.locator('.tab', { hasText: '工程' }).click();
await page.waitForTimeout(250);
const setSeed = async (v) => {
  const f = page.locator('.param-group', { hasText: '种子与复现' }).locator('input').first();
  await f.fill(String(v));
  await f.blur();
  await page.waitForTimeout(450);
};
const snapshot = async () =>
  page.evaluate(() =>
    JSON.stringify(
      window.__irrigationScene.branches.map((b) => ({
        u: Math.round(b.u * 100) / 100,
        e: b.emitters.map((e) => Math.round(e.y * 10) / 10),
      })),
    ),
  );
await setSeed(4242);
const snapA = await snapshot();
const fpA = (await facts())['布置指纹'];
await setSeed(99);
const snapB = await snapshot();
const fpB = (await facts())['布置指纹'];
await setSeed(4242);
const snapA2 = await snapshot();
const fpA2 = (await facts())['布置指纹'];
check(
  '7 同参数 + 同种子 → 支管与滴头排布完全一致',
  snapA === snapA2 && snapA !== snapB && fpA === fpA2 && /^[0-9a-f]{8}$/.test(fpA ?? ''),
  `指纹 ${fpA} / ${fpB} / ${fpA2}`,
);

// ── 9. aisle crossings: red boxes + list ────────────────────────────────────
await preset('aisle');
const red = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  let hits = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 165 && data[i] < 215 && data[i + 1] < 80 && data[i + 2] < 70) hits += 1;
  }
  return hits;
});
await page.locator('.tab', { hasText: '穿道清单' }).click();
await page.waitForTimeout(250);
const rows = await page.$$eval('.conflict-table tbody tr', (trs) =>
  trs.map((r) => [...r.children].map((c) => c.textContent.trim())),
);
await shot('e2e-09-aisle');
check(
  '9 支管穿作业道 → 红框圈出 + 清单',
  rows.length > 0 && red > 300,
  `${rows.length} 条:${rows.map((r) => `Z${r[0]?.replace(/Z/, '')}@${r[1]}m`).join(', ')};红色像素 ${red}`,
);

const fixBtn = page.locator('.conflict-table .link-strong').first();
if (await fixBtn.count()) {
  await fixBtn.click();
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => document.querySelectorAll('.conflict-table tbody tr').length);
  check('9b 一键移开后清单同步减少', after < rows.length, `${rows.length} → ${after}`);
  await shot('e2e-09b-aisle-fixed');
}

// ── 6. drag one emitter → only that branch's spacing changes ───────────────
await preset('standard');
await clickBranch(3);
await page.waitForTimeout(300);
const branchRowsBefore = await page.$$eval('.branch-row', (rs) => rs.length);
const spacingBefore = await page.evaluate(
  () => document.querySelector('.branch-edits input')?.value ?? '',
);
const sb = await scene();
const br3 = sb.branches.find((b) => b.index === 3);
// emitters become individual targets only once they are drawn far apart, so
// zoom in on the branch before grabbing one (same as a technician would)
await clickBranch(3);
// Zoom until single emitters resolve, then pan so the whole branch stays in
// view (zooming at the cursor pushes the far end off-canvas otherwise).
const bp = await toPage(await clearPointOnBranch(3));
const crPre = await canvasRect();
// Zoom in until the branch's splitters resolve, then drag the canvas so the
// whole lateral sits in view (zooming at a cursor pushes one end off-canvas).
// Zoom centred on branch 3 itself so it stays on screen.
const bp0 = await toPage(await clearPointOnBranch(3));
const zoomAt = {
  x: Math.min(Math.max(bp0.x, crPre.x + 30), crPre.x + crPre.width - 30),
  y: Math.min(Math.max(bp0.y, crPre.y + 30), crPre.y + crPre.height - 30),
};
await page.mouse.move(zoomAt.x, zoomAt.y);
for (let i = 0; i < 4; i++) {
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(120);
}
await page.waitForTimeout(400);
await page.mouse.move(crPre.x + crPre.width / 2, crPre.y + crPre.height / 2);
await page.mouse.down();
await page.mouse.move(crPre.x + crPre.width / 2 + 40, crPre.y + crPre.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(350);
const s2 = await scene();
const b2 = s2.branches.find((b) => b.index === 3);
const inView = b2.emitters.filter(
  (e) => e.x > 20 && e.x < crPre.width - 20 && e.y > 20 && e.y < crPre.height - 20,
);
const target2 = inView[Math.floor(inView.length / 2)] ?? b2.emitters[0];
const dragPt = await toPage({ x: target2.x, y: target2.y });
await page.mouse.move(dragPt.x, dragPt.y);
await page.mouse.down();
await page.mouse.move(dragPt.x, dragPt.y + 34, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(600);
const spacingAfter = await page.evaluate(
  () => document.querySelector('.branch-edits input')?.value ?? '',
);
const sa = await scene();
const worldOf = (sc, idx) =>
  JSON.stringify(sc.branches.find((b) => b.index === idx).emitters.map((e) => Math.round(e.s * 1000)));
// compare in world units (screen pixels shift with pan/zoom)
const othersUnequal = sb.branches
  .filter((b) => b.index !== 3)
  .every((b) => worldOf(sa, b.index) === worldOf(sb, b.index));
const draggedBranchChanged = worldOf(sa, 3) !== worldOf(sb, 3);
await shot('e2e-06-emitter');
check(
  '6 拖一个滴头改间距 → 只影响这一条支管',
  draggedBranchChanged && othersUnequal && (await page.$$eval('.branch-row', (rs) => rs.length)) === branchRowsBefore,
  `间距 ${spacingBefore || '—'} → ${spacingAfter || '—'} m,其余支管未变`,
);

// ── SVG export ─────────────────────────────────────────────────────────────
const [dl] = await Promise.all([
  page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
  page.locator('.btn', { hasText: '导出 SVG' }).click(),
]);
check('导出 SVG 图纸', Boolean(dl), dl ? await dl.suggestedFilename() : '未触发');

// ── CSV export ─────────────────────────────────────────────────────────────
await page.locator('.dropdown summary').click();
const [csv] = await Promise.all([
  page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
  page.locator('.dropdown-panel button', { hasText: '分段水力计算表' }).click(),
]);
check('导出分段水力计算表 CSV', Boolean(csv), csv ? await csv.suggestedFilename() : '未触发');

const failed = results.filter((r) => !r.ok);
console.log('');
if (errors.length) console.log('PAGE ERRORS', JSON.stringify(errors, null, 1));
console.log(`${results.length - failed.length}/${results.length} checks passed`);
await browser.close();
process.exit(failed.length ? 1 : 0);
