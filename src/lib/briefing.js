import { downloadBlob } from './geo.js';
import { buildHandoffGeoJson } from './projectIO.js';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

export async function composeBriefingPng(captures, context) {
  const { project, mapperIds = [], assessorIds = [], zones = [], activeRole = 'mapper' } = context;
  const canvas = document.createElement('canvas');
  canvas.width = 1800;
  canvas.height = 1280;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header
  const gradient = ctx.createLinearGradient(0, 0, 1800, 110);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(0.58, '#164e63');
  gradient.addColorStop(1, '#1d4ed8');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1800, 112);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 34px "Microsoft YaHei", "Segoe UI", sans-serif';
  ctx.fillText('火山锥区熔岩流单元总览 · 会商用图', 42, 48);
  ctx.font = '500 18px "Microsoft YaHei", "Segoe UI", sans-serif';
  ctx.fillStyle = '#cffafe';
  ctx.fillText(`${project.name}　|　${project.areaName}　|　工程版本 r${project.revision}`, 42, 82);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#e0f2fe';
  ctx.fillText(new Date().toLocaleString('zh-CN', { hour12: false }), 1758, 46);
  ctx.font = '600 16px "Microsoft YaHei", sans-serif';
  ctx.fillText('供避险范围划定环节继续使用', 1758, 80);
  ctx.textAlign = 'left';

  const available = captures.filter(Boolean);
  const mapArea = { x: 42, y: 138, width: 1716, height: 700 };
  const gap = 24;
  const panelWidth = available.length > 1 ? (mapArea.width - gap) / 2 : mapArea.width;

  for (let i = 0; i < Math.max(1, available.length); i++) {
    const x = mapArea.x + i * (panelWidth + gap);
    const capture = available[i];
    ctx.save();
    roundRect(ctx, x, mapArea.y, panelWidth, mapArea.height, 18);
    ctx.fillStyle = '#e2e8f0';
    ctx.fill();
    ctx.clip();
    if (capture?.url) {
      const image = await loadImage(capture.url);
      const scale = Math.min(panelWidth / image.width, mapArea.height / image.height);
      const drawW = image.width * scale;
      const drawH = image.height * scale;
      ctx.drawImage(image, x + (panelWidth - drawW) / 2, mapArea.y + (mapArea.height - drawH) / 2, drawW, drawH);
    } else {
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '700 28px "Microsoft YaHei"';
      ctx.fillText('地图视图不可用', x + 40, mapArea.y + 80);
    }
    ctx.restore();

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    roundRect(ctx, x, mapArea.y, panelWidth, mapArea.height, 18);
    ctx.stroke();

    ctx.fillStyle = 'rgba(15,23,42,.86)';
    roundRect(ctx, x + 16, mapArea.y + 16, 260, 44, 22);
    ctx.fill();
    ctx.fillStyle = capture?.role === 'assessor' ? '#fbcfe8' : '#a5f3fc';
    ctx.font = '800 18px "Microsoft YaHei"';
    ctx.fillText(capture?.title || (i === 0 ? '当前视图' : '另一视图'), x + 34, mapArea.y + 45);

    // North arrow
    const nx = x + panelWidth - 58;
    const ny = mapArea.y + 54;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(nx, ny - 28);
    ctx.lineTo(nx - 13, ny + 12);
    ctx.lineTo(nx, ny + 4);
    ctx.lineTo(nx + 13, ny + 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = '800 18px Segoe UI';
    ctx.fillText('N', nx - 6, ny - 36);
  }

  // Bottom information area
  const bottomY = 870;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#cbd5e1';
  roundRect(ctx, 42, bottomY, 520, 350, 16);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 22px "Microsoft YaHei"';
  ctx.fillText('期次分层图例', 66, bottomY + 38);
  project.periods.forEach((period, index) => {
    const y = bottomY + 76 + index * 42;
    ctx.fillStyle = period.color;
    roundRect(ctx, 68, y - 18, 28, 20, 5);
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 17px "Microsoft YaHei"';
    ctx.fillText(`${period.name}（${period.code}）`, 110, y - 2);
    ctx.fillStyle = '#64748b';
    ctx.font = '500 14px "Microsoft YaHei"';
    const count = project.units.filter((u) => u.periodId === period.id).length;
    ctx.fillText(`${count.toLocaleString()} 单元`, 390, y - 2);
  });

  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 586, bottomY, 560, 350, 16);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 22px "Microsoft YaHei"';
  ctx.fillText('协同选中与对比范围', 610, bottomY + 38);
  ctx.font = '600 16px "Microsoft YaHei"';
  ctx.fillStyle = '#0e7490';
  ctx.fillText(`编图选中：${mapperIds.length ? mapperIds.slice(0, 10).join('、') + (mapperIds.length > 10 ? ' …' : '') : '无'}`, 610, bottomY + 78, 510);
  ctx.fillStyle = '#be185d';
  ctx.fillText(`评估选中：${assessorIds.length ? assessorIds.slice(0, 10).join('、') + (assessorIds.length > 10 ? ' …' : '') : '无'}`, 610, bottomY + 126, 510);
  ctx.fillStyle = '#6d28d9';
  const zoneNames = zones.map((z) => z.name).join('、') || '未叠加';
  ctx.fillText(`避险范围：${zoneNames}`, 610, bottomY + 174, 510);
  ctx.fillStyle = '#92400e';
  ctx.fillText(`琥珀色图斑：与当前显示期次相交的预警单元，详见协同面板。`, 610, bottomY + 222, 510);
  ctx.fillStyle = '#475569';
  ctx.font = '500 14px "Microsoft YaHei"';
  ctx.fillText('选中单元、前缘点与避险范围已同步写入交接 GeoJSON。', 610, bottomY + 278);
  ctx.fillText('本图为局部工程坐标；正式出图前应挂接 CGCS2000/UTM 与比例尺。', 610, bottomY + 306);

  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 1172, bottomY, 586, 350, 16);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 22px "Microsoft YaHei"';
  ctx.fillText('移交避险范围划定环节', 1196, bottomY + 40);
  const handoff = [
    `要素总数：${project.stats.featureCount.toLocaleString()}`,
    `熔岩流单元：${project.stats.unitCount.toLocaleString()}`,
    `当前出图岗位：${activeRole === 'mapper' ? '编图组' : '评估组'}`,
    '交付物：会商 PNG + handoff.geojson',
    'GeoJSON：选中单元 / 前缘点 / 避险范围',
    '工程 JSON：完整分层、修订与导入数据源'
  ];
  handoff.forEach((line, i) => {
    ctx.fillStyle = i < 3 ? '#0f172a' : '#334155';
    ctx.font = i < 3 ? '700 18px "Microsoft YaHei"' : '500 16px "Microsoft YaHei"';
    ctx.fillText(line, 1198, bottomY + 86 + i * 42);
  });
  ctx.fillStyle = '#1d4ed8';
  roundRect(ctx, 1198, bottomY + 296, 250, 38, 19);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 15px "Microsoft YaHei"';
  ctx.fillText('可直接进入范围划定 / 转移分析', 1216, bottomY + 321);

  return canvas.toDataURL('image/png');
}

export function downloadBriefingPng(dataUrl, project) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `volcano-briefing-r${project.revision}-${Date.now()}.png`;
  link.click();
}

export function downloadHandoff(project, payload) {
  const geojson = buildHandoffGeoJson(project, payload);
  const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
  downloadBlob(blob, `volcano-handoff-r${project.revision}.geojson`, 'application/geo+json');
}
