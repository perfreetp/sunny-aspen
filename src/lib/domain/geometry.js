import {
  GRAIN_TYPES,
  DUCT_FORMS,
  MAIN_ROUTES,
  PARAM_LIMITS,
  DEFAULT_PARAMS_A
} from './catalog.js';
import { clamp, round, seededRandom, hashSeed } from './rng.js';

const TAU = Math.PI * 2;

export function getGrainType(id) {
  return GRAIN_TYPES.find((g) => g.id === id) ?? GRAIN_TYPES[0];
}

export function getDuctForm(id) {
  return DUCT_FORMS.find((d) => d.id === id) ?? DUCT_FORMS[0];
}

export function getMainRoute(id) {
  return MAIN_ROUTES.find((r) => r.id === id) ?? MAIN_ROUTES[0];
}

export function normalizeParams(input = {}) {
  const fallback = DEFAULT_PARAMS_A;
  const num = (key, fallbackValue) => {
    const n = Number(input[key] ?? fallbackValue);
    return Number.isFinite(n) ? n : fallbackValue;
  };

  const eaveHeight = round(
    clamp(num('eaveHeight', fallback.eaveHeight), PARAM_LIMITS.eaveHeight.min, PARAM_LIMITS.eaveHeight.max),
    1
  );

  const maxGrainLine = Math.max(PARAM_LIMITS.grainLine.min, Math.min(PARAM_LIMITS.grainLine.max, eaveHeight - 0.4));

  return {
    innerDiameter: round(
      clamp(num('innerDiameter', fallback.innerDiameter), PARAM_LIMITS.innerDiameter.min, PARAM_LIMITS.innerDiameter.max),
      1
    ),
    eaveHeight,
    coneAngle: Math.round(
      clamp(num('coneAngle', fallback.coneAngle), PARAM_LIMITS.coneAngle.min, PARAM_LIMITS.coneAngle.max)
    ),
    grainLine: round(
      clamp(num('grainLine', fallback.grainLine), PARAM_LIMITS.grainLine.min, maxGrainLine),
      1
    ),
    grainType: getGrainType(input.grainType ?? fallback.grainType).id,
    ductForm: getDuctForm(input.ductForm ?? fallback.ductForm).id,
    mainRoute: getMainRoute(input.mainRoute ?? fallback.mainRoute).id,
    branchCount: Math.round(
      clamp(num('branchCount', fallback.branchCount), PARAM_LIMITS.branchCount.min, PARAM_LIMITS.branchCount.max)
    ),
    arrayRows: Math.round(
      clamp(num('arrayRows', fallback.arrayRows), PARAM_LIMITS.arrayRows.min, PARAM_LIMITS.arrayRows.max)
    ),
    arrayCols: Math.round(
      clamp(num('arrayCols', fallback.arrayCols), PARAM_LIMITS.arrayCols.min, PARAM_LIMITS.arrayCols.max)
    ),
    seed: String(input.seed ?? fallback.seed ?? '0').trim() || '0'
  };
}

function polar(radius, angle) {
  return { x: round(radius * Math.cos(angle), 3), y: round(radius * Math.sin(angle), 3) };
}

function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

export function buildSiloModel(rawParams) {
  const params = normalizeParams(rawParams);
  const radius = params.innerDiameter / 2;
  const coneHeight = radius * Math.tan((params.coneAngle * Math.PI) / 180);
  const wallClearance = clamp(params.innerDiameter * 0.035, 0.45, 0.9);
  const effectiveRadius = radius - wallClearance;
  const ductForm = getDuctForm(params.ductForm);
  const mainWidth = clamp(params.innerDiameter * 0.045, 0.55, 1.15) * ductForm.widthFactor;
  const branchWidth = mainWidth * 0.62;
  const ventRadius = clamp(params.innerDiameter * 0.011, 0.15, 0.27);

  return {
    params,
    radius,
    coneHeight: round(coneHeight, 2),
    wallClearance: round(wallClearance, 2),
    effectiveRadius: round(effectiveRadius, 3),
    mainWidth: round(mainWidth, 3),
    branchWidth: round(branchWidth, 3),
    ventRadius: round(ventRadius, 3)
  };
}

function buildRawBranches(params, silo, rnd, layoutContext = {}) {
  const route = getMainRoute(params.mainRoute);
  const r = silo.effectiveRadius;
  const branches = [];

  if (route.branchMode === 'comb') {
    const n = params.branchCount;
    const span = r * 0.84;
    const jitterAmp = params.innerDiameter * 0.012;
    const maxX = r * 0.9;

    for (let i = 0; i < n; i += 1) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const baseX = -span + span * 2 * t;
      const seedJitter = (rnd() - 0.5) * 2 * jitterAmp;
      const x = round(clamp(baseX + seedJitter, -maxX, maxX), 3);
      const side = i % 2 === 0 ? 1 : -1;
      const boundaryY = Math.sqrt(Math.max(0, r * r - x * x));
      const y0 = side * silo.mainWidth * 0.42;
      const y1 = side * Math.max(silo.mainWidth * 1.4, boundaryY - 0.18);
      branches.push({
        id: `b${i}`,
        index: i,
        mode: 'comb',
        side,
        width: silo.branchWidth,
        points: [
          { x, y: round(y0, 3) },
          { x, y: round(y1, 3) }
        ],
        lengthM: round(Math.abs(y1 - y0), 2),
        manual: false
      });
    }
  }

  if (route.branchMode === 'radial') {
    const hubRadius = silo.mainWidth * 1.65;
    const seedRotation = (rnd() - 0.5) * (TAU / params.branchCount) * 0.45;

    for (let i = 0; i < params.branchCount; i += 1) {
      const baseAngle = (i / params.branchCount) * TAU + seedRotation;
      const jitter = (rnd() - 0.5) * (TAU / params.branchCount) * 0.2;
      const angle = baseAngle + jitter;
      const r0 = hubRadius + 0.18;
      const r1 = r * (0.93 + rnd() * 0.045);
      branches.push({
        id: `b${i}`,
        index: i,
        mode: 'radial',
        width: silo.branchWidth,
        angleDeg: round((angle * 180) / Math.PI, 2),
        points: [polar(r0, angle), polar(r1, angle)],
        lengthM: round(r1 - r0, 2),
        manual: false
      });
    }
  }

  if (route.branchMode === 'ring') {
    const ringRadius = layoutContext.ringRadius ?? silo.radius * 0.56;
    const seedRotation = (rnd() - 0.5) * (TAU / params.branchCount) * 0.35;

    for (let i = 0; i < params.branchCount; i += 1) {
      const angle = (i / params.branchCount) * TAU + seedRotation + (rnd() - 0.5) * 0.08;
      const r0 = ringRadius * 0.28;
      const r1 = r * (0.94 + rnd() * 0.035);
      branches.push({
        id: `b${i}`,
        index: i,
        mode: 'ring',
        width: silo.branchWidth,
        angleDeg: round((angle * 180) / Math.PI, 2),
        ringRadius: round(ringRadius, 3),
        points: [polar(r0, angle), polar(r1, angle)],
        lengthM: round(r1 - r0, 2),
        manual: false
      });
    }
  }

  return branches;
}

function buildRawMain(params, silo, layoutContext = {}) {
  const route = getMainRoute(params.mainRoute);
  const r = silo.effectiveRadius;
  const width = silo.mainWidth;

  if (params.mainRoute === 'tee') {
    return {
      route: params.mainRoute,
      width,
      polylines: [
        [
          { x: round(-r, 3), y: 0 },
          { x: round(r, 3), y: 0 }
        ],
        [
          { x: 0, y: 0 },
          { x: 0, y: round(-r * 0.72, 3) }
        ]
      ],
      circle: null,
      lengthM: round(2 * r + r * 0.72, 2)
    };
  }

  if (params.mainRoute === 'radial') {
    const hubRadius = width * 1.65;
    return {
      route: params.mainRoute,
      width,
      polylines: [
        [
          { x: round(-r, 3), y: 0 },
          { x: round(-hubRadius, 3), y: 0 }
        ]
      ],
      circle: null,
      hub: { x: 0, y: 0, r: round(hubRadius, 3) },
      lengthM: round(r - hubRadius, 2)
    };
  }

  if (params.mainRoute === 'ring') {
    const ringR = layoutContext.ringRadius ?? silo.radius * 0.56;
    return {
      route: params.mainRoute,
      width,
      polylines: [
        [
          { x: round(-r, 3), y: 0 },
          { x: round(-ringR, 3), y: 0 }
        ]
      ],
      circle: { x: 0, y: 0, r: round(ringR, 3) },
      lengthM: round(TAU * ringR + (r - ringR), 2)
    };
  }

  return {
    route: params.mainRoute,
    width,
    polylines: [
      [
        { x: round(-r, 3), y: 0 },
        { x: round(r, 3), y: 0 }
      ]
    ],
    circle: null,
    lengthM: round(2 * r, 2)
  };
}

function recomputeCombBranch(branch, override, silo) {
  const r = silo.effectiveRadius;
  const maxX = r * 0.9;
  const x = round(clamp(Number(override.xM), -maxX, maxX), 3);
  const boundaryY = Math.sqrt(Math.max(0, r * r - x * x));
  const y0 = branch.side * silo.mainWidth * 0.42;
  const y1 = branch.side * Math.max(silo.mainWidth * 1.4, boundaryY - 0.18);
  return {
    ...branch,
    points: [
      { x, y: round(y0, 3) },
      { x, y: round(y1, 3) }
    ],
    lengthM: round(Math.abs(y1 - y0), 2),
    manual: true,
    override: { ...override }
  };
}

function recomputeRadialBranch(branch, override, silo) {
  const angleDeg = Number(override.angleDeg);
  if (!Number.isFinite(angleDeg)) return branch;
  const angle = (angleDeg * Math.PI) / 180;
  const r0 = branch.points?.[0] ? Math.hypot(branch.points[0].x, branch.points[0].y) : silo.mainWidth * 1.8;
  const r1 = branch.points?.[1] ? Math.hypot(branch.points[1].x, branch.points[1].y) : silo.effectiveRadius * 0.96;
  return {
    ...branch,
    angleDeg: round(angleDeg, 2),
    points: [polar(r0, angle), polar(r1, angle)],
    manual: true,
    override: { ...override }
  };
}

function applyBranchOverrides(rawBranches, branchOverrides, silo) {
  const overrides = branchOverrides ?? {};
  return rawBranches.map((branch) => {
    const override = overrides[branch.id];
    if (!override) return branch;
    if (branch.mode === 'comb' && Number.isFinite(Number(override.xM))) {
      return recomputeCombBranch(branch, override, silo);
    }
    if ((branch.mode === 'radial' || branch.mode === 'ring') && Number.isFinite(Number(override.angleDeg))) {
      return recomputeRadialBranch(branch, override, silo);
    }
    return branch;
  });
}

function buildRawVents(params, silo, rnd) {
  const edge = Math.max(0.9, params.innerDiameter * 0.075);
  const fieldRadius = Math.max(1, silo.radius - edge);

  // 装粮越高，粮层阻力越大；方案阶段用深度系数缩小阵列跨距、加密风口。
  const depthFactor = clamp(1.18 - params.grainLine * 0.025, 0.72, 1.08);
  const radiusX = fieldRadius * depthFactor;
  const radiusY = fieldRadius * depthFactor * 0.96;
  const cols = params.arrayCols;
  const rows = params.arrayRows;
  const spacingX = cols > 1 ? (radiusX * 2) / (cols - 1) : 0;
  const spacingY = rows > 1 ? (radiusY * 2) / (rows - 1) : 0;
  const staggerRatio = (rnd() - 0.5) * 0.32;
  const stagger = spacingX * staggerRatio;

  const vents = [];
  for (let row = 0; row < rows; row += 1) {
    const y = rows === 1 ? 0 : -radiusY + (radiusY * 2 * row) / (rows - 1);
    for (let col = 0; col < cols; col += 1) {
      let x = cols === 1 ? 0 : -radiusX + (radiusX * 2 * col) / (cols - 1);
      if (row % 2 === 1) x += stagger;
      // Keep staggered end vents inside the nominal circular field.
      const normalized = Math.hypot(x / Math.max(radiusX, 0.001), y / Math.max(radiusY, 0.001));
      if (normalized > 1) {
        const k = 1 / normalized;
        x *= k;
      }
      vents.push({
        id: `v-${row}-${col}`,
        row,
        col,
        x: round(x, 3),
        y: round(y, 3),
        radius: silo.ventRadius
      });
    }
  }

  return {
    vents,
    spacingX: round(spacingX, 3),
    spacingY: round(spacingY, 3),
    depthFactor: round(depthFactor, 3),
    staggerM: round(stagger, 3)
  };
}

export function buildNetwork(scheme = {}) {
  const params = normalizeParams(scheme.params ?? scheme);
  const silo = buildSiloModel(params);
  // One seeded stream is used for the complete raw layout. Manual edits are applied afterwards.
  const rnd = seededRandom(params.seed, 'silo-network-v1');
  const layoutContext = {};
  if (params.mainRoute === 'ring') {
    layoutContext.ringRadius = silo.radius * (0.52 + rnd() * 0.09);
  }

  const rawBranches = buildRawBranches(params, silo, rnd, layoutContext);
  const main = buildRawMain(params, silo, layoutContext);
  const ventLayout = buildRawVents(params, silo, rnd);
  const branches = applyBranchOverrides(rawBranches, scheme.branchOverrides, silo);

  const removedVentIds = Array.isArray(scheme.removedVentIds) ? scheme.removedVentIds : [];
  const removedSet = new Set(removedVentIds);
  const vents = ventLayout.vents.filter((vent) => !removedSet.has(vent.id));

  const branchLengthM = round(branches.reduce((sum, b) => sum + b.lengthM, 0), 1);
  const mainPolylineLength = main.polylines.reduce((sum, line) => sum + polylineLength(line), 0);
  const mainLengthM = round(mainPolylineLength + (main.circle ? TAU * main.circle.r : 0), 1);
  const grain = getGrainType(params.grainType);
  const grainVolumeM3 =
    Math.PI * silo.radius * silo.radius * params.grainLine +
    (Math.PI * silo.radius * silo.radius * silo.coneHeight) / 3;
  const grainMassT = grainVolumeM3 * grain.bulkDensity;
  const airflowM3h = grainMassT * grain.ventilationRate;
  const ventAreaM2 = vents.length * Math.PI * silo.ventRadius * silo.ventRadius;
  const ventVelocityMs = ventAreaM2 > 0 ? airflowM3h / 3600 / ventAreaM2 : 0;
  const pressurePa = Math.round(420 + params.grainLine * 42 + (grain.resistance === '高' ? 260 : grain.resistance === '中高' ? 150 : 60));

  const rawFingerprint = hashSeed(
    JSON.stringify({
      params,
      main,
      rawBranches,
      ventLayout
    })
  )
    .toString(16)
    .padStart(8, '0')
    .toUpperCase();

  return {
    params,
    silo,
    main,
    branches,
    vents,
    allVents: ventLayout.vents,
    removedVentIds,
    ventLayout,
    fingerprint: rawFingerprint,
    stats: {
      branchLengthM,
      mainLengthM,
      totalDuctLengthM: round(branchLengthM + mainLengthM, 1),
      gridVentCount: params.arrayRows * params.arrayCols,
      activeVentCount: vents.length,
      removedVentCount: removedSet.size,
      spacingX: ventLayout.spacingX,
      spacingY: ventLayout.spacingY,
      grainVolumeM3: round(grainVolumeM3, 1),
      grainMassT: round(grainMassT, 1),
      airflowM3h: Math.round(airflowM3h),
      airflowM3s: round(airflowM3h / 3600, 2),
      ventVelocityMs: round(ventVelocityMs, 2),
      pressureRangePa: [pressurePa, pressurePa + 350],
      planAreaM2: round(Math.PI * silo.radius * silo.radius, 1)
    }
  };
}

export function buildSection(rawParams) {
  const params = normalizeParams(rawParams);
  const silo = buildSiloModel(params);
  const r = silo.radius;
  const ch = silo.coneHeight;
  return {
    params,
    radius: r,
    coneHeight: ch,
    // Ring beam is y=0. Cylinder goes to eaveHeight; cone/outlet go negative.
    ringY: 0,
    eaveY: params.eaveHeight,
    coneApexY: -ch,
    outletBottomY: -ch - 0.9,
    grainY: params.grainLine,
    wallX: r,
    dimensions: {
      innerDiameter: params.innerDiameter,
      eaveHeight: params.eaveHeight,
      coneAngle: params.coneAngle,
      grainLine: params.grainLine
    }
  };
}

export function branchHitTest(network, xM, yM) {
  // Distance to branch segments in meter coordinates; used by pointer controller.
  let best = null;
  for (const branch of network.branches) {
    for (let i = 1; i < branch.points.length; i += 1) {
      const a = branch.points[i - 1];
      const b = branch.points[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      const t = clamp(((xM - a.x) * dx + (yM - a.y) * dy) / len2, 0, 1);
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      const distance = Math.hypot(xM - px, yM - py);
      const threshold = Math.max(0.42, branch.width * 1.8);
      if (distance <= threshold && (!best || distance < best.distance)) {
        best = { branch, distance };
      }
    }
  }
  return best?.branch ?? null;
}

export function ventHitTest(network, xM, yM) {
  let best = null;
  for (const vent of network.vents) {
    const distance = Math.hypot(xM - vent.x, yM - vent.y);
    const threshold = Math.max(0.42, vent.radius * 2.4);
    if (distance <= threshold && (!best || distance < best.distance)) {
      best = { vent, distance };
    }
  }
  return best?.vent ?? null;
}
