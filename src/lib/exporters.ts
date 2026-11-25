import { PROFILE_LABELS, type DesignModel } from './design';

export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob(['﻿', content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildBomCsv(model: DesignModel): string {
  const header = ['类别', '编号', '名称', '规格参数', '材料/工艺', '单位', '单套数量', '批量套数', '总数量', '安装位置'];
  const lines = [header.map(csvCell).join(',')];

  for (const row of model.bom) {
    lines.push(
      [
        row.category,
        row.id,
        row.name,
        row.spec,
        row.material,
        row.unit,
        row.qtyPerSet,
        row.batchCount,
        row.qty,
        row.positions.join(' | '),
      ]
        .map(csvCell)
        .join(','),
    );
  }

  return lines.join('\r\n');
}

export function buildPositionsCsv(model: DesignModel): string {
  const rows: Array<[string, string, number, number, number, string]> = [];

  for (const gear of model.gears) {
    rows.push([
      gear.id,
      '齿轮',
      gear.position.x,
      gear.position.y,
      gear.position.z,
      `z${gear.teeth}${gear.manual ? '，手调齿数' : ''}；实际中心距按相邻坐标复核`,
    ]);
  }

  rows.push(['RACK', '齿条', 0, 0, 0, '齿距基准线 Y=0，沿 X 向找水平']);

  model.grid.vertical.forEach((bar, index) => {
    rows.push([`GV-${index + 1}-F`, '前栅竖条', bar.x, model.grid.centerY, model.grid.zFront, `长度${bar.length}`]);
    rows.push([`GV-${index + 1}-B`, '后栅竖条', bar.x, model.grid.centerY, model.grid.zRear, `长度${bar.length}`]);
  });

  model.grid.horizontal.forEach((bar, index) => {
    rows.push([`GH-${index + 1}-F`, '前栅横条', 0, bar.y, model.grid.zFront, `长度${bar.length}`]);
    rows.push([`GH-${index + 1}-B`, '后栅横条', 0, bar.y, model.grid.zRear, `长度${bar.length}`]);
  });

  const header = ['件号', '类别', 'X_mm', 'Y_mm', 'Z_mm', '备注'];
  return [
    header.join(','),
    ...rows.map((row) => row.map((value) => csvCell(typeof value === 'number' ? value.toFixed(1) : value)).join(',')),
  ].join('\r\n');
}

export function buildProjectJson(model: DesignModel): string {
  return JSON.stringify(
    {
      tool: 'SolidJS × Babylon.js 机关传动件程序化出件工作台',
      version: model.version,
      fingerprint: model.fingerprint,
      seedCode: model.seedCode,
      params: model.params,
      overrides: model.overrides,
      gears: model.gears.map((g) => ({
        id: g.id,
        teeth: g.teeth,
        manual: g.manual,
        position: g.position,
        specKey: g.specKey,
        boreDiameter: g.boreDiameter,
        holePattern: g.holePattern,
      })),
      grid: model.grid,
      bom: model.bom,
    },
    null,
    2,
  );
}

export function buildMarkdownReport(model: DesignModel): string {
  const p = model.params;
  const manualGears = model.gears.filter((g) => g.manual);
  const totalQty = model.bom.reduce((sum, row) => sum + row.qty, 0);

  const lines: string[] = [];
  lines.push('# 机关传动件程序化出件 — 下料清单与装配说明');
  lines.push('');
  lines.push(`- 复现指纹：**${model.fingerprint}**`);
  lines.push(`- 种子：**${model.seedCode}**`);
  lines.push(`- 批量：**${p.batchCount} 套**；清单总条数/件数合计 **${totalQty}**（含标准件批项）`);
  lines.push(`- 基础规格：模数 **m${p.module}**，压力角 **${p.pressureAngle}°**，基础齿数 **z${p.baseTeeth}**`);
  lines.push(`- 齿形：**${PROFILE_LABELS[p.profile]}**；整组间距/栅格节距 **${p.spacing}mm**；齿厚 **${p.thickness}mm**`);
  lines.push(`- 手调齿轮：${manualGears.length ? manualGears.map((g) => `${g.id}=z${g.teeth}`).join('，') : '无'}`);
  lines.push('');

  if (model.warnings.length) {
    lines.push('## 设计校核提示');
    for (const warning of model.warnings) lines.push(`- ⚠️ ${warning}`);
    lines.push('');
  }

  lines.push('## 一、下料清单');
  lines.push('');
  lines.push('| 类别 | 名称 | 规格参数 | 材料/工艺 | 单套 | 批量 | 总数 | 单位 |');
  lines.push('| --- | --- | --- | --- | ---: | ---: | ---: | --- |');
  for (const row of model.bom) {
    lines.push(
      `| ${row.category} | ${row.name} | ${row.spec.replaceAll('|', '/')} | ${row.material} | ${row.qtyPerSet} | ${row.batchCount} | **${row.qty}** | ${row.unit} |`,
    );
  }
  lines.push('');

  lines.push('## 二、安装位置表（首套坐标，单位 mm）');
  lines.push('');
  lines.push('坐标原点：首套传动组几何中心；X 沿齿条长度，Y 竖直向上，Z 为齿厚方向。');
  lines.push('');
  lines.push('| 件号 | 类别/名称 | 安装坐标 | 关键参数 |');
  lines.push('| --- | --- | --- | --- |');
  for (const gear of model.gears) {
    lines.push(
      `| ${gear.id} | ${gear.manual ? '手调齿轮' : '标准齿轮'} | X${gear.position.x}，Y${gear.position.y}，Z0 | z${gear.teeth}，m${gear.module}，齿厚${gear.thickness}，轴孔Ø${gear.boreDiameter} |`,
    );
  }
  lines.push(`| RACK | 齿条 | X0，Y0 齿距基准线，Z0 | 长${model.rack.length}，${model.rack.toothCount}齿，齿距${model.rack.toothPitch} |`);
  lines.push(`| GRID-F | 前栅格 | X0，Y${model.grid.centerY}，Z${model.grid.zFront} | 外廓${model.grid.width}×${model.grid.height}，条厚${p.gridThickness}，间距${p.spacing} |`);
  lines.push(`| GRID-B | 后栅格 | X0，Y${model.grid.centerY}，Z${model.grid.zRear} | 同上 |`);
  lines.push('');

  lines.push('## 三、装配说明');
  lines.push('');
  lines.push('1. **来料核对**：按五金供应商质保书核对齿条和齿轮滚刀模数、压力角；常用压力角为 20°，齿形类别须与本清单一致。');
  lines.push('2. **齿条定位**：以 Y=0 为齿条齿距基准线，将齿条基面贴平安装梁；从 X=0 向两侧找水平，按安装孔位置配钻并分段紧固。对接齿条时相邻齿距偏差不大于 0.05mm。');
  lines.push('3. **齿轮编号**：严格按 G1 起的件号安装。手调齿数齿轮已在清单和 3D 场景中以橙色标识，不得用基础 z' + p.baseTeeth + ' 齿轮替代。');
  lines.push('4. **中心距复核**：相邻齿轮的理论中心距为 m(z₁+z₂)/2；本方案因采用共齿条高度布局，X 坐标和 Y 坐标均在位置表中给出。装配后盘动应无卡滞，齿侧间隙建议 0.08–0.20mm。');
  lines.push('5. **轴向固定**：齿轮毂孔与传动轴采用 H7/h6 或平键连接，紧定螺钉对准键槽/平台；所有齿轮端面与 Z=0 基准面偏差不大于 0.10mm。');
  lines.push(`6. **栅格制作**：栅条间距 ${p.spacing}mm，条厚不得超过 ${model.grid.thicknessMax}mm；本方案采用 ${p.gridThickness}mm。先焊框架再点焊栅条，对角线误差不大于 3mm，焊后打磨喷塑。`);
  lines.push(`7. **外侧安装**：前后栅格中心分别位于 Z=${model.grid.zFront} 和 Z=${model.grid.zRear}，与齿轮端面净距 ${p.gridClearance}mm；安装后手动盘车确认无干涉。`);
  lines.push(`8. **批量与复现**：批量 ${p.batchCount} 套均按同一坐标和清单施工。复验时在工具中输入种子 ${p.seed} 及复现指纹 ${model.fingerprint}，并导回 JSON 参数；同参数、同种子、同手调覆盖必须得到完全一致的零件坐标和数量。`);
  lines.push('9. **安全防护**：栅格门应加检修联锁或可锁定扣件；试运转前清除工具，先点动确认旋向，再连续运行 30 分钟检查温升和噪声。');
  lines.push('');
  lines.push('## 四、版本比对要点');
  lines.push('');
  lines.push('- 种子只决定减重孔排布、相位等确定性派生细节；主规格、坐标和数量由参数与手调覆盖决定。');
  lines.push('- 修改整组间距后，若 G 编号的齿数仍显示“手调”，说明局部覆盖未被上游刷新冲掉。');
  lines.push('- 两版方案应分别保存 Markdown/JSON，并比对指纹、BOM 总数、G 件号齿数和安装坐标。');
  lines.push('');

  return lines.join('\n');
}
