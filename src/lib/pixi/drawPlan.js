import { Container, Graphics, Text } from 'pixi.js';
import { round } from '../domain/rng.js';

const COLORS = {
  grid: 0x2b4c68,
  gridStrong: 0x3b6486,
  soil: 0x102a40,
  wallFill: 0x153852,
  wall: 0x9edcff,
  dimension: 0x8fb7d4,
  mainCasing: 0x05131f,
  main: 0x38bdf8,
  branchCasing: 0x061827,
  branch: 0x8bdcff,
  branchManual: 0xfbbf24,
  selected: 0xfb923c,
  vent: 0x34d399,
  ventStroke: 0x052e22,
  danger: 0xef4444,
  text: 0xe6f4ff,
  muted: 0x9cc7e4
};

function niceStep(raw) {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const factor = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return factor * pow;
}

function addText(layer, text, x, y, options = {}) {
  const label = new Text({
    text,
    style: {
      fontFamily: '"Segoe UI", "Microsoft YaHei", system-ui, sans-serif',
      fontSize: options.size ?? 12,
      fontWeight: options.weight ?? '600',
      fill: options.color ?? COLORS.text,
      align: options.align ?? 'center',
      ...options.style
    }
  });
  label.anchor.set(options.anchorX ?? 0.5, options.anchorY ?? 0.5);
  label.position.set(x, y);
  label.alpha = options.alpha ?? 1;
  layer.addChild(label);
  return label;
}

function drawLine(g, points, projectX, projectY) {
  g.moveTo(projectX(points[0].x), projectY(points[0].y));
  for (let i = 1; i < points.length; i += 1) {
    g.lineTo(projectX(points[i].x), projectY(points[i].y));
  }
}

function strokePolyline(layer, points, projectX, projectY, widthPx, color, alpha = 1) {
  const g = new Graphics();
  drawLine(g, points, projectX, projectY);
  g.stroke({ width: widthPx, color, alpha, cap: 'round', join: 'round' });
  layer.addChild(g);
  return g;
}

export function renderPlan(layer, options) {
  const {
    host,
    canvas,
    network,
    editable = false,
    selectedBranchId = null,
    selectedVentId = null,
    onSelectBranch = () => {},
    onSelectVent = () => {},
    onClearSelection = () => {},
    onBranchDrag = () => {},
    onDeleteVent = () => {}
  } = options;

  const width = host?.clientWidth ?? 0;
  const height = host?.clientHeight ?? 0;
  if (!width || !height || !network) return { destroyDrag: () => {} };

  const p = network.params;
  const silo = network.silo;
  const topPad = options.compact ? 44 : 58;
  const bottomPad = options.compact ? 38 : 54;
  const sidePad = 28;
  const scale = Math.min(
    (width - sidePad * 2) / (p.innerDiameter + 2.2),
    (height - topPad - bottomPad) / (p.innerDiameter + 1.5)
  );
  const cx = width / 2;
  // Anchor the top of the silo just under the badge row so diameter label has room.
  const cy = topPad + silo.radius * scale + 8;
  const X = (x) => cx + x * scale;
  const Y = (y) => cy - y * scale;

  const dragCleanups = [];
  const clientToMeters = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - cx) / scale,
      y: (cy - (clientY - rect.top)) / scale
    };
  };

  // Background hit area / CAD grid.
  const background = new Graphics();
  background.rect(0, 0, width, height).fill({ color: 0x071a2b, alpha: 0.35 });
  background.eventMode = 'static';
  background.cursor = editable ? 'crosshair' : 'default';
  background.on('pointerdown', (event) => {
    event.stopPropagation();
    onClearSelection();
  });
  layer.addChild(background);

  const grid = new Graphics();
  const step = niceStep(48 / scale);
  const minX = (0 - cx) / scale;
  const maxX = (width - cx) / scale;
  const minY = (cy - height) / scale;
  const maxY = cy / scale;
  for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) {
    grid.moveTo(X(x), 0).lineTo(X(x), height);
  }
  for (let y = Math.ceil(minY / step) * step; y <= maxY; y += step) {
    grid.moveTo(0, Y(y)).lineTo(width, Y(y));
  }
  grid.stroke({ width: 1, color: COLORS.grid, alpha: 0.34 });
  layer.addChild(grid);

  // Circular silo plan.
  const wallPx = Math.max(4, 0.28 * scale);
  const outerR = (silo.radius + 0.22) * scale;
  const siloFill = new Graphics();
  siloFill
    .circle(cx, cy, silo.radius * scale)
    .fill({ color: COLORS.soil, alpha: 0.82 })
    .stroke({ color: COLORS.wallFill, width: wallPx + 5, alpha: 0.95 });
  layer.addChild(siloFill);

  const wall = new Graphics();
  wall.circle(cx, cy, silo.radius * scale).stroke({ width: wallPx, color: COLORS.wall, alpha: 0.95 });
  layer.addChild(wall);

  const innerTick = new Graphics();
  innerTick.circle(cx, cy, silo.effectiveRadius * scale).stroke({
    width: 1,
    color: COLORS.wall,
    alpha: 0.22
  });
  layer.addChild(innerTick);

  addText(layer, `Ø ${p.innerDiameter.toFixed(1)} m`, cx, Math.max(18, cy - silo.radius * scale - 18), {
    size: options.compact ? 12 : 14,
    color: COLORS.wall,
    weight: '800'
  });
  if (!options.compact) {
    addText(layer, '筒仓内径 / 仓壁', cx, Math.min(height - 14, cy + silo.radius * scale + 18), {
      size: 11,
      color: COLORS.muted
    });
  }

  // Diameter dimension ticks are useful in the large editable view; compact cards keep the top label.
  const dimY = Y(-silo.radius - 0.85);
  if (!options.compact && dimY < height - 28) {
    const dim = new Graphics();
    dim.moveTo(X(-silo.radius), dimY).lineTo(X(silo.radius), dimY);
    dim.moveTo(X(-silo.radius), dimY - 5).lineTo(X(-silo.radius), dimY + 5);
    dim.moveTo(X(silo.radius), dimY - 5).lineTo(X(silo.radius), dimY + 5);
    dim.stroke({ width: 1.4, color: COLORS.dimension, alpha: 0.75 });
    layer.addChild(dim);
    addText(layer, `内径 ${p.innerDiameter.toFixed(1)} m`, cx, dimY + 13, {
      size: 11,
      color: COLORS.dimension
    });
  }

  // Main duct casing/core.
  const main = network.main;
  for (const line of main.polylines) {
    strokePolyline(layer, line, X, Y, Math.max(7, main.width * scale * 1.45), COLORS.mainCasing, 0.96);
  }
  if (main.circle) {
    const casing = new Graphics();
    casing.circle(cx, cy, main.circle.r * scale).stroke({
      width: Math.max(7, main.width * scale * 1.45),
      color: COLORS.mainCasing,
      alpha: 0.96
    });
    layer.addChild(casing);
  }

  for (const line of main.polylines) {
    strokePolyline(layer, line, X, Y, Math.max(4, main.width * scale), COLORS.main, 0.96);
  }
  if (main.circle) {
    const core = new Graphics();
    core.circle(cx, cy, main.circle.r * scale).stroke({
      width: Math.max(3, main.width * scale * 0.82),
      color: COLORS.main,
      alpha: 0.95
    });
    layer.addChild(core);
  }
  if (main.hub) {
    const hub = new Graphics();
    hub
      .circle(cx, cy, main.hub.r * scale * 1.25)
      .fill({ color: COLORS.mainCasing })
      .circle(cx, cy, main.hub.r * scale)
      .fill({ color: COLORS.main });
    layer.addChild(hub);
  }

  addText(layer, '主风道', X(-silo.effectiveRadius + 1.1), Y(0.72), {
    size: 11,
    color: 0xc8f1ff,
    anchorX: 0
  });

  // Branch ducts with direct manipulation hit areas.
  for (const branch of network.branches) {
    const selected = branch.id === selectedBranchId;
    const color = branch.manual ? COLORS.branchManual : selected ? COLORS.selected : COLORS.branch;
    const widthPx = Math.max(4, branch.width * scale);
    const branchView = new Graphics();

    drawLine(branchView, branch.points, X, Y);
    branchView.stroke({
      width: Math.max(8, widthPx * 1.55),
      color: selected ? COLORS.selected : COLORS.branchCasing,
      alpha: selected ? 0.42 : 0.96,
      cap: 'round',
      join: 'round'
    });

    drawLine(branchView, branch.points, X, Y);
    branchView.stroke({
      width: widthPx + (selected ? 2 : 0),
      color,
      alpha: 0.98,
      cap: 'round',
      join: 'round'
    });

    // Wide nearly-transparent stroke gives an easy pointer target.
    drawLine(branchView, branch.points, X, Y);
    branchView.stroke({
      width: Math.max(20, widthPx * 2.4),
      color: 0xffffff,
      alpha: 0.012,
      cap: 'round',
      join: 'round'
    });

    if (editable) {
      branchView.eventMode = 'static';
      branchView.cursor = 'grab';
      branchView.on('pointerdown', (event) => {
        event.stopPropagation();
        onSelectBranch(branch.id);
        if (canvas) canvas.style.cursor = 'grabbing';

        const handleMove = (moveEvent) => {
          const m = clientToMeters(moveEvent.clientX, moveEvent.clientY);
          if (branch.mode === 'comb') {
            onBranchDrag(branch.id, { xM: round(m.x, 2) });
          } else {
            let angle = (Math.atan2(m.y, m.x) * 180) / Math.PI;
            angle = Math.round(angle * 10) / 10;
            onBranchDrag(branch.id, { angleDeg: angle });
          }
        };
        const handleUp = () => {
          window.removeEventListener('pointermove', handleMove);
          window.removeEventListener('pointerup', handleUp);
          if (canvas) canvas.style.cursor = '';
        };
        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
        dragCleanups.push(handleUp);
      });
    }
    layer.addChild(branchView);

    const mid = branch.points[0] && branch.points[1]
      ? {
          x: (branch.points[0].x + branch.points[1].x) / 2,
          y: (branch.points[0].y + branch.points[1].y) / 2
        }
      : { x: 0, y: 0 };

    if (branch.manual || selected || !options.compact) {
      const label = branch.manual ? `✋ B${branch.index + 1}` : `B${branch.index + 1}`;
      addText(layer, label, X(mid.x), Y(mid.y), {
        size: branch.manual || selected ? 11 : 9,
        weight: branch.manual || selected ? '800' : '600',
        color: branch.manual ? COLORS.branchManual : selected ? COLORS.selected : COLORS.muted,
        alpha: branch.manual || selected ? 1 : 0.72
      });
    }
  }

  // Vent array.
  for (const vent of network.vents) {
    const selected = vent.id === selectedVentId;
    const rPx = Math.max(options.compact ? 3.2 : 4.4, vent.radius * scale);
    const ventView = new Graphics();
    ventView
      .circle(X(vent.x), Y(vent.y), rPx + (selected ? 4 : 1.5))
      .fill({ color: selected ? COLORS.selected : COLORS.ventStroke, alpha: selected ? 0.35 : 0.8 })
      .circle(X(vent.x), Y(vent.y), rPx)
      .fill({ color: selected ? COLORS.selected : COLORS.vent, alpha: 0.96 })
      .stroke({ color: 0xd1fae5, width: selected ? 1.6 : 0.8, alpha: 0.9 });

    if (editable) {
      ventView.eventMode = 'static';
      ventView.cursor = 'pointer';
      ventView.on('pointerdown', (event) => {
        event.stopPropagation();
        onSelectVent(vent.id);
      });
    }
    layer.addChild(ventView);
  }

  const selectedVent = network.vents.find((v) => v.id === selectedVentId);
  if (selectedVent && editable) {
    const bx = Math.min(width - 24, Math.max(24, X(selectedVent.x) + 18));
    const by = Math.min(height - 24, Math.max(24, Y(selectedVent.y) - 18));
    const deleteButton = new Container();
    const buttonBg = new Graphics();
    buttonBg.circle(0, 0, 12).fill({ color: COLORS.danger }).stroke({ color: 0xffffff, width: 1.5, alpha: 0.9 });
    deleteButton.addChild(buttonBg);
    const cross = new Text({
      text: '×',
      style: { fontSize: 18, fontWeight: '900', fill: '#ffffff', fontFamily: 'Arial, sans-serif' }
    });
    cross.anchor.set(0.5, 0.55);
    deleteButton.addChild(cross);
    deleteButton.position.set(bx, by);
    deleteButton.eventMode = 'static';
    deleteButton.cursor = 'pointer';
    deleteButton.on('pointerdown', (event) => {
      event.stopPropagation();
      onDeleteVent(selectedVent.id);
    });
    layer.addChild(deleteButton);

    addText(layer, `${selectedVent.id.toUpperCase()} · Delete 删除`, X(selectedVent.x), Math.max(16, Y(selectedVent.y) - 24), {
      size: 11,
      color: 0xfed7aa,
      weight: '800'
    });
  }

  // North arrow / scale badge.
  addText(layer, 'N ↑', width - 34, 28, { size: 14, color: COLORS.wall, weight: '900' });
  const scaleMeters = niceStep(70 / scale);
  const barX = 18;
  const barY = height - 22;
  const bar = new Graphics();
  bar.rect(barX, barY, scaleMeters * scale, 5).fill({ color: COLORS.text, alpha: 0.86 });
  bar.rect(barX, barY - 4, 1.5, 13).fill({ color: COLORS.text, alpha: 0.86 });
  bar.rect(barX + scaleMeters * scale - 1.5, barY - 4, 1.5, 13).fill({ color: COLORS.text, alpha: 0.86 });
  layer.addChild(bar);
  addText(layer, `${scaleMeters} m`, barX + (scaleMeters * scale) / 2, barY - 12, {
    size: 10,
    color: COLORS.text
  });

  return {
    destroyDrag: () => dragCleanups.forEach((cleanup) => cleanup?.())
  };
}
