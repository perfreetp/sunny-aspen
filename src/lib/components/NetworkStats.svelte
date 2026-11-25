<script>
  import { buildNetwork, getGrainType, getDuctForm, getMainRoute } from '../domain/geometry.js';
  import { workspace } from '../state.svelte.js';

  let { schemeId = 'A', compact = false } = $props();

  const scheme = $derived(workspace.schemes[schemeId]);
  const network = $derived(buildNetwork(scheme));
  const grain = $derived(getGrainType(network.params.grainType));
  const ductForm = $derived(getDuctForm(network.params.ductForm));
  const route = $derived(getMainRoute(network.params.mainRoute));
</script>

<div class="stats-panel" class:compact data-testid={`stats-${schemeId}`}>
  <div class="metric">
    <span>风口 X 向间距</span>
    <strong data-testid="spacing-x">{network.stats.spacingX.toFixed(2)} m</strong>
  </div>
  <div class="metric">
    <span>风口 Y 向间距</span>
    <strong>{network.stats.spacingY.toFixed(2)} m</strong>
  </div>
  <div class="metric">
    <span>支风道总长</span>
    <strong data-testid="branch-length">{network.stats.branchLengthM.toFixed(1)} m</strong>
  </div>
  <div class="metric">
    <span>主风道长度</span>
    <strong>{network.stats.mainLengthM.toFixed(1)} m</strong>
  </div>
  <div class="metric">
    <span>在用风口</span>
    <strong data-testid="active-vents">{network.stats.activeVentCount} 个</strong>
  </div>
  <div class="metric">
    <span>粮堆质量</span>
    <strong>{network.stats.grainMassT.toFixed(0)} t</strong>
  </div>
  <div class="metric wide">
    <span>估算所需风量</span>
    <strong data-testid="airflow">{network.stats.airflowM3h.toLocaleString('zh-CN')} m³/h</strong>
  </div>
  <div class="metric wide">
    <span>建议风机压力区间（方案估算）</span>
    <strong>{network.stats.pressureRangePa[0]}–{network.stats.pressureRangePa[1]} Pa</strong>
  </div>

  {#if !compact}
    <div class="engineering-note">
      <strong>{grain.label} · {ductForm.label} · {route.label}</strong>
      <p>
        按单位通风量 {grain.ventilationRate} m³/(h·t)、容重 {grain.bulkDensity} t/m³ 估算；
        风口出口风速约 {network.stats.ventVelocityMs.toFixed(2)} m/s。{grain.note}。
        该结果用于设计院方案比选，设备选型前仍应按风网阻力计算和当地规范复核。
      </p>
    </div>
  {/if}
</div>

<style>
  .stats-panel {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 9px;
  }

  .metric {
    min-width: 0;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 13px;
    padding: 10px 11px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .metric span {
    color: #64748b;
    font-size: 11.5px;
    white-space: nowrap;
  }

  .metric strong {
    color: #0f172a;
    font-size: 16px;
    line-height: 1.15;
  }

  .metric.wide {
    grid-column: span 2;
  }

  .engineering-note {
    grid-column: 1 / -1;
    border-radius: 14px;
    padding: 12px 13px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
  }

  .engineering-note strong {
    color: #1d4ed8;
    font-size: 13px;
  }

  .engineering-note p {
    margin: 6px 0 0;
    color: #475569;
    font-size: 12px;
    line-height: 1.6;
  }

  .compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .compact .metric.wide {
    grid-column: auto;
  }

  @media (max-width: 1100px) {
    .stats-panel {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .metric.wide {
      grid-column: span 2;
    }
  }
</style>
