<script>
  import { config, lodStats } from '../lib/stores.js';
  import { LOD_NAMES } from '../lib/data/categories.js';

  let { marqueeMode, onToggleMarquee } = $props();

  // 滑杆档位映射：0~100 -> bias 2.2~0.4（滑得越大简化越强）
  let biasPct = $derived(Math.round(((2.2 - $config.simplificationBias) / 1.8) * 100));
  const stats = $derived($lodStats);
  const overview = $derived(stats.overview ?? {});
  const detail = $derived(stats.detail ?? {});

  function onSlider(e) {
    const pct = +e.target.value;
    const bias = +(2.2 - (pct / 100) * 1.8).toFixed(2);
    config.update((c) => ({ ...c, simplificationBias: bias }));
  }

  // 当前档位（以全图视图统计判断主档位）
  const currentGear = $derived(
    (overview.lod2 ?? 0) > (overview.lod0 ?? 0)
      ? LOD_NAMES[2]
      : (overview.lod1 ?? 0) > (overview.lod0 ?? 0)
        ? LOD_NAMES[1]
        : LOD_NAMES[0]
  );
</script>

<div class="instructor-bar">
  <div class="ib-block ib-slider">
    <span class="ib-label">简化阈值</span>
    <input type="range" min="0" max="100" value={biasPct} oninput={onSlider} />
    <div class="ib-gear">
      当前档位 <b>{currentGear}</b>
      <small>强度 {$config.simplificationBias.toFixed(2)}× · 与工程师面板实时同步</small>
    </div>
  </div>

  <div class="ib-block ib-stats">
    <div class="ib-viewstat">
      <label>全机场视图</label>
      <span>完整 {overview.lod0 ?? 0} · 抽稀 {overview.lod1 ?? 0} · 聚合 {overview.lod2 ?? 0}</span>
      <small>可见 {overview.visible ?? 0}</small>
    </div>
    <div class="ib-viewstat">
      <label>局部视图</label>
      <span>完整 {detail.lod0 ?? 0} · 抽稀 {detail.lod1 ?? 0} · 聚合 {detail.lod2 ?? 0}</span>
      <small>可见 {detail.visible ?? 0}</small>
    </div>
  </div>

  <div class="ib-block">
    <button class="marquee-btn" class:active={marqueeMode} onclick={() => onToggleMarquee()}>
      {marqueeMode ? '退出框选' : '框选缺灯段'}
    </button>
  </div>
</div>
