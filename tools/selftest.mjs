/* 引擎自检：采样后输出 SVG 预览 + 数值断言。仅开发期使用。 */
import { sampleScene, samplePhase } from '../src/lib/scene.js';
import { projectFromTemplate, phaseStart, totalFrames } from '../src/lib/doc.js';
import fs from 'node:fs';

import { sceneToSvg } from '../src/lib/svg.js';

if (process.argv[1] && process.argv[1].endsWith('selftest.mjs')) {
  /* ── 运行自检 ────────────────────────────────────────────────────────── */

  const outDir = new URL('./out/', import.meta.url);
  fs.mkdirSync(outDir, { recursive: true });

  const report = [];
  function assert(cond, msg) {
    report.push(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
    if (!cond) process.exitCode = 1;
  }

  function finiteDeep(v, path = '') {
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return path;
      return null;
    }
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        const r = finiteDeep(v[i], `${path}[${i}]`);
        if (r) return r;
      }
      return null;
    }
    if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        const r = finiteDeep(v[k], `${path}.${k}`);
        if (r) return r;
      }
    }
    return null;
  }

  const tpls = ['strombolian', 'plinian', 'hawaiian', 'vulcanian', 'domegrowth'];
  let badFrames = 0;
  let totalSampled = 0;
  let maxOverrun = 0;

  for (const t of tpls) {
    const doc = projectFromTemplate(t);
    const total = totalFrames(doc);
    assert(total > 0, `${t}: 总帧数 ${total} > 0`);
    assert(doc.phases.length >= 4, `${t}: 阶段数 ${doc.phases.length} >= 4`);
    // 阶段起点严格递增
    let prev = -1;
    let mono = true;
    for (let i = 0; i < doc.phases.length; i++) {
      const s = phaseStart(doc, i);
      if (s <= prev) mono = false;
      prev = s;
    }
    assert(mono, `${t}: 阶段起点严格递增`);

    for (let f = 0; f < total; f += 3) {
      totalSampled++;
      const s = sampleScene(doc, f, { ghost: true, ghostLava: true, ghostTephra: true, labels: true, showGround: true, trackLegend: true });
      const bad = finiteDeep(s.prims);
      if (bad) {
        badFrames++;
        if (badFrames <= 3) report.push(`      非有限数值 @ ${t} frame ${f} ${bad}`);
      }
      if (s.lava) maxOverrun = Math.max(maxOverrun, s.lava.overrun);
    }
  }
  assert(badFrames === 0, `全部采样无 NaN/Infinity（采样 ${totalSampled} 帧）`);
  assert(maxOverrun === 0, `模板内前缘均不越过锥缘（最大 ${maxOverrun.toFixed(2)}px）`);

  /* 前缘 >1 时应越过锥缘，且越界像素随前缘单调增长 */
  {
    const doc = projectFromTemplate('strombolian');
    const ph = doc.phases[2];
    const vals = [];
    for (const front of [0.8, 1.0, 1.2, 1.5]) {
      ph.tracks.lava.keys = [{ id: 'k', u: 0, front, width: 1, dx: 0, dy: 0 }];
      const s = sampleScene(doc, phaseStart(doc, 2), {});
      vals.push([front, s.lava.overrun]);
    }
    assert(vals[0][1] === 0, `front=0.8 未越界（${vals[0][1].toFixed(1)}px）`);
    assert(vals[1][1] < 1, `front=1.0 恰好抵达锥缘（${vals[1][1].toFixed(1)}px）`);
    assert(vals[2][1] > 10 && vals[3][1] > vals[2][1], `front>1 越界量单调增长（1.2→${vals[2][1].toFixed(0)}px, 1.5→${vals[3][1].toFixed(0)}px）`);
  }

  /* 时长重排一致性：改中间阶段时长后，后续阶段起点应整体平移，
   * 且熔岩前缘在阶段末的取值不变（u 归一化存储） */
  {
    const doc = projectFromTemplate('strombolian');
    const idx = 1;
    const before = phaseStart(doc, idx + 1);
    const endFrontBefore = samplePhase(doc.phases[idx], 1).lava.front;
    const midBefore = samplePhase(doc.phases[idx], 0.5).lava.front;
    const doc2 = structuredClone(doc);
    doc2.phases[idx].durF += 48;
    const after = phaseStart(doc2, idx + 1);
    assert(after - before === 48, `改时长 +48f → 后续阶段起点平移 ${after - before}f`);
    const endFrontAfter = samplePhase(doc2.phases[idx], 1).lava.front;
    const midAfter = samplePhase(doc2.phases[idx], 0.5).lava.front;
    assert(Math.abs(endFrontAfter - endFrontBefore) < 1e-9 && Math.abs(midAfter - midBefore) < 1e-9,
      `同一 u 处前缘取值与时长无关（末 ${endFrontBefore.toFixed(4)}, 中 ${midBefore.toFixed(4)}）`);
  }

  /* 关键帧中点插值应落在两端之间 */
  {
    const doc = projectFromTemplate('strombolian');
    const ph = doc.phases[2];
    const a = samplePhase(ph, 0).lava.front;
    const b = samplePhase(ph, 1).lava.front;
    const m = samplePhase(ph, 0.5).lava.front;
    assert((m > Math.min(a, b) - 1e-9) && (m < Math.max(a, b) + 1e-9), `熔岩前缘中点插值在两端之间 (${a.toFixed(2)} → ${m.toFixed(2)} → ${b.toFixed(2)})`);
  }

  /* 输出 SVG 预览 */
  const doc = projectFromTemplate('plinian');
  const total = totalFrames(doc);
  const shots = [0, 0.2, 0.45, 0.7, 0.92].map((t) => Math.floor(t * (total - 1)));
  for (const f of shots) {
    const s = sampleScene(doc, f, { ghost: true, ghostLava: true, ghostTephra: true, labels: true, trackLegend: true });
    fs.writeFileSync(new URL(`plinian-${String(f).padStart(4, '0')}.svg`, outDir), sceneToSvg(s));
  }
  const doc2 = projectFromTemplate('strombolian');
  const total2 = totalFrames(doc2);
  for (const t of [0.15, 0.55, 0.85]) {
    const f = Math.floor(t * (total2 - 1));
    const s = sampleScene(doc2, f, { ghost: true, ghostLava: true, ghostTephra: true, labels: true });
    fs.writeFileSync(new URL(`strom-${String(f).padStart(4, '0')}.svg`, outDir), sceneToSvg(s));
  }

  console.log(report.join('\n'));
  console.log(`\n输出预览: out/*.svg`);

}
