// 交互验证 v2：通过 window.__engines 直接驱动引擎，验证 LOD、拾取、旋转、框选、跨视图联动
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9337;
const prof = join(tmpdir(), 'alpt-interact3-prof');
mkdirSync(prof, { recursive: true });

const edge = spawn(EDGE, [
  '--headless=new', '--no-first-run', '--disable-gpu-sandbox',
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  `--user-data-dir=${prof}`, `--remote-debugging-port=${PORT}`,
  '--window-size=1680,980', 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p?.webSocketDebuggerUrl) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('no cdp');
}
const ws = new WebSocket(await getWs());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const errs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    errs.push(m.params.exceptionDetails.text + ' | ' + (m.params.exceptionDetails.exception?.description || '').split('\n')[0]);
  }
};
const send = (method, params = {}) => new Promise((res) => {
  const mid = ++id; pending.set(mid, res);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: 'http://localhost:5180/?interact3=1' });
await sleep(8000);

const R = {};

// 0) 引擎实例就绪
R.engines = await evalJs(`Object.keys(window.__engines || {})`);

// 1) 初始状态：全图视角应处于 LOD2 聚合
R.initialChips = await evalJs(`[...document.querySelectorAll('.lod-chip')].map(e => e.innerText.replace(/\\s+/g,' ').trim())`);

// 2) 局部视图放大到米级 → LOD0 完整灯组
R.zoomDetail = await evalJs(`(async () => {
  const e = window.__engines.detail;
  e.viewport.scale.set(1.2);
  e.viewport.moveCenter(0, 0);
  e._syncTransformAndRender(true);
  await new Promise(r => setTimeout(r, 300));
  return document.querySelectorAll('.map-view')[1].querySelector('.lod-chip').innerText.replace(/\\s+/g,' ').trim();
})()`);

// 2b) 继续放大到 0.2 m/px → LOD0 完整灯组（近处恢复完整灯组）
R.zoomFull = await evalJs(`(async () => {
  const e = window.__engines.detail;
  e.viewport.scale.set(5);
  e._syncTransformAndRender(true);
  await new Promise(r => setTimeout(r, 300));
  return document.querySelectorAll('.map-view')[1].querySelector('.lod-chip').innerText.replace(/\\s+/g,' ').trim();
})()`);

// 3) 放大后标注出现（灯组名/跑道名，碰撞避让后数量 > 0）
R.labelsAtZoom = await evalJs(`document.querySelectorAll('.map-view')[1].querySelectorAll('.map-label').length`);

// 4) 拾取：在原点附近找一盏完整灯，用引擎 _pick 验证
R.pick = await evalJs(`(() => {
  const e = window.__engines.detail;
  // 取中心视口内一盏跑道中线灯
  const f = e.features.find(x => x.categoryId === 'rwy_centerline' && Math.abs(x.x) < 50 && Math.abs(e.viewport.toScreen(x.x, x.y).x - 330) < 300);
  const picked = e._pick(f.x, f.y);
  return { target: f.id, picked, match: picked === f.id };
})()`);

// 5) 选中要素 → 弹窗 + 列表高亮（走真实 onSelect 链路）
R.selectFlow = await evalJs(`(async () => {
  const e = window.__engines.detail;
  const f = e.features.find(x => x.categoryId === 'approach');
  e.handlers.onSelect(f.id);
  await new Promise(r => setTimeout(r, 700));
  return {
    popupId: document.querySelector('.fp-id')?.textContent,
    popupGroup: [...document.querySelectorAll('.fp-row b')].map(b => b.textContent)[1],
    activeList: document.querySelector('.fl-row.active .fl-id')?.textContent,
    selectedLabel: [...document.querySelectorAll('.map-label.lb-feature')].map(l => l.textContent).includes(f.id)
  };
})()`);

// 6) 旋转局部视图 → 标注重新避让，数量保持合理（不重叠）
R.rotate = await evalJs(`(async () => {
  const e = window.__engines.detail;
  const before = document.querySelectorAll('.map-view')[1].querySelectorAll('.map-label').length;
  e.rotateBy(30);
  await new Promise(r => setTimeout(r, 200));
  const after = document.querySelectorAll('.map-view')[1].querySelectorAll('.map-label').length;
  // 检测标注矩形互不重叠
  const rects = [...document.querySelectorAll('.map-view')[1].querySelectorAll('.map-label')]
    .filter(el => el.style.display !== 'none')
    .map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  let overlap = 0;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) overlap++;
  }
  return { before, after, overlap, rotation: +e.viewport.rotation.toFixed(3) };
})()`);

// 7) 框选缺失分析：直接调引擎 _runMarquee，框住滑行道 A 预置缺失段
R.marquee = await evalJs(`(() => {
  const e = window.__engines.overview;
  const miss = e.features.filter(f => f.lineId === 'A' && f.status === 'missing');
  const xs = miss.map(f => f.x), ys = miss.map(f => f.y);
  const rect = { minX: Math.min(...xs) - 40, maxX: Math.max(...xs) + 40, minY: Math.min(...ys) - 40, maxY: Math.max(...ys) + 40 };
  // 截获 onMarquee 回调
  let captured = null;
  const orig = e.handlers.onMarquee;
  e.handlers.onMarquee = (p) => { captured = p; };
  e._runMarquee(rect);
  e.handlers.onMarquee = orig;
  const rep = captured.reports.find(r => r.lineId === 'A');
  return { reportCount: captured.reports.length, aMissing: rep?.missingIds, correct: rep?.missingIds.length === 5 };
})()`);

// 8) 跨视图联动：在 overview 选中 → detail 自动飞行（detail 中心应逼近要素坐标）
R.crossView = await evalJs(`(async () => {
  const ov = window.__engines.overview, dt = window.__engines.detail;
  const f = ov.features.find(x => x.id === 'TWE-B-R-010');
  ov.handlers.onSelect(f.id);
  await new Promise(r => setTimeout(r, 1000));
  const c = dt.viewport.center;
  return {
    target: { x: f.x, y: f.y },
    detailCenter: { x: +c.x.toFixed(1), y: +c.y.toFixed(1) },
    aligned: Math.hypot(c.x - f.x, c.y - f.y) < 60
  };
})()`);

console.log(JSON.stringify({ R, exceptions: errs.slice(0, 6) }, null, 2));
ws.close();
edge.kill();
process.exit(errs.length ? 2 : 0);
