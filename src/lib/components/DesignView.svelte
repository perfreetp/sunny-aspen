<script>
  import ParameterPanel from './ParameterPanel.svelte';
  import PlanCanvas from './PlanCanvas.svelte';
  import SectionProfile from './SectionProfile.svelte';
  import NetworkStats from './NetworkStats.svelte';
  import { workspace, setActiveScheme, copySchemeAToB, setView } from '../state.svelte.js';

  const scheme = $derived(workspace.schemes[workspace.activeId]);
</script>

<div class="design-page" data-testid="design-page">
  <aside class="left-rail">
    <div class="scheme-switch" role="tablist" aria-label="选择要编辑的方案">
      {#each ['A', 'B'] as id (id)}
        <button
          type="button"
          role="tab"
          aria-selected={workspace.activeId === id}
          class:active={workspace.activeId === id}
          data-testid={`edit-scheme-${id}`}
          onclick={() => setActiveScheme(id)}
        >
          方案 {id}
        </button>
      {/each}
    </div>
    <ParameterPanel schemeId={workspace.activeId} />
  </aside>

  <section class="workspace-main">
    <div class="workspace-toolbar">
      <div>
        <p class="eyebrow">SILO AERATION GENERATIVE DESIGN</p>
        <h1>筒仓通风道管网生成工作台</h1>
        <p class="subtitle">
          当前编辑 <strong>方案 {scheme.id}</strong>；内径、装粮线变化会驱动几何重排，稳定编号保证手改和删除不被冲掉。
        </p>
      </div>
      <div class="toolbar-actions">
        <button type="button" class="ghost" onclick={copySchemeAToB}>复制 A 到手改 B</button>
        <button type="button" class="primary" data-testid="open-compare" onclick={() => setView('compare')}>
          并排比选 →
        </button>
      </div>
    </div>

    <div class="visual-grid">
      <article class="panel-card plan-card">
        <header class="card-head">
          <div>
            <h2>平面管网与风口阵列</h2>
            <p>PixiJS 实时绘制 · 圆内按内径排布，支路可拖动</p>
          </div>
          <span class="live-dot"><i></i> LIVE</span>
        </header>
        <PlanCanvas schemeId={scheme.id} editable={true} canvasHeight={560} />
      </article>

      <div class="side-column">
        <article class="panel-card">
          <header class="card-head compact-head">
            <div>
              <h2>筒仓剖面轮廓</h2>
              <p>锥底角、檐高与装粮线联动</p>
            </div>
          </header>
          <SectionProfile scheme={scheme} schemeId={scheme.id} />
        </article>

        <article class="panel-card stats-card">
          <header class="card-head compact-head">
            <div>
              <h2>联动计算结果</h2>
              <p>风口间距、支路长度与选型风量</p>
            </div>
          </header>
          <NetworkStats schemeId={scheme.id} />
        </article>
      </div>
    </div>
  </section>
</div>

<style>
  .design-page {
    display: grid;
    grid-template-columns: minmax(350px, 390px) minmax(0, 1fr);
    gap: 18px;
    align-items: start;
  }

  .left-rail {
    position: sticky;
    top: 86px;
    max-height: calc(100vh - 104px);
    overflow-y: auto;
    padding-right: 4px;
    scrollbar-width: thin;
  }

  .scheme-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    padding: 5px;
    margin-bottom: 14px;
    border-radius: 15px;
    background: #e2e8f0;
  }

  .scheme-switch button {
    border: 0;
    border-radius: 11px;
    padding: 10px;
    font-weight: 850;
    color: #475569;
    background: transparent;
    cursor: pointer;
  }

  .scheme-switch button.active {
    color: white;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    box-shadow: 0 8px 18px rgba(37, 99, 235, 0.22);
  }

  .workspace-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .workspace-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 18px;
    padding: 20px 22px;
    border-radius: 22px;
    color: white;
    background:
      radial-gradient(circle at 88% 12%, rgba(56, 189, 248, 0.35), transparent 34%),
      linear-gradient(125deg, #0f3b63 0%, #075985 52%, #1d4ed8 120%);
    box-shadow: 0 22px 50px rgba(7, 89, 133, 0.22);
  }

  .eyebrow {
    margin: 0 0 7px;
    letter-spacing: 0.16em;
    font-size: 11px;
    font-weight: 900;
    color: #7dd3fc;
  }

  h1 {
    margin: 0;
    font-size: clamp(22px, 2.4vw, 32px);
    letter-spacing: -0.03em;
  }

  .subtitle {
    margin: 9px 0 0;
    max-width: 760px;
    color: #d7efff;
    font-size: 13.5px;
    line-height: 1.65;
  }

  .toolbar-actions {
    display: flex;
    flex-direction: column;
    gap: 9px;
    flex: 0 0 auto;
  }

  .primary,
  .ghost {
    border-radius: 12px;
    padding: 10px 15px;
    font-weight: 850;
    cursor: pointer;
    white-space: nowrap;
  }

  .primary {
    border: 0;
    color: #06243a;
    background: #a5f3fc;
    box-shadow: 0 10px 22px rgba(34, 211, 238, 0.2);
  }

  .primary:hover {
    background: #cffafe;
  }

  .ghost {
    border: 1px solid rgba(255, 255, 255, 0.28);
    color: white;
    background: rgba(255, 255, 255, 0.08);
  }

  .ghost:hover {
    background: rgba(255, 255, 255, 0.16);
  }

  .visual-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.55fr) minmax(330px, 0.9fr);
    gap: 16px;
    align-items: start;
  }

  .side-column {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  .panel-card {
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid #e2e8f0;
    border-radius: 20px;
    padding: 15px;
    box-shadow: 0 14px 36px rgba(15, 23, 42, 0.07);
    min-width: 0;
  }

  .plan-card {
    padding: 12px;
  }

  .card-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
    padding: 4px 5px 12px;
  }

  .compact-head {
    padding-bottom: 10px;
  }

  .card-head h2 {
    margin: 0;
    font-size: 16px;
    color: #0f172a;
  }

  .card-head p {
    margin: 4px 0 0;
    font-size: 12px;
    color: #64748b;
    line-height: 1.45;
  }

  .live-dot {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 999px;
    padding: 5px 9px;
    background: #ecfdf5;
    color: #047857;
    font-size: 11px;
    font-weight: 900;
  }

  .live-dot i {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: #10b981;
    box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.14);
  }

  .stats-card :global(.stats-panel) {
    padding: 2px;
  }

  @media (max-width: 1280px) {
    .design-page {
      grid-template-columns: 360px minmax(0, 1fr);
    }

    .visual-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 980px) {
    .design-page {
      grid-template-columns: 1fr;
    }

    .left-rail {
      position: static;
      max-height: none;
      overflow: visible;
    }

    .workspace-toolbar {
      flex-direction: column;
      align-items: stretch;
    }

    .toolbar-actions {
      flex-direction: row;
    }
  }

  @media (max-width: 560px) {
    .toolbar-actions {
      flex-direction: column;
    }
  }
</style>
