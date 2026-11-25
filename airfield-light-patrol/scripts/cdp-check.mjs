// CDP 诊断：无头 Edge 打开应用，采集控制台异常，评估引擎运行时状态
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:5180/?cdp=1';
const PORT = 9333;
const prof = join(tmpdir(), 'alpt-cdp-prof');
mkdirSync(prof, { recursive: true });

const edge = spawn(
  EDGE,
  [
    '--headless=new',
    '--no-first-run',
    '--disable-gpu-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    `--user-data-dir=${prof}`,
    `--remote-debugging-port=${PORT}`,
    '--window-size=1680,980',
    'about:blank'
  ],
  { stdio: 'ignore' }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('CDP 端点不可用');
}

const wsUrl = await getWsUrl();
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    logs.push(`[异常] ${d.text} ${d.exception?.description ?? ''}`);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    logs.push('[console.error] ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    logs.push('[Log] ' + msg.params.entry.text);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.navigate', { url: URL });
await sleep(9000);

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result?.result?.value;
};

const state = await evalJs(`(() => {
  const chips = [...document.querySelectorAll('.lod-chip')].map(e => e.innerText.replace(/\\s+/g,' ').trim());
  const canvases = [...document.querySelectorAll('canvas')].map(c => ({ w: c.width, h: c.height }));
  const labels = document.querySelectorAll('.map-label').length;
  const gl = (() => {
    const c = document.querySelector('canvas');
    if (!c) return 'no-canvas';
    const g = c.getContext('webgl2') || c.getContext('webgl');
    return g ? (g.getParameter(g.VERSION)) : 'no-gl-context';
  })();
  return {
    title: document.title,
    chips,
    canvases,
    labels,
    gl,
    listRows: document.querySelectorAll('.fl-row').length,
    bodyText: document.body.innerText.slice(0, 200)
  };
})()`);

console.log('=== 运行时状态 ===');
console.log(JSON.stringify(state, null, 2));
console.log('=== 控制台异常（%d 条）===\n%s', logs.length, logs.join('\n') || '（无）');

ws.close();
edge.kill();
process.exit(logs.some((l) => l.includes('异常') || l.includes('error')) ? 2 : 0);
