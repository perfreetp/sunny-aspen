<script>
  import { buildSection } from '../domain/geometry.js';

  let { schemeId = 'A', scheme = null, compact = false } = $props();

  const section = $derived(buildSection(scheme?.params ?? schemeId?.params ?? {}));
  const W = 560;
  const H = $derived(compact ? 360 : 470);
  const padX = 72;
  const padY = 48;

  const viewModel = $derived.by(() => {
    const s = section;
    const minY = s.outletBottomY - 1.0;
    const maxY = s.eaveY + 3.6;
    const worldW = s.radius * 2 + 7.5;
    const worldH = maxY - minY;
    const scale = Math.min((W - padX * 2) / worldW, (H - padY * 2) / worldH);
    const midY = (minY + maxY) / 2;
    return {
      scale,
      X: (x) => W / 2 + x * scale,
      Y: (y) => H / 2 - (y - midY) * scale
    };
  });

  function pointsToPath(points) {
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${viewModel.X(p.x).toFixed(1)} ${viewModel.Y(p.y).toFixed(1)}`)
      .join(' ');
  }

  const grainPath = $derived(pointsToPath([
    { x: -section.radius, y: section.grainY },
    { x: section.radius, y: section.grainY },
    { x: section.radius, y: 0 },
    { x: 0, y: section.coneApexY },
    { x: -section.radius, y: 0 }
  ]));

  const groundY = $derived(section.outletBottomY - 0.45);
</script>

<div class="section-card" data-testid={`section-${schemeId}`}>
  <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="筒仓平面和剖面轮廓中的剖面图">
    <defs>
      <pattern id={`grain-hatch-${schemeId}`} width="8" height="8" patternUnits="userSpaceOnUse">
        <path d="M0 8 L8 0" stroke="#b45309" stroke-width="1" opacity="0.22" />
      </pattern>
      <linearGradient id={`grain-fill-${schemeId}`} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#fcd34d" stop-opacity="0.72" />
        <stop offset="100%" stop-color="#d97706" stop-opacity="0.42" />
      </linearGradient>
    </defs>

    <!-- ground -->
    <line
      x1="34"
      x2={W - 34}
      y1={viewModel.Y(groundY)}
      y2={viewModel.Y(groundY)}
      stroke="#94a3b8"
      stroke-width="2"
      stroke-dasharray="7 6"
    />
    <text x="40" y={viewModel.Y(groundY) - 8} class="svg-label muted">地面/支承基准</text>

    <!-- support columns -->
    {#each [-1, 1] as side}
      <line
        x1={viewModel.X(side * (section.radius + 0.55))}
        x2={viewModel.X(side * (section.radius + 0.55))}
        y1={viewModel.Y(0.2)}
        y2={viewModel.Y(groundY)}
        stroke="#64748b"
        stroke-width="7"
        stroke-linecap="round"
      />
      <rect
        x={viewModel.X(side * (section.radius + 0.55)) - 13}
        y={viewModel.Y(groundY) - 5}
        width="26"
        height="8"
        rx="2"
        fill="#94a3b8"
      />
    {/each}

    <!-- grain -->
    <path d={grainPath} fill={`url(#grain-fill-${schemeId})`} stroke="#b45309" stroke-width="1.2" opacity="0.95" />
    <path d={grainPath} fill={`url(#grain-hatch-${schemeId})`} />
    <line
      x1={viewModel.X(-section.radius)}
      x2={viewModel.X(section.radius)}
      y1={viewModel.Y(section.grainY)}
      y2={viewModel.Y(section.grainY)}
      stroke="#b45309"
      stroke-width="2"
      stroke-dasharray="8 5"
    />
    <text
      x={viewModel.X(0)}
      y={viewModel.Y(section.grainY) + 19}
      text-anchor="middle"
      class="svg-label grain halo"
    >
      装粮线 {section.params.grainLine.toFixed(1)} m
    </text>

    <!-- silo section shell -->
    <path
      d={pointsToPath([
        { x: -section.radius, y: section.eaveY },
        { x: -section.radius, y: 0 },
        { x: 0, y: section.coneApexY },
        { x: section.radius, y: 0 },
        { x: section.radius, y: section.eaveY }
      ])}
      fill="none"
      stroke="#0f4c81"
      stroke-width="4"
      stroke-linejoin="round"
      stroke-linecap="round"
    />

    <!-- eave line and roof hint -->
    <line
      x1={viewModel.X(-section.radius - 0.65)}
      x2={viewModel.X(section.radius + 0.65)}
      y1={viewModel.Y(section.eaveY)}
      y2={viewModel.Y(section.eaveY)}
      stroke="#0f4c81"
      stroke-width="5"
      stroke-linecap="round"
    />
    <path
      d={`M ${viewModel.X(-section.radius - 0.4)} ${viewModel.Y(section.eaveY)} L ${viewModel.X(0)} ${viewModel.Y(section.eaveY + 1.15)} L ${viewModel.X(section.radius + 0.4)} ${viewModel.Y(section.eaveY)}`}
      fill="rgba(14,165,233,0.08)"
      stroke="#0f4c81"
      stroke-width="2.4"
      stroke-linejoin="round"
    />

    <!-- outlet -->
    <line
      x1={viewModel.X(0)}
      x2={viewModel.X(0)}
      y1={viewModel.Y(section.coneApexY)}
      y2={viewModel.Y(section.outletBottomY)}
      stroke="#0f4c81"
      stroke-width="8"
      stroke-linecap="round"
    />
    <text x={viewModel.X(0) + 12} y={viewModel.Y(section.outletBottomY) + 4} class="svg-label muted">出料口</text>

    <!-- diameter dimension -->
    <line
      x1={viewModel.X(-section.radius)}
      x2={viewModel.X(section.radius)}
      y1={viewModel.Y(section.eaveY + 2.45)}
      y2={viewModel.Y(section.eaveY + 2.45)}
      stroke="#2563eb"
      stroke-width="1.5"
    />
    <line x1={viewModel.X(-section.radius)} x2={viewModel.X(-section.radius)} y1={viewModel.Y(section.eaveY + 2.15)} y2={viewModel.Y(section.eaveY + 2.75)} stroke="#2563eb" stroke-width="1.5" />
    <line x1={viewModel.X(section.radius)} x2={viewModel.X(section.radius)} y1={viewModel.Y(section.eaveY + 2.15)} y2={viewModel.Y(section.eaveY + 2.75)} stroke="#2563eb" stroke-width="1.5" />
    <text x={viewModel.X(0)} y={viewModel.Y(section.eaveY + 2.45) - 8} text-anchor="middle" class="svg-label dimension halo">
      内径 Ø {section.params.innerDiameter.toFixed(1)} m
    </text>

    <!-- eave height dimension from ring beam -->
    <line
      x1={W - 28}
      x2={W - 28}
      y1={viewModel.Y(0)}
      y2={viewModel.Y(section.eaveY)}
      stroke="#64748b"
      stroke-width="1.5"
    />
    <line x1={W - 34} x2={W - 22} y1={viewModel.Y(0)} y2={viewModel.Y(0)} stroke="#64748b" stroke-width="1.5" />
    <line x1={W - 34} x2={W - 22} y1={viewModel.Y(section.eaveY)} y2={viewModel.Y(section.eaveY)} stroke="#64748b" stroke-width="1.5" />
    <text x={W - 17} y={(viewModel.Y(0) + viewModel.Y(section.eaveY)) / 2} class="svg-label muted" transform={`rotate(90 ${W - 17} ${(viewModel.Y(0) + viewModel.Y(section.eaveY)) / 2})`} text-anchor="middle">
      檐高 {section.params.eaveHeight.toFixed(1)} m（环梁以上）
    </text>

    <!-- cone angle callout -->
    <text x="22" y="30" class="svg-label strong">锥底角 α = {section.params.coneAngle}°</text>
    <text x="22" y="50" class="svg-label muted">锥段高度约 {section.coneHeight.toFixed(1)} m</text>
  </svg>
</div>

<style>
  .section-card {
    width: 100%;
    border-radius: 16px;
    background:
      linear-gradient(180deg, rgba(240, 249, 255, 0.9), rgba(248, 250, 252, 0.98));
    border: 1px solid #dbeafe;
    overflow: hidden;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
  }

  :global(.svg-label) {
    font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
    font-size: 13px;
    fill: #1e3a5f;
    font-weight: 650;
  }

  :global(.svg-label.strong) {
    font-size: 15px;
    font-weight: 800;
    fill: #0f3b63;
  }

  :global(.svg-label.muted) {
    font-size: 12px;
    fill: #64748b;
    font-weight: 600;
  }

  :global(.svg-label.grain) {
    fill: #92400e;
    font-weight: 800;
  }

  :global(.svg-label.dimension) {
    fill: #1d4ed8;
    font-weight: 800;
  }

  :global(.svg-label.halo) {
    stroke: rgba(255, 255, 255, 0.86);
    stroke-width: 4px;
    paint-order: stroke;
    stroke-linejoin: round;
  }
</style>
