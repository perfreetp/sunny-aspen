<script>
  import { onMount } from 'svelte';
  import StageView from './components/StageView.svelte';
  import Timeline from './components/Timeline.svelte';
  import Inspector from './components/Inspector.svelte';
  import TopBar from './components/TopBar.svelte';
  import ExportDialog from './components/ExportDialog.svelte';
  import { studio } from './lib/store.svelte.js';

  let exportOpen = $state(false);
  let splitterY = $state(340);
  let splitterX = $state(360);

  let dragging = null;

  /* 播放循环 */
  let raf = 0;
  let last = 0;
  function loop(t) {
    if (studio.playing) {
      if (!last) last = t;
      studio.advance(t - last);
      last = t;
    } else {
      last = 0;
    }
    raf = requestAnimationFrame(loop);
  }
  onMount(() => {
    raf = requestAnimationFrame(loop);
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? studio.redo() : studio.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        studio.redo();
      } else if (mod && e.key === 'Enter') {
        e.preventDefault();
        exportOpen = true;
      } else if (e.key === 'g' && !e.target.closest?.('input,textarea,select')) {
        studio.showGhost = !studio.showGhost;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    };
  });

  function startDrag(kind) {
    dragging = kind;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }
  function onMove(e) {
    if (dragging === 'y') {
      const rect = document.getElementById('main-area').getBoundingClientRect();
      splitterY = Math.min(rect.height - 160, Math.max(150, rect.bottom - e.clientY));
    } else if (dragging === 'x') {
      const rect = document.getElementById('main-area').getBoundingClientRect();
      splitterX = Math.min(rect.width - 300, Math.max(280, rect.right - e.clientX));
    }
  }
  function onUp() {
    dragging = null;
    window.removeEventListener('pointermove', onMove);
  }
</script>

<div class="app">
  <TopBar onExport={() => (exportOpen = true)} />

  <div class="main" id="main-area" style="grid-template-rows: 1fr 6px {splitterY}px">
    <div class="workspace" style="grid-template-columns: 1fr 6px {splitterX}px">
      <StageView />
      <div class="split v" onpointerdown={() => startDrag('x')} role="separator" aria-orientation="vertical" aria-label="调整检查器宽度"></div>
      <Inspector />
    </div>
    <div class="split h" onpointerdown={() => startDrag('y')} role="separator" aria-orientation="horizontal" aria-label="调整时间轴高度"></div>
    <Timeline />
  </div>

  {#if studio.toast}
    <div class="toast">{studio.toast.msg}</div>
  {/if}
</div>

<ExportDialog bind:open={exportOpen} />

<style>
  .app { display: flex; flex-direction: column; height: 100%; background: var(--bg0); }
  .main { display: grid; min-height: 0; flex: 1; }
  .workspace { display: grid; min-height: 0; }
  .split { background: var(--line); }
  .split.h { cursor: ns-resize; }
  .split.v { cursor: ew-resize; }
  .split:hover { background: #3a4252; }
  .toast {
    position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
    background: rgba(30,34,46,.97); border: 1px solid var(--line2); border-radius: 8px;
    padding: 8px 16px; font-size: 12px; color: var(--fg); z-index: 200;
    box-shadow: 0 8px 30px rgba(0,0,0,.5); pointer-events: none;
  }
</style>
