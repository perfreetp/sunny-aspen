import { store } from '../state/store';
import { KIND_LABEL } from '../types';
import type { Layer } from '../types';
import { escapeHtml, formatTime } from '../lib/format';

class StudioInspectorPanel extends HTMLElement {
  connectedCallback(): void {
    this.classList.add('panel', 'side-right');
    this.innerHTML = `
      <div class="panel-header">
        <h2 class="panel-title"><span class="dot" style="background:var(--purple);box-shadow:0 0 12px var(--purple)"></span>检查器 / 蒙版笔刷</h2>
      </div>
      <div class="panel-body" data-role="body"></div>
    `;

    this.addEventListener('click', this.onClick);
    store.on('change', () => this.render());
    store.on('selectionchange', () => this.render());
    store.on('toolchange', () => this.render());
    this.render();
  }

  private onClick = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-inspector-action]');
    if (!button) return;
    const action = button.dataset.inspectorAction!;
    const layer = store.activeLayer;

    if (action === 'open-mask-tool') store.setTool('mask');
    if (action === 'select-tool') store.setTool('select');
    if (action === 'undo') store.undo();
    if (action === 'export') window.dispatchEvent(new CustomEvent('studio:open-export'));
    if (!layer) return;

    if (action === 'clear-mask') {
      store.mutate(`清空 ${layer.name} 的蒙版`, () => {
        const target = store.project.layers.find((item) => item.id === layer.id);
        if (target) target.strokes = [];
      });
    }
    if (action === 'reset-transform') {
      store.mutate('重置缩放与旋转', () => {
        const target = store.project.layers.find((item) => item.id === layer.id);
        if (target) {
          target.scaleX = 1;
          target.scaleY = 1;
          target.rotation = 0;
        }
      });
    }
    if (action === 'center-layer') {
      store.mutate('移动层到画布中心', () => {
        const target = store.project.layers.find((item) => item.id === layer.id);
        if (target) {
          target.x = store.project.width / 2;
          target.y = store.project.height / 2;
        }
      });
    }
    if (action === 'duplicate') store.duplicateLayer(layer.id);
    if (action === 'delete') store.deleteLayers([layer.id]);
  };

  private render(): void {
    const root = this.querySelector<HTMLElement>('[data-role="body"]');
    if (!root) return;
    const layers = store.selectedLayers;
    if (layers.length === 0) {
      root.innerHTML = this.renderEmpty();
      return;
    }
    if (layers.length > 1) {
      root.innerHTML = this.renderMulti(layers);
      this.bindGestures(root, layers[0]?.id);
      return;
    }
    root.innerHTML = this.renderSingle(layers[0]);
    this.bindGestures(root, layers[0].id);
  }

  private renderEmpty(): string {
    return `
      <div class="empty-state">
        <div class="big">🎚️</div>
        <b>选择一个层开始精调</b>
        <p>可在画布中点选、空白处框选，或从左侧图层列表选择。</p>
      </div>
      <section class="inspector-section">
        <div class="section-title">本周交付检查路径</div>
        <div class="section-content" style="color:var(--muted);line-height:1.75">
          1. 铺正面现场照或触发瞬间素材为底。<br/>
          2. 按节奏表把灯光、烟雾、火星摆到时间点。<br/>
          3. 灯光在最上、烟雾居中、火星压底。<br/>
          4. 逐层拉透明度，确认能盖住机关本体。<br/>
          5. 用蒙版笔刷压暗过亮频闪，<kbd>Ctrl</kbd>+<kbd>Z</kbd> 按笔划退。<br/>
          6. 框选烟团拖动，蒙版会在同一组内一起移动/变换。<br/>
          7. 导演换侧面视角后替换底图并重新对位。
        </div>
        <div class="section-content" style="padding-top:0">
          <button class="btn primary block" data-inspector-action="export">打开现场特效参数表</button>
        </div>
      </section>
    `;
  }

  private renderMulti(layers: Layer[]): string {
    return `
      <section class="inspector-section">
        <div class="section-title">已框选 ${layers.length} 层</div>
        <div class="section-content">
          <div class="field">
            <div class="field-label"><span>批量透明度</span><span class="field-value" data-output="batch-opacity">—</span></div>
            <div class="range-line">
              <input type="range" min="0" max="100" value="80" data-batch-opacity />
              <span></span>
            </div>
          </div>
          <div class="kbd-hint">拖动画布中任一已选层，可整组移动；蒙版属于同一 Konva 组，会严丝合缝跟随。</div>
        </div>
      </section>
      ${layers.map((layer) => `<div class="layer-meta" style="padding:7px 2px;border-bottom:1px solid var(--line)">${KIND_LABEL[layer.kind]} · ${escapeHtml(layer.name)}</div>`).join('')}
    `;
  }

  private rangeField(options: {
    label: string;
    output: string;
    min: number;
    max: number;
    step: number;
    value: number;
    patch?: string;
    effect?: keyof Layer['effect'];
    scale?: number;
    suffix?: string;
  }): string {
    const attrs = options.effect
      ? `data-effect-key="${options.effect}"`
      : `data-patch-key="${options.patch ?? ''}"`;
    return `
      <div class="field">
        <div class="field-label">
          <span>${options.label}</span>
          <span class="field-value" data-output="${options.output}">${options.value}${options.suffix ?? ''}</span>
        </div>
        <input type="range" min="${options.min}" max="${options.max}" step="${options.step}"
               value="${options.value}" ${attrs} data-scale="${options.scale ?? 1}"
               data-output-key="${options.output}" data-suffix="${options.suffix ?? ''}" />
      </div>
    `;
  }

  private renderSingle(layer: Layer): string {
    const brushActive = store.tool === 'mask';
    const isFx = layer.texture.startsWith('fx-');
    return `
      <section class="inspector-section">
        <div class="section-title">
          <span>${KIND_LABEL[layer.kind]}层</span>
          <span class="stage-pill">${escapeHtml(layer.assetName ?? layer.texture)}</span>
        </div>
        <div class="section-content">
          <label class="field">
            <span class="field-label">层名称</span>
            <input class="input" value="${escapeHtml(layer.name)}" data-text-key="name" />
          </label>
          ${
            layer.kind === 'background'
              ? ''
              : `<label class="field">
                   <span class="field-label">层级分组（决定叠放次序）</span>
                   <select class="select" data-kind-choice>
                     ${(['light', 'smoke', 'image', 'spark'] as const)
                       .map(
                         (kind) =>
                           `<option value="${kind}" ${layer.kind === kind ? 'selected' : ''}>${KIND_LABEL[kind]}${
                             kind === 'light' ? ' · 最上' : kind === 'smoke' ? ' · 中间' : kind === 'spark' ? ' · 最底' : ''
                           }</option>`,
                       )
                       .join('')}
                   </select>
                 </label>`
          }
          <div class="input-row">
            <label class="field"><span class="field-label">触发时间</span>
              <input class="input" type="number" min="0" max="${store.project.duration}" step="0.05" value="${layer.start}" data-number-key="start" />
            </label>
            <label class="field"><span class="field-label">持续秒数</span>
              <input class="input" type="number" min="0.1" max="30" step="0.1" value="${layer.duration}" data-number-key="duration" />
            </label>
          </div>
          ${this.rangeField({ label: '整层透明度', output: 'opacity', min: 0, max: 100, step: 1, value: Math.round(layer.opacity * 100), patch: 'opacity', scale: 0.01, suffix: '%' })}
          <label class="field">
            <span class="field-label">混合模式</span>
            <select class="select" data-choice-key="blendMode">
              ${['normal', 'screen', 'lighter', 'multiply'].map((mode) => `<option value="${mode}" ${layer.blendMode === mode ? 'selected' : ''}>${mode}</option>`).join('')}
            </select>
          </label>
          <div class="input-row">
            <button class="btn small" data-inspector-action="duplicate">复制层</button>
            <button class="btn small danger" data-inspector-action="delete">删除层</button>
          </div>
        </div>
      </section>

      <section class="inspector-section" style="border-color:${brushActive ? 'rgba(103,232,249,.45)' : 'var(--line)'}">
        <div class="section-title">
          <span>🖌 局部暗区 / 蒙版</span>
          <button class="btn small ${brushActive ? 'primary' : ''}" data-inspector-action="${brushActive ? 'select-tool' : 'open-mask-tool'}">
            ${brushActive ? '完成画笔' : '开始画笔'}
          </button>
        </div>
        <div class="section-content">
          <div class="brush-modes">
            <button class="brush-mode active ${store.brush.mode === 'hide' ? 'hide' : ''}" data-brush-mode="hide">
              <b>压暗 / 遮去</b>在过亮频闪上画黑蒙版
            </button>
            <button class="brush-mode ${store.brush.mode === 'show' ? 'active show' : ''}" data-brush-mode="show">
              <b>恢复</b>擦回误遮区域
            </button>
          </div>
          <div style="height:11px"></div>
          ${this.brushRange('笔刷直径', 'size', 12, 360, 1, ' px')}
          ${this.brushRange('笔刷强度', 'opacity', 5, 100, 1, '%', 100)}
          ${this.brushRange('边缘柔度', 'hardness', 0, 100, 1, '%', 100)}
          <div class="input-row" style="margin-top:8px">
            <button class="btn small" data-inspector-action="undo">↶ 撤销一笔</button>
            <button class="btn small danger" data-inspector-action="clear-mask">清空蒙版</button>
          </div>
          <div class="kbd-hint" style="margin-top:8px;line-height:1.6">
            本层已有 <b style="color:var(--amber)">${layer.strokes.length}</b> 笔。每一笔单独入历史；移动或缩放整组时，蒙版和画面使用同一变换。
          </div>
        </div>
      </section>

      <section class="inspector-section">
        <div class="section-title">📐 位置与变换</div>
        <div class="section-content">
          <div class="input-row three">
            <label class="field"><span class="field-label">X</span><input class="input" type="number" step="1" value="${Math.round(layer.x)}" data-number-key="x" /></label>
            <label class="field"><span class="field-label">Y</span><input class="input" type="number" step="1" value="${Math.round(layer.y)}" data-number-key="y" /></label>
            <label class="field"><span class="field-label">旋转°</span><input class="input" type="number" step="1" value="${Math.round(layer.rotation)}" data-number-key="rotation" /></label>
          </div>
          <div class="input-row">
            <label class="field"><span class="field-label">横向缩放</span><input class="input" type="number" min="0.05" max="6" step="0.01" value="${layer.scaleX.toFixed(2)}" data-number-key="scaleX" /></label>
            <label class="field"><span class="field-label">纵向缩放</span><input class="input" type="number" min="0.05" max="6" step="0.01" value="${layer.scaleY.toFixed(2)}" data-number-key="scaleY" /></label>
          </div>
          <div class="input-row">
            <button class="btn small" data-inspector-action="center-layer">移到画布中心</button>
            <button class="btn small ghost" data-inspector-action="reset-transform">重置缩放/旋转</button>
          </div>
        </div>
      </section>

      ${isFx ? this.renderEffectSettings(layer) : ''}

      <section class="inspector-section">
        <div class="section-title">🕒 节奏预览</div>
        <div class="section-content" style="color:var(--muted);line-height:1.7">
          当前播放头：<b style="color:var(--text);font-family:var(--mono)">${formatTime(store.currentTime)}</b><br/>
          本层区间：<b style="color:var(--text)">${layer.start.toFixed(2)}s – ${(layer.start + layer.duration).toFixed(2)}s</b><br/>
          ${store.timeFilter ? '时间轴显隐已开启：区间外暂隐。' : '合成编辑视图：区间外也常驻显示，方便对位。'}
        </div>
      </section>
    `;
  }

  private brushRange(label: string, key: keyof typeof store.brush, min: number, max: number, step: number, suffix: string, percentScale = 1): string {
    const raw = store.brush[key] as number;
    const display = key === 'size' ? Math.round(raw) : Math.round(raw * percentScale);
    return `
      <div class="field">
        <div class="field-label"><span>${label}</span><span class="field-value" data-brush-output="${key}">${display}${suffix}</span></div>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${display}" data-brush-key="${key}" data-percent-scale="${percentScale}" />
      </div>
    `;
  }

  private renderEffectSettings(layer: Layer): string {
    const e = layer.effect;
    let controls = '';
    if (layer.kind === 'light') {
      controls = `
        ${this.rangeField({ label: '频闪频率', output: 'frequency', min: 1, max: 30, step: 0.5, value: e.frequency, effect: 'frequency', suffix: 'Hz' })}
        ${this.rangeField({ label: '峰值强度', output: 'intensity', min: 10, max: 130, step: 1, value: Math.round(e.intensity * 100), effect: 'intensity', scale: 0.01, suffix: '%' })}
      `;
    } else if (layer.kind === 'smoke') {
      controls = `
        ${this.rangeField({ label: '扩散幅度', output: 'spread', min: 40, max: 220, step: 1, value: Math.round(e.spread * 100), effect: 'spread', scale: 0.01, suffix: '%' })}
        ${this.rangeField({ label: '烟团密度', output: 'density', min: 20, max: 180, step: 1, value: Math.round(e.density * 100), effect: 'density', scale: 0.01, suffix: '%' })}
        ${this.rangeField({ label: '漂移速度', output: 'drift', min: 0, max: 220, step: 1, value: Math.round(e.drift * 100), effect: 'drift', scale: 0.01, suffix: '%' })}
      `;
    } else if (layer.kind === 'spark') {
      controls = `
        ${this.rangeField({ label: '粒子密度', output: 'density', min: 20, max: 200, step: 1, value: Math.round(e.density * 100), effect: 'density', scale: 0.01, suffix: '%' })}
        ${this.rangeField({ label: '迸射速度', output: 'speed', min: 30, max: 180, step: 1, value: Math.round(e.speed * 100), effect: 'speed', scale: 0.01, suffix: '%' })}
      `;
    }
    return `
      <section class="inspector-section">
        <div class="section-title">✨ 程序化效果参数</div>
        <div class="section-content">
          ${controls}
          <div class="input-row">
            <label class="field"><span class="field-label">主色</span><input class="input" type="color" value="${e.color}" data-color-effect="color" /></label>
            <label class="field"><span class="field-label">副色</span><input class="input" type="color" value="${e.color2 ?? '#ffffff'}" data-color-effect="color2" /></label>
          </div>
        </div>
      </section>
    `;
  }

  private bindGestures(root: HTMLElement, layerId?: string): void {
    if (!layerId) {
      const batch = root.querySelector<HTMLInputElement>('[data-batch-opacity]');
      batch?.addEventListener('input', () => {
        const value = Number(batch.value) / 100;
        for (const id of store.selectedIds) store.patchLayerLive(id, { opacity: value });
        const output = root.querySelector('[data-output="batch-opacity"]');
        if (output) output.textContent = `${batch.value}%`;
      });
      batch?.addEventListener('change', () => store.emitChange());
      return;
    }

    const layer = () => store.project.layers.find((item) => item.id === layerId);

    root.querySelector<HTMLSelectElement>('[data-kind-choice]')?.addEventListener('change', (event) => {
      store.setLayerKind(layerId, (event.target as HTMLSelectElement).value as Layer['kind']);
    });

    root.querySelectorAll<HTMLButtonElement>('[data-brush-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        store.setBrush({ mode: button.dataset.brushMode as 'hide' | 'show' });
        this.render();
      });
    });

    root.querySelectorAll<HTMLInputElement>('[data-brush-key]').forEach((input) => {
      const key = input.dataset.brushKey as 'size' | 'opacity' | 'hardness';
      input.addEventListener('input', () => {
        const percentScale = Number(input.dataset.percentScale ?? 1);
        const raw = Number(input.value);
        const value = key === 'size' ? raw : raw / percentScale;
        store.setBrush({ [key]: value });
        const output = root.querySelector(`[data-brush-output="${key}"]`);
        if (output) output.textContent = key === 'size' ? `${raw} px` : `${raw}%`;
      });
    });

    root.querySelectorAll<HTMLInputElement>('input[data-patch-key], input[data-effect-key]').forEach((input) => {
      let before = store.capture();
      input.addEventListener('focus', () => {
        before = store.capture();
      });
      input.addEventListener('pointerdown', () => {
        before = store.capture();
      });
      input.addEventListener('input', () => {
        const target = layer();
        if (!target) return;
        const scale = Number(input.dataset.scale ?? 1);
        const value = Number(input.value) * scale;
        if (input.dataset.effectKey) {
          const effectKey = input.dataset.effectKey as keyof Layer['effect'];
          store.patchLayerLive(target.id, { effect: { ...target.effect, [effectKey]: value } });
        } else if (input.dataset.patchKey) {
          store.patchLayerLive(target.id, { [input.dataset.patchKey]: value } as Partial<Layer>);
        }
        const output = root.querySelector(`[data-output="${input.dataset.outputKey}"]`);
        if (output) output.textContent = `${input.value}${input.dataset.suffix ?? ''}`;
      });
      input.addEventListener('change', () => store.commitGesture('调整检查器参数', before));
    });

    root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-text-key],[data-number-key],[data-choice-key],[data-color-effect]').forEach((input) => {
      let before = store.capture();
      input.addEventListener('focus', () => {
        before = store.capture();
      });
      input.addEventListener('input', () => {
        const target = layer();
        if (!target) return;
        const element = input as HTMLInputElement;
        if (element.dataset.textKey) {
          store.patchLayerLive(target.id, { name: element.value });
        } else if (element.dataset.numberKey) {
          const key = element.dataset.numberKey as keyof Layer;
          const value = Number(element.value);
          if (Number.isFinite(value)) store.patchLayerLive(target.id, { [key]: value } as Partial<Layer>);
        } else if (element.dataset.choiceKey) {
          store.patchLayerLive(target.id, { [element.dataset.choiceKey]: element.value } as Partial<Layer>);
        } else if (element.dataset.colorEffect) {
          const key = element.dataset.colorEffect as 'color' | 'color2';
          store.patchLayerLive(target.id, { effect: { ...target.effect, [key]: element.value } });
        }
      });
      input.addEventListener('change', () => store.commitGesture('编辑层参数', before));
    });
  }
}

customElements.define('studio-inspector-panel', StudioInspectorPanel);
