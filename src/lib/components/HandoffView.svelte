<script>
  import PlanCanvas from './PlanCanvas.svelte';
  import { buildNetwork, getGrainType, getDuctForm, getMainRoute } from '../domain/geometry.js';
  import { workspace, setView, confirmHandoff, showToast } from '../state.svelte.js';

  const winnerId = $derived(workspace.winnerId);
  const scheme = $derived(workspace.schemes[winnerId]);
  const network = $derived(buildNetwork(scheme));
  const grain = $derived(getGrainType(network.params.grainType));
  const ductForm = $derived(getDuctForm(network.params.ductForm));
  const route = $derived(getMainRoute(network.params.mainRoute));

  function buildPayload() {
    return {
      documentType: '筒仓通风系统选型条件交接单',
      schemeId: winnerId,
      generatedAt: new Date().toISOString(),
      silo: {
        innerDiameterM: network.params.innerDiameter,
        eaveHeightM: network.params.eaveHeight,
        coneAngleDeg: network.params.coneAngle,
        grainLineM: network.params.grainLine
      },
      grain: {
        type: grain.label,
        bulkDensityTPerM3: grain.bulkDensity,
        ventilationRateM3hPerT: grain.ventilationRate
      },
      ductSystem: {
        form: ductForm.label,
        mainRoute: route.label,
        seed: network.params.seed,
        layoutFingerprint: network.fingerprint,
        mainLengthM: network.stats.mainLengthM,
        branchLengthM: network.stats.branchLengthM,
        totalDuctLengthM: network.stats.totalDuctLengthM,
        mainWidthM: network.main.width,
        branchWidthM: network.silo.branchWidth,
        branches: network.branches.map((b) => ({
          id: b.id.toUpperCase(),
          mode: b.mode,
          lengthM: b.lengthM,
          manuallyPositioned: b.manual,
          pointsM: b.points
        }))
      },
      ventArray: {
        rows: network.params.arrayRows,
        columns: network.params.arrayCols,
        designedCount: network.stats.gridVentCount,
        activeCount: network.stats.activeVentCount,
        spacingXM: network.stats.spacingX,
        spacingYM: network.stats.spacingY,
        radiusM: network.silo.ventRadius,
        removedVentIds: scheme.removedVentIds,
        ventsM: network.vents.map((v) => ({ id: v.id, xM: v.x, yM: v.y }))
      },
      selectionConditions: {
        grainMassT: network.stats.grainMassT,
        requiredAirflowM3h: network.stats.airflowM3h,
        requiredAirflowM3s: network.stats.airflowM3s,
        suggestedPressureRangePa: network.stats.pressureRangePa,
        ventFaceVelocityMs: network.stats.ventVelocityMs
      },
      designOfficeNote: scheme.handoffNote ?? ''
    };
  }

  function summaryText() {
    const p = buildPayload();
    return [
      '筒仓通风系统选型条件交接单',
      `选定方案：${p.schemeId}（指纹 ${p.ductSystem.layoutFingerprint}，种子 ${p.ductSystem.seed}）`,
      `筒仓：内径 ${p.silo.innerDiameterM} m，檐高 ${p.silo.eaveHeightM} m，锥底角 ${p.silo.coneAngleDeg}°，装粮线 ${p.silo.grainLineM} m`,
      `粮种：${p.grain.type}；容重 ${p.grain.bulkDensityTPerM3} t/m³；单位通风量 ${p.grain.ventilationRateM3hPerT} m³/(h·t)`,
      `风道：${p.ductSystem.form}，${p.ductSystem.mainRoute}；管道总长约 ${p.ductSystem.totalDuctLengthM} m`,
      `风口：${p.ventArray.rows} 排 × ${p.ventArray.columns} 列，在用 ${p.ventArray.activeCount} 个，X 间距 ${p.ventArray.spacingXM} m`,
      `选型条件：粮量约 ${p.selectionConditions.grainMassT} t，风量约 ${p.selectionConditions.requiredAirflowM3h} m³/h，压力参考 ${p.selectionConditions.suggestedPressureRangePa[0]}–${p.selectionConditions.suggestedPressureRangePa[1]} Pa`,
      p.designOfficeNote ? `设计院备注：${p.designOfficeNote}` : '',
      '注：压力与风机型号为方案阶段估算，设备厂应结合风网阻力、海拔、粮温和标准工况复核。'
    ].filter(Boolean).join('\n');
  }

  async function copySummary() {
    const text = summaryText();
    try {
      await navigator.clipboard.writeText(text);
      showToast('交接摘要已复制，可粘贴给设备厂');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      showToast('交接摘要已复制');
    }
  }

  function downloadJson() {
    const payload = buildPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `silo-ventilation-handoff-${winnerId}-${network.fingerprint}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('JSON 坐标与材料清单已导出');
  }
</script>

<div class="handoff-page" data-testid="handoff-page">
  <header class="handoff-header">
    <div>
      <p class="eyebrow">EQUIPMENT VENDOR HANDOFF</p>
      <h1>把方案 {winnerId} 交给设备厂选型</h1>
      <p>汇总筒仓边界、粮种、风量压力参考、管网长度和风口坐标；确认后可复制摘要或导出 JSON。</p>
    </div>
    <div class="header-actions">
      <button type="button" class="ghost" onclick={() => setView('compare')}>← 回比选换一套</button>
      <button type="button" class="ghost" onclick={() => window.print()}>打印 / 另存 PDF</button>
    </div>
  </header>

  <div class="handoff-grid">
    <section class="preview-card card">
      <div class="card-title-row">
        <h2>选定管网预览</h2>
        <span class="fingerprint">种子 {network.params.seed} · {network.fingerprint}</span>
      </div>
      <PlanCanvas schemeId={winnerId} editable={false} compact={true} canvasHeight={430} />

      <div class="confirm-row">
        <label class="note-field">
          <span>给设备厂的备注</span>
          <textarea
            data-testid="handoff-note"
            rows="3"
            placeholder="例如：要求风机防爆/低噪，风口采用 304 不锈钢冲孔盖板，接口方位以土建图为准……"
            bind:value={scheme.handoffNote}
          ></textarea>
        </label>
        <button
          type="button"
          class="confirm-button"
          data-testid="confirm-handoff"
          class:confirmed={scheme.handedOff}
          onclick={() => confirmHandoff(scheme.handoffNote)}
        >
          {scheme.handedOff ? '✓ 交接单已确认（可再次更新）' : '确认选用并生成交接单'}
        </button>
        {#if scheme.handedOff}
          <p class="confirmed-tip">本方案已标记为可移交。建议复制摘要并导出 JSON 一并发给设备厂。</p>
        {/if}
        <div class="action-row">
          <button type="button" class="primary" data-testid="copy-summary" onclick={copySummary}>复制交接摘要</button>
          <button type="button" class="secondary" data-testid="export-json" onclick={downloadJson}>导出坐标/BOM JSON</button>
        </div>
      </div>
    </section>

    <aside class="summary-column">
      <section class="card conditions">
        <h2>选型边界条件</h2>
        <dl>
          <div><dt>筒仓内径</dt><dd>{network.params.innerDiameter} m</dd></div>
          <div><dt>檐高 / 装粮线</dt><dd>{network.params.eaveHeight} / {network.params.grainLine} m</dd></div>
          <div><dt>锥底角度</dt><dd>{network.params.coneAngle}°</dd></div>
          <div><dt>粮种</dt><dd>{grain.label}</dd></div>
          <div><dt>粮量估算</dt><dd>{network.stats.grainMassT} t</dd></div>
          <div><dt>单位通风量</dt><dd>{grain.ventilationRate} m³/(h·t)</dd></div>
          <div><dt>所需风量</dt><dd class="strong">{network.stats.airflowM3h.toLocaleString('zh-CN')} m³/h</dd></div>
          <div><dt>压力参考</dt><dd>{network.stats.pressureRangePa[0]}–{network.stats.pressureRangePa[1]} Pa</dd></div>
          <div><dt>风道形式</dt><dd>{ductForm.label}</dd></div>
          <div><dt>主风道</dt><dd>{route.label}</dd></div>
        </dl>
      </section>

      <section class="card bom">
        <h2>管网与风口清单</h2>
        <div class="bom-summary">
          <span>主管 <strong>{network.stats.mainLengthM} m</strong></span>
          <span>支管 <strong>{network.stats.branchLengthM} m</strong></span>
          <span>总计 <strong>{network.stats.totalDuctLengthM} m</strong></span>
          <span>风口 <strong>{network.stats.activeVentCount} 个</strong></span>
        </div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>支路</th><th>类型</th><th>长度</th><th>定位</th></tr>
            </thead>
            <tbody>
              {#each network.branches as branch (branch.id)}
                <tr>
                  <th>{branch.id.toUpperCase()}</th>
                  <td>{branch.mode === 'comb' ? '梳形' : branch.mode === 'radial' ? '放射' : '环接放射'}</td>
                  <td>{branch.lengthM.toFixed(2)} m</td>
                  <td>{branch.manual ? '手改保留' : '自动'} </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if scheme.removedVentIds.length}
          <p class="excluded">已排除设计院手动删除的 {scheme.removedVentIds.length} 个风口：{scheme.removedVentIds.join(', ')}</p>
        {/if}
      </section>
    </aside>
  </div>
</div>

<style>
  .handoff-page {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .handoff-header {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: flex-end;
    padding: 22px 24px;
    color: white;
    border-radius: 24px;
    background:
      radial-gradient(circle at 90% 10%, rgba(251, 191, 36, 0.25), transparent 30%),
      linear-gradient(125deg, #451a03, #92400e 48%, #0f766e 120%);
  }

  .eyebrow {
    margin: 0 0 7px;
    color: #fcd34d;
    letter-spacing: 0.16em;
    font-size: 11px;
    font-weight: 900;
  }

  h1 {
    margin: 0;
    font-size: clamp(23px, 3vw, 34px);
    letter-spacing: -0.03em;
  }

  .handoff-header p {
    margin: 9px 0 0;
    color: #ffedd5;
    font-size: 13.5px;
    line-height: 1.6;
  }

  .header-actions {
    display: flex;
    gap: 9px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .ghost {
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border-radius: 12px;
    padding: 10px 14px;
    font-weight: 850;
    cursor: pointer;
  }

  .ghost:hover {
    background: rgba(255, 255, 255, 0.18);
  }

  .card {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 22px;
    padding: 18px;
    box-shadow: 0 14px 36px rgba(15, 23, 42, 0.07);
    min-width: 0;
  }

  .handoff-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(340px, 0.75fr);
    gap: 18px;
    align-items: start;
  }

  .preview-card {
    padding: 14px;
  }

  .card-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 2px 4px 12px;
  }

  h2 {
    margin: 0;
    font-size: 17px;
    color: #0f172a;
  }

  .fingerprint {
    color: #92400e;
    background: #fef3c7;
    border-radius: 999px;
    padding: 5px 9px;
    font-size: 11.5px;
    font-weight: 900;
  }

  .confirm-row {
    padding: 14px 4px 2px;
  }

  .note-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 800;
    color: #334155;
  }

  textarea {
    width: 100%;
    border: 1px solid #cbd5e1;
    border-radius: 13px;
    padding: 10px 12px;
    font: inherit;
    font-size: 13.5px;
    resize: vertical;
    outline: none;
  }

  textarea:focus {
    border-color: #0284c7;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.15);
  }

  .confirm-button {
    width: 100%;
    margin-top: 11px;
    border: 0;
    border-radius: 14px;
    padding: 13px 15px;
    background: linear-gradient(135deg, #d97706, #059669);
    color: white;
    font-size: 15px;
    font-weight: 950;
    cursor: pointer;
    box-shadow: 0 14px 28px rgba(5, 150, 105, 0.2);
  }

  .confirm-button.confirmed {
    background: linear-gradient(135deg, #059669, #0d9488);
  }

  .confirmed-tip {
    margin: 8px 0 0;
    color: #047857;
    font-size: 12.5px;
    font-weight: 700;
  }

  .action-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 9px;
    margin-top: 10px;
  }

  .primary,
  .secondary {
    border-radius: 12px;
    padding: 10px 13px;
    font-weight: 850;
    cursor: pointer;
  }

  .primary {
    border: 0;
    background: #0284c7;
    color: white;
  }

  .secondary {
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    color: #334155;
  }

  .summary-column {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  dl {
    margin: 12px 0 0;
    display: flex;
    flex-direction: column;
  }

  dl div {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 9px 0;
    border-bottom: 1px solid #e2e8f0;
  }

  dt {
    color: #64748b;
    font-size: 13px;
  }

  dd {
    margin: 0;
    text-align: right;
    color: #0f172a;
    font-size: 13px;
    font-weight: 800;
  }

  dd.strong {
    color: #0369a1;
    font-size: 15px;
  }

  .bom-summary {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin: 12px 0;
  }

  .bom-summary span {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 9px;
    font-size: 12px;
    color: #64748b;
  }

  .bom-summary strong {
    display: block;
    margin-top: 3px;
    color: #0f172a;
    font-size: 15px;
  }

  .table-scroll {
    max-height: 310px;
    overflow: auto;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 8px 10px;
    border-bottom: 1px solid #e2e8f0;
    font-size: 12.5px;
    text-align: left;
  }

  thead th {
    position: sticky;
    top: 0;
    background: #f1f5f9;
    z-index: 1;
  }

  .excluded {
    margin: 11px 0 0;
    padding: 10px;
    border-radius: 11px;
    background: #fef2f2;
    color: #991b1b;
    font-size: 12px;
    line-height: 1.5;
  }

  @media (max-width: 1100px) {
    .handoff-grid {
      grid-template-columns: 1fr;
    }

    .handoff-header {
      flex-direction: column;
      align-items: stretch;
    }

    .header-actions {
      justify-content: flex-start;
    }
  }

  @media (max-width: 560px) {
    .action-row {
      grid-template-columns: 1fr;
    }
  }
</style>
