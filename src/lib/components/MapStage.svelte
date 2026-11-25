<script>
  import { onMount, onDestroy } from 'svelte';
  import { MapController } from '../MapController.js';
  import {
    getProject,
    projectState,
    viewSettings,
    collab,
    ui,
    selectUnits,
    commitProjectChange,
    setActiveView,
    setTool,
    mapApis,
    registerMapApi,
    PEER_META
  } from '../state.svelte.js';

  let {
    role = 'mapper',
    comparisonZones = [],
    peerSelections = [],
    onOpenList = () => {},
    onComparisonResult = () => {}
  } = $props();

  let host = $state(null);
  let controller = null;
  let labels = $state([]);
  let hover = $state(null);
  let viewState = $state({ scale: 0.5, center: { x: 1300, y: 900 } });
  let selectedGully = $state('');

  const meta = $derived(PEER_META[role]);
  const settings = $derived(viewSettings[role]);
  const tool = $derived(ui.activeTool[role]);
  const ownCount = $derived(collab.peers[role]?.ids.length || 0);
  const periodName = $derived(
    settings.periodId === 'all' ? '全部期次' : getProject()?.periods.find((p) => p.id === settings.periodId)?.name
  );

  onMount(async () => {
    controller = new MapController(host, {
      role,
      project: getProject(),
      settings: $state.snapshot(viewSettings[role]),
      tool: ui.activeTool[role],
      onLabels: (next) => {
        labels = next;
      },
      onHover: (next) => {
        hover = next;
      },
      onViewChange: (next) => {
        viewState = next;
      },
      onActivate: () => setActiveView(role),
      onSelectionChange: (ids) => selectUnits(role, ids, { source: 'local' }),
      onCommitEdit: (unit) => {
        commitProjectChange((project) => {
          const index = project.units.findIndex((item) => item.id === unit.id);
          if (index >= 0) project.units[index] = unit;
        }, `编图端保存 ${unit.code} 界线修订`);
        // In split mode the second Pixi view shares the raw nested geometry but
        // has baked fills; ask it to rebuild the affected period immediately.
        for (const api of Object.values(mapApis)) {
          api.rebuildIndex?.();
          api.redrawPeriodFill?.(unit.periodId);
          api.scheduleFrame?.();
        }
      },
      onCreateZone: (ring) => {
        commitProjectChange((project) => {
          project.customZones ||= [];
          project.customZones.push({
            id: `custom-zone-${Date.now()}`,
            name: `自定义避险范围 ${project.customZones.length + 1}`,
            villageName: '会商圈画',
            ring,
            kind: 'custom',
            color: '#7c3aed'
          });
        }, '评估端圈画新的村子避险范围');
        setTool(role, 'pan');
      },
      onComparisonChange: (payload) => onComparisonResult(role, payload)
    });
    await controller.init();
    if (controller.destroyed) return;
    registerMapApi(role, controller);
  });

  onDestroy(() => {
    controller?.destroy();
    delete mapApis[role];
  });

  $effect(() => {
    projectState.reloadToken;
    if (controller && projectState.reloadToken > 0) {
      controller.setProject(getProject());
    }
  });

  $effect(() => {
    if (!controller) return;
    controller.updateSettings($state.snapshot(viewSettings[role]));
  });

  $effect(() => {
    if (!controller) return;
    controller.setPeerSelections(peerSelections);
  });

  $effect(() => {
    if (!controller) return;
    controller.setComparisonZones(comparisonZones);
  });

  $effect(() => {
    if (controller) controller.options.tool = tool;
  });

  function openList() {
    if (!controller) return;
    const result = controller.getVisibleUnits();
    onOpenList(result);
  }

  function locateGully() {
    if (selectedGully) controller?.flyToMouth(selectedGully);
  }
</script>

<div
  class="map-stage"
  class:active-view={ui.activeView === role}
  role="application"
  aria-label={`${meta.name}地图视图`}
  onpointerdown={() => setActiveView(role)}
>
  <div class="canvas-host" bind:this={host}></div>

  <div class="label-layer" aria-hidden="true">
    {#each labels as label (label.id)}
      <div
        class="map-label"
        class:unit={label.kind === 'unit'}
        class:major={label.kind !== 'unit'}
        class:village={label.kind === 'village'}
        style="--x:{label.x}px; --y:{label.y}px; --period-color:{label.color || '#0891b2'}"
      >
        {label.text}
        {#if label.subtext}<small>{label.subtext}</small>{/if}
      </div>
    {/each}
  </div>

  {#if hover?.unit}
    <div class="map-tooltip" style="left:{hover.x}px; top:{hover.y}px;">
      <h4>{hover.unit.code}</h4>
      <div class="tooltip-row">
        <i class="swatch" style="background:{hover.period?.color}"></i>
        期次：{hover.period?.name}（{hover.period?.code}）
      </div>
      <div class="tooltip-row">沟谷：{hover.gully?.name || '跨沟谷/导入单元'}</div>
      <div class="tooltip-row">前缘：{Math.round(hover.unit.front[0])}, {Math.round(hover.unit.front[1])} m</div>
    </div>
  {/if}

  <div class="map-overlay-top">
    <div class="map-top-left" style="display:grid;gap:7px;max-width:min(360px,70%);">
      <div class="view-badge" style="--peer-color:{meta.color}">
        <i class="peer-dot"></i>
        <div>
          <strong>{role === 'mapper' ? '编图视图' : '评估视图'} · {meta.name}</strong>
          <span>{periodName}{settings.onlyPeriod && settings.periodId !== 'all' ? ' · 单期追踪' : ' · 全部分层'}</span>
        </div>
      </div>
      <div style="display:flex;gap:6px;pointer-events:auto;">
        <select
          bind:value={selectedGully}
          onchange={locateGully}
          class="gully-select"
          aria-label="转到沟口"
        >
          <option value="">转到沟口细看…</option>
          {#each getProject()?.gullies || [] as gully (gully.id)}
            <option value={gully.id}>{gully.name}口 · {gully.village?.name || gully.village}上游</option>
          {/each}
        </select>
      </div>
    </div>

    <div class="map-tools" aria-label="地图工具">
      <button class="icon-btn" class:active={tool === 'pan'} title="平移/点选" onclick={() => setTool(role, 'pan')}>✥</button>
      <button
        class="icon-btn"
        class:active={tool === 'edit'}
        title="编图修边：拖动选中单元顶点"
        onclick={() => setTool(role, 'edit')}
      >✎</button>
      <button
        class="icon-btn"
        class:active={tool === 'draw'}
        title="圈画村子避险范围"
        onclick={() => setTool(role, 'draw')}
      >▱</button>
      <span style="width:1px;background:var(--line);margin:3px 2px;"></span>
      <button class="icon-btn" title="放大" onclick={() => controller?.zoomIn()}>＋</button>
      <button class="icon-btn" title="缩小" onclick={() => controller?.zoomOut()}>－</button>
      <button class="icon-btn" title="全图" onclick={() => controller?.fitWorld()}>⤢</button>
    </div>
  </div>

  {#if tool === 'edit'}
    <div class="drawing-hint">
      <span>先点选一个单元，再拖动白色顶点修边；松开自动保存并通知评估端。</span>
      {#if ownCount !== 1}<strong style="color:#fde68a">需恰好选中 1 个</strong>{/if}
    </div>
  {/if}

  {#if tool === 'draw'}
    <div class="drawing-hint">
      <span>逐点单击圈画避险范围，双击闭合；也可右侧完成。</span>
      <button class="btn small primary" onclick={() => controller?.finishDrawing()}>完成</button>
      <button class="btn small ghost" onclick={() => controller?.cancelDrawing()}>取消</button>
    </div>
  {/if}

  <div class="map-overlay-bottom">
    <div class="status-chip">
      缩放 {Math.round(viewState.scale * 100)}%<br />
      中心 {Math.round(viewState.center.x)}, {Math.round(viewState.center.y)} · 细线按屏宽重绘
    </div>
    <div class="map-bottom-actions">
      <button class="btn small primary" onclick={openList}>☷ 列当前视野单元与前缘</button>
    </div>
  </div>
</div>

<style>
  .gully-select {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 10px;
    background: rgba(8, 13, 26, 0.84);
    color: #e5eefc;
    padding: 7px 9px;
    backdrop-filter: blur(10px);
    cursor: pointer;
  }
</style>
