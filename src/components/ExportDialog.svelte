<script>
  /* ExportDialog —— 交付物：独立播放器 / WebM 视频 / 采样数据 */
  import { studio } from '../lib/store.svelte.js';
  import { buildStandaloneHTML, recordWebM, sampleExport, downloadBlob, safeName } from '../lib/export.js';
  import { createRenderer, StageRenderer } from '../lib/render-pixi.js';
  import { W, H } from '../lib/scene.js';

  let { open = $bindable(false) } = $props();

  let tab = $state('player');
  let busy = $state(false);
  let progress = $state(0);
  let progressMsg = $state('');
  let err = $state(null);
  let done = $state(null);
  let videoScale = $state(1);

  const total = $derived(studio.total);
  const seconds = $derived(total / (studio.doc.fps || 24));

  function close() {
    if (busy) return;
    open = false;
    err = null;
    done = null;
    progress = 0;
  }

  async function exportPlayer() {
    busy = true; err = null; done = null;
    try {
      const doc = structuredClone($state.snapshot(studio.doc));
      const html = buildStandaloneHTML(doc);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      downloadBlob(blob, safeName(doc.name + '-演示', 'html'));
      done = {
        title: '独立播放器已导出',
        lines: [
          '单文件 HTML，内含 PixiJS 运行时与全部工程数据，可离线双击打开',
          '适合交给展陈团队做互动演示：支持阶段章节跳转、播放/暂停、逐帧',
          good()
        ]
      };
    } catch (e) {
      err = e?.message || String(e);
    } finally {
      busy = false;
    }
  }

  async function exportVideo() {
    busy = true; err = null; done = null; progress = 0;
    try {
      // 离屏画布：与编辑器同一渲染器
      const off = document.createElement('div');
      off.style.cssText = 'position:fixed;left:-10000px;top:0;width:1920px;height:1080px';
      document.body.appendChild(off);
      const r = await createRenderer(off, W, H);
      const R = new StageRenderer(r.world);
      R.app = r.app;
      const doc = structuredClone($state.snapshot(studio.doc));
      progressMsg = '正在编码…';
      const blob = await recordWebM(doc, R, r.app.canvas, {
        scale: videoScale,
        onProgress: (p, m) => { progress = p; progressMsg = m; }
      });
      r.app.destroy(true, { children: true });
      off.remove();
      downloadBlob(blob, safeName(doc.name, 'webm'));
      done = {
        title: 'WebM 视频已导出',
        lines: [
          `${videoScale === 1 ? '1920×1080' : videoScale === 0.5 ? '960×540' : '1280×720'} · ${studio.doc.fps}fps · VP9`,
          '逐帧离线渲染，与编辑器预览逐像素一致',
          '可直接用于汇报演示，或导入剪辑软件'
        ]
      };
    } catch (e) {
      err = e?.message || String(e);
    } finally {
      busy = false;
      progress = 0;
    }
  }

  function exportSamples() {
    const data = sampleExport(structuredClone($state.snapshot(studio.doc)));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, safeName(studio.doc.name + '-逐帧采样', 'json'));
    done = {
      title: '逐帧采样数据已导出',
      lines: [
        `${data.totalFrames} 帧的锥体缩放 / 熔岩前缘 / 碎屑层厚度数值`,
        '适合研究人员做前缘推进速率、越界量的定量分析'
      ]
    };
  }

  function good() {
    return `总时长 ${seconds.toFixed(1)} 秒 · ${total} 帧 · ${studio.phaseCount} 个阶段`;
  }
</script>

{#if open}
  <div class="backdrop" role="presentation" onclick={close} onkeydown={(e) => e.key === 'Escape' && close()}></div>
  <div class="dlg" role="dialog" aria-modal="true" aria-label="导出动画">
    <header>
      <h2>导出 / 交付</h2>
      <button class="x" onclick={close} disabled={busy} aria-label="关闭">×</button>
    </header>

    <nav class="tabs">
      <button class:on={tab === 'player'} onclick={() => (tab = 'player')}>独立播放器</button>
      <button class:on={tab === 'video'} onclick={() => (tab = 'video')}>WebM 视频</button>
      <button class:on={tab === 'data'} onclick={() => (tab = 'data')}>逐帧采样</button>
    </nav>

    <div class="body">
      {#if tab === 'player'}
        <p class="lead">把排好的动画打成<strong>单文件 HTML</strong>，交给展陈团队做成互动演示。</p>
        <ul class="pts">
          <li>内含 PixiJS 运行时与全部工程数据，双击即可打开，无需联网</li>
          <li>按阶段分章跳转，所见即所得（与编辑器同一套采样与渲染）</li>
          <li>可后期在播放器里嵌入触摸屏 / 大屏</li>
        </ul>
        <div class="meta">{good()}</div>
        <button class="btn primary wide" onclick={exportPlayer} disabled={busy}>生成并下载 HTML 播放器</button>
      {:else if tab === 'video'}
        <p class="lead">逐帧离线渲染成 <strong>WebM</strong> 视频，给研究人员做喷发过程汇报。</p>
        <label class="row">
          <span>分辨率</span>
          <div class="seg">
            <button aria-pressed={videoScale === 1} onclick={() => (videoScale = 1)}>1920×1080</button>
            <button aria-pressed={videoScale === 0.667} onclick={() => (videoScale = 0.667)}>1280×720</button>
            <button aria-pressed={videoScale === 0.5} onclick={() => (videoScale = 0.5)}>960×540</button>
          </div>
        </label>
        <div class="meta">{seconds.toFixed(1)} 秒 · {total} 帧 · {studio.doc.fps}fps · VP9</div>
        {#if busy}
          <div class="prog"><div class="fill" style="width:{progress * 100}%"></div></div>
          <p class="pm">{progressMsg}</p>
        {/if}
        <button class="btn primary wide" onclick={exportVideo} disabled={busy}>渲染并下载 WebM</button>
      {:else}
        <p class="lead">导出每一帧的<strong>定量采样</strong>，供研究人员分析前缘推进与越界量。</p>
        <ul class="pts">
          <li>每帧：阶段序号、阶段内进度 u、锥体缩放、熔岩前缘位置、越过锥缘像素、碎屑层厚度</li>
          <li>JSON 格式，可直接进表格或脚本</li>
        </ul>
        <div class="meta">{good()}</div>
        <button class="btn primary wide" onclick={exportSamples} disabled={busy}>下载逐帧采样 JSON</button>
      {/if}

      {#if err}<p class="errbox">导出失败：{err}</p>{/if}
      {#if done}
        <div class="donebox">
          <strong>{done.title}</strong>
          {#each done.lines as l}<p>{l}</p>{/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(4,5,9,.72); z-index: 100; backdrop-filter: blur(2px); }
  .dlg {
    position: fixed; z-index: 101; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow: auto;
    background: var(--bg2); border: 1px solid var(--line2); border-radius: 12px;
    box-shadow: 0 24px 80px rgba(0,0,0,.6); display: flex; flex-direction: column;
  }
  header { display: flex; align-items: center; padding: 14px 16px 10px; }
  header h2 { margin: 0; font-size: 14px; }
  .x { margin-left: auto; border: 0; background: none; color: var(--fg3); font-size: 20px; line-height: 1; cursor: pointer; }
  .x:hover { color: var(--fg); }

  .tabs { display: flex; gap: 2px; padding: 0 12px; border-bottom: 1px solid var(--line); }
  .tabs button {
    border: 0; background: none; color: var(--fg3); padding: 8px 12px; cursor: pointer;
    border-bottom: 2px solid transparent; font-size: 12px;
  }
  .tabs button:hover { color: var(--fg2); }
  .tabs button.on { color: var(--accent); border-bottom-color: var(--accent); }

  .body { padding: 14px 16px 18px; display: flex; flex-direction: column; gap: 12px; }
  .lead { margin: 0; font-size: 12.5px; line-height: 1.6; color: var(--fg2); }
  .lead strong { color: var(--fg); }
  .pts { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 5px; }
  .pts li { font-size: 11.5px; line-height: 1.55; color: var(--fg3); }
  .meta {
    font-size: 11px; color: var(--fg2); background: var(--bg1); border: 1px solid var(--line);
    border-radius: 6px; padding: 7px 10px; font-variant-numeric: tabular-nums;
  }
  .row { display: flex; align-items: center; gap: 10px; font-size: 11.5px; color: var(--fg3); }
  .wide { width: 100%; height: 34px; }
  .prog { height: 6px; border-radius: 3px; background: var(--bg1); overflow: hidden; }
  .prog .fill { height: 100%; background: linear-gradient(90deg, #c9762f, #ffab5c); transition: width .12s; }
  .pm { margin: 0; font-size: 11px; color: var(--fg3); }
  .errbox { margin: 0; font-size: 11.5px; color: #ffb0b0; background: #3a1e1e; border-radius: 6px; padding: 8px 10px; line-height: 1.5; }
  .donebox {
    border: 1px solid #33513c; background: #1a271e; border-radius: 7px; padding: 9px 11px;
    display: flex; flex-direction: column; gap: 3px;
  }
  .donebox strong { font-size: 12px; color: #a8e0b8; }
  .donebox p { margin: 0; font-size: 11px; color: #86a890; line-height: 1.5; }
</style>
