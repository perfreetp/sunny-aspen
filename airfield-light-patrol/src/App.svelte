<script>
  import { getDataset } from './lib/data/generator.js';
  import {
    role,
    splitView,
    selectFeature,
    addMissingReport,
    missingReports
  } from './lib/stores.js';
  import MapView from './components/MapView.svelte';
  import FeatureList from './components/FeatureList.svelte';
  import ConfigPanel from './components/ConfigPanel.svelte';
  import InstructorBar from './components/InstructorBar.svelte';
  import MissingPanel from './components/MissingPanel.svelte';

  const ds = getDataset();
  let marqueeMode = $state(false);
  let toast = $state(null);
  let toastTimer;

  function showToast(msg) {
    toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 4200);
  }

  function handleSelect(id, viewId) {
    if (!id) return;
    selectFeature(id, viewId, 'map');
  }

  function handleMarquee(payload, viewId) {
    if (!payload.reports.length) {
      showToast('框选范围内未发现编号缺失');
      return;
    }
    let total = 0;
    for (const rep of payload.reports) {
      addMissingReport({
        rect: payload.rect,
        categoryId: rep.categoryId,
        lineId: rep.lineId,
        missingIds: rep.missingIds,
        viewId
      });
      total += rep.missingIds.length;
    }
    showToast(`发现 ${payload.reports.length} 组、共 ${total} 个缺失编号，已列入缺失清单`);
    marqueeMode = false;
  }
</script>

<div class="app-shell">
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark">✈</span>
      <div>
        <h1>机场灯光要素巡视工具</h1>
        <small>
          测绘资料：{ds.meta.surveySource} · 跑道方位 {ds.meta.runwayAzimuth}° ·
          要素 {ds.stats.total} 个 · 灯组 {ds.stats.groupCount} 个 · 预置缺失 {ds.stats.missing} 处
        </small>
      </div>
    </div>
    <div class="top-actions">
      <div class="role-switch">
        <button class:on={$role === 'engineer'} onclick={() => role.set('engineer')}>视景工程师</button>
        <button class:on={$role === 'instructor'} onclick={() => role.set('instructor')}>教员</button>
      </div>
      <label class="split-switch">
        <input type="checkbox" bind:checked={$splitView} />
        双视图并排
      </label>
    </div>
  </header>

  {#if $role === 'instructor'}
    <InstructorBar {marqueeMode} onToggleMarquee={() => (marqueeMode = !marqueeMode)} />
  {/if}

  <main class="workspace" class:single={!$splitView}>
    <section class="maps">
      <div class="map-slot">
        <MapView
          viewId="overview"
          title="全机场视图"
          {marqueeMode}
          onSelect={handleSelect}
          onMarquee={handleMarquee}
        />
      </div>
      {#if $splitView}
        <div class="map-divider"></div>
        <div class="map-slot">
          <MapView
            viewId="detail"
            title="局部巡视视图"
            {marqueeMode}
            onSelect={handleSelect}
            onMarquee={handleMarquee}
          />
        </div>
      {/if}
    </section>

    <aside class="sidebar">
      {#if $role === 'engineer'}
        <ConfigPanel />
      {/if}
      <FeatureList />
      <MissingPanel />
    </aside>
  </main>

  {#if toast}
    <div class="toast">{toast}</div>
  {/if}
</div>
