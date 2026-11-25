<script>
  import { PEER_META } from '../state.svelte.js';

  let { units = [], project = null, activeIds = [], onLocate = () => {}, onLocateFront = () => {} } = $props();

  const ROW_HEIGHT = 56;
  const VIEW_HEIGHT = 430;
  const OVERSCAN = 10;
  let scrollTop = $state(0);

  const activeSet = $derived(new Set(activeIds));
  const range = $derived.by(() => {
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const visibleCount = Math.ceil(VIEW_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
    const end = Math.min(units.length, start + visibleCount);
    return { start, end, items: units.slice(start, end) };
  });

  function period(id) {
    return project?.periods.find((p) => p.id === id);
  }
  function gully(id) {
    return project?.gullies.find((g) => g.id === id);
  }
</script>

<div class="unit-list">
  <div
    class="virtual-viewport"
    style="height:{VIEW_HEIGHT}px;max-height:none;"
    onscroll={(e) => (scrollTop = e.currentTarget.scrollTop)}
  >
    <div class="virtual-spacer" style="height:{units.length * ROW_HEIGHT}px;">
      {#each range.items as unit, index (unit.id)}
        <div
          class="virtual-row"
          style="top:{(range.start + index) * ROW_HEIGHT}px;"
        >
          <button
            class="unit-row"
            class:selected={activeSet.has(unit.id)}
            style="height:{ROW_HEIGHT - 4}px;margin:2px 0;"
            onclick={() => onLocate(unit)}
            title="定位到单元"
          >
            <i class="period-dot" style="background:{period(unit.periodId)?.color}"></i>
            <span>
              <strong>{unit.code}</strong>
              <span>
                {period(unit.periodId)?.short} · {gully(unit.gullyId)?.name || '导入区'} · 前缘 {Math.round(unit.front[0])},{Math.round(unit.front[1])}
              </span>
            </span>
            <span class="front-tag">{unit.distanceKm} km</span>
          </button>
          <button
            class="btn small ghost"
            style="position:absolute;right:8px;bottom:7px;padding:2px 6px;font-size:10px;"
            onclick={(e) => {
              e.stopPropagation();
              onLocateFront(unit);
            }}
          >
            前缘
          </button>
        </div>
      {/each}
    </div>
  </div>
</div>

<p class="hint" style="margin:7px 2px 0;">
    清单包含当前视野内 {units.length.toLocaleString()} 个单元；右侧里程为距锥心下游距离，坐标为前缘点。选中状态：
  {#each Object.values(PEER_META) as meta (meta.role)}
    <span style="color:{meta.color}">● {meta.shortName}</span>
  {/each}
</p>

<style>
  .virtual-row :global(.unit-row) {
    grid-template-columns: 10px minmax(0, 1fr) 52px;
    height: 100%;
  }
</style>
