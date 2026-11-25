import { For } from 'solid-js';
import type { DesignModel } from '../lib/design';
import {
  buildBomCsv,
  buildMarkdownReport,
  buildPositionsCsv,
  buildProjectJson,
  downloadTextFile,
} from '../lib/exporters';
import { notify } from '../state/store';

interface DeliverablesPanelProps {
  model: DesignModel;
}

export function DeliverablesPanel(props: DeliverablesPanelProps) {
  const totalQty = () => props.model.bom.reduce((sum, row) => sum + row.qty, 0);

  const fileStem = () => `传动件下料清单_${props.model.fingerprint}_${props.model.seedCode}`;

  const downloadMarkdown = () => {
    downloadTextFile(`${fileStem()}.md`, buildMarkdownReport(props.model), 'text/markdown;charset=utf-8');
    notify('已导出完整下料清单与装配说明 Markdown。', 'success');
  };

  const downloadBomCsv = () => {
    downloadTextFile(`${fileStem()}_下料清单.csv`, buildBomCsv(props.model), 'text/csv;charset=utf-8');
    notify('已导出下料清单 CSV，可用 Excel 打开。', 'success');
  };

  const downloadPositionsCsv = () => {
    downloadTextFile(`${fileStem()}_安装坐标.csv`, buildPositionsCsv(props.model), 'text/csv;charset=utf-8');
    notify('已导出全部件号的安装坐标 CSV。', 'success');
  };

  const downloadJson = () => {
    downloadTextFile(`${fileStem()}_复现参数.json`, buildProjectJson(props.model), 'application/json;charset=utf-8');
    notify('已导出工程 JSON；同参数、同种子、同覆盖可完全复现。', 'success');
  };

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(buildMarkdownReport(props.model));
      notify('施工说明 Markdown 已复制到剪贴板。', 'success');
    } catch {
      notify('浏览器拒绝剪贴板访问，请改用下载 Markdown。', 'warning');
    }
  };

  return (
    <div class="panel-stack">
      <section class="card card-final">
        <div class="card-title-row">
          <div>
            <h2>定稿下料清单</h2>
            <p>按类别汇总参数、数量与安装位置，批量数量已乘入总数。</p>
          </div>
          <span class="badge badge-green">总数量 {totalQty()}</span>
        </div>

        <div class="export-grid">
          <button type="button" class="button button-primary" onClick={downloadMarkdown}>
            下载清单 + 装配说明
          </button>
          <button type="button" class="button button-soft" onClick={copyMarkdown}>
            复制 Markdown
          </button>
          <button type="button" class="button button-soft" onClick={downloadBomCsv}>
            下料 CSV
          </button>
          <button type="button" class="button button-soft" onClick={downloadPositionsCsv}>
            安装坐标 CSV
          </button>
          <button type="button" class="button button-ghost button-block" onClick={downloadJson}>
            导出复现工程 JSON
          </button>
        </div>

        <div class="final-meta">
          <div>
            <span class="micro-label">复现指纹</span>
            <strong>{props.model.fingerprint}</strong>
          </div>
          <div>
            <span class="micro-label">批量套数</span>
            <strong>×{props.model.params.batchCount}</strong>
          </div>
        </div>
      </section>

      <For each={props.model.bom}>
        {(row) => (
          <section class="card bom-card">
            <div class="bom-head">
              <div>
                <span class={`category-tag category-${row.category}`}>{row.category}</span>
                <h3>{row.name}</h3>
              </div>
              <div class="bom-qty">
                <strong>{row.qty}</strong>
                <span>{row.unit}</span>
              </div>
            </div>
            <p class="bom-spec">{row.spec}</p>
            <p class="bom-material">材料/工艺：{row.material}</p>
            <div class="bom-count-line">
              单套 {row.qtyPerSet} {row.unit} × 批量 {row.batchCount}
            </div>
            <details class="position-details">
              <summary>安装位置（{row.positions.length} 条）</summary>
              <ul>
                <For each={row.positions}>{(position) => <li>{position}</li>}</For>
              </ul>
            </details>
          </section>
        )}
      </For>

      <section class="card">
        <h2>装配说明摘要</h2>
        <ol class="assembly-list">
          <li>核对供应商提供的模数 m{props.model.params.module}、压力角 {props.model.params.pressureAngle}° 与齿形刀具。</li>
          <li>齿条以 Y=0 为齿距基准线找水平，对接齿距偏差控制在 0.05mm 内。</li>
          <li>按 G1…G{props.model.gears.length} 件号装齿轮；橙色手调件不得用基础 z{props.model.params.baseTeeth} 替代。</li>
          <li>盘车检查啮合与侧隙，建议齿侧间隙 0.08–0.20mm，不得有卡滞。</li>
          <li>
            栅格间距 {props.model.params.spacing}mm，条厚上限 {props.model.grid.thicknessMax}mm；本版采用{' '}
            {props.model.params.gridThickness}mm。
          </li>
          <li>
            前后栅格 Z 坐标为 {props.model.grid.zFront} / {props.model.grid.zRear}mm，净距 {props.model.params.gridClearance}mm。
          </li>
          <li>批量 {props.model.params.batchCount} 套按同一坐标施工；复验输入 {props.model.seedCode} 与 {props.model.fingerprint}。</li>
        </ol>
      </section>
    </div>
  );
}
