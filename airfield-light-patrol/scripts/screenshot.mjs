// 截两张图：近景完整灯组 + 选中要素弹窗
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9338;
const prof = join(tmpdir(), 'alpt-shot-prof');
mkdirSync(prof, { recursive: true });
const out = join(tmpdir(), 'alpt-verify');
mkdirSync(out, { recursive: true });

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
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => {
  const mid = ++id; pending.set(mid, res);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: 'http://localhost:5180/?shot=1' });
await sleep(8000);

// 局部视图放大到一条跑道入口，选中一盏进近灯
await evalJs(`(async () => {
  const e = window.__engines.detail;
  const f = e.features.find(x => x.id && x.id.startsWith('APL-05-05L23R-C0'));
  e.viewport.scale.set(3.2);
  e.viewport.moveCenter(f.x, f.y);
  e._syncTransformAndRender(true);
  e.handlers.onSelect(f.id);
  await new Promise(r => setTimeout(r, 800));
  return true;
})()`);
await sleep(600);
let shot = await send('Page.captureScreenshot', { format: 'png' });
const fs = await import('node:fs');
fs.writeFileSync(join(out, 'closeup.png'), Buffer.from(shot.result.data, 'base64'));

// 工程师视角截图
await evalJs(`[...document.querySelectorAll('.role-switch button')].find(b => b.textContent.includes('工程师')).click()`);
await sleep(500);
shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(join(out, 'engineer.png'), Buffer.from(shot.result.data, 'base64'));

console.log('saved to', out);
ws.close();
edge.kill();
