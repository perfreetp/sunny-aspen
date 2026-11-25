<script>
  import { ui, collab, getProject, projectState } from '../state.svelte.js';
  import { downloadBriefingPng, downloadHandoff } from '../briefing.js';

  let { image = '', zones = [] } = $props();
  const project = $derived.by(() => {
    projectState.reloadToken;
    return getProject();
  });

  function png() {
    downloadBriefingPng(image, project);
  }

  function geojson() {
    downloadHandoff(project, {
      mapperIds: collab.peers.mapper.ids,
      assessorIds: collab.peers.assessor.ids,
      zones,
      viewState: { activeView: ui.activeView, mode: ui.mode }
    });
  }
</script>

{#if ui.briefingOpen}
  <div
    class="modal-backdrop"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="会商周预览"
    onclick={(e) => e.target === e.currentTarget && (ui.briefingOpen = false)}
    onkeydown={(e) => e.key === 'Escape' && (ui.briefingOpen = false)}
  >
    <section class="modal">
      <header class="modal-header">
        <div>
          <h2>会商用图面与避险划定交接包</h2>
          <p>保留当前分层、期次、两端选中状态、前缘和避险范围；可下载 PNG 或 GeoJSON 继续划定。</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn primary" onclick={png} disabled={!image}>⤓ 下载会商 PNG</button>
          <button class="btn pink" onclick={geojson}>⤓ 下载交接 GeoJSON</button>
          <button class="btn ghost" onclick={() => (ui.briefingOpen = false)}>关闭</button>
        </div>
      </header>
      <div class="modal-body">
        {#if image}
          <img class="briefing-map" src={image} alt="火山熔岩流单元会商周" />
        {:else}
          <div class="empty-state">正在拼接地图、图例和选中状态…</div>
        {/if}
        <div class="briefing-grid" style="margin-top:16px;">
          <div class="selection-card">
            <strong>交接内容</strong>
            <p class="hint">
              GeoJSON 中包含：两端选中的熔岩流单元 Polygon、每个单元的前缘 Point、当前叠加的村子/自定义避险范围，以及顶层
              metadata 中的分层配色、工程 r{project?.revision}、视图和 selection 状态。
            </p>
          </div>
          <div class="selection-card">
            <strong>当前选中</strong>
            <div class="legend-list" style="margin-top:8px;">
              <span class="legend-item" style="color:var(--cyan)">● 编图：{collab.peers.mapper.ids.length} 个</span>
              <span class="legend-item" style="color:var(--pink)">● 评估：{collab.peers.assessor.ids.length} 个</span>
              <span class="legend-item" style="color:var(--violet)">▱ 避险范围：{zones.length} 个</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
{/if}
