<script>
  import {
    PARAM_LIMITS,
    GRAIN_TYPES,
    DUCT_FORMS,
    MAIN_ROUTES
  } from '../domain/catalog.js';
  import { workspace, generateNetwork, commitNumericParam, resetManualLayout } from '../state.svelte.js';
  import ManualPanel from './ManualPanel.svelte';

  let { schemeId = 'A' } = $props();

  const scheme = $derived(workspace.schemes[schemeId]);
  const grainLineMax = $derived(
    Math.max(PARAM_LIMITS.grainLine.min, Math.min(PARAM_LIMITS.grainLine.max, scheme.params.eaveHeight - 0.4))
  );
  const routeHint = $derived(MAIN_ROUTES.find((r) => r.id === scheme.params.mainRoute)?.hint ?? '');
</script>

<div class="parameter-panel">
  <section class="form-section">
    <div class="section-heading">
      <span class="step">1</span>
      <div>
        <h2>筒仓参数</h2>
        <p>修改后平面圆和剖面轮廓立即更新</p>
      </div>
    </div>

    <div class="field">
      <label for={`d-${schemeId}`}>内径 D（m）</label>
      <input
        id={`d-${schemeId}`}
        data-testid="input-diameter"
        type="number"
        min={PARAM_LIMITS.innerDiameter.min}
        max={PARAM_LIMITS.innerDiameter.max}
        step={PARAM_LIMITS.innerDiameter.step}
        bind:value={scheme.params.innerDiameter}
        onchange={() => commitNumericParam(schemeId, 'innerDiameter')}
      />
      <span class="range-hint">{PARAM_LIMITS.innerDiameter.min}–{PARAM_LIMITS.innerDiameter.max} m</span>
    </div>

    <div class="two-col">
      <div class="field">
        <label for={`h-${schemeId}`}>檐高（m）</label>
        <input
          id={`h-${schemeId}`}
          data-testid="input-eave"
          type="number"
          min={PARAM_LIMITS.eaveHeight.min}
          max={PARAM_LIMITS.eaveHeight.max}
          step={PARAM_LIMITS.eaveHeight.step}
          bind:value={scheme.params.eaveHeight}
          onchange={() => commitNumericParam(schemeId, 'eaveHeight')}
        />
      </div>
      <div class="field">
        <label for={`a-${schemeId}`}>锥底角度（°）</label>
        <input
          id={`a-${schemeId}`}
          data-testid="input-cone-angle"
          type="number"
          min={PARAM_LIMITS.coneAngle.min}
          max={PARAM_LIMITS.coneAngle.max}
          step={PARAM_LIMITS.coneAngle.step}
          bind:value={scheme.params.coneAngle}
          onchange={() => commitNumericParam(schemeId, 'coneAngle')}
        />
      </div>
    </div>

    <div class="field">
      <label for={`g-${schemeId}`}>装粮线（环梁以上 m）</label>
      <input
        id={`g-${schemeId}`}
        data-testid="input-grain-line"
        type="range"
        min={PARAM_LIMITS.grainLine.min}
        max={grainLineMax}
        step={0.1}
        bind:value={scheme.params.grainLine}
        onchange={() => commitNumericParam(schemeId, 'grainLine')}
      />
      <div class="range-value">
        <input
          aria-label="装粮线数值"
          type="number"
          min={PARAM_LIMITS.grainLine.min}
          max={grainLineMax}
          step={0.1}
          bind:value={scheme.params.grainLine}
          onchange={() => commitNumericParam(schemeId, 'grainLine')}
        />
        <span>m · 改后风口跨距重算，已删风口不恢复</span>
      </div>
    </div>
  </section>

  <section class="form-section">
    <div class="section-heading">
      <span class="step">2</span>
      <div>
        <h2>粮种与风道形式</h2>
        <p>用于风量、粮层阻力和设备选型估算</p>
      </div>
    </div>

    <div class="field">
      <label for={`grain-${schemeId}`}>粮种</label>
      <select id={`grain-${schemeId}`} data-testid="select-grain" bind:value={scheme.params.grainType}>
        {#each GRAIN_TYPES as grain (grain.id)}
          <option value={grain.id}>{grain.label} · 容重 {grain.bulkDensity} t/m³</option>
        {/each}
      </select>
    </div>

    <div class="field">
      <span class="label">风道形式</span>
      <div class="segment-grid">
        {#each DUCT_FORMS as form (form.id)}
          <button
            type="button"
            class="segment"
            class:active={scheme.params.ductForm === form.id}
            data-testid={`duct-form-${form.id}`}
            onclick={() => (scheme.params.ductForm = form.id)}
          >
            <strong>{form.label}</strong>
            <small>{form.roughness}</small>
          </button>
        {/each}
      </div>
    </div>

    <div class="field">
      <label for={`route-${schemeId}`}>主风道沿仓底走向</label>
      <select
        id={`route-${schemeId}`}
        data-testid="select-main-route"
        bind:value={scheme.params.mainRoute}
      >
        {#each MAIN_ROUTES as route (route.id)}
          <option value={route.id}>{route.label}</option>
        {/each}
      </select>
      <p class="hint">{routeHint}</p>
    </div>

    <div class="field">
      <label for={`branches-${schemeId}`}>支风道：<strong>{scheme.params.branchCount}</strong> 路</label>
      <input
        id={`branches-${schemeId}`}
        data-testid="input-branch-count"
        type="range"
        min={PARAM_LIMITS.branchCount.min}
        max={PARAM_LIMITS.branchCount.max}
        step={1}
        bind:value={scheme.params.branchCount}
        onchange={() => commitNumericParam(schemeId, 'branchCount')}
      />
    </div>
  </section>

  <section class="form-section">
    <div class="section-heading">
      <span class="step">3</span>
      <div>
        <h2>风口阵列与种子</h2>
        <p>同参数同种子生成结果完全一致</p>
      </div>
    </div>

    <div class="two-col">
      <div class="field">
        <label for={`rows-${schemeId}`}>阵列排数</label>
        <input
          id={`rows-${schemeId}`}
          data-testid="input-rows"
          type="number"
          min={PARAM_LIMITS.arrayRows.min}
          max={PARAM_LIMITS.arrayRows.max}
          step={1}
          bind:value={scheme.params.arrayRows}
          onchange={() => commitNumericParam(schemeId, 'arrayRows')}
        />
      </div>
      <div class="field">
        <label for={`cols-${schemeId}`}>阵列列数</label>
        <input
          id={`cols-${schemeId}`}
          data-testid="input-cols"
          type="number"
          min={PARAM_LIMITS.arrayCols.min}
          max={PARAM_LIMITS.arrayCols.max}
          step={1}
          bind:value={scheme.params.arrayCols}
          onchange={() => commitNumericParam(schemeId, 'arrayCols')}
        />
      </div>
    </div>

    <div class="field">
      <label for={`seed-${schemeId}`}>种子号</label>
      <input
        id={`seed-${schemeId}`}
        data-testid="input-seed"
        type="text"
        inputmode="text"
        placeholder="例如 20261126"
        bind:value={scheme.params.seed}
      />
      <span class="range-hint">换种子会改变支路摆动、放射角和错列；手改记录仍按稳定编号保留</span>
    </div>

    <button
      type="button"
      class="primary generate"
      data-testid="button-generate"
      onclick={() => generateNetwork(schemeId)}
    >
      生成 / 按当前参数重排管网
    </button>
    <button
      type="button"
      class="ghost danger-ghost"
      data-testid="button-reset-layout"
      onclick={() => resetManualLayout(schemeId)}
    >
      清除手改支路与已删风口
    </button>
  </section>

  <ManualPanel {schemeId} />
</div>

<style>
  .parameter-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .form-section {
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid #e2e8f0;
    border-radius: 18px;
    padding: 16px;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.05);
  }

  .section-heading {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    margin-bottom: 14px;
  }

  .step {
    flex: 0 0 28px;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    color: white;
    font-weight: 900;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    box-shadow: 0 6px 14px rgba(37, 99, 235, 0.25);
  }

  h2 {
    margin: 0;
    font-size: 16px;
    color: #0f172a;
  }

  .section-heading p {
    margin: 3px 0 0;
    font-size: 12px;
    color: #64748b;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 13px;
  }

  .field:last-child {
    margin-bottom: 0;
  }

  label,
  .label {
    font-size: 13px;
    font-weight: 750;
    color: #334155;
  }

  label strong {
    color: #0369a1;
  }

  input,
  select {
    width: 100%;
    border: 1px solid #cbd5e1;
    border-radius: 11px;
    padding: 9px 11px;
    font-size: 14px;
    color: #0f172a;
    background: white;
    outline: none;
    transition: border-color 0.16s, box-shadow 0.16s;
  }

  input:focus,
  select:focus {
    border-color: #0284c7;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.16);
  }

  input[type='range'] {
    padding: 0;
    accent-color: #0284c7;
  }

  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .range-hint,
  .hint {
    font-size: 11.5px;
    line-height: 1.45;
    color: #64748b;
    margin: 0;
  }

  .range-value {
    display: grid;
    grid-template-columns: 86px 1fr;
    gap: 9px;
    align-items: center;
  }

  .range-value input {
    padding-block: 7px;
  }

  .range-value span {
    font-size: 11.5px;
    color: #64748b;
    line-height: 1.35;
  }

  .segment-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .segment {
    text-align: left;
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    border-radius: 12px;
    padding: 9px 11px;
    cursor: pointer;
    transition: all 0.16s;
    color: #334155;
  }

  .segment strong {
    display: block;
    font-size: 13px;
  }

  .segment small {
    display: block;
    margin-top: 2px;
    color: #64748b;
    font-size: 11px;
    line-height: 1.35;
  }

  .segment:hover {
    border-color: #38bdf8;
    background: #f0f9ff;
  }

  .segment.active {
    border-color: #0284c7;
    background: linear-gradient(180deg, #e0f2fe, #f0f9ff);
    box-shadow: inset 0 0 0 1px rgba(2, 132, 199, 0.12);
  }

  .primary,
  .ghost {
    width: 100%;
    border-radius: 13px;
    padding: 11px 14px;
    font-size: 14px;
    font-weight: 850;
    cursor: pointer;
    transition: transform 0.12s, box-shadow 0.16s, background 0.16s;
  }

  .primary {
    border: 0;
    color: white;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    box-shadow: 0 12px 24px rgba(37, 99, 235, 0.24);
  }

  .primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 15px 30px rgba(37, 99, 235, 0.3);
  }

  .ghost {
    margin-top: 8px;
    border: 1px solid #cbd5e1;
    background: white;
    color: #475569;
  }

  .ghost:hover {
    background: #f8fafc;
  }

  .danger-ghost {
    color: #b91c1c;
    border-color: #fecaca;
  }

  .danger-ghost:hover {
    background: #fef2f2;
  }
</style>
