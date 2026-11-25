<script>
  import UnitVirtualList from './UnitVirtualList.svelte';
  import { collab, PEER_META, selectUnits, mapApis, ui, projectState, getProject } from '../state.svelte.js';
  import { exportCsv } from '../projectIO.js';

  let { tab = $bindable('selection'), listPayload = null, comparisonCount = 0, onOpenBriefing = () => {} } = $props();

  const project = $derived.by(() => {
    projectState.reloadToken;
    return getProject();
  });

  const allSelectedIds = $derived([
    ...collab.peers.mapper.ids,
    ...collab.peers.assessor.ids
  ]);
  const activeUnit = $derived.by(() => {
    const id = collab.peers[ui.activeView]?.ids[0] || allSelectedIds[0];
    return id ? unitById(id) : null;
  });

  function unitById(id) {
    return project?.units.find((unit) => unit.id === id);
  }

  function periodFor(unit) {
    return project?.periods.find((p) => p.id === unit.periodId);
  }

  function locate(role, id) {
    mapApis[role]?.flyToUnit?.(id);
  }

  function locateListUnit(unit) {
    selectUnits(listPayload.role, [unit.id]);
    mapApis[listPayload.role]?.flyToUnit?.(unit.id);
  }

  function locateFront(unit) {
    mapApis[listPayload.role]?.flyToFront?.(unit.id);
  }

  function exportList() {
    if (!listPayload) return;
    exportCsv(
      listPayload.units.map((unit) => ({
        单元编号: unit.code,
        期次: periodFor(unit)?.name,
        期次代号: periodFor(unit)?.code,
        沟谷: project.gullies.find((g) => g.id === unit.gullyId)?.name || '',
        前缘X_m: Math.round(unit.front[0]),
        前缘Y_m: Math.round(unit.front[1]),
        距锥心_km: unit.distanceKm,
        面积_ha: Number(unit.areaHa.toFixed(3))
      })),
      `current-view-lava-units-${listPayload.role}.csv`
    );
  }
</script>

<aside class="panel" aria-label="选中、清单和协同面板">
  <div class="right-tabs">
    <button class="right-tab" class:active={tab === 'selection'} onclick={() => (tab = 'selection')}>
      选中与会商
      {#if allSelectedIds.length}<span class="revision-pill" style="margin-left:4px;">{allSelectedIds.length}</span>{/if}
    </button>
    <button class="right-tab" class:active={tab === 'list'} onclick={() => (tab = 'list')}>视野清单</button>
    <button class="right-tab" class:active={tab === 'activity'} onclick={() => (tab = 'activity')}>协同动态</button>
  </div>

  <div class="panel-body">
    {#if tab === 'selection'}
      <section class="section">
        <div class="section-title">两端选中状态</div>
        {#each ['mapper', 'assessor'] as role (role)}
          {@const peer = collab.peers[role]}
          <article class="selection-card" style="border-left:3px solid {PEER_META[role].color}">
            <header>
              <div class="selection-title">
                <i class="peer-dot" style="--peer-color:{PEER_META[role].color}"></i>
                {PEER_META[role].name}
              </div>
              <button class="btn small ghost" disabled={!peer.ids.length} onclick={() => selectUnits(role, [])}>清空</button>
            </header>
            {#if peer.ids.length}
              <div class="id-chips">
                {#each peer.ids.slice(0, 12) as id (id)}
                  <button class="id-chip" style="--chip-color:{PEER_META[role].color}" onclick={() => locate(role, id)}>
                    <i></i>{unitById(id)?.code || id}
                  </button>
                {/each}
                {#if peer.ids.length > 12}
                  <span class="revision-pill">+{peer.ids.length - 12}</span>
                {/if}
              </div>
            {:else}
              <p class="hint" style="margin:0;">尚未点选；同一单元会在另一视图以同色轮廓亮起。</p>
            {/if}
          </article>
        {/each}
      </section>

      {#if activeUnit}
        <section class="section">
          <div class="section-title">单元属性卡</div>
          <article class="selection-card">
            <header>
              <div class="selection-title">{activeUnit.code}</div>
              <span class="swatch" style="background:{periodFor(activeUnit)?.color};width:16px;height:16px;"></span>
            </header>
            <dl class="kv">
              <dt>期次</dt>
              <dd>{periodFor(activeUnit)?.name}（{periodFor(activeUnit)?.code}）</dd>
              <dt>所属沟谷</dt>
              <dd>{project.gullies.find((g) => g.id === activeUnit.gullyId)?.name || '导入/跨沟谷单元'}</dd>
              <dt>前缘坐标</dt>
              <dd>{Math.round(activeUnit.front[0])}, {Math.round(activeUnit.front[1])} m</dd>
              <dt>下游距离</dt>
              <dd>约 {activeUnit.distanceKm} km</dd>
              <dt>图斑面积</dt>
              <dd>{activeUnit.areaHa.toFixed(2)} ha（示范剖分单元）</dd>
            </dl>
            <div style="display:flex;gap:7px;margin-top:10px;">
              <button class="btn small" onclick={() => mapApis[ui.activeView]?.flyToUnit(activeUnit.id)}>定位图斑</button>
              <button class="btn small" onclick={() => mapApis[ui.activeView]?.flyToFront(activeUnit.id)}>飞到前缘</button>
            </div>
          </article>
        </section>
      {/if}

      <section class="section" style="margin-bottom:0;">
        <div class="section-title">避险对比</div>
        <div class="metric">
          <strong style="color:var(--amber)">{comparisonCount.toLocaleString()}</strong>
          <span>个可见单元与当前避险范围相交</span>
        </div>
        <button class="btn amber" style="width:100%;margin-top:9px;" onclick={onOpenBriefing}>
          整理会商周 / 交接避险划定
        </button>
      </section>

    {:else if tab === 'list'}
      {#if listPayload}
        <div class="list-summary">
          <div class="metric"><strong>{listPayload.units.length.toLocaleString()}</strong><span>视野单元</span></div>
          <div class="metric"><strong>{Math.round(listPayload.scale * 100)}%</strong><span>当前缩放</span></div>
          <div class="metric"><strong>{new Set(listPayload.units.map((u) => u.periodId)).size}</strong><span>涉及期次</span></div>
        </div>
        <div style="display:flex;gap:7px;margin-bottom:10px;">
          <button class="btn small primary" style="flex:1" onclick={exportList}>导出清单 CSV</button>
          <button class="btn small pink" style="flex:1" onclick={onOpenBriefing}>带入会商周</button>
        </div>
        <UnitVirtualList
          units={listPayload.units}
          {project}
          activeIds={allSelectedIds}
          onLocate={locateListUnit}
          onLocateFront={locateFront}
        />
      {:else}
        <div class="empty-state">
          转到某个沟口后，点击地图右下角<br />
          <strong>“列当前视野单元与前缘”</strong><br />
          这里会生成可搜索、可定位、可导出的清单。
        </div>
      {/if}

    {:else}
      <section class="section">
        <div class="section-title">协同总线</div>
        <p class="hint" style="margin-top:0;">
          同一浏览器的 split 视图直接同步；另开标签页并切换到对应岗位，可验证跨标签选择与工程修订刷新。
        </p>
        <div class="activity-list">
          {#each collab.activity as item (item.id)}
            <div class="activity-item {item.tone}">
              {item.text}
              <span class="activity-time">{item.at}</span>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  </div>
</aside>
