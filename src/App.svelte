<script>
  import { onMount } from 'svelte';
  import MapStage from './lib/components/MapStage.svelte';
  import LayerPanel from './lib/components/LayerPanel.svelte';
  import RightPanel from './lib/components/RightPanel.svelte';
  import BriefingModal from './lib/components/BriefingModal.svelte';
  import {
    projectState,
    ui,
    collab,
    PEER_META,
    hydrateProject,
    reloadProjectFromDb,
    commitProjectChange,
    getProject,
    mapApis,
    setMode,
    showToast
  } from './lib/state.svelte.js';
  import { readFileAsDataUrl, readFileAsText, parseGeoJsonToProjectLayers, exportProjectJson } from './lib/projectIO.js';
  import { composeBriefingPng } from './lib/briefing.js';

  let terrainInput = $state(null);
  let vectorInput = $state(null);
  let rightTab = $state('selection');
  let listPayload = $state.raw(null);
  let briefingImage = $state('');
  let draggingFile = $state(false);
  let comparisonCounts = $state({ mapper: 0, assessor: 0 });

  const project = $derived.by(() => {
    projectState.reloadToken;
    return getProject();
  });

  const peerSelections = $derived(
    ['mapper', 'assessor'].map((role) => ({
      role,
      color: PEER_META[role].color,
      ids: collab.peers[role].ids
    }))
  );

  const comparisonZones = $derived.by(() => {
    projectState.reloadToken;
    const current = getProject();
    if (!current) return [];
    const builtin = ui.activeBuiltinZoneIds
      .map((id) => {
        const village = current.villages.find((item) => item.id === id);
        if (!village?.refuge) return null;
        return {
          id: `zone-${village.id}`,
          name: `${village.name}避险范围`,
          villageName: village.name,
          ring: village.refuge,
          kind: 'builtin',
          color: '#7c3aed'
        };
      })
      .filter(Boolean);
    return [...builtin, ...(current.customZones || [])];
  });

  onMount(() => {
    hydrateProject();
    // Read-only/debug handle for E2E checks and power-user troubleshooting.
    window.__volcano = { mapApis, getProject, projectState, collab, ui };
  });

  function triggerTerrainPicker() {
    terrainInput?.click();
  }

  function triggerVectorPicker() {
    vectorInput?.click();
  }

  async function handleTerrainFile(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    commitProjectChange((current) => {
      current.terrain = {
        kind: 'image',
        dataUrl,
        name: file.name,
        opacity: 1,
        importedAt: new Date().toISOString()
      };
    }, `编图端导入航测地形 ${file.name}`);
    Object.values(mapApis).forEach((api) => api.refreshTerrain?.());
    showToast(`地形 ${file.name} 已保存到工程，评估端刷新即可见`);
    event.currentTarget.value = '';
  }

  async function handleVectorFile(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const parsed = parseGeoJsonToProjectLayers(text);
      commitProjectChange((current) => {
        if (parsed.units.length) {
          current.units = parsed.units;
          current.flows = [];
          current.unitImport = { fileName: file.name, importedAt: new Date().toISOString() };
          current.stats ||= {};
          current.stats.unitCount = parsed.units.length;
          current.stats.featureCount = parsed.units.length + parsed.zones.length + (parsed.cone ? 1 : 0);
        }
        if (parsed.cone) current.cone = parsed.cone;
        if (parsed.zones.length) {
          current.customZones ||= [];
          current.customZones.push(...parsed.zones);
        }
      }, `导入 GeoJSON：${parsed.units.length} 个熔岩单元、${parsed.zones.length} 个避险范围`);
      Object.values(mapApis).forEach((api) => api.setProject?.(getProject()));
      showToast(`GeoJSON 已入库：${parsed.units.length} 个单元；另一标签页会自动刷新`);
    } catch (error) {
      console.error(error);
      showToast(`GeoJSON 导入失败：${error.message}`);
    } finally {
      event.currentTarget.value = '';
    }
  }

  function handleExportProject() {
    exportProjectJson(getProject());
  }

  async function handleReloadProject() {
    await reloadProjectFromDb();
    Object.values(mapApis).forEach((api) => api.setProject?.(getProject()));
  }

  function handleOpenList(payload) {
    listPayload = payload;
    rightTab = 'list';
    showToast(`已列出当前视野 ${payload.units.length.toLocaleString()} 个单元`);
  }

  function handleComparisonResult(role, payload) {
    comparisonCounts[role] = payload.ids.length;
  }

  async function openBriefing() {
    ui.briefingOpen = true;
    briefingImage = '';
    const roles = ui.mode === 'split' ? ['mapper', 'assessor'] : [ui.activeView];
    const captures = [];
    for (const role of roles) {
      const api = mapApis[role];
      if (!api?.captureDataUrl) continue;
      try {
        const url = await api.captureDataUrl();
        captures.push({
          role,
          url,
          title: role === 'mapper' ? '编图视图 · 分层与修订界线' : '评估视图 · 单期追踪与避险对比'
        });
      } catch (error) {
        console.warn('capture failed', role, error);
      }
    }
    briefingImage = await composeBriefingPng(captures, {
      project: getProject(),
      mapperIds: collab.peers.mapper.ids,
      assessorIds: collab.peers.assessor.ids,
      zones: comparisonZones,
      activeRole: ui.activeView
    });
  }

  function handleDragOver(event) {
    event.preventDefault();
    draggingFile = true;
  }

  function handleDragLeave() {
    draggingFile = false;
  }

  async function handleDrop(event) {
    event.preventDefault();
    draggingFile = false;
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type.startsWith('image/')) {
      const dataUrl = await readFileAsDataUrl(file);
      commitProjectChange((current) => {
        current.terrain = { kind: 'image', dataUrl, name: file.name, opacity: 1 };
      }, `拖入航测地形 ${file.name}`);
      Object.values(mapApis).forEach((api) => api.refreshTerrain?.());
    } else {
      const text = await readFileAsText(file);
      const parsed = parseGeoJsonToProjectLayers(text);
      commitProjectChange((current) => {
        if (parsed.units.length) {
          current.units = parsed.units;
          current.flows = [];
        }
        if (parsed.cone) current.cone = parsed.cone;
        if (parsed.zones.length) (current.customZones ||= []).push(...parsed.zones);
      }, `拖入并导入 ${file.name}`);
      Object.values(mapApis).forEach((api) => api.setProject?.(getProject()));
    }
  }
</script>

<svelte:window ondragover={handleDragOver} ondragleave={handleDragLeave} ondrop={handleDrop} />

<div class="app-shell">
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true"></div>
      <div>
        <h1>火山锥区熔岩流单元总览</h1>
        <p>Svelte · PixiJS · pixi-viewport｜编图—评估协同 / LOD 界线 / 会商周交接</p>
      </div>
    </div>

    <div class="top-project">
      <div style="min-width:0;">
        <div class="project-name">{project?.name || '正在建立工程…'}</div>
        <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;">
          <span class="revision-pill"><i class="dot"></i>{projectState.storageMessage}</span>
          <span class="revision-pill">r{project?.revision ?? '—'}</span>
          <span class="save-pill">{projectState.lastSavedAt ? `本机保存 ${projectState.lastSavedAt}` : 'IndexedDB 工程持久化'}</span>
        </div>
      </div>
    </div>

    <div class="top-actions">
      <div class="mode-switch" role="group" aria-label="工作视图模式">
        <button class="btn small" class:active={ui.mode === 'split'} onclick={() => setMode('split')}>双端视图</button>
        <button class="btn small" class:active={ui.mode === 'mapper'} onclick={() => setMode('mapper')}>编图</button>
        <button class="btn small" class:active={ui.mode === 'assessor'} onclick={() => setMode('assessor')}>评估</button>
      </div>
      <button class="btn small ghost" onclick={handleReloadProject} title="从 IndexedDB 重新载入编图修订">↻ 刷新工程</button>
      <button class="btn small" onclick={triggerTerrainPicker}>🏔 地形</button>
      <button class="btn small" onclick={triggerVectorPicker}>🗺 GeoJSON</button>
      <button class="btn primary" onclick={openBriefing}>📌 会商周</button>
    </div>

    <input bind:this={terrainInput} type="file" accept="image/*" hidden onchange={handleTerrainFile} />
    <input bind:this={vectorInput} type="file" accept=".geojson,.json,application/geo+json,application/json" hidden onchange={handleVectorFile} />
  </header>

  <main class="workspace">
    <LayerPanel role={ui.activeView === 'assessor' && ui.mode === 'split' ? 'assessor' : ui.mode === 'assessor' ? 'assessor' : 'mapper'}
      onImportTerrain={triggerTerrainPicker}
      onImportVector={triggerVectorPicker}
      onExportProject={handleExportProject}
    />

    <section class="map-workspace">
      {#if !projectState.hydrated || !project}
        <div class="panel"><div class="empty-state">正在载入数万要素与地形山影…</div></div>
      {:else}
        <div class="map-grid" class:single={ui.mode !== 'split'} style="--map-count:{ui.mode === 'split' ? 2 : 1}">
          {#if ui.mode !== 'assessor'}
            <MapStage
              role="mapper"
              {peerSelections}
              {comparisonZones}
              onOpenList={handleOpenList}
              onComparisonResult={handleComparisonResult}
            />
          {/if}
          {#if ui.mode !== 'mapper'}
            <MapStage
              role="assessor"
              {peerSelections}
              {comparisonZones}
              onOpenList={handleOpenList}
              onComparisonResult={handleComparisonResult}
            />
          {/if}
        </div>
      {/if}
    </section>

    <RightPanel
      bind:tab={rightTab}
      {listPayload}
      comparisonCount={comparisonCounts[ui.activeView] || 0}
      onOpenBriefing={openBriefing}
    />
  </main>

  <footer class="statusbar">
    <span>要素 {project?.stats.featureCount.toLocaleString() || '—'} · 单元 {project?.stats.unitCount.toLocaleString() || '—'} · 碎屑点 {project?.stats.clastCount.toLocaleString() || '—'}</span>
    <span>操作：滚轮缩放｜拖拽平移｜Shift 多选｜▱ 双击闭合｜✎ 拖顶点修边</span>
    <span>协同频道 volcano-lava-review-v1 · 可另开标签页分岗验证</span>
  </footer>

  <BriefingModal image={briefingImage} zones={comparisonZones} />

  {#if ui.toast}
    <div class="toast" role="status">{ui.toast}</div>
  {/if}

  {#if draggingFile}
    <div class="drop-overlay">松开文件以导入地形图片或范围 GeoJSON</div>
  {/if}
</div>

<style>
  .mode-switch {
    display: flex;
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.6);
  }
</style>
