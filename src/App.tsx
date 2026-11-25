import { createMemo, createSignal, Show } from 'solid-js';
import { ParameterPanel } from './components/ParameterPanel';
import { GearPanel } from './components/GearPanel';
import { DeliverablesPanel } from './components/DeliverablesPanel';
import { SceneCanvas } from './components/SceneCanvas';
import { CompareModal } from './components/CompareModal';
import { buildDesignModel } from './lib/design';
import { runBatchRefresh, saveSnapshot, studioState } from './state/store';

type RightTab = 'gears' | 'bom';

export default function App() {
  const model = createMemo(() => buildDesignModel(studioState.params, studioState.overrides));
  const [rightTab, setRightTab] = createSignal<RightTab>('gears');
  const [compareOpen, setCompareOpen] = createSignal(false);

  const finalize = () => {
    setRightTab('bom');
    saveSnapshot(`定稿 · ${model().seedCode} · ${model().fingerprint}`);
  };

  return (
    <div class="app-shell">
      <header class="app-header">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="38" height="38">
              <path
                fill="currentColor"
                d="M24 6l2.1 4.2 4.6-.9 1 4.6 4.5 1.7-1.5 4.4 3.4 3.3-3.4 3.3 1.5 4.4-4.5 1.7-1 4.6-4.6-.9L24 41l-2.1-4.2-4.6.9-1-4.6-4.5-1.7 1.5-4.4L9.9 24l3.4-3.3-1.5-4.4 4.5-1.7 1-4.6 4.6.9L24 6zm0 10a8 8 0 100 16 8 8 0 000-16z"
              />
            </svg>
          </div>
          <div>
            <h1>机关传动件程序化出件工作台</h1>
            <p>SolidJS × Babylon.js · 齿轮 / 齿条 / 栅格遮挡件联动生成与施工交付</p>
          </div>
        </div>

        <div class="header-actions">
          <button type="button" class="button button-ghost" onClick={() => saveSnapshot()}>
            保存当前方案
          </button>
          <button type="button" class="button button-soft" onClick={() => setCompareOpen(true)}>
            两版比对
          </button>
          <button type="button" class="button button-soft" onClick={runBatchRefresh}>
            整排批量刷新
          </button>
          <button type="button" class="button button-primary" onClick={finalize}>
            定稿并出清单
          </button>
        </div>
      </header>

      <div class="workspace">
        <aside class="sidebar sidebar-left">
          <ParameterPanel model={model()} />
        </aside>

        <main class="viewport-column">
          <SceneCanvas
            model={model()}
            refreshNonce={studioState.refreshNonce}
            batchFlash={studioState.batchFlash}
          />

          <Show when={model().warnings.length > 0}>
            <div class="warning-dock">
              {model()
                .warnings.slice(0, 3)
                .map((warning) => (
                  <div class="warning-line">
                    <span class="warning-icon">!</span>
                    <span>{warning}</span>
                  </div>
                ))}
            </div>
          </Show>
        </main>

        <aside class="sidebar sidebar-right">
          <div class="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              class="tab-button"
              classList={{ active: rightTab() === 'gears' }}
              onClick={() => setRightTab('gears')}
            >
              手调齿轮
              <span class="tab-count">
                {model().gears.filter((g) => g.manual).length}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              class="tab-button"
              classList={{ active: rightTab() === 'bom' }}
              onClick={() => setRightTab('bom')}
            >
              下料 / 装配
            </button>
          </div>

          <div class="tab-body">
            <Show when={rightTab() === 'gears'}>
              <GearPanel model={model()} />
            </Show>
            <Show when={rightTab() === 'bom'}>
              <DeliverablesPanel model={model()} />
            </Show>
          </div>
        </aside>
      </div>

      <CompareModal open={compareOpen()} onClose={() => setCompareOpen(false)} />

      <Show when={studioState.toast}>
        <div class={`toast toast-${studioState.toast?.tone ?? 'info'}`} role="status">
          <strong>
            {studioState.toast?.tone === 'warning' ? '已卡住可用值' : studioState.toast?.tone === 'success' ? '完成' : '提示'}
          </strong>
          <span>{studioState.toast?.text}</span>
        </div>
      </Show>
    </div>
  );
}
