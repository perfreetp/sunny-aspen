/* ── player/main.js · 独立播放器入口 ───────────────────────────────────────
 * 由 tools/build-player.mjs 用 esbuild 打成单文件 IIFE，内联进导出的 HTML。
 * 关键：这里 import 的是编辑器同一份 scene.js / render-pixi.js，
 * 所以“展陈端的播放”与“编辑器的预览”是同一套采样与绘制代码。
 * ─────────────────────────────────────────────────────────────────────── */

import { Application, Container } from 'pixi.js';
import { sampleScene } from '../lib/scene.js';
import { StageRenderer, fitView, applyViewWorld } from '../lib/render-pixi.js';

const DOC = window.__ERUPTION_DOC__;
if (DOC) boot(DOC);

async function boot(doc) {
  const host = document.getElementById('wrap');
  const total = Math.max(1, doc.phases.reduce((a, p) => a + p.durF, 0));
  const fps = doc.fps || 24;

  const app = new Application();
  await app.init({
    background: 0x07080d,
    antialias: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
    resizeTo: host,
    preference: 'webgl'
  });
  host.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);
  const R = new StageRenderer(world);

  let view = fitView(1920, 1080, host.clientWidth, host.clientHeight);
  const refit = () => {
    view = fitView(1920, 1080, host.clientWidth, host.clientHeight);
    if (lastScene) renderAt(current);
  };
  new ResizeObserver(refit).observe(host);

  let current = 0;
  let playing = true;
  let lastScene = null;

  const seek = document.getElementById('seek');
  const timeEl = document.getElementById('time');
  const capEl = document.getElementById('cap');
  const playBtn = document.getElementById('play');
  const chips = Array.from(document.querySelectorAll('.ch'));
  const starts = [];
  {
    let acc = 0;
    for (const p of doc.phases) { starts.push(acc); acc += p.durF; }
  }

  function renderAt(f) {
    current = Math.max(0, Math.min(total - 1, f));
    const scene = sampleScene(doc, current, {
      labels: false,
      showGround: true,
      trackLegend: true,
      mode: 'play'
    });
    lastScene = scene;
    R.draw(scene.prims);
    applyViewWorld(world, view);
    seek.value = String(Math.round(current));
    timeEl.textContent = `${(current / fps).toFixed(2)}s / ${(total / fps).toFixed(2)}s`;
    if (capEl) {
      const p = doc.phases[scene.phaseIndex];
      capEl.textContent = p ? `${p.name}${p.note ? ' · ' + p.note : ''}` : '';
    }
    chips.forEach((b, i) => b.classList.toggle('on', i === scene.phaseIndex));
  }

  seek.max = String(total - 1);
  seek.addEventListener('input', () => { playing = false; syncPlayBtn(); renderAt(+seek.value); });
  playBtn.addEventListener('click', () => { playing = !playing; syncPlayBtn(); last = performance.now(); });
  chips.forEach((b, i) => b.addEventListener('click', () => { renderAt(starts[i]); }));
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') { playing = !playing; syncPlayBtn(); last = performance.now(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { playing = false; syncPlayBtn(); renderAt(current + (e.shiftKey ? 10 : 1)); }
    else if (e.key === 'ArrowLeft') { playing = false; syncPlayBtn(); renderAt(current - (e.shiftKey ? 10 : 1)); }
  });
  function syncPlayBtn() { if (playBtn) playBtn.textContent = playing ? '⏸' : '▶'; }

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(120, now - last);
    last = now;
    if (playing) {
      let f = current + (dt / 1000) * fps;
      if (f >= total - 1) f = 0;
      renderAt(f);
    }
    requestAnimationFrame(tick);
  }

  document.getElementById('ld')?.remove();
  renderAt(0);
  requestAnimationFrame(tick);
}
