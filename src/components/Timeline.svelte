<script>
  /* Timeline —— 阶段条 + 三轨道关键帧 + 播放头
   *
   * 时间基是帧。阶段条按 durF 比例伸缩；每个阶段内三条轨道各画关键帧。
   * 拖动关键帧改 u（阶段内归一化），改阶段右边界改 durF ——
   * 后者只平移后续阶段，前面已排好的节奏不变。 */
  import { studio } from '../lib/store.svelte.js';
  import { TRACK_LEG } from '../lib/scene.js';
  import { phaseStart } from '../lib/doc.js';
  import { clamp } from '../lib/geom.js';

  let track = $state(null);
  let drag = null;
  let hoverPhase = $state(-1);
  let hoverKey = $state(null);
  let dropPhase = $state(-1);

  const PX = $derived(studio.tlZoom * 5.4);          // 每帧像素宽
  const totalW = $derived(Math.max(320, studio.total * PX));
  const ROW_H = 26;

  function phaseLeft(i) { return phaseStart(studio.doc, i) * PX; }
  function phaseW(i) { return studio.doc.phases[i].durF * PX; }

  function frameFromX(x) {
    return clamp(x / PX, 0, Math.max(0, studio.total - 1));
  }

  function keysOf(i, trackKey) {
    const p = studio.doc.phases[i];
    return p.tracks[trackKey]?.keys || [];
  }

  function keyX(i, k) {
    const start = phaseStart(studio.doc, i);
    return (start + k.u * studio.doc.phases[i].durF) * PX;
  }

  /* ── 拖动 ─────────────────────────────────────────────────────────────── */

  function onScrubDown(e) {
    if (e.button !== 0) return;
    const r = track.getBoundingClientRect();
    studio.pause();
    drag = { mode: 'scrub' };
    scrubTo(e.clientX - r.left + track.scrollLeft);
    window.addEventListener('pointermove', onWinMove);
    window.addEventListener('pointerup', onWinUp, { once: true });
  }

  function scrubTo(localX) {
    studio.setFrame(Math.round(frameFromX(localX)));
  }

  function onKeyDown(e, i, trackKey, k) {
    if (e.button !== 0) return;
    e.stopPropagation();
    studio.pause();
    studio.selectedPhase = i;
    studio.selectedTrack = trackKey;
    studio.beginLive();
    const r = track.getBoundingClientRect();
    drag = {
      mode: 'key', i, trackKey, keyId: k.id,
      grabX: e.clientX - r.left + track.scrollLeft - keyX(i, k)
    };
    studio.setFrame(Math.round(phaseStart(studio.doc, i) + k.u * studio.doc.phases[i].durF));
    window.addEventListener('pointermove', onWinMove);
    window.addEventListener('pointerup', onWinUp, { once: true });
    e.preventDefault();
  }

  function onPhaseEdgeDown(e, i) {
    if (e.button !== 0) return;
    e.stopPropagation();
    studio.beginLive();
    drag = { mode: 'dur', i, dur0: studio.doc.phases[i].durF, x0: e.clientX };
    window.addEventListener('pointermove', onWinMove);
    window.addEventListener('pointerup', onWinUp, { once: true });
    e.preventDefault();
  }

  function onWinMove(e) {
    if (!drag) return;
    if (drag.mode === 'scrub') {
      const r = track.getBoundingClientRect();
      scrubTo(e.clientX - r.left + track.scrollLeft);
      return;
    }
    if (drag.mode === 'key') {
      const r = track.getBoundingClientRect();
      const x = e.clientX - r.left + track.scrollLeft - drag.grabX;
      const start = phaseStart(studio.doc, drag.i);
      const dur = studio.doc.phases[drag.i].durF;
      const u = clamp((x / PX - start) / dur, 0, 1);
      studio.setKeyU(drag.trackKey, drag.keyId, u);
      return;
    }
    if (drag.mode === 'dur') {
      const d = drag.dur0 + (e.clientX - drag.x0) / PX;
      const next = Math.max(6, Math.round(d));
      if (next !== studio.doc.phases[drag.i].durF) {
        studio.mutate((doc) => { doc.phases[drag.i].durF = next; });
      }
      return;
    }
  }

  function onWinUp() {
    if (!drag) return;
    const label =
      drag.mode === 'key' ? '已移动关键帧'
        : drag.mode === 'dur' ? `阶段时长 → ${studio.doc.phases[drag.i].durF} 帧`
          : null;
    drag = null;
    window.removeEventListener('pointermove', onWinMove);
    if (label) studio.endLive(label);
    else studio.endLive();
    studio.clampFrame();
  }

  /* ── 键盘：←/→ 逐帧，Shift 十倍，Home/End ────────────────────────────── */
  function onKeydown(e) {
    if (e.target.closest?.('input, textarea, select')) return;
    if (e.key === 'ArrowLeft') { studio.step(e.shiftKey ? -10 : -1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { studio.step(e.shiftKey ? 10 : 1); e.preventDefault(); }
    else if (e.key === 'Home') { studio.setFrame(0); e.preventDefault(); }
    else if (e.key === 'End') { studio.setFrame(studio.total - 1); e.preventDefault(); }
    else if (e.key === ' ') { studio.toggle(); e.preventDefault(); }
  }

  const playheadX = $derived(studio.frame * PX);

  /* 时间刻度：按当前缩放自适应 */
  const ticks = $derived.by(() => {
    const fps = studio.doc.fps || 24;
    const stepFrames = PX > 4 ? fps : PX > 1.6 ? fps * 2 : fps * 5;
    const out = [];
    for (let f = 0; f <= studio.total; f += stepFrames) {
      out.push({ f, sec: (f / fps).toFixed(1) });
    }
    return out;
  });
</script>

<svelte:window onkeydown={onKeydown} />

<section class="tl" aria-label="时间轴">
  <div class="bar">
    <div class="transport">
      <button class="btn sm" onclick={() => studio.setFrame(0)} title="回到起点 (Home)" aria-label="回到起点">⏮</button>
      <button class="btn sm" onclick={() => studio.step(-1)} title="退一帧 (←)" aria-label="退一帧">◀|</button>
      <button class="btn sm play" onclick={() => studio.toggle()} title="播放/暂停 (空格)" aria-label={studio.playing ? '暂停' : '播放'}>
        {studio.playing ? '⏸' : '▶'}
      </button>
      <button class="btn sm" onclick={() => studio.step(1)} title="进一帧 (→)" aria-label="进一帧">|▶</button>
      <button class="btn sm" onclick={() => studio.setFrame(studio.total - 1)} title="跳到末尾 (End)" aria-label="跳到末尾">⏭</button>
      <button class="btn sm cmp" onclick={() => studio.stepBackCompare()} title="退一格叠着看（上一帧轮廓叠加）">退一格叠看</button>
    </div>

    <div class="clock mono">
      <span class="big">{String(studio.frame).padStart(4, '0')}</span>
      <span class="sep">/</span>
      <span>{studio.total} 帧</span>
      <span class="sec">{((studio.frame / (studio.doc.fps || 24))).toFixed(2)}s · {studio.doc.fps}fps</span>
    </div>

    <div class="zoomers">
      <label class="speed">
        速度
        <input type="range" min="0.25" max="3" step="0.25" bind:value={studio.speed} aria-label="播放速度" />
        <span class="mono">{studio.speed}×</span>
      </label>
      <button class="btn sm" class:on={studio.loop} onclick={() => (studio.loop = !studio.loop)} aria-pressed={studio.loop}>循环</button>
      <label class="zoom">
        缩放
        <input type="range" min="0.4" max="3.2" step="0.1" bind:value={studio.tlZoom} aria-label="时间轴缩放" />
      </label>
    </div>
  </div>

  <div class="scroller" bind:this={track}>
    <div class="content" style="width:{totalW}px">
      <!-- 时间刻度 -->
      <div class="ruler">
        {#each ticks as t}
          <div class="tick" style="left:{t.f * PX}px"><i></i><span>{t.sec}s</span></div>
        {/each}
      </div>

      <!-- 阶段条 -->
      <div class="row phases">
        {#each studio.doc.phases as p, i (p.id)}
          <div
            class="phase"
            class:sel={studio.selectedPhase === i}
            class:hover={hoverPhase === i}
            class:drop={dropPhase === i}
            style="left:{phaseLeft(i)}px;width:{phaseW(i)}px"
            onpointerenter={() => (hoverPhase = i)}
            onpointerleave={() => (hoverPhase = -1, dropPhase = -1)}
            ondragover={(e) => {
              if (!e.dataTransfer?.types.includes('application/x-cone-preset')) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              dropPhase = i;
            }}
            ondragleave={() => (dropPhase = -1)}
            ondrop={(e) => {
              const presetId = e.dataTransfer?.getData('application/x-cone-preset');
              dropPhase = -1;
              if (!presetId) return;
              e.preventDefault();
              studio.assignCone(i, presetId);
              studio.selectedPhase = i;
            }}
            onclick={() => studio.gotoPhase(i)}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && studio.gotoPhase(i)}
            role="button"
            tabindex="0"
            aria-label={`阶段 ${i + 1}：${p.name}，${p.durF} 帧`}
          >
            <span class="idx">{i + 1}</span>
            <span class="nm">{p.name}</span>
            <span class="dur mono">{p.durF}f</span>
            <div
              class="edge"
              onpointerdown={(e) => onPhaseEdgeDown(e, i)}
              role="separator"
              aria-label={`调整阶段 ${i + 1} 时长`}
              title="拖动改时长（后续阶段整体平移）"></div>
          </div>
        {/each}
      </div>

      <!-- 三条轨道 -->
      {#each TRACK_LEG as tr}
        <div class="row lanes" style="height:{ROW_H * studio.phaseCount}px">
          {#each studio.doc.phases as p, i (p.id)}
            <div class="lane" style="left:{phaseLeft(i)}px;width:{phaseW(i)}px"></div>
          {/each}
          {#each studio.doc.phases as p, i (p.id)}
            {#each keysOf(i, tr.key) as k (k.id)}
              <button
                class="key"
                class:sel={hoverKey === k.id}
                style="left:{keyX(i, k)}px"
                onpointerdown={(e) => onKeyDown(e, i, tr.key, k)}
                onpointerenter={() => (hoverKey = k.id)}
                onpointerleave={() => (hoverKey = null)}
                aria-label={`${tr.name} 关键帧，${Math.round(k.u * 100)}%`}
                title={`${tr.name} · 阶段内 ${(k.u * 100).toFixed(0)}%`}
              ></button>
            {/each}
          {/each}
        </div>
      {/each}

      <!-- 播放头 -->
      <div class="playhead" style="left:{playheadX}px">
        <div class="cap"></div>
      </div>

      <!-- 点击定位层：位于最底，交互元素在其上 -->
      <div class="scrub" onpointerdown={onScrubDown} role="slider"
           aria-label="播放头位置" aria-valuemin="0" aria-valuemax={studio.total - 1} aria-valuenow={studio.frame} tabindex="0"></div>
    </div>
  </div>

  <div class="legend">
    {#each TRACK_LEG as tr}
      <span class="lg"><i style="background:{tr.color}"></i>{tr.name}</span>
    {/each}
    <span class="hint">拖动阶段右缘改时长 · 拖关键帧改节奏 · ←/→ 逐帧</span>
  </div>
</section>

<style>
  .tl {
    display: grid; grid-template-rows: 40px 1fr 26px;
    background: var(--bg1); border-top: 1px solid var(--line); min-height: 0;
  }
  .bar {
    display: flex; align-items: center; gap: 14px; padding: 0 12px;
    border-bottom: 1px solid var(--line); overflow-x: auto;
  }
  .transport { display: flex; gap: 4px; align-items: center; }
  .play { width: 34px; background: #262c3a; }
  .cmp { margin-left: 8px; color: #ffdc9a; border-color: #5a4526; background: #2c2319; }
  .cmp:hover { background: #3a2e1f; border-color: #7a5c30; }
  .clock { display: flex; align-items: baseline; gap: 6px; color: var(--fg2); }
  .clock .big { font-size: 16px; color: var(--fg); font-weight: 600; }
  .clock .sep { color: var(--fg3); }
  .clock .sec { color: var(--fg3); font-size: 11px; margin-left: 4px; }
  .zoomers { margin-left: auto; display: flex; align-items: center; gap: 14px; }
  .speed, .zoom { display: flex; align-items: center; gap: 6px; color: var(--fg3); font-size: 11px; }
  .speed input, .zoom input { width: 74px; }
  .btn.on { background: #2f3b2f; border-color: #4a6b4a; color: #b8e6b8; }

  .scroller { overflow-x: auto; overflow-y: auto; position: relative; }
  .content { position: relative; min-height: 100%; padding-bottom: 6px; }

  .ruler { position: relative; height: 20px; border-bottom: 1px solid var(--line); }
  .tick { position: absolute; top: 0; bottom: 0; }
  .tick i { position: absolute; left: 0; bottom: 0; width: 1px; height: 7px; background: var(--line2); }
  .tick span { position: absolute; left: 3px; top: 2px; font-size: 10px; color: var(--fg3); font-variant-numeric: tabular-nums; }

  .row { position: relative; }
  .phases { height: 30px; margin-top: 4px; }
  .phase {
    position: absolute; top: 0; height: 26px; display: flex; align-items: center; gap: 6px;
    padding: 0 8px; border-radius: 5px; background: var(--bg3); border: 1px solid var(--line2);
    overflow: hidden; cursor: pointer; transition: border-color .12s, background .12s;
    font-size: 12px; color: var(--fg2);
  }
  .phase:hover { background: #262c3a; }
  .phase.sel { border-color: var(--accent); background: #2b2119; color: var(--fg); }
  .phase.drop { border-color: #8fc4ea; background: #1b2733; box-shadow: inset 0 0 0 1px #8fc4ea; }
  .phase .idx {
    flex: none; width: 16px; height: 16px; border-radius: 4px; background: #2c3340;
    display: grid; place-content: center; font-size: 10px; color: var(--fg2);
  }
  .phase.sel .idx { background: var(--accent); color: #2a1a0c; font-weight: 700; }
  .phase .nm { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .phase .dur { flex: none; font-size: 10px; color: var(--fg3); }
  .phase .edge {
    position: absolute; right: 0; top: 0; bottom: 0; width: 7px; cursor: ew-resize;
    background: linear-gradient(90deg, transparent, rgba(255,171,92,.35));
  }
  .phase .edge:hover { background: rgba(255,171,92,.55); }

  .lanes { position: relative; border-bottom: 1px solid #1d212b; }
  .lane {
    position: absolute; top: 0; bottom: 0; border-right: 1px dashed #232834;
    background: repeating-linear-gradient(90deg, transparent 0 40px, rgba(255,255,255,.012) 40px 80px);
  }
  .key {
    position: absolute; top: 50%; width: 9px; height: 9px; margin-left: -4.5px; margin-top: -4.5px;
    transform: rotate(45deg); border-radius: 1.5px; border: 1px solid #1a1a20;
    padding: 0; cursor: grab; background: var(--accent);
  }
  .key.sel { box-shadow: 0 0 0 3px rgba(255,171,92,.3); }

  .playhead { position: absolute; top: 0; bottom: 0; width: 1px; background: #ff5a5a; pointer-events: none; z-index: 5; }
  .playhead .cap {
    position: absolute; top: 0; left: -5px; width: 11px; height: 11px;
    background: #ff5a5a; clip-path: polygon(0 0, 100% 0, 50% 100%);
  }
  .scrub { position: absolute; inset: 0; z-index: 0; cursor: crosshair; }
  .ruler, .row { position: relative; z-index: 2; }
  .row.lanes { z-index: 2; }
  .phase .edge { z-index: 4; }
  .scrub:focus-visible { outline: 1px dashed var(--accent); outline-offset: -2px; }

  .legend {
    display: flex; align-items: center; gap: 16px; padding: 0 12px;
    border-top: 1px solid var(--line); color: var(--fg3); font-size: 11px;
  }
  .lg { display: inline-flex; align-items: center; gap: 5px; }
  .lg i { width: 8px; height: 8px; border-radius: 2px; }
  .hint { margin-left: auto; opacity: .75; }
</style>
