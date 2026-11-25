import { store } from '../state/store';
import { importBaseImage, importEffectImages } from '../actions/studioActions';

class StudioToolbar extends HTMLElement {
  private baseInput!: HTMLInputElement;
  private assetInput!: HTMLInputElement;

  connectedCallback(): void {
    this.classList.add('toolbar');
    this.innerHTML = `
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">⚡</div>
        <div>
          <h1 class="brand-name">机关触发特效合成台</h1>
          <div class="brand-sub">Mechanism Cue Compositor · 剧场预览版</div>
        </div>
      </div>

      <div class="tool-group" role="toolbar" aria-label="画布工具">
        <button class="tool-btn" data-tool="select" title="选择 / 框选 / 移动 / 变换（V）">
          <span>↖</span><span>选择变换</span>
        </button>
        <button class="tool-btn" data-tool="mask" title="在当前层上绘制蒙版（B）">
          <span>🖌</span><span>蒙版笔刷</span>
        </button>
      </div>

      <div class="tool-group">
        <button class="icon-btn" data-action="undo" title="撤销（Ctrl/Cmd+Z）">↶</button>
        <button class="icon-btn" data-action="redo" title="重做（Ctrl/Cmd+Shift+Z）">↷</button>
      </div>

      <div class="toolbar-spacer"></div>
      <span class="toolbar-status" id="history-status">所有笔划已同步</span>

      <button class="btn ghost" data-action="import-asset">＋ 导入层素材</button>
      <button class="btn" data-action="import-base">📷 导入现场/侧面底图</button>
      <button class="btn primary" data-action="export">参数表 / 定稿导出</button>

      <input type="file" accept="image/*" hidden data-input="base" />
      <input type="file" accept="image/*" multiple hidden data-input="asset" />
    `;

    this.baseInput = this.querySelector('[data-input="base"]') as HTMLInputElement;
    this.assetInput = this.querySelector('[data-input="asset"]') as HTMLInputElement;

    this.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-tool],[data-action]');
      if (!target) return;
      const tool = target.dataset.tool;
      const action = target.dataset.action;
      if (tool === 'select' || tool === 'mask') store.setTool(tool);
      if (action === 'undo') store.undo();
      if (action === 'redo') store.redo();
      if (action === 'import-base') this.baseInput.click();
      if (action === 'import-asset') this.assetInput.click();
      if (action === 'export') window.dispatchEvent(new CustomEvent('studio:open-export'));
    });

    this.baseInput.addEventListener('change', async () => {
      const file = this.baseInput.files?.[0];
      if (file) await importBaseImage(file);
      this.baseInput.value = '';
    });
    this.assetInput.addEventListener('change', async () => {
      if (this.assetInput.files) await importEffectImages(this.assetInput.files);
      this.assetInput.value = '';
    });

    store.on('toolchange', () => this.update());
    store.on('historychange', () => this.update());
    store.on('change', () => this.update());
    this.update();
  }

  private update(): void {
    this.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
      button.classList.toggle('active', button.dataset.tool === store.tool);
    });
    const undo = this.querySelector<HTMLButtonElement>('[data-action="undo"]');
    const redo = this.querySelector<HTMLButtonElement>('[data-action="redo"]');
    if (undo) {
      undo.disabled = !store.canUndo();
      undo.title = store.undoLabel() ? `撤销：${store.undoLabel()}（Ctrl+Z）` : '撤销';
    }
    if (redo) {
      redo.disabled = !store.canRedo();
      redo.title = store.redoLabel() ? `重做：${store.redoLabel()}` : '重做';
    }
    const status = this.querySelector('#history-status');
    if (status) {
      status.textContent = store.undoLabel()
        ? `可撤销：${store.undoLabel()}`
        : '笔划、移动和参数均按步骤记录';
    }
  }
}

customElements.define('studio-toolbar', StudioToolbar);
