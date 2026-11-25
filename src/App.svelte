<script>
  import { onMount } from 'svelte';
  import DesignView from './lib/components/DesignView.svelte';
  import CompareView from './lib/components/CompareView.svelte';
  import HandoffView from './lib/components/HandoffView.svelte';
  import { buildNetwork } from './lib/domain/geometry.js';
  import {
    workspace,
    setView,
    persistWorkspace,
    generateNetwork,
    setBranchOverride,
    removeVent,
    restoreVent,
    chooseWinner
  } from './lib/state.svelte.js';

  $effect(() => {
    // JSON.stringify reads the full reactive state graph before persisting.
    JSON.stringify(workspace);
    persistWorkspace();
  });

  onMount(() => {
    // Stable debug/automation handle; normal use goes through the visible UI.
    globalThis.__siloPlanner = {
      workspace,
      buildNetwork,
      setView,
      generateNetwork,
      setBranchOverride,
      removeVent,
      restoreVent,
      chooseWinner
    };
  });
</script>

<div class="app-shell">
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="30" height="30">
          <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="2.4" />
          <path d="M7 16h18M16 16l7 7M16 16L9 23M16 16V6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          <circle cx="16" cy="16" r="2.6" fill="currentColor" />
        </svg>
      </div>
      <div>
        <strong>筒仓风网生成器</strong>
        <span>Silo Ductwork Scheme Studio</span>
      </div>
    </div>

    <nav class="main-nav" aria-label="主导航">
      <button
        type="button"
        class:active={workspace.view === 'design'}
        data-testid="nav-design"
        onclick={() => setView('design')}
      >
        ① 参数设计
      </button>
      <button
        type="button"
        class:active={workspace.view === 'compare'}
        data-testid="nav-compare"
        onclick={() => setView('compare')}
      >
        ② 方案比选
      </button>
      <button
        type="button"
        class:active={workspace.view === 'handoff'}
        data-testid="nav-handoff"
        onclick={() => setView('handoff')}
      >
        ③ 选型交接
        {#if workspace.schemes[workspace.winnerId].handedOff}
          <i class="check">✓</i>
        {/if}
      </button>
    </nav>

    <div class="winner-pill">当前倾向：方案 <b>{workspace.winnerId}</b></div>
  </header>

  <main class="app-main">
    {#if workspace.view === 'design'}
      <DesignView />
    {:else if workspace.view === 'compare'}
      <CompareView />
    {:else}
      <HandoffView />
    {/if}
  </main>

  <footer class="app-footer">
    <span>参数化生成 · 种子复现 · 手改稳定保留 · 双方案比选</span>
    <span>工程数值为方案阶段估算，施工图与设备选型需按现行规范复核</span>
  </footer>

  {#if workspace.toast}
    <div class="toast" role="status" data-testid="toast">{workspace.toast}</div>
  {/if}
</div>

<style>
  .app-shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .topbar {
    position: sticky;
    top: 0;
    z-index: 50;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 18px;
    padding: 12px 24px;
    background: rgba(248, 250, 252, 0.86);
    border-bottom: 1px solid rgba(203, 213, 225, 0.8);
    backdrop-filter: blur(16px);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 11px;
    min-width: 0;
  }

  .brand-mark {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    color: #0369a1;
    background: linear-gradient(145deg, #e0f2fe, #bae6fd);
    box-shadow: inset 0 0 0 1px rgba(2, 132, 199, 0.14);
  }

  .brand strong {
    display: block;
    color: #0f172a;
    font-size: 17px;
    letter-spacing: -0.01em;
  }

  .brand span {
    display: block;
    margin-top: 2px;
    color: #64748b;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .main-nav {
    display: flex;
    gap: 6px;
    padding: 5px;
    border-radius: 15px;
    background: #e2e8f0;
  }

  .main-nav button {
    border: 0;
    border-radius: 11px;
    padding: 9px 14px;
    background: transparent;
    color: #475569;
    font-size: 13.5px;
    font-weight: 850;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.16s;
  }

  .main-nav button:hover {
    color: #0f172a;
    background: rgba(255, 255, 255, 0.62);
  }

  .main-nav button.active {
    color: white;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    box-shadow: 0 8px 18px rgba(37, 99, 235, 0.22);
  }

  .check {
    display: inline-grid;
    place-items: center;
    width: 17px;
    height: 17px;
    margin-left: 4px;
    border-radius: 999px;
    background: #10b981;
    color: white;
    font-size: 11px;
    font-style: normal;
  }

  .winner-pill {
    justify-self: end;
    border: 1px solid #bbf7d0;
    background: #ecfdf5;
    color: #047857;
    border-radius: 999px;
    padding: 8px 12px;
    font-size: 12.5px;
    font-weight: 750;
    white-space: nowrap;
  }

  .winner-pill b {
    font-size: 14px;
  }

  .app-main {
    flex: 1;
    width: 100%;
    max-width: 1760px;
    margin: 0 auto;
    padding: 20px 24px 28px;
  }

  .app-footer {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
    padding: 16px 24px 24px;
    color: #64748b;
    font-size: 12px;
  }

  .toast {
    position: fixed;
    left: 50%;
    bottom: 26px;
    transform: translateX(-50%);
    z-index: 100;
    max-width: min(680px, calc(100vw - 32px));
    padding: 12px 17px;
    border-radius: 999px;
    color: white;
    background: rgba(15, 23, 42, 0.92);
    border: 1px solid rgba(148, 163, 184, 0.28);
    box-shadow: 0 18px 45px rgba(15, 23, 42, 0.3);
    backdrop-filter: blur(12px);
    font-size: 13.5px;
    font-weight: 700;
    text-align: center;
    animation: toast-in 0.2s ease-out;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translate(-50%, 10px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  @media (max-width: 1080px) {
    .topbar {
      grid-template-columns: 1fr;
      justify-items: center;
      gap: 10px;
    }

    .winner-pill {
      justify-self: center;
    }
  }

  @media (max-width: 640px) {
    .topbar {
      padding: 10px 12px;
    }

    .brand span {
      display: none;
    }

    .main-nav {
      width: 100%;
      overflow-x: auto;
      justify-content: start;
    }

    .app-main {
      padding: 12px;
    }

    .app-footer {
      padding: 12px 16px 80px;
    }

    .toast {
      border-radius: 16px;
      bottom: 14px;
    }
  }

  @media print {
    .topbar,
    .toast {
      display: none !important;
    }

    .app-main {
      max-width: none;
      padding: 0;
    }
  }
</style>
