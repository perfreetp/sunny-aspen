import { Workbench } from '../core/Workbench';
import { createCsvTemplate, parseTemperatureCsv } from '../lib/csv';
import { TEMP_BANDS } from '../lib/temperature';
import { createSampleTable } from '../data/sample';
import type { LayerKey, ToolId, ViewId, WorkbenchSnapshot } from '../types';

const STYLES = `
:host {
  display: block;
  min-height: 100vh;
  color: #0f172a;
}
* { box-sizing: border-box; }
button, select, input { font: inherit; }
button {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #0f172a;
  border-radius: 10px;
  padding: 9px 12px;
  cursor: pointer;
  transition: transform .12s ease, border-color .12s ease, background .12s ease, box-shadow .12s ease;
}
button:hover { border-color: #2563eb; background: #eff6ff; }
button:active { transform: translateY(1px); }
button.primary {
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
  border-color: #1d4ed8;
  color: white;
  font-weight: 800;
  box-shadow: 0 10px 24px rgba(37,99,235,.22);
}
button.primary:hover { background: linear-gradient(135deg, #1e40af, #1d4ed8); }
button.danger { color: #b91c1c; border-color: #fecaca; }
button.danger:hover { background: #fef2f2; border-color: #ef4444; }
button.active {
  border-color: #1d4ed8;
  background: #dbeafe;
  color: #1e3a8a;
  font-weight: 800;
  box-shadow: inset 0 0 0 1px rgba(29,78,216,.12);
}
button:disabled { opacity: .45; cursor: not-allowed; box-shadow: none; }
.app {
  display: grid;
  grid-template-columns: 350px minmax(0, 1fr);
  min-height: 100vh;
  background: #eef2f7;
}
aside {
  background: linear-gradient(180deg, #0f172a 0%, #111c33 100%);
  color: #e2e8f0;
  padding: 20px 18px 28px;
  overflow-y: auto;
  max-height: 100vh;
  position: sticky;
  top: 0;
}
.brand { margin-bottom: 16px; }
.brand .kicker { color: #60a5fa; font-size: 12px; font-weight: 800; letter-spacing: .16em; }
.brand h1 { font-size: 22px; line-height: 1.25; margin: 6px 0 6px; color: #fff; }
.brand p { margin: 0; color: #94a3b8; font-size: 12.5px; line-height: 1.6; }
.panel {
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(148,163,184,.18);
  border-radius: 16px;
  padding: 14px;
  margin: 12px 0;
  backdrop-filter: blur(8px);
}
.panel h2 {
  font-size: 14px;
  margin: 0 0 11px;
  color: #f8fafc;
  display: flex;
  align-items: center;
  gap: 8px;
}
.panel h2::before {
  content: '';
  width: 7px;
  height: 18px;
  border-radius: 99px;
  background: #3b82f6;
}
label.field { display: block; font-size: 12.5px; color: #cbd5e1; margin: 11px 0 6px; font-weight: 700; }
select, input[type='text'] {
  width: 100%;
  border-radius: 10px;
  border: 1px solid #334155;
  background: #0b1220;
  color: #e2e8f0;
  padding: 9px 10px;
  outline: none;
}
select:focus, input:focus { border-color: #60a5fa; }
input[type='range'] { width: 100%; accent-color: #ef4444; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
.row.three { grid-template-columns: repeat(3, 1fr); }
.row.four { grid-template-columns: repeat(2, 1fr); }
.row > button { width: 100%; padding-inline: 8px; }
aside button {
  background: rgba(255,255,255,.08);
  border-color: rgba(148,163,184,.25);
  color: #e2e8f0;
}
aside button:hover { background: rgba(59,130,246,.22); border-color: #60a5fa; }
aside button.primary { background: #2563eb; border-color: #3b82f6; color: white; }
aside button.primary:hover { background: #1d4ed8; }
aside button.active { background: #1d4ed8; border-color: #93c5fd; color: #fff; }
.message { margin-top: 9px; font-size: 12px; line-height: 1.55; color: #bfdbfe; }
.error { margin-top: 7px; font-size: 12px; line-height: 1.5; color: #fecaca; background: rgba(220,38,38,.16); border: 1px solid rgba(248,113,113,.3); padding: 8px; border-radius: 9px; white-space: pre-wrap; }
.stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 7px; margin-top: 10px; }
.stat { background: rgba(15,23,42,.55); border: 1px solid rgba(148,163,184,.16); border-radius: 10px; padding: 8px 6px; text-align: center; }
.stat b { display: block; color: #fff; font-size: 16px; }
.stat span { color: #94a3b8; font-size: 11px; }
.swatches { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
.swatch {
  min-height: 42px;
  padding: 5px 4px;
  border-radius: 10px;
  border: 2px solid transparent;
  color: white;
  font-size: 11px;
  font-weight: 900;
  text-shadow: 0 1px 2px rgba(0,0,0,.45);
  display: flex;
  align-items: end;
  justify-content: center;
  text-align: center;
  line-height: 1.15;
}
.swatch.active { border-color: #fff; box-shadow: 0 0 0 2px #60a5fa; }
.layer-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0;
  padding: 10px;
  border-radius: 12px;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(148,163,184,.16);
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 700;
}
.layer-toggle:hover { background: rgba(255,255,255,.1); }
.layer-toggle input { width: 17px; height: 17px; accent-color: #3b82f6; }
.layer-dot { width: 12px; height: 12px; border-radius: 4px; flex: 0 0 auto; }
main { padding: 20px; min-width: 0; }
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.segmented { display: inline-flex; background: #dbe4f0; padding: 4px; border-radius: 13px; gap: 4px; }
.segmented button { border: 0; background: transparent; }
.segmented button.active { background: #fff; color: #1d4ed8; box-shadow: 0 4px 12px rgba(15,23,42,.12); }
.layer-switch { display: inline-flex; align-items: center; gap: 6px; }
.layer-switch select { width: 132px; background: #fff; color: #0f172a; border-color: #cbd5e1; }
.layer-switch button { width: 38px; padding: 8px 0; font-size: 18px; font-weight: 900; }
.spacer { flex: 1; }
.canvas-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  box-shadow: 0 18px 45px rgba(15,23,42,.10);
  padding: 12px;
  min-width: 0;
}
.stage-wrap {
  width: 100%;
  aspect-ratio: 1040 / 680;
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #eef2f7;
}
.host { width: 100%; height: 100%; }
.host canvas { display: block; }
.status {
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 12px 2px;
  color: #334155;
  font-size: 13.5px;
  line-height: 1.5;
}
.status-dot { width: 9px; height: 9px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 4px #dcfce7; flex: 0 0 auto; }
.details-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; margin-top: 14px; }
.details-grid article { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px; box-shadow: 0 8px 24px rgba(15,23,42,.06); min-width: 0; }
.details-grid h3 { margin: 0 0 8px; font-size: 15px; }
.details-grid p { margin: 0 0 10px; color: #475569; font-size: 13px; line-height: 1.6; }
.details-grid ul { margin: 0; padding-left: 18px; color: #475569; font-size: 12.5px; line-height: 1.75; }
.kbd { padding: 1px 6px; border: 1px solid #cbd5e1; border-bottom-width: 2px; border-radius: 6px; background: #f8fafc; font-size: 11px; }
@media (max-width: 1100px) {
  .app { grid-template-columns: 320px minmax(0,1fr); }
  .details-grid { grid-template-columns: 1fr; }
}
@media (max-width: 860px) {
  .app { grid-template-columns: 1fr; }
  aside { position: relative; max-height: none; }
  main { padding: 14px; }
  .spacer { display: none; }
  .toolbar { align-items: stretch; }
}
`;

const TEMPLATE = `
<div class="app">
  <aside>
    <div class="brand">
      <div class="kicker">GRAIN PROFILE THERMAL</div>
      <h1>粮堆剖面温度云图工具</h1>
      <p>Konva Canvas · 原生 TypeScript · Web Components。导入逐日电缆测温表，落格、刷云图、圈高温区并导出研判底图。</p>
    </div>

    <section class="panel">
      <h2>1. 逐日测点温度表</h2>
      <input data-role="file" type="file" accept=".csv,text/csv" hidden />
      <button class="primary" data-action="import" style="width:100%">选择 CSV 温度表并导入</button>
      <div class="row">
        <button data-action="sample">载入示例</button>
        <button data-action="template">下载模板</button>
      </div>
      <label class="field" for="date-select">观测日期</label>
      <select id="date-select" data-role="date"></select>
      <div class="message" data-role="import-message"></div>
      <div class="error" data-role="import-error" hidden></div>
      <div class="stats">
        <div class="stat"><b data-role="stat-cables">0</b><span>电缆</span></div>
        <div class="stat"><b data-role="stat-layers">0</b><span>粮层</span></div>
        <div class="stat"><b data-role="stat-records">0</b><span>读数</span></div>
      </div>
    </section>

    <section class="panel">
      <h2>2. 温度笔刷与研判工具</h2>
      <div class="row four">
        <button data-tool="brush">🖌 笔刷</button>
        <button data-tool="reshape">◇ 塑形</button>
        <button data-tool="hotzone">⭝ 圈高温</button>
        <button data-tool="gradient">↕ 梯度线</button>
      </div>

      <label class="field">笔刷大小（三档）</label>
      <div class="row three">
        <button data-size="1">小档</button>
        <button data-size="2">中档</button>
        <button data-size="3">大档</button>
      </div>

      <label class="field">笔刷温度分档：<span data-role="temp-label"></span></label>
      <div class="swatches" data-role="swatches"></div>

      <label class="field">高温区/温度蒙版阈值：<span data-role="threshold-value"></span></label>
      <input data-role="threshold" type="range" min="26" max="40" step="0.5" value="30" />

      <div class="row">
        <button data-action="undo">↶ 撤销上一笔</button>
        <button data-action="reset-cloud">重置插值</button>
      </div>
    </section>

    <section class="panel">
      <h2>3. 独立图层开关</h2>
      <label class="layer-toggle"><input type="checkbox" data-layer="cloud" checked /><span class="layer-dot" style="background:#2563eb"></span>温度云图层</label>
      <label class="layer-toggle"><input type="checkbox" data-layer="heat" checked /><span class="layer-dot" style="background:#f97316"></span>分层热力图格点层</label>
      <label class="layer-toggle"><input type="checkbox" data-layer="hotZone" checked /><span class="layer-dot" style="background:#dc2626"></span>高温区与蒙版层</label>
      <label class="layer-toggle"><input type="checkbox" data-layer="gradient" checked /><span class="layer-dot" style="background:#7c3aed"></span>梯度突变标注层</label>
    </section>

    <section class="panel">
      <h2>4. 研判底图</h2>
      <button class="primary" data-action="export" style="width:100%">⤓ 保存当前剖面研判底图 PNG</button>
      <p class="message">导出包含坐标剖面、温度云图、高温区边界与温度蒙版，以及数据日期和高温统计。</p>
      <button class="danger" data-action="clear-hot" style="width:100%;margin-top:8px">清除当前高温区</button>
    </section>
  </aside>

  <main>
    <div class="toolbar">
      <div class="segmented" role="tablist" aria-label="视图切换">
        <button data-view="profile" class="active">剖面云图</button>
        <button data-view="layer">分层热力图</button>
      </div>
      <div class="layer-switch">
        <button data-action="prev-layer" aria-label="上一层">‹</button>
        <select data-role="layer-select" aria-label="选择层"></select>
        <button data-action="next-layer" aria-label="下一层">›</button>
      </div>
      <div class="spacer"></div>
      <button data-action="undo-top">↶ 按笔划撤销</button>
      <button class="primary" data-action="export-top">保存研判底图</button>
    </div>

    <section class="canvas-card">
      <div class="stage-wrap">
        <div class="host" data-role="host"></div>
      </div>
      <div class="status"><span class="status-dot"></span><span data-role="status">正在初始化…</span></div>
    </section>

    <section class="details-grid">
      <article>
        <h3>高温区边界 / 蒙版</h3>
        <p data-role="hot-summary"></p>
        <button class="danger" data-action="clear-hot">清除高温区</button>
      </article>
      <article>
        <h3>层间温度梯度</h3>
        <p data-role="gradient-summary"></p>
        <p>选择“梯度线”后沿高度拖动，系统按相邻粮层平均温差找出突变最大的层并在线上标记。</p>
      </article>
      <article>
        <h3>验收操作路径</h3>
        <ul>
          <li>导入 CSV：按 <span class="kbd">电缆编号#层号</span> 自动落格。</li>
          <li>笔刷分小/中/大三档，颜色跟随温度档。</li>
          <li>切到分层热力图并换层，每层温度场独立。</li>
          <li>圈高温区后，在“塑形”工具拖白点改边界。</li>
          <li>一次笔划只产生一条撤销记录。</li>
        </ul>
      </article>
    </section>
  </main>
</div>
`;

function downloadTextFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class GrainWorkbenchElement extends HTMLElement {
  private workbench: Workbench | null = null;
  private root: ShadowRoot | null = null;
  private exportButtons: HTMLButtonElement[] = [];

  connectedCallback(): void {
    if (this.root) return;
    this.root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLES;
    this.root.appendChild(style);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = TEMPLATE;
    while (wrapper.firstElementChild) this.root.appendChild(wrapper.firstElementChild);

    const host = this.require<HTMLDivElement>('[data-role="host"]');
    this.buildSwatches();
    this.bindEvents();
    window.addEventListener('keydown', this.handleKeydown);

    this.workbench = new Workbench(host, (snapshot) => this.render(snapshot));
    this.render(this.workbench.getSnapshot());
  }

  disconnectedCallback(): void {
    window.removeEventListener('keydown', this.handleKeydown);
    this.workbench?.destroy();
    this.workbench = null;
  }

  private handleKeydown = (event: KeyboardEvent): void => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.workbench?.undo();
    }
  };

  private require<T extends Element = Element>(selector: string): T {
    const element = this.root?.querySelector<T>(selector);
    if (!element) throw new Error(`Missing UI element: ${selector}`);
    return element;
  }

  private all<T extends Element = Element>(selector: string): T[] {
    return Array.from(this.root?.querySelectorAll<T>(selector) ?? []);
  }

  private buildSwatches(): void {
    const container = this.require<HTMLDivElement>('[data-role="swatches"]');
    TEMP_BANDS.forEach((band, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'swatch';
      button.dataset.tempIndex = String(index);
      button.style.background = band.color;
      button.textContent = band.label;
      button.title = `用笔温度 ${band.brushTemp}℃`;
      container.appendChild(button);
    });
  }

  private bindEvents(): void {
    this.root?.addEventListener('click', (event) => {
      const path = event.target as HTMLElement;

      const toolButton = path.closest<HTMLButtonElement>('[data-tool]');
      if (toolButton) {
        this.workbench?.setTool(toolButton.dataset.tool as ToolId);
        return;
      }

      const viewButton = path.closest<HTMLButtonElement>('[data-view]');
      if (viewButton) {
        this.workbench?.setView(viewButton.dataset.view as ViewId);
        return;
      }

      const sizeButton = path.closest<HTMLButtonElement>('[data-size]');
      if (sizeButton) {
        this.workbench?.setBrushSize(Number(sizeButton.dataset.size) as 1 | 2 | 3);
        return;
      }

      const tempButton = path.closest<HTMLButtonElement>('[data-temp-index]');
      if (tempButton) {
        this.workbench?.setTempIndex(Number(tempButton.dataset.tempIndex));
        return;
      }

      const actionButton = path.closest<HTMLButtonElement>('[data-action]');
      if (actionButton) {
        void this.handleAction(actionButton.dataset.action ?? '');
      }
    });

    this.all<HTMLInputElement>('[data-layer]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        this.workbench?.setLayerVisible(checkbox.dataset.layer as LayerKey, checkbox.checked);
      });
    });

    this.require<HTMLSelectElement>('[data-role="date"]').addEventListener('change', (event) => {
      this.workbench?.selectDate((event.target as HTMLSelectElement).value);
    });

    this.require<HTMLSelectElement>('[data-role="layer-select"]').addEventListener('change', (event) => {
      this.workbench?.setSelectedLayer(Number((event.target as HTMLSelectElement).value));
    });

    this.require<HTMLInputElement>('[data-role="threshold"]').addEventListener('input', (event) => {
      this.workbench?.setThreshold(Number((event.target as HTMLInputElement).value));
    });

    this.require<HTMLInputElement>('[data-role="file"]').addEventListener('change', async (event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file || !this.workbench) return;
      try {
        const text = await file.text();
        const table = parseTemperatureCsv(text, file.name);
        this.workbench.setTable(table);
      } catch (error) {
        this.workbench.reportImportError(error instanceof Error ? error.message : '温度表导入失败。');
      } finally {
        input.value = '';
      }
    });
  }

  private async handleAction(action: string): Promise<void> {
    if (!this.workbench) return;
    switch (action) {
      case 'import':
        this.require<HTMLInputElement>('[data-role="file"]').click();
        break;
      case 'sample':
        this.workbench.setTable(createSampleTable());
        break;
      case 'template':
        downloadTextFile('粮堆温度表_CSV模板.csv', `﻿${createCsvTemplate()}`, 'text/csv;charset=utf-8');
        break;
      case 'undo':
      case 'undo-top':
        this.workbench.undo();
        break;
      case 'reset-cloud':
        if (window.confirm('确定放弃当前笔刷，恢复为导入测点的插值云图吗？')) {
          this.workbench.resetCloudToReadings();
        }
        break;
      case 'clear-hot':
        this.workbench.clearHotZone();
        break;
      case 'prev-layer':
        this.workbench.setSelectedLayer(this.workbench.getSnapshot().selectedLayer - 1);
        break;
      case 'next-layer':
        this.workbench.setSelectedLayer(this.workbench.getSnapshot().selectedLayer + 1);
        break;
      case 'export':
      case 'export-top': {
        this.exportButtons = this.all<HTMLButtonElement>('[data-action="export"],[data-action="export-top"]');
        this.exportButtons.forEach((button) => {
          button.disabled = true;
          button.dataset.originalText = button.textContent ?? '';
          button.textContent = '正在生成…';
        });
        try {
          await this.workbench.exportBaseMap();
        } finally {
          this.exportButtons.forEach((button) => {
            button.disabled = false;
            button.textContent = button.dataset.originalText || '保存研判底图';
          });
        }
        break;
      }
      default:
        break;
    }
  }

  private render(s: WorkbenchSnapshot): void {
    if (!this.root) return;

    this.all<HTMLButtonElement>('[data-tool]').forEach((button) => {
      button.classList.toggle('active', button.dataset.tool === s.tool);
    });
    this.all<HTMLButtonElement>('[data-view]').forEach((button) => {
      button.classList.toggle('active', button.dataset.view === s.view);
    });
    this.all<HTMLButtonElement>('[data-size]').forEach((button) => {
      button.classList.toggle('active', Number(button.dataset.size) === s.brushSize);
    });
    this.all<HTMLButtonElement>('[data-temp-index]').forEach((button) => {
      button.classList.toggle('active', Number(button.dataset.tempIndex) === s.tempIndex);
    });

    const tempBand = TEMP_BANDS[s.tempIndex];
    this.text('[data-role="temp-label"]', tempBand.label);

    const dateSelect = this.require<HTMLSelectElement>('[data-role="date"]');
    const dateSignature = s.dates.join('|');
    if (dateSelect.dataset.signature !== dateSignature) {
      dateSelect.innerHTML = s.dates
        .map((date) => `<option value="${this.escapeAttribute(date)}">${this.escapeHtml(date)}</option>`)
        .join('');
      dateSelect.dataset.signature = dateSignature;
    }
    dateSelect.value = s.selectedDate;

    const layerSelect = this.require<HTMLSelectElement>('[data-role="layer-select"]');
    if (Number(layerSelect.dataset.count) !== s.layerCount) {
      layerSelect.innerHTML = Array.from(
        { length: s.layerCount },
        (_, i) => `<option value="${i + 1}">第 ${i + 1} 层</option>`
      ).join('');
      layerSelect.dataset.count = String(s.layerCount);
    }
    layerSelect.value = String(s.selectedLayer);

    this.text('[data-role="stat-cables"]', String(s.cableCount));
    this.text('[data-role="stat-layers"]', String(s.layerCount));
    this.text('[data-role="stat-records"]', String(s.recordCount));
    this.text('[data-role="import-message"]', s.importMessage);

    const error = this.require<HTMLDivElement>('[data-role="import-error"]');
    error.textContent = s.importError;
    error.hidden = !s.importError;

    this.text('[data-role="status"]', s.status);
    this.text('[data-role="hot-summary"]', s.hotZoneSummary);
    this.text('[data-role="gradient-summary"]', s.gradientSummary);

    const threshold = this.require<HTMLInputElement>('[data-role="threshold"]');
    threshold.value = String(s.threshold);
    this.text('[data-role="threshold-value"]', `≥ ${s.threshold.toFixed(1)} ℃`);

    this.all<HTMLInputElement>('[data-layer]').forEach((checkbox) => {
      const key = checkbox.dataset.layer as LayerKey;
      checkbox.checked = s.layerVisibility[key];
    });

    this.all<HTMLButtonElement>('[data-action="undo"],[data-action="undo-top"]').forEach((button) => {
      button.disabled = !s.canUndo;
      if (button.dataset.action === 'undo') {
        button.textContent = s.canUndo ? `↶ 撤销上一笔（${s.undoDepth}）` : '↶ 撤销上一笔';
      }
    });
  }

  private text(selector: string, value: string): void {
    const element = this.root?.querySelector(selector);
    if (element) element.textContent = value;
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string
    );
  }

  private escapeAttribute(value: string): string {
    return this.escapeHtml(value);
  }
}

if (!customElements.get('grain-workbench')) {
  customElements.define('grain-workbench', GrainWorkbenchElement);
}
