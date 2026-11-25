<script>
  import { onMount, onDestroy } from 'svelte';
  import { MapEngine } from '../lib/engine/MapEngine.js';
  import { config, selectedId, selectionOrigin, lodStats, selectedFeature, featureTick } from '../lib/stores.js';
  import { CATEGORY_MAP, LOD_NAMES } from '../lib/data/categories.js';

  let {
    viewId,
    title,
    marqueeMode = false,
    showMissing = true,
    onSelect,
    onMarquee
  } = $props();

  let hostEl;
  let engine;
  let stats = $state({ lod0: 0, lod1: 0, lod2: 0, visible: 0 });
  let mpp = $state(0);

  onMount(() => {
    engine = new MapEngine(hostEl, viewId, {
      onSelect: (id) => onSelect?.(id, viewId),
      onMarquee: (payload) => onMarquee?.(payload, viewId),
      onLodStats: (s) => {
        stats = s;
        lodStats.update((v) => ({ ...v, [viewId]: s }));
      }
    });
    if (import.meta.env.DEV) {
      window.__engines = window.__engines || {};
      window.__engines[viewId] = engine;
    }
    const unsubCfg = config.subscribe((cfg) => engine.syncConfig(cfg));
    const unsubSel = selectedId.subscribe((id) => {
      if (!engine) return;
      engine.setSelected(id);
    });
    const unsubOrigin = selectionOrigin.subscribe((origin) => {
      if (!engine || !origin) return;
      if (origin.viewId !== viewId || origin.kind === 'list') {
        if (origin.id) engine.flyToFeature(origin.id);
      }
    });
    const unsubTick = featureTick.subscribe(() => engine?._syncTransformAndRender(true));
    const mppTimer = setInterval(() => {
      if (engine?.viewport) mpp = 1 / engine.viewport.scale.x;
    }, 200);
    return () => {
      clearInterval(mppTimer);
      unsubCfg();
      unsubSel();
      unsubOrigin();
      unsubTick();
      engine?.destroy();
      engine = null;
    };
  });

  $effect(() => {
    engine?.setMarqueeMode(marqueeMode);
  });
  $effect(() => {
    engine?.setShowMissing(showMissing);
  });

  let sf = $derived($selectedFeature);
  let catName = $derived(sf ? CATEGORY_MAP[sf.categoryId]?.name : '');
</script>

<div class="map-view" data-view={viewId}>
  <div class="map-head">
    <span class="map-title">{title}</span>
    <span class="lod-chip">
      <span><i class="dot d0"></i>完整 {stats.lod0}</span>
      <span><i class="dot d1"></i>抽稀 {stats.lod1}</span>
      <span><i class="dot d2"></i>聚合 {stats.lod2}</span>
      <span class="mpp">{mpp < 1 ? mpp.toFixed(2) : mpp.toFixed(1)} m/px</span>
    </span>
  </div>
  <div class="map-host" bind:this={hostEl}>
    <div class="map-tools">
      <button title="逆时针旋转 15°" onclick={() => engine?.rotateBy(-15)}>⟲</button>
      <button title="顺时针旋转 15°" onclick={() => engine?.rotateBy(15)}>⟳</button>
      <button title="复位朝向" onclick={() => engine?.resetRotation()}>北↑</button>
      <button title="全图" onclick={() => engine?.fitAll()}>⛶</button>
    </div>

    {#if sf}
      <div class="feature-popup">
        <div class="fp-head">
          <span class="fp-id">{sf.id}</span>
          <button class="fp-close" onclick={() => selectedId.set(null)}>×</button>
        </div>
        <div class="fp-row"><label>要素类别</label><b>{catName}</b></div>
        <div class="fp-row"><label>所属灯组</label><b>{sf.groupName}</b></div>
        <div class="fp-row"><label>组内序号</label><b>{sf.designIndex + 1}</b></div>
        <div class="fp-row"><label>局部坐标</label><b>X {sf.x.toFixed(1)} m / Y {sf.y.toFixed(1)} m</b></div>
        <div class="fp-row"><label>经纬度</label><b>{sf.lat.toFixed(6)}, {sf.lon.toFixed(6)}</b></div>
        <div class="fp-row">
          <label>状态</label>
          {#if sf.status === 'missing'}
            <b class="st-missing">缺失</b>
          {:else}
            <b class="st-ok">正常</b>
          {/if}
        </div>
      </div>
    {/if}

    {#if marqueeMode}
      <div class="marquee-hint">框选模式：在图上拖拽框选疑似缺灯的滑行道段</div>
    {/if}
  </div>
</div>
