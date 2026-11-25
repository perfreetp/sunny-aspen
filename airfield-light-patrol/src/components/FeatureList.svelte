<script>
  import { filteredFeatures, listFilter, selectFeature, selectedId, missingReports } from '../lib/stores.js';
  import { CATEGORIES, CATEGORY_MAP } from '../lib/data/categories.js';

  let scrollEl;
  const ROW_H = 34;
  const OVERSCAN = 10;
  let scrollTop = $state(0);
  let viewH = $state(600);

  let list = $derived($filteredFeatures);
  let total = $derived(list.length);
  let start = $derived(Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN));
  let end = $derived(Math.min(total, start + Math.ceil(viewH / ROW_H) + OVERSCAN * 2));
  let visible = $derived(list.slice(start, end));

  function onScroll() {
    scrollTop = scrollEl.scrollTop;
  }
  function rowClick(id) {
    selectFeature(id, null, 'list');
  }
  function ensureVisible() {
    const id = $selectedId;
    if (!id) return;
    const idx = list.findIndex((f) => f.id === id);
    if (idx < 0) return;
    const top = idx * ROW_H;
    if (top < scrollEl.scrollTop || top + ROW_H > scrollEl.scrollTop + viewH) {
      scrollEl.scrollTo({ top: top - viewH / 2 });
    }
  }
  $effect(() => {
    $selectedId;
    ensureVisible();
  });
</script>

<div class="feature-list">
  <div class="fl-head">
    <span>要素列表</span>
    <span class="fl-count">{total} 项</span>
  </div>
  <div class="fl-filters">
    <select
      value={$listFilter.categoryId}
      onchange={(e) => listFilter.update((f) => ({ ...f, categoryId: e.target.value }))}
    >
      <option value="">全部类别</option>
      {#each CATEGORIES as c}
        <option value={c.id}>{c.name}</option>
      {/each}
    </select>
    <input
      type="search"
      placeholder="编号 / 灯组搜索"
      value={$listFilter.keyword}
      oninput={(e) => listFilter.update((f) => ({ ...f, keyword: e.target.value }))}
    />
    <label class="fl-check">
      <input
        type="checkbox"
        checked={$listFilter.onlyMissing}
        onchange={(e) => listFilter.update((f) => ({ ...f, onlyMissing: e.target.checked }))}
      />
      只看缺失
    </label>
  </div>

  <div
    class="fl-scroll"
    bind:this={scrollEl}
    onscroll={onScroll}
    use={(el) => {
      viewH = el.clientHeight;
      const ro = new ResizeObserver(() => (viewH = el.clientHeight));
      ro.observe(el);
      return () => ro.disconnect();
    }}
  >
    <div style:height={total * ROW_H + 'px'} class="fl-spacer">
      {#each visible as f, i (f.id)}
        {@const cat = CATEGORY_MAP[f.categoryId]}
        <button
          class="fl-row"
          class:active={$selectedId === f.id}
          style:transform={`translateY(${start * ROW_H}px)`}
          style:height={ROW_H + 'px'}
          onclick={() => rowClick(f.id)}
          title={`${f.id} · ${f.groupName}`}
        >
          <i class="fl-dot" style:background={cat.cssColor}></i>
          <span class="fl-id">{f.id}</span>
          <span class="fl-group">{f.groupName}</span>
          {#if f.status === 'missing'}<span class="fl-miss">缺</span>{/if}
        </button>
      {/each}
    </div>
  </div>

  <div class="fl-foot">
    缺失清单：{$missingReports.filter((r) => r.status === 'open').length} 份待处理 ·
    {$missingReports.length} 份总计
  </div>
</div>
