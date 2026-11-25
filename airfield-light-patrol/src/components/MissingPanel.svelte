<script>
  import { missingReports, resolveReport, setFeatureStatus, config } from '../lib/stores.js';
  import { getDataset } from '../lib/data/generator.js';
  import { CATEGORY_MAP } from '../lib/data/categories.js';
  import JSZip from 'jszip';

  let expanded = $state(true);
  let reports = $derived($missingReports);
  let openCount = $derived(reports.filter((r) => r.status === 'open').length);

  function toggle() {
    expanded = !expanded;
  }

  // 工程师补录：把报告内编号标记为已恢复（演示闭环）
  function backfill(report) {
    for (const id of report.missingIds) {
      setFeatureStatus(id, 'ok');
    }
    resolveReport(report.reportId);
  }

  async function exportPackage() {
    const zip = new JSZip();
    const ds = getDataset();
    zip.file('feature-config.json', JSON.stringify($config, null, 2));

    const missingPayload = {
      exportedAt: new Date().toISOString(),
      totalReports: reports.length,
      openReports: openCount,
      reports: reports.map((r) => ({
        reportId: r.reportId,
        createdAt: r.createdAt,
        status: r.status,
        category: r.categoryName,
        taxiway: r.lineId,
        rect: r.rect,
        missingIds: r.missingIds
      }))
    };
    zip.file('missing-list.json', JSON.stringify(missingPayload, null, 2));

    // 可读清单（CSV）
    const rows = [['报告号', '时间', '状态', '类别', '线路', '缺失编号']];
    for (const r of reports) {
      rows.push([r.reportId, r.createdAt, r.status, r.categoryName, r.lineId, r.missingIds.join(';')]);
    }
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    zip.file('missing-list.csv', csv);

    // 场景说明
    zip.file(
      'README.txt',
      [
        '机场灯光场景要素包',
        `导出时间：${new Date().toLocaleString()}`,
        `测绘资料：${ds.meta.surveySource}`,
        `跑道方位：${ds.meta.runwayAzimuth}°（05/23）`,
        `要素总数：${ds.stats.total}，灯组：${ds.stats.groupCount}`,
        `缺失报告：${reports.length} 份（待处理 ${openCount} 份）`,
        '',
        '文件：',
        '  feature-config.json — 地景要素配置（图层/简化阈值/显示级别）',
        '  missing-list.json   — 缺失编号清单（含框选范围坐标）',
        '  missing-list.csv    — 缺失清单表格版',
        '交付对象：模拟机运维'
      ].join('\n')
    );

    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `scene-feature-package-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
</script>

<div class="missing-panel">
  <button type="button" class="mp-head" onclick={toggle} aria-expanded={expanded}>
    <span>缺失清单 <em class="mp-badge">{openCount}</em></span>
    <span class="mp-toggle">{expanded ? '▾' : '▸'}</span>
  </button>
  {#if expanded}
    <div class="mp-body">
      {#if reports.length === 0}
        <p class="mp-empty">暂无缺失报告。使用「框选缺灯段」在图上框选疑似缺灯的滑行道段。</p>
      {:else}
        {#each reports as r (r.reportId)}
          <div class="mp-item" class:resolved={r.status === 'resolved'}>
            <div class="mp-item-head">
              <b>{r.reportId}</b>
              <span class="mp-cat">{r.categoryName} · {r.lineId}</span>
              {#if r.status === 'open'}
                <span class="tag tag-open">待补录</span>
              {:else}
                <span class="tag tag-done">已补录</span>
              {/if}
            </div>
            <div class="mp-ids">
              {#each r.missingIds as id (id)}
                <code class:miss-code={r.status === 'open'}>{id}</code>
              {/each}
            </div>
            {#if r.status === 'open'}
              <button class="mp-backfill" onclick={() => backfill(r)}>工程师补录并关闭</button>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
    <div class="mp-foot">
      <button class="pkg-btn" onclick={exportPackage} disabled={reports.length === 0}>
        打包场景要素包 (.zip)
      </button>
    </div>
  {/if}
</div>
