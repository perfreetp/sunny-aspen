<script>
  import PlanCanvas from './PlanCanvas.svelte';
  import NetworkStats from './NetworkStats.svelte';
  import { buildNetwork, getGrainType, getMainRoute } from '../domain/geometry.js';
  import { workspace, chooseWinner, setActiveScheme, setView } from '../state.svelte.js';

  const networks = $derived({
    A: buildNetwork(workspace.schemes.A),
    B: buildNetwork(workspace.schemes.B)
  });

  const rows = $derived([
    { label: '内径', key: 'innerDiameter', unit: 'm' },
    { label: '檐高', key: 'eaveHeight', unit: 'm' },
    { label: '锥底角', key: 'coneAngle', unit: '°' },
    { label: '装粮线', key: 'grainLine', unit: 'm' },
    { label: '支风道', key: 'branchCount', unit: '路' },
    { label: '阵列', format: (p) => `${p.arrayRows} 排 × ${p.arrayCols} 列` },
    { label: '种子', key: 'seed' },
    { label: '平面指纹', format: (p, n) => n.fingerprint }
  ]);

  function editScheme(id) {
    setActiveScheme(id);
    setView('design');
  }
</script>

<div class="compare-page" data-testid="compare-page">
  <header class="compare-header">
    <div>
      <p class="eyebrow">SCHEME COMPARISON</p>
      <h1>两套管网方案并排比选</h1>
      <p>几何、风量、风口间距和手改记录均按各自参数与种子独立计算。选定后进入设备厂选型交接。</p>
    </div>
    <button type="button" class="primary big" data-testid="go-handoff" onclick={() => setView('handoff')}>
      用方案 {workspace.winnerId} 做选型交接 →
    </button>
  </header>

  <div class="compare-grid">
    {#each ['A', 'B'] as id (id)}
      {@const scheme = workspace.schemes[id]}
      {@const network = networks[id]}
      {@const grain = getGrainType(scheme.params.grainType)}
      {@const route = getMainRoute(scheme.params.mainRoute)}
      <article
        class="compare-column"
        class:winner={workspace.winnerId === id}
        data-testid={`compare-column-${id}`}
      >
        <div class="column-head">
          <div>
            <div class="title-line">
              <h2>方案 {id}</h2>
              {#if workspace.winnerId === id}
                <span class="winner-badge">✓ 已选定</span>
              {/if}
            </div>
            <p>{grain.label} · {route.label} · 种子 {scheme.params.seed}</p>
          </div>
          <button
            type="button"
            class="select-button"
            class:selected={workspace.winnerId === id}
            data-testid={`choose-${id}`}
            onclick={() => chooseWinner(id)}
          >
            {workspace.winnerId === id ? '已挑这一套' : '挑这一套'}
          </button>
        </div>

        <div class="param-chips">
          <span>Ø {scheme.params.innerDiameter} m</span>
          <span>檐高 {scheme.params.eaveHeight} m</span>
          <span>α {scheme.params.coneAngle}°</span>
          <span>粮线 {scheme.params.grainLine} m</span>
          <span>{scheme.params.branchCount} 路支路</span>
          <span>{scheme.params.arrayRows}×{scheme.params.arrayCols} 风口</span>
        </div>

        <PlanCanvas schemeId={id} editable={false} compact={true} canvasHeight={410} />

        <NetworkStats schemeId={id} compact={true} />

        <div class="column-actions">
          <button type="button" class="ghost" data-testid={`edit-${id}`} onclick={() => editScheme(id)}>
            回工作台细调
          </button>
          <button type="button" class="primary" onclick={() => chooseWinner(id)}>
            交给设备厂做选型
          </button>
        </div>
      </article>
    {/each}
  </div>

  <section class="diff-table card">
    <div class="table-head">
      <h2>参数与结果差异表</h2>
      <p>设计院比选会可直接照表讨论；数值随表单和手改记录实时更新。</p>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>比选项</th>
            <th>方案 A</th>
            <th>方案 B</th>
            <th>差异 / 说明</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.label)}
            {@const aText = row.format ? row.format(workspace.schemes.A.params, networks.A) : workspace.schemes.A.params[row.key]}
            {@const bText = row.format ? row.format(workspace.schemes.B.params, networks.B) : workspace.schemes.B.params[row.key]}
            <tr>
              <th>{row.label}</th>
              <td data-testid={`diff-a-${row.label}`}>{aText}{row.unit ?? ''}</td>
              <td>{bText}{row.unit ?? ''}</td>
              <td class="muted">
                {#if row.key && typeof aText === 'number' && typeof bText === 'number'}
                  差值 {Math.abs(bText - aText).toFixed(2)} {row.unit ?? ''}
                {:else if aText === bText}
                  一致
                {:else}
                  两套不同
                {/if}
              </td>
            </tr>
          {/each}
          <tr>
            <th>X 向风口间距</th>
            <td>{networks.A.stats.spacingX.toFixed(2)} m</td>
            <td>{networks.B.stats.spacingX.toFixed(2)} m</td>
            <td class="muted">内径越大，间距越大；装粮深度系数另作加密修正</td>
          </tr>
          <tr>
            <th>管道总长</th>
            <td>{networks.A.stats.totalDuctLengthM.toFixed(1)} m</td>
            <td>{networks.B.stats.totalDuctLengthM.toFixed(1)} m</td>
            <td class="muted">含主风道与全部支风道</td>
          </tr>
          <tr>
            <th>所需风量</th>
            <td>{networks.A.stats.airflowM3h.toLocaleString('zh-CN')} m³/h</td>
            <td>{networks.B.stats.airflowM3h.toLocaleString('zh-CN')} m³/h</td>
            <td class="muted">按粮种单位通风量估算</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</div>

<style>
  .compare-page {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .compare-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 18px;
    padding: 22px 24px;
    color: white;
    border-radius: 24px;
    background:
      radial-gradient(circle at 92% 20%, rgba(45, 212, 191, 0.28), transparent 32%),
      linear-gradient(125deg, #0f172a, #075985 58%, #1d4ed8);
    box-shadow: 0 24px 55px rgba(15, 23, 42, 0.22);
  }

  .eyebrow {
    margin: 0 0 7px;
    color: #67e8f9;
    letter-spacing: 0.16em;
    font-size: 11px;
    font-weight: 900;
  }

  h1 {
    margin: 0;
    font-size: clamp(24px, 3vw, 36px);
    letter-spacing: -0.03em;
  }

  .compare-header p:last-child {
    margin: 9px 0 0;
    color: #cbd5e1;
    font-size: 13.5px;
    line-height: 1.6;
    max-width: 760px;
  }

  .primary {
    border: 0;
    border-radius: 13px;
    padding: 11px 16px;
    background: #5eead4;
    color: #042f2e;
    font-weight: 900;
    cursor: pointer;
    white-space: nowrap;
  }

  .primary:hover {
    background: #99f6e4;
  }

  .primary.big {
    padding: 13px 18px;
    box-shadow: 0 14px 30px rgba(45, 212, 191, 0.2);
  }

  .compare-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
  }

  .compare-column {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 13px;
    padding: 16px;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.96);
    border: 2px solid #e2e8f0;
    box-shadow: 0 16px 40px rgba(15, 23, 42, 0.07);
  }

  .compare-column.winner {
    border-color: #10b981;
    box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.12), 0 20px 45px rgba(4, 120, 87, 0.14);
  }

  .column-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .title-line {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  h2 {
    margin: 0;
    font-size: 21px;
    color: #0f172a;
  }

  .column-head p {
    margin: 5px 0 0;
    color: #64748b;
    font-size: 12.5px;
  }

  .winner-badge {
    background: #d1fae5;
    color: #047857;
    border-radius: 999px;
    padding: 4px 9px;
    font-size: 11.5px;
    font-weight: 900;
  }

  .select-button {
    border: 1px solid #0284c7;
    background: white;
    color: #0369a1;
    border-radius: 999px;
    padding: 9px 13px;
    font-weight: 850;
    cursor: pointer;
    white-space: nowrap;
  }

  .select-button.selected {
    background: #059669;
    border-color: #059669;
    color: white;
  }

  .param-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .param-chips span {
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    color: #334155;
    border-radius: 999px;
    padding: 5px 9px;
    font-size: 11.5px;
    font-weight: 750;
  }

  .column-actions {
    display: grid;
    grid-template-columns: 1fr 1.25fr;
    gap: 9px;
  }

  .column-actions .ghost,
  .column-actions .primary {
    border-radius: 12px;
    padding: 10px 12px;
    font-weight: 850;
    cursor: pointer;
  }

  .ghost {
    border: 1px solid #cbd5e1;
    background: white;
    color: #334155;
  }

  .ghost:hover {
    background: #f8fafc;
  }

  .column-actions .primary {
    background: linear-gradient(135deg, #059669, #0d9488);
    color: white;
  }

  .card {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 22px;
    padding: 18px;
    box-shadow: 0 14px 36px rgba(15, 23, 42, 0.06);
  }

  .table-head h2 {
    font-size: 18px;
  }

  .table-head p {
    margin: 5px 0 14px;
    color: #64748b;
    font-size: 12.5px;
  }

  .table-scroll {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    min-width: 680px;
  }

  th,
  td {
    text-align: left;
    padding: 11px 12px;
    border-bottom: 1px solid #e2e8f0;
    font-size: 13px;
  }

  thead th {
    background: #f8fafc;
    color: #0f172a;
    font-size: 13px;
  }

  tbody th {
    color: #334155;
    font-weight: 800;
  }

  td {
    color: #0f172a;
    font-variant-numeric: tabular-nums;
  }

  .muted {
    color: #64748b !important;
  }

  @media (max-width: 1100px) {
    .compare-grid {
      grid-template-columns: 1fr;
    }

    .compare-header {
      flex-direction: column;
      align-items: stretch;
    }

    .primary.big {
      width: 100%;
    }
  }
</style>
