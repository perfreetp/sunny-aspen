<script>
  import { buildNetwork } from '../domain/geometry.js';
  import {
    workspace,
    setBranchOverride,
    resetBranchOverride,
    restoreVent,
    restoreAllVents
  } from '../state.svelte.js';

  let { schemeId = 'A' } = $props();

  const scheme = $derived(workspace.schemes[schemeId]);
  const network = $derived(buildNetwork(scheme));
  const selectedBranch = $derived(network.branches.find((b) => b.id === workspace.selectedBranchId) ?? null);
  const manualBranches = $derived(network.branches.filter((b) => b.manual));

  function ventLabel(id) {
    const match = /v-(\d+)-(\d+)/.exec(id);
    if (!match) return id;
    return `第 ${Number(match[1]) + 1} 排 · 第 ${Number(match[2]) + 1} 列`;
  }
</script>

<section class="manual-panel" data-testid="manual-panel">
  <div class="panel-title">
    <h2>手改保留栏</h2>
    <span class="count">{manualBranches.length} 路手改 · {scheme.removedVentIds.length} 个风口删除</span>
  </div>

  {#if selectedBranch}
    <div class="inspector-card branch" data-testid="selected-branch-editor">
      <div class="inspector-head">
        <strong>支路 {selectedBranch.index + 1}</strong>
        <span class="tag" class:manual={selectedBranch.manual}>
          {selectedBranch.manual ? '已手改 · 改内径保留' : '自动位置'}
        </span>
      </div>
      <p class="meta">当前计算长度 {selectedBranch.lengthM.toFixed(2)} m；内径变化时长度自动跟随。</p>

      {#if selectedBranch.mode === 'comb'}
        <label class="edit-field">
          <span>横向绝对位置 x（m）</span>
          <input
            data-testid="branch-x-input"
            type="number"
            step="0.1"
            value={selectedBranch.points[0].x}
            onchange={(event) => {
              const value = Number(event.currentTarget.value);
              if (Number.isFinite(value)) setBranchOverride(schemeId, selectedBranch.id, { xM: value });
            }}
          />
        </label>
        <p class="hint">也可在平面图上直接左右拖动该支路。位置按米制记录，不随内径重排清零。</p>
      {:else}
        <label class="edit-field">
          <span>方向角（°）</span>
          <input
            data-testid="branch-angle-input"
            type="number"
            step="1"
            value={selectedBranch.angleDeg}
            onchange={(event) => {
              const value = Number(event.currentTarget.value);
              if (Number.isFinite(value)) setBranchOverride(schemeId, selectedBranch.id, { angleDeg: value });
            }}
          />
        </label>
        <p class="hint">也可绕圆心拖动旋转。换内径只改长度，不改已保留方向。</p>
      {/if}

      <button type="button" class="small-reset" onclick={() => resetBranchOverride(schemeId, selectedBranch.id)}>
        恢复此路自动排布
      </button>
    </div>
  {:else if workspace.selectedVentId}
    <div class="inspector-card vent">
      <strong>风口 {workspace.selectedVentId}</strong>
      <p>点击画布上的红色 × 或按 Delete 可删除。</p>
    </div>
  {:else}
    <div class="empty-tip">在平面图中点选支路可精确改位，点选风口可删除。</div>
  {/if}

  {#if scheme.removedVentIds.length > 0}
    <div class="deleted-list" data-testid="deleted-vent-list">
      <div class="list-head">
        <strong>已删风口（{scheme.removedVentIds.length}）</strong>
        <button type="button" onclick={() => restoreAllVents(schemeId)}>全部恢复</button>
      </div>
      <div class="chips">
        {#each scheme.removedVentIds as id (id)}
          <span class="deleted-chip">
            <span>{ventLabel(id)}</span>
            <button
              type="button"
              aria-label={`恢复 ${id}`}
              data-testid={`restore-${id}`}
              onclick={() => restoreVent(schemeId, id)}
            >
              ↺
            </button>
          </span>
        {/each}
      </div>
      <p class="hint">这些稳定行列编号会在改装粮线、内径或重新生成时持续排除。</p>
    </div>
  {/if}
</section>

<style>
  .manual-panel {
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 18px;
    padding: 15px;
  }

  .panel-title {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: flex-start;
    margin-bottom: 10px;
  }

  h2 {
    margin: 0;
    font-size: 15px;
    color: #78350f;
  }

  .count {
    font-size: 11px;
    color: #92400e;
    background: #fef3c7;
    border-radius: 999px;
    padding: 4px 8px;
    white-space: nowrap;
  }

  .inspector-card {
    background: white;
    border-radius: 13px;
    padding: 12px;
    border: 1px solid #fcd34d;
  }

  .inspector-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .tag {
    font-size: 11px;
    color: #0369a1;
    background: #e0f2fe;
    border-radius: 999px;
    padding: 3px 8px;
    font-weight: 800;
  }

  .tag.manual {
    color: #92400e;
    background: #fef3c7;
  }

  .meta {
    margin: 7px 0 10px;
    color: #64748b;
    font-size: 12px;
    line-height: 1.45;
  }

  .edit-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
    font-weight: 750;
    color: #475569;
  }

  .edit-field input {
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    padding: 8px 10px;
    font-size: 14px;
  }

  .hint,
  .empty-tip {
    font-size: 11.5px;
    line-height: 1.5;
    color: #92400e;
    margin: 8px 0 0;
  }

  .empty-tip {
    background: rgba(255, 255, 255, 0.62);
    border: 1px dashed #fbbf24;
    border-radius: 12px;
    padding: 10px;
  }

  .small-reset {
    margin-top: 10px;
    width: 100%;
    border: 1px solid #f59e0b;
    background: #fff7ed;
    color: #b45309;
    font-weight: 800;
    border-radius: 10px;
    padding: 8px 10px;
    cursor: pointer;
  }

  .small-reset:hover {
    background: #ffedd5;
  }

  .deleted-list {
    margin-top: 12px;
  }

  .list-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    color: #7f1d1d;
    font-size: 13px;
  }

  .list-head button {
    border: 0;
    background: transparent;
    color: #b91c1c;
    font-weight: 850;
    cursor: pointer;
    font-size: 12px;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .deleted-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #fee2e2;
    color: #991b1b;
    border-radius: 999px;
    padding: 4px 6px 4px 9px;
    font-size: 11.5px;
    font-weight: 700;
  }

  .deleted-chip button {
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: 999px;
    background: #fecaca;
    color: #7f1d1d;
    cursor: pointer;
    font-weight: 900;
  }

  .deleted-chip button:hover {
    background: #fca5a5;
  }
</style>
