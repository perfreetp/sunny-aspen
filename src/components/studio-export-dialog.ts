import { store } from '../state/store';
import { buildParameterRows, exportParameterCsv, exportParameterJson, printParameterSheet } from '../lib/parameterSheet';
import { escapeHtml } from '../lib/format';

class StudioExportDialog extends HTMLElement {
  connectedCallback(): void {
    this.innerHTML = `
      <div class="dialog-backdrop" hidden data-role="backdrop">
        <section class="dialog" role="dialog" aria-modal="true" aria-label="现场特效参数表">
          <header class="dialog-header">
            <div>
              <h2 class="dialog-title">定稿特效参数表</h2>
              <div class="dialog-subtitle" data-role="subtitle"></div>
            </div>
            <div class="dialog-actions">
              <button class="btn ghost" data-action="copy">复制 CSV</button>
              <button class="btn" data-action="csv">下载 CSV</button>
              <button class="btn" data-action="json">下载 JSON</button>
              <button class="btn primary" data-action="print">打印 / PDF</button>
              <button class="icon-btn" data-action="close" aria-label="关闭">✕</button>
            </div>
          </header>
          <div class="dialog-body" data-role="content"></div>
        </section>
      </div>
    `;

    window.addEventListener('studio:open-export', () => this.open());
    this.addEventListener('click', (event) => {
      const actionElement = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (event.target === this.backdrop() || actionElement?.dataset.action === 'close') this.close();
      if (!actionElement) return;
      const action = actionElement.dataset.action;
      if (action === 'csv') exportParameterCsv(store.project);
      if (action === 'json') exportParameterJson(store.project);
      if (action === 'print') printParameterSheet(store.project);
      if (action === 'copy') void this.copyCsv();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isOpen()) this.close();
    });
  }

  private backdrop(): HTMLElement | null {
    return this.querySelector('[data-role="backdrop"]');
  }

  private isOpen(): boolean {
    return !this.backdrop()?.hasAttribute('hidden');
  }

  private open(): void {
    const backdrop = this.backdrop();
    if (!backdrop) return;
    this.render();
    backdrop.hidden = false;
  }

  private close(): void {
    this.backdrop()?.setAttribute('hidden', '');
  }

  private async copyCsv(): Promise<void> {
    const rows = buildParameterRows(store.project);
    const header = ['顺序', '类型', '名称', '时间s', '持续s', '透明度%', '混合', 'X,Y', '缩放', '旋转', '蒙版笔数'];
    const text = [
      header.join('\t'),
      ...rows.map((r) => [r.order, r.kind, r.name, r.start, r.duration, r.opacityPercent, r.blendMode, `${r.x},${r.y}`, r.scalePercent, r.rotation, r.maskStrokes].join('\t')),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      store.notify('参数表已复制，可直接粘贴到 Excel / 飞书表格', 'success');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      store.notify('参数表已复制（兼容模式）', 'success');
    }
  }

  private render(): void {
    const subtitle = this.querySelector('[data-role="subtitle"]');
    const content = this.querySelector<HTMLElement>('[data-role="content"]');
    if (!content) return;
    const rows = buildParameterRows(store.project);
    if (subtitle) {
      subtitle.textContent = `${store.project.name} · ${store.project.layers.length} 层 · ${store.project.cues.length} 个 Cue · 顺序按画布最上层到最下层`;
    }

    content.innerHTML = `
      <table class="sheet-table">
        <thead><tr>
          <th>顺序</th><th>类型</th><th>层名称</th><th>触发时间</th><th>持续/结束</th>
          <th>透明度</th><th>混合</th><th>位置</th><th>缩放</th><th>旋转</th><th>蒙版</th><th>效果参数</th><th>素材</th>
        </tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr>
                <td><b>${r.order}</b></td>
                <td>${escapeHtml(r.kind)}</td>
                <td><b>${escapeHtml(r.name)}</b></td>
                <td>${r.start.toFixed(2)}s</td>
                <td>${r.duration.toFixed(2)}s / 止 ${r.end.toFixed(2)}s</td>
                <td><b>${r.opacityPercent}%</b></td>
                <td>${escapeHtml(r.blendMode)}</td>
                <td>${r.x}, ${r.y}</td>
                <td>${escapeHtml(r.scalePercent)}</td>
                <td>${r.rotation}°</td>
                <td>${r.maskStrokes} 笔</td>
                <td>${escapeHtml(r.fx)}</td>
                <td>${escapeHtml(r.assetName)}</td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table>
      <h3 class="sheet-section-title">剧情节奏 / Cue 表</h3>
      <table class="sheet-table">
        <thead><tr><th style="width:120px">时间</th><th style="width:220px">节点</th><th>现场/调试备注</th></tr></thead>
        <tbody>
          ${[...store.project.cues]
            .sort((a, b) => a.time - b.time)
            .map(
              (cue) => `<tr>
                <td><b>${cue.time.toFixed(2)}s</b></td>
                <td>${escapeHtml(cue.title)}</td>
                <td>${escapeHtml(cue.note ?? '')}</td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `;
  }
}

customElements.define('studio-export-dialog', StudioExportDialog);
