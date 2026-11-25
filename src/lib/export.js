/* ── export.js · 交付物导出 ────────────────────────────────────────────────
 * 三种交付形态，都复用编辑器同一套采样引擎与渲染器：
 *   1. 独立播放器（单文件 HTML，内嵌工程 JSON）—— 交给展陈团队做互动演示
 *   2. WebM 视频（WebCodecs + webm-muxer）—— 给研究人员做汇报
 *   3. 工程 JSON —— 可再导入、可进版本管理
 * ─────────────────────────────────────────────────────────────────────── */

import { sampleScene } from './scene.js';
import { fitView, applyViewWorld } from './render-pixi.js';
import PLAYER_RUNTIME from 'virtual:player-runtime';

/** 安全文件名 */
export function safeName(name, ext) {
  const base = (name || 'eruption').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);
  return `${base}.${ext}`;
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ── 1. 独立播放器 ─────────────────────────────────────────────────────── */

/**
 * 生成单文件 HTML 播放器：PixiJS 从 CDN 引入（展陈端机器可联网），
 * 工程数据内联，渲染逻辑沿用编辑器同一份 sampleScene + 图元绘制实现。
 */
export function buildStandaloneHTML(doc, opts = {}) {
  const data = JSON.stringify(doc);
  const title = doc.name || '喷发演示';
  const chapters = doc.phases
    .map((p, i) => {
      const start = doc.phases.slice(0, i).reduce((a, q) => a + q.durF, 0);
      return `<button class="ch" data-frame="${start}">${i + 1}. ${escapeHtml(p.name)}</button>`;
    })
    .join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)} · 喷发过程演示</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #07080d; color: #ece6dd;
    font-family: system-ui, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif; overflow: hidden; }
  #wrap { position: fixed; inset: 0 0 84px 0; }
  #wrap canvas { width: 100% !important; height: 100% !important; display: block; object-fit: contain; }
  .bar { position: fixed; left: 0; right: 0; bottom: 0; height: 84px; display: flex; align-items: center;
    gap: 14px; padding: 0 18px; background: rgba(14,15,22,.94); border-top: 1px solid #232836; }
  .chs { display: flex; gap: 6px; overflow-x: auto; flex: 1; }
  .ch { flex: none; border: 1px solid #2c3342; background: #171b25; color: #b9b3bd; border-radius: 999px;
    padding: 6px 12px; font-size: 12px; cursor: pointer; white-space: nowrap; }
  .ch:hover { border-color: #ffab5c; color: #ffd2a3; }
  .ch.on { background: #3a2717; border-color: #ffab5c; color: #ffd9b0; }
  .ctrl { display: flex; align-items: center; gap: 8px; flex: none; }
  button.p { width: 42px; height: 42px; border-radius: 50%; border: 1px solid #3a4256; background: #202633;
    color: #fff; font-size: 16px; cursor: pointer; }
  button.p:hover { background: #2b3346; }
  .prog { flex: none; width: 260px; }
  input[type=range] { width: 100%; accent-color: #ffab5c; }
  .t { font-variant-numeric: tabular-nums; font-size: 12px; color: #8b8794; min-width: 92px; text-align: right; }
  .note { position: fixed; left: 18px; top: 16px; max-width: 560px; pointer-events: none; }
  .note h1 { margin: 0 0 4px; font-size: 17px; font-weight: 700; }
  .note p { margin: 0; font-size: 12px; color: #9b96a2; line-height: 1.5; }
  .loading { position: fixed; inset: 0; display: grid; place-content: center; color: #6b6875; font-size: 13px; }
</style>
</head>
<body>
<div id="wrap"></div>
<div class="loading" id="ld">正在载入喷发过程演示…</div>
<div class="note"><h1>${escapeHtml(title)}</h1><p id="cap"></p></div>
<div class="bar">
  <div class="chs">${chapters}</div>
  <div class="ctrl">
    <button class="p" id="play" aria-label="播放 / 暂停">▶</button>
    <div class="prog"><input type="range" id="seek" min="0" max="1" value="0" step="1" aria-label="进度" /></div>
    <div class="t" id="time">0 / 0</div>
  </div>
</div>
<script>window.__ERUPTION_DOC__ = ${data};</script>
<script>
/* 与编辑器同源的采样与绘制（构建期由 esbuild 打成单文件内联） */
${opts.runtime || PLAYER_RUNTIME}
</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

/* ── 2. WebM 视频录制 ───────────────────────────────────────────────────── */

/**
 * 用 WebCodecs 逐帧编码离线渲染，交给 webm-muxer 封装。
 * 每帧都调用与编辑器相同的 sampleScene + PlayerRenderer，因此成片与预览一致。
 */
export async function recordWebM(doc, renderer, canvas, opts = {}) {
  const fps = opts.fps || doc.fps || 24;
  const total = doc.phases.reduce((a, p) => a + p.durF, 0);
  // 编码尺寸取偶数（VP9 对奇数尺寸不友好）
  const w = Math.round(1920 * (opts.scale || 1) / 2) * 2;
  const h = Math.round(1080 * (opts.scale || 1) / 2) * 2;

  if (typeof VideoEncoder === 'undefined') {
    throw new Error('当前浏览器不支持 WebCodecs 视频编码（请用 Chrome / Edge 120+）');
  }

  const { Muxer, ArrayBufferTarget } = await import('webm-muxer');
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'V_VP9', width: w, height: h, frameRate: fps },
    firstTimestampBehavior: 'offset'
  });

  let cfg = null;
  for (const codec of ['vp09.00.10.08', 'vp09.00.51.08', 'vp8']) {
    try {
      const sup = await VideoEncoder.isConfigSupported({
        codec, width: w, height: h, bitrate: 8_000_000, framerate: fps
      });
      if (sup.supported) { cfg = codec; break; }
    } catch { /* 试下一个 */ }
  }
  if (!cfg) throw new Error('没有可用的 VP9 / VP8 编码配置');

  let encErr = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encErr = e; }
  });
  encoder.configure({
    codec: cfg, width: w, height: h, bitrate: 8_000_000, framerate: fps,
    latencyMode: 'realtime'          // 速度优先：离线逐帧提交，质量差异可忽略
  });

  const app = renderer.app;
  const prevW = canvas.width, prevH = canvas.height;
  if (canvas.width !== w || canvas.height !== h) {
    app?.renderer?.resize?.(w, h);
  }
  // 世界坐标 1920×1080 必须按输出尺寸做 fit 变换，否则内容会溢出画面外
  const view = fitView(1920, 1080, w, h);

  const progress = opts.onProgress || (() => {});
  for (let f = 0; f < total; f++) {
    if (encErr) throw encErr;
    const scene = sampleScene(doc, f, { labels: true, showGround: true, trackLegend: true });
    renderer.draw(scene.prims);
    applyViewWorld(renderer.root, view);
    app?.render?.();
    // 让出主线程，保证 UI 能刷新进度
    if (f % 4 === 0) {
      progress(f / total, `渲染 ${f + 1} / ${total}`);
      await new Promise((r) => setTimeout(r, 0));
    }
    const bitmap = await createImageBitmap(canvas);
    const frame = new VideoFrame(bitmap, {
      timestamp: Math.round((f * 1e6) / fps),
      duration: Math.round(1e6 / fps)
    });
    encoder.encode(frame, { keyFrame: f % 48 === 0 });
    frame.close();
    bitmap.close();
    while (encoder.encodeQueueSize > 8) {
      await new Promise((r) => setTimeout(r, 4));
    }
  }
  progress(1, '封装中…');
  await encoder.flush();
  encoder.close();
  if (encErr) throw encErr;
  muxer.finalize();

  // 恢复原尺寸
  if (prevW && prevH) app?.renderer?.resize?.(prevW, prevH);
  return new Blob([target.buffer], { type: 'video/webm' });
}

/* ── 3. 采样导出（供外部工具链） ──────────────────────────────────────── */

/** 导出全部帧的 JSON 采样（关键帧与轨道值），给研究人员的定量数据 */
export function sampleExport(doc) {
  const total = doc.phases.reduce((a, p) => a + p.durF, 0);
  const frames = [];
  for (let f = 0; f < total; f++) {
    const s = sampleScene(doc, f, { labels: false, showGround: false, ghost: false });
    frames.push({
      frame: f,
      phase: s.phaseIndex,
      u: +s.u.toFixed(4),
      cone: { preset: s.state.cone.presetId, sx: +s.state.cone.sx.toFixed(3), sy: +s.state.cone.sy.toFixed(3) },
      lava: s.lava ? { front: +s.lava.frontFrac.toFixed(4), overrunPx: +s.lava.overrun.toFixed(1) } : null,
      tephra: { thickness: +s.state.tephra.thickness.toFixed(3) }
    });
  }
  return { docName: doc.name, fps: doc.fps, totalFrames: total, phases: doc.phases.map((p) => ({ name: p.name, durF: p.durF })), frames };
}
