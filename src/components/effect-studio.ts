import { StageController } from '../canvas/StageController';
import { store } from '../state/store';
import './studio-toolbar';
import './studio-layer-panel';
import './studio-inspector-panel';
import './studio-timeline-panel';
import './studio-export-dialog';

class EffectStudio extends HTMLElement {
  private controller: StageController | null = null;

  connectedCallback(): void {
    this.innerHTML = `
      <studio-toolbar></studio-toolbar>
      <studio-layer-panel></studio-layer-panel>

      <main class="stage-shell">
        <div class="stage-topbar">
          <span class="stage-title" data-project-name></span>
          <span class="stage-pill live">Konva 画布</span>
          <span class="stage-pill" data-selection-pill></span>
          <div style="flex:1"></div>
          <button class="icon-btn" data-zoom="out" title="缩小">−</button>
          <span class="zoom-value" data-zoom-value>100%</span>
          <button class="icon-btn" data-zoom="in" title="放大">＋</button>
          <button class="btn small ghost" data-zoom="fit">适配画布</button>
        </div>
        <div class="stage-container" data-stage-host></div>
        <div class="stage-footer">
          <span><kbd>V</kbd> 选择/框选</span>
          <span><kbd>B</kbd> 蒙版笔刷</span>
          <span><kbd>Ctrl</kbd>+<kbd>Z</kbd> 按笔划撤销</span>
          <span><kbd>Space</kbd> 播放/暂停</span>
          <span>框选烟团后拖动，蒙版同组跟随</span>
          <div class="zoom-controls">
            <span>滚轮缩放</span>
          </div>
        </div>
      </main>

      <studio-timeline-panel></studio-timeline-panel>
      <studio-inspector-panel></studio-inspector-panel>
      <studio-export-dialog></studio-export-dialog>
      <div class="toast-stack" data-toast-stack aria-live="polite"></div>
    `;

    const host = this.querySelector<HTMLElement>('[data-stage-host]');
    if (host) {
      this.controller = new StageController(host);
      (window as unknown as { stageController?: StageController }).stageController = this.controller;
    }

    this.querySelector('[data-zoom="in"]')?.addEventListener('click', () => store.zoomBy(1.15));
    this.querySelector('[data-zoom="out"]')?.addEventListener('click', () => store.zoomBy(1 / 1.15));
    this.querySelector('[data-zoom="fit"]')?.addEventListener('click', () => store.requestFit());

    window.addEventListener('keydown', this.onKeyDown);
    store.on('viewchange', () => this.updateMeta());
    store.on('selectionchange', () => this.updateMeta());
    store.on('change', () => this.updateMeta());
    store.on('toast', ((event: CustomEvent) => this.showToast(event.detail.message, event.detail.tone)) as EventListener);

    this.updateMeta();
  }

  disconnectedCallback(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.controller?.destroy();
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    const typing =
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable);

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      if (typing) return;
      event.preventDefault();
      if (event.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      if (typing) return;
      event.preventDefault();
      store.redo();
      return;
    }
    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key.toLowerCase() === 'v') store.setTool('select');
    if (event.key.toLowerCase() === 'b') store.setTool('mask');
    if (event.code === 'Space') {
      event.preventDefault();
      store.togglePlay();
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      store.deleteLayers();
    }
  };

  private updateMeta(): void {
    const name = this.querySelector('[data-project-name]');
    if (name) name.textContent = store.project.name;
    const zoom = this.querySelector('[data-zoom-value]');
    if (zoom) zoom.textContent = `${Math.round(store.zoom * 100)}%`;
    const selection = this.querySelector('[data-selection-pill]');
    if (selection) {
      selection.textContent =
        store.selectedLayers.length === 1
          ? `当前：${store.activeLayer?.name ?? ''}`
          : store.selectedLayers.length > 1
            ? `已选 ${store.selectedLayers.length} 层`
            : '未选择层';
    }
  }

  private showToast(message: string, tone: 'info' | 'success' | 'error' = 'info'): void {
    const stack = this.querySelector<HTMLElement>('[data-toast-stack]');
    if (!stack) return;
    const toast = document.createElement('div');
    toast.className = `toast ${tone}`;
    toast.textContent = message;
    stack.append(toast);
    window.setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all .2s ease';
      window.setTimeout(() => toast.remove(), 220);
    }, 3600);
  }
}

customElements.define('effect-studio', EffectStudio);
