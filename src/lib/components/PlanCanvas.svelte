<script>
  import { onMount } from 'svelte';
  import { Application, Container } from 'pixi.js';
  import { buildNetwork } from '../domain/geometry.js';
  import {
    workspace,
    selectBranch,
    selectVent,
    clearSelection,
    setBranchOverride,
    removeVent
  } from '../state.svelte.js';
  import { renderPlan } from '../pixi/drawPlan.js';

  let {
    schemeId = 'A',
    editable = false,
    compact = false,
    canvasHeight = 520,
    showOverlay = true
  } = $props();

  let host = $state(null);
  let ready = $state(false);
  let sizeTick = $state(0);
  /** @type {Application | null} */
  let app = null;
  /** @type {Container | null} */
  let layer = null;
  let resizeObserver = null;

  const scheme = $derived(workspace.schemes[schemeId]);
  const network = $derived(buildNetwork(scheme));
  const selectedBranchId = $derived(editable ? workspace.selectedBranchId : null);
  const selectedVentId = $derived(editable ? workspace.selectedVentId : null);

  function handleKeyDown(event) {
    if (!editable) return;
    const target = event.target;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
    if ((event.key === 'Delete' || event.key === 'Backspace') && workspace.selectedVentId) {
      event.preventDefault();
      removeVent(schemeId, workspace.selectedVentId);
    }
    if (event.key === 'Escape') clearSelection();
  }

  onMount(async () => {
    if (!host) return;
    app = new Application();
    await app.init({
      resizeTo: host,
      antialias: true,
      backgroundAlpha: 0,
      autoDensity: true,
      resolution: Math.min(2, globalThis.devicePixelRatio || 1)
    });
    app.canvas.classList.add('pixi-canvas');
    host.appendChild(app.canvas);
    layer = new Container();
    app.stage.addChild(layer);

    resizeObserver = new ResizeObserver(() => {
      sizeTick += 1;
    });
    resizeObserver.observe(host);
    window.addEventListener('keydown', handleKeyDown);
    ready = true;

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      resizeObserver?.disconnect();
      if (app) {
        app.destroy(true, { children: true, texture: true });
      }
      app = null;
      layer = null;
      ready = false;
    };
  });

  $effect(() => {
    // Read all reactive inputs that should trigger a Pixi redraw.
    sizeTick;
    const currentNetwork = network;
    const currentBranch = selectedBranchId;
    const currentVent = selectedVentId;
    if (!ready || !app || !layer || !host) return;

    layer.destroy({ children: true });
    layer = new Container();
    app.stage.addChild(layer);

    renderPlan(layer, {
      host,
      canvas: app.canvas,
      network: currentNetwork,
      editable,
      compact,
      selectedBranchId: currentBranch,
      selectedVentId: currentVent,
      onSelectBranch: (id) => selectBranch(id),
      onSelectVent: (id) => selectVent(id),
      onClearSelection: () => clearSelection(),
      onBranchDrag: (id, patch) => setBranchOverride(schemeId, id, patch),
      onDeleteVent: (id) => removeVent(schemeId, id)
    });
  });
</script>

<div
  class="plan-canvas-shell"
  class:compact
  style={`min-height:${compact ? 340 : 420}px; height:${canvasHeight}px;`}
  data-testid={`plan-shell-${schemeId}`}
>
  <div
    bind:this={host}
    class="plan-canvas-host"
    data-testid={`plan-canvas-${schemeId}`}
    role="img"
    aria-label={`方案 ${schemeId} 筒仓平面与风道管网 PixiJS 画布`}
  ></div>

  {#if showOverlay}
    <div class="canvas-badges">
      <span class="badge seed">种子 {network.params.seed}</span>
      <span class="badge fingerprint">指纹 {network.fingerprint}</span>
      <span class="badge vents">{network.stats.activeVentCount}/{network.stats.gridVentCount} 风口</span>
    </div>

    {#if editable}
      <div class="canvas-hint">
        拖动支路可手改位置 · 点风口后按 Delete 或点 × 删除 · 空白处取消选择
      </div>
    {/if}
  {/if}
</div>

<style>
  .plan-canvas-shell {
    position: relative;
    width: 100%;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid rgba(125, 211, 252, 0.22);
    background:
      radial-gradient(circle at 50% 42%, rgba(30, 88, 130, 0.55), transparent 58%),
      linear-gradient(145deg, #071827 0%, #0b2438 52%, #081a2b 100%);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03), 0 18px 45px rgba(15, 23, 42, 0.16);
  }

  .plan-canvas-host {
    position: absolute;
    inset: 0;
  }

  .plan-canvas-host :global(canvas.pixi-canvas) {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    outline: none;
  }

  .canvas-badges {
    position: absolute;
    top: 12px;
    left: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    pointer-events: none;
    max-width: calc(100% - 90px);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 4px 9px;
    font-size: 11px;
    line-height: 1;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: #dff6ff;
    background: rgba(8, 27, 43, 0.76);
    border: 1px solid rgba(147, 216, 255, 0.24);
    backdrop-filter: blur(8px);
  }

  .badge.fingerprint {
    color: #fde68a;
    border-color: rgba(251, 191, 36, 0.28);
  }

  .badge.vents {
    color: #bbf7d0;
    border-color: rgba(52, 211, 153, 0.28);
  }

  .canvas-hint {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 10px;
    padding: 8px 11px;
    border-radius: 10px;
    color: #c7e7fb;
    font-size: 12px;
    text-align: center;
    background: rgba(4, 17, 29, 0.72);
    border: 1px solid rgba(148, 210, 245, 0.16);
    pointer-events: none;
    backdrop-filter: blur(8px);
  }

  .compact .canvas-hint {
    display: none;
  }

  @media (max-width: 720px) {
    .canvas-badges {
      max-width: calc(100% - 24px);
    }

    .canvas-hint {
      font-size: 11px;
    }
  }
</style>
