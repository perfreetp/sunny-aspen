<script>
  import { viewSettings, ui, projectState, getProject } from '../state.svelte.js';

  let { role = 'mapper', onImportTerrain, onImportVector, onExportProject } = $props();

  const project = $derived.by(() => {
    projectState.reloadToken;
    return getProject();
  });
  const settings = $derived(viewSettings[role]);

  const layerDefs = [
    { key: 'terrain', name: '无人机航测地形 / 山影', hint: 'PNG/JPG 正射或 DEM 渲染图' },
    { key: 'tephra', name: '火山碎屑席', hint: '地质图圈定碎屑范围' },
    { key: 'clasts', name: '数万碎屑/砾石点要素', hint: '缩放到 42% 以上显示' },
    { key: 'units', name: '熔岩流单元填色', hint: '按期次分色' },
    { key: 'periodBoundaries', name: '各期熔岩流外轮廓', hint: 'LOD 细线，低缩放保留主干' },
    { key: 'boundaries', name: '单元界线独立层', hint: '屏宽 1px，缩放时重绘不糊' },
    { key: 'cone', name: '火山锥轮廓', hint: '航测地形 + 地质图边界' },
    { key: 'gullies', name: '沟谷与沟口', hint: '下游追踪参考线' },
    { key: 'fronts', name: '单元前缘点', hint: '放大后显示' },
    { key: 'villages', name: '村子 / 居民点', hint: '避险对比对象' },
    { key: 'refuges', name: '避险范围层', hint: '预编范围 + 会商圈画' },
    { key: 'labels', name: '单元名与期次标注', hint: '175% 起逐个避让露出' }
  ];

  const periodCounts = $derived.by(() => {
    const map = new Map();
    for (const unit of project?.units || []) map.set(unit.periodId, (map.get(unit.periodId) || 0) + 1);
    return map;
  });

  function toggleLayer(key) {
    settings.layers[key] = !settings.layers[key];
  }

  function showAllPeriods() {
    settings.periodId = 'all';
    settings.onlyPeriod = false;
  }

  function soloPeriod(periodId) {
    settings.periodId = periodId;
    settings.onlyPeriod = true;
    if (!settings.hiddenPeriodIds.includes(periodId)) return;
    settings.hiddenPeriodIds = settings.hiddenPeriodIds.filter((id) => id !== periodId);
  }

  function togglePeriodVisible(periodId, event) {
    event.stopPropagation();
    if (settings.hiddenPeriodIds.includes(periodId)) {
      settings.hiddenPeriodIds = settings.hiddenPeriodIds.filter((id) => id !== periodId);
    } else {
      settings.hiddenPeriodIds = [...settings.hiddenPeriodIds, periodId];
    }
  }

  function toggleVillageZone(villageId) {
    if (ui.activeBuiltinZoneIds.includes(villageId)) {
      ui.activeBuiltinZoneIds = ui.activeBuiltinZoneIds.filter((id) => id !== villageId);
    } else {
      ui.activeBuiltinZoneIds = [...ui.activeBuiltinZoneIds, villageId];
    }
  }
</script>

<aside class="panel" aria-label="分层与期次面板">
  <div class="panel-header">
    <div>
      <h2>分层 / 期次 / 避险范围</h2>
      <p>当前控制：{role === 'mapper' ? '编图视图' : '评估视图'}（点地图可切换）</p>
    </div>
    <span class="revision-pill">r{project?.revision}</span>
  </div>

  <div class="panel-body">
    <section class="section">
      <div class="section-title">数据导入与工程</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;">
        <button class="btn small" onclick={() => onImportTerrain?.()}>🏔 导入航测地形</button>
        <button class="btn small" onclick={() => onImportVector?.()}>🗺 导入范围 GeoJSON</button>
        <button class="btn small ghost" style="grid-column:1/-1" onclick={() => onExportProject?.()}>
          ⤓ 导出完整工程 JSON
        </button>
      </div>
      <p class="hint" style="margin:8px 0 0;">
        已内置 {project?.stats.featureCount.toLocaleString()} 个示范要素；导入的 GeoJSON 会自动归一化坐标并按期次字段配色。
      </p>
    </section>

    <section class="section">
      <div class="section-title">
        熔岩流期次
        <button class="btn small ghost" onclick={showAllPeriods}>全部</button>
      </div>
      <div style="display:grid;gap:4px;">
        {#each project?.periods || [] as period (period.id)}
          <div
            class="period-row"
            class:active={settings.onlyPeriod && settings.periodId === period.id}
            role="button"
            tabindex="0"
            onclick={() => soloPeriod(period.id)}
            onkeydown={(e) => e.key === 'Enter' && soloPeriod(period.id)}
          >
            <i class="swatch" style="background:{period.color}"></i>
            <div class="period-name">
              <strong>{period.name}</strong>
              <span>{period.code} · {period.short}</span>
            </div>
            <span class="period-count">{(periodCounts.get(period.id) || 0).toLocaleString()}</span>
            <button
              class="icon-btn"
              style="width:26px;height:26px;"
              title={settings.hiddenPeriodIds.includes(period.id) ? '显示该期' : '隐藏该期'}
              onclick={(e) => togglePeriodVisible(period.id, e)}
            >
              {settings.hiddenPeriodIds.includes(period.id) ? '◌' : '◉'}
            </button>
          </div>
        {/each}
      </div>
      <p class="hint" style="margin-top:7px;">单击期次即“只留这一期”，可观察其从锥区向沟口、下游的连续路径。</p>
    </section>

    <section class="section">
      <div class="section-title">图层开关</div>
      <div style="display:grid;gap:2px;">
        {#each layerDefs as layer (layer.key)}
          <label class="layer-row">
            <input
              type="checkbox"
              checked={settings.layers[layer.key] !== false}
              onchange={() => toggleLayer(layer.key)}
            />
            <span class="layer-name">
              <strong>{layer.name}</strong>
              <span>{layer.hint}</span>
            </span>
          </label>
        {/each}
      </div>
    </section>

    <section class="section" style="margin-bottom:0;">
      <div class="section-title">村子避险范围对比</div>
      <div style="display:grid;gap:4px;">
        {#each project?.villages || [] as village (village.id)}
          <button class="village-row" onclick={() => toggleVillageZone(village.id)}>
            <input type="checkbox" readonly checked={ui.activeBuiltinZoneIds.includes(village.id)} />
            <span class="layer-name">
              <strong>{village.name}</strong>
              <span>{village.gullyId ? project.gullies.find((g) => g.id === village.gullyId)?.name : ''} · {village.population.toLocaleString()} 人</span>
            </span>
            {#if ui.activeBuiltinZoneIds.includes(village.id)}
              <span class="revision-pill" style="color:#ddd6fe;border-color:rgba(167,139,250,.45);">对比中</span>
            {/if}
          </button>
        {/each}
      </div>
      <p class="hint" style="margin-top:8px;">
        地图工具栏选择 <span class="kbd">▱</span> 可圈自定义避险范围；与当前可见期次相交的单元会以琥珀色标出。
      </p>
    </section>
  </div>
</aside>
