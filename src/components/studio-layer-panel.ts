import { addEffectLayer, importBaseImage, importEffectImages, useDemoBackdrop } from '../actions/studioActions';
import { escapeHtml } from '../lib/format';
import { store } from '../state/store';
import type { Layer, LayerKind } from '../types';

const GROUP_DEFS: { kind: LayerKind; title: string; hint: string; color: string; icon: string }[] = [
  { kind: 'light', title: '灯光闪烁', hint: '最上层', color: '#fbbf24', icon: '💡' },
  { kind: 'smoke', title: '烟雾', hint: '中间层', color: '#a8b6c7', icon: '🌫️' },
  { kind: 'image', title: '导入素材', hint: '烟/火之间', color: '#a78bfa', icon: '🖼️' },
  { kind: 'spark', title: '火星', hint: '最底层', color: '#fb923c', icon: '✦' },
  { kind: 'background', title: '现场底图', hint: '铺底', color: '#67e8f9', icon: '📷' },
];

class StudioLayerPanel extends HTMLElement {
  connectedCallback(): void {
    this.classList.add('panel', 'side-left');
    this.innerHTML = `
      <div class="panel-header">
        <h2 class="panel-title"><span class="dot"></span>图层与层级</h2>
        <span class="stage-pill">光 → 烟 → 火</span>
      </div>
      <div class="panel-body">
        <div class="add-grid">
          <button class="add-tile" data-add="light" style="--tile-color:#fbbf24">
            <span class="tile-icon">💡</span><span>灯光层</span>
          </button>
          <button class="add-tile" data-add="smoke" style="--tile-color:#a8b6c7">
            <span class="tile-icon">🌫️</span><span>烟雾层</span>
          </button>
          <button class="add-tile" data-add="spark" style="--tile-color:#fb923c">
            <span class="tile-icon">✦</span><span>火星层</span>
          </button>
        </div>
        <div data-role="groups"></div>

        <div class="inspector-section">
          <div class="section-title">📷 替换底图 / 导演视角</div>
          <div class="section-content" style="display:grid;gap:8px">
            <button class="btn block" data-bg="upload">导入新的现场/侧面照片</button>
            <div class="input-row">
              <button class="btn small" data-bg="front">用正面示例</button>
              <button class="btn small" data-bg="side">换成侧面示例</button>
            </div>
            <button class="btn ghost small block" data-bg="assets">导入相机素材为独立层</button>
            <input type="file" accept="image/*" hidden data-input="background" />
            <input type="file" accept="image/*" multiple hidden data-input="materials" />
            <div class="kbd-hint">换底图只替换画面，各效果层顺序、时间点和透明度保留。</div>
          </div>
        </div>
      </div>
    `;

    this.addEventListener('click', this.onClick);
    this.querySelector('[data-add="light"]')?.addEventListener('click', () => addEffectLayer('light'));
    this.querySelector('[data-add="smoke"]')?.addEventListener('click', () => addEffectLayer('smoke'));
    this.querySelector('[data-add="spark"]')?.addEventListener('click', () => addEffectLayer('spark'));

    const bgInput = this.querySelector<HTMLInputElement>('[data-input="background"]')!;
    const materialInput = this.querySelector<HTMLInputElement>('[data-input="materials"]')!;
    bgInput.addEventListener('change', async () => {
      const file = bgInput.files?.[0];
      if (file) await importBaseImage(file);
      bgInput.value = '';
    });
    materialInput.addEventListener('change', async () => {
      if (materialInput.files) await importEffectImages(materialInput.files);
      materialInput.value = '';
    });

    this.querySelector('[data-bg="upload"]')?.addEventListener('click', () => bgInput.click());
    this.querySelector('[data-bg="assets"]')?.addEventListener('click', () => materialInput.click());
    this.querySelector('[data-bg="front"]')?.addEventListener('click', () => useDemoBackdrop(false));
    this.querySelector('[data-bg="side"]')?.addEventListener('click', () => useDemoBackdrop(true));

    store.on('change', () => this.renderGroups());
    store.on('selectionchange', () => this.renderGroups());
    this.renderGroups();
  }

  private onClick = (event: MouseEvent): void => {
    const actionButton = (event.target as HTMLElement).closest<HTMLElement>('[data-layer-action]');
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-layer-id]');
    if (actionButton) {
      event.stopPropagation();
      const id = actionButton.dataset.layerId!;
      const action = actionButton.dataset.layerAction!;
      if (action === 'visible') store.toggleVisible(id);
      if (action === 'lock') store.toggleLocked(id);
      if (action === 'duplicate') store.duplicateLayer(id);
      if (action === 'delete') store.deleteLayers([id]);
      if (action === 'up') store.moveLayerInCategory(id, 1);
      if (action === 'down') store.moveLayerInCategory(id, -1);
      return;
    }
    if (row && !(event.target as HTMLElement).closest('input,button')) {
      const id = row.dataset.layerId!;
      store.select(id, event.shiftKey);
    }
  };

  private renderGroups(): void {
    const root = this.querySelector<HTMLElement>('[data-role="groups"]');
    if (!root) return;

    root.innerHTML = GROUP_DEFS.map((group) => {
      // Panel reads top-to-bottom, while project.layers is bottom-to-top.
      const layers = store.project.layers.filter((layer) => layer.kind === group.kind).reverse();
      if (layers.length === 0 && group.kind === 'image') return '';
      return `
        <section class="layer-group" data-kind="${group.kind}">
          <div class="layer-group-head" style="color:${group.color}">
            <span>${group.icon}</span>
            <span>${group.title}</span>
            <span style="color:var(--faint);font-weight:600">${group.hint}</span>
            <i class="rank-line"></i>
            <span>${layers.length}</span>
          </div>
          ${layers.length ? layers.map((layer) => this.renderRow(layer, group.color, group.icon)).join('') : `<div class="layer-meta" style="padding:8px 10px">暂无${group.title}层</div>`}
        </section>
      `;
    }).join('');

    this.bindOpacitySliders(root);
  }

  private renderRow(layer: Layer, color: string, icon: string): string {
    const selected = store.selectedIds.includes(layer.id);
    return `
      <div class="layer-row ${selected ? 'selected' : ''} ${layer.visible ? '' : 'is-hidden'} ${layer.locked ? 'locked' : ''}"
           data-layer-id="${layer.id}">
        <div class="kind-badge" style="--kind:${color}">${icon}</div>
        <div class="layer-main">
          <div class="layer-name-line">
            <span class="layer-name" title="${escapeHtml(layer.name)}">${escapeHtml(layer.name)}</span>
            ${layer.strokes.length ? `<span class="mask-indicator" title="已有 ${layer.strokes.length} 笔蒙版">蒙版${layer.strokes.length}</span>` : ''}
          </div>
          <div class="layer-meta">
            <span>${layer.start.toFixed(1)}s → ${(layer.start + layer.duration).toFixed(1)}s</span>
            <span>·</span>
            <span>${layer.blendMode}</span>
          </div>
          <div class="mini-opacity" @click-stop>
            <span>透明度</span>
            <input type="range" min="0" max="100" value="${Math.round(layer.opacity * 100)}"
                   data-opacity="${layer.id}" aria-label="${escapeHtml(layer.name)} 透明度" />
            <span data-opacity-value="${layer.id}" style="min-width:31px;text-align:right">${Math.round(layer.opacity * 100)}%</span>
          </div>
        </div>
        <div class="layer-actions">
          <button class="icon-btn" data-layer-action="visible" data-layer-id="${layer.id}" title="${layer.visible ? '隐藏' : '显示'}">${layer.visible ? '👁' : '—'}</button>
          <button class="icon-btn ${layer.locked ? 'active' : ''}" data-layer-action="lock" data-layer-id="${layer.id}" title="${layer.locked ? '解锁' : '锁定'}">${layer.locked ? '🔒' : '🔓'}</button>
          <button class="icon-btn" data-layer-action="up" data-layer-id="${layer.id}" title="在同组中上移">↑</button>
          <button class="icon-btn" data-layer-action="down" data-layer-id="${layer.id}" title="在同组中下移">↓</button>
          <button class="icon-btn" data-layer-action="duplicate" data-layer-id="${layer.id}" title="复制层">⧉</button>
          <button class="icon-btn danger" data-layer-action="delete" data-layer-id="${layer.id}" title="删除层">🗑</button>
        </div>
      </div>
    `;
  }

  private bindOpacitySliders(root: HTMLElement): void {
    root.querySelectorAll<HTMLInputElement>('input[data-opacity]').forEach((input) => {
      const id = input.dataset.opacity!;
      let before = store.capture();
      input.addEventListener('focus', () => {
        before = store.capture();
      });
      input.addEventListener('pointerdown', () => {
        before = store.capture();
      });
      input.addEventListener('input', () => {
        const opacity = Number(input.value) / 100;
        store.patchLayerLive(id, { opacity });
        const value = root.querySelector(`[data-opacity-value="${id}"]`);
        if (value) value.textContent = `${input.value}%`;
      });
      input.addEventListener('change', () => {
        store.commitGesture('逐层调整透明度', before);
        before = store.capture();
      });
    });
  }
}

customElements.define('studio-layer-panel', StudioLayerPanel);
