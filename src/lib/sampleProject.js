import { mulberry32, polygonBounds } from './geo.js';

export const WORLD = { width: 2600, height: 1800 };
export const CONE_CENTER = { x: 1280, y: 760 };

export const PERIODS = [
  { id: 'p0', code: 'Q4-3', name: '晚全新世晚期', short: '最新期', color: '#ff5a3c', order: 0 },
  { id: 'p1', code: 'Q4-2', name: '晚全新世早期', short: '晚全新世', color: '#ff9f1c', order: 1 },
  { id: 'p2', code: 'Q4-1', name: '中全新世', short: '中全新世', color: '#e6d547', order: 2 },
  { id: 'p3', code: 'Q3-2', name: '早全新世', short: '早全新世', color: '#55c667', order: 3 },
  { id: 'p4', code: 'Q3-1', name: '晚更新世末', short: '晚更末', color: '#2a9d8f', order: 4 },
  { id: 'p5', code: 'Q2', name: '中更新世', short: '中更新世', color: '#5b8def', order: 5 }
];

// Radians: 0 = east, PI/2 = south in screen/world coordinates.
const GULLY_DEFS = [
  { id: 'g-xitai', name: '西台沟', angle: Math.PI + 0.05, bend: -0.22, phase: 0.7, length: 1080, width: 330, mouthT: 0.61, village: '西台村', population: 1260 },
  { id: 'g-nangou', name: '南沟', angle: Math.PI / 2 + 0.04, bend: 0.16, phase: 2.1, length: 980, width: 390, mouthT: 0.58, village: '南桥村', population: 1840 },
  { id: 'g-dongnan', name: '东南沟', angle: 0.72, bend: -0.18, phase: 4.4, length: 1160, width: 430, mouthT: 0.63, village: '河口村', population: 2410 },
  { id: 'g-dongping', name: '东坪沟', angle: 0.05, bend: 0.2, phase: 1.2, length: 1080, width: 360, mouthT: 0.6, village: '东坪村', population: 980 },
  { id: 'g-beiling', name: '北岭沟', angle: -0.67, bend: 0.14, phase: 3.3, length: 900, width: 300, mouthT: 0.57, village: '北岭村', population: 760 },
  { id: 'g-wanzi', name: '湾子沟', angle: 2.36, bend: -0.12, phase: 5.2, length: 1040, width: 350, mouthT: 0.62, village: '湾子村', population: 1530 }
];

function centerlinePoint(g, t) {
  const angle =
    g.angle +
    g.bend * t * t +
    0.055 * Math.sin(t * 6.1 + g.phase) * t;
  const radius = 215 + t * g.length;
  const x = CONE_CENTER.x + Math.cos(angle) * radius;
  const y = CONE_CENTER.y + Math.sin(angle) * radius;
  const tx = -Math.sin(angle);
  const ty = Math.cos(angle);
  return { x, y, angle, tx, ty };
}

function widthAt(g, t) {
  return 58 + g.width * Math.pow(t, 0.76);
}

function makeIrregularEllipse(cx, cy, rx, ry, count, rng, roughness = 0.16) {
  const ring = [];
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const harmonic =
      1 +
      roughness * 0.55 * Math.sin(a * 3 + p1) +
      roughness * 0.32 * Math.sin(a * 7 + p2) +
      (rng() - 0.5) * roughness * 0.35;
    ring.push([cx + Math.cos(a) * rx * harmonic, cy + Math.sin(a) * ry * harmonic]);
  }
  return ring;
}

function shoelaceAreaHa(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 20000;
}

function buildGulliesAndVillages(rng) {
  const gullies = GULLY_DEFS.map((g) => {
    const path = [];
    for (let i = 0; i <= 90; i++) path.push([centerlinePoint(g, i / 90).x, centerlinePoint(g, i / 90).y]);
    const mouth = centerlinePoint(g, g.mouthT);
    const villagePoint = centerlinePoint(g, 0.94);
    const refuge = makeIrregularEllipse(
      villagePoint.x,
      villagePoint.y,
      118 + rng() * 35,
      88 + rng() * 28,
      28,
      rng,
      0.2
    );
    return {
      ...g,
      path,
      mouth: [mouth.x, mouth.y],
      village: {
        id: `v-${g.id}`,
        name: g.village,
        x: villagePoint.x,
        y: villagePoint.y,
        population: g.population,
        gullyId: g.id,
        refuge
      }
    };
  });
  return { gullies, villages: gullies.map((g) => g.village) };
}

function buildFlowField(spec, gully, period, rng, unitStartSeq) {
  const A = 50;
  const C = 24;
  const phase = rng() * 100;
  const widthScale = spec.widthScale;
  const lengthScale = spec.lengthScale;
  const localGully = { ...gully, length: gully.length * lengthScale, width: gully.width * widthScale };
  const grid = [];

  for (let i = 0; i <= A; i++) {
    const t = i / A;
    const center = centerlinePoint(localGully, t);
    const width = widthAt(localGully, t);
    const row = [];
    for (let j = 0; j <= C; j++) {
      const lateralT = j / C - 0.5;
      const edgeFactor = j === 0 || j === C ? 0.35 : 1;
      const lateral = lateralT * width;
      const longJitter = i > 0 && i < A ? (rng() - 0.5) * 13 * edgeFactor : 0;
      const sideJitter = j > 0 && j < C ? (rng() - 0.5) * 8 : (rng() - 0.5) * 10;
      row.push([
        center.x + center.tx * lateral + Math.cos(center.angle) * longJitter + center.tx * sideJitter,
        center.y + center.ty * lateral + Math.sin(center.angle) * longJitter + center.ty * sideJitter
      ]);
    }
    grid.push(row);
  }

  const units = [];
  let seq = unitStartSeq;
  for (let i = 0; i < A; i++) {
    for (let j = 0; j < C; j++) {
      seq += 1;
      const ring = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
      const b = polygonBounds(ring);
      const front = [
        (grid[i + 1][j][0] + grid[i + 1][j + 1][0]) / 2,
        (grid[i + 1][j][1] + grid[i + 1][j + 1][1]) / 2
      ];
      units.push({
        id: `u-${seq.toString(36)}-${i}-${j}`,
        seq,
        code: `LY-${seq.toString().padStart(5, '0')}`,
        periodId: period.id,
        flowId: spec.id,
        gullyId: gully.id,
        ring,
        bounds: b,
        centroid: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2],
        front,
        areaHa: shoelaceAreaHa(ring),
        distanceKm: Math.round((215 + ((i + 1) / A) * localGully.length) / 100) / 10
      });
    }
  }

  const outer = [];
  for (let i = 0; i <= A; i++) outer.push(grid[i][0]);
  for (let i = A; i >= 0; i--) outer.push(grid[i][C]);
  const flow = {
    id: spec.id,
    name: spec.name,
    periodId: period.id,
    gullyId: gully.id,
    ring: outer,
    front: grid[A][Math.floor(C / 2)],
    mouth: gully.mouth
  };
  return { units, flow, nextSeq: seq };
}

function buildClasts(tephraRing, count, rng) {
  const b = polygonBounds(tephraRing);
  const data = new Float32Array(count * 4);
  let written = 0;
  let attempts = 0;
  while (written < count && attempts < count * 20) {
    attempts++;
    const x = b.minX + rng() * (b.maxX - b.minX);
    const y = b.minY + rng() * (b.maxY - b.minY);
    // Fast ellipse rejection around the cone; the irregular tephra outline is close to this.
    const ex = (x - CONE_CENTER.x) / 930;
    const ey = (y - CONE_CENTER.y) / 760;
    if (ex * ex + ey * ey > 1.05) continue;
    const k = written * 4;
    data[k] = x;
    data[k + 1] = y;
    data[k + 2] = 1.2 + rng() * 2.8;
    data[k + 3] = rng();
    written++;
  }
  return data.slice(0, written * 4);
}

export function createSampleProject() {
  const rng = mulberry32(20261126);
  const { gullies, villages } = buildGulliesAndVillages(rng);
  const gullyById = new Map(gullies.map((g) => [g.id, g]));

  const cone = {
    id: 'cone-boundary',
    name: '无人机航测圈定火山锥边界',
    ring: makeIrregularEllipse(CONE_CENTER.x, CONE_CENTER.y, 315, 270, 110, rng, 0.13)
  };
  const tephra = {
    id: 'tephra-apron',
    name: '火山碎屑席',
    ring: makeIrregularEllipse(CONE_CENTER.x, CONE_CENTER.y + 35, 850, 700, 150, rng, 0.22)
  };
  const clasts = buildClasts(tephra.ring, 24000, rng);

  const flowSpecs = [];
  PERIODS.forEach((period, pi) => {
    for (let k = 0; k < 3; k++) {
      const gullyIndex = (pi * 2 + k) % GULLY_DEFS.length;
      flowSpecs.push({
        id: `flow-${period.id}-${k + 1}`,
        name: `${period.name}·${GULLY_DEFS[gullyIndex].name}熔岩流`,
        periodId: period.id,
        gullyId: GULLY_DEFS[gullyIndex].id,
        lengthScale: 0.82 + rng() * 0.32 + (5 - pi) * 0.025,
        widthScale: 0.82 + rng() * 0.32 + (5 - pi) * 0.035
      });
    }
  });

  let units = [];
  const flows = [];
  let seq = 0;
  for (const spec of flowSpecs) {
    const period = PERIODS.find((p) => p.id === spec.periodId);
    const gully = gullyById.get(spec.gullyId);
    const result = buildFlowField(spec, gully, period, rng, seq);
    units = units.concat(result.units);
    flows.push(result.flow);
    seq = result.nextSeq;
  }

  const project = {
    schema: 'volcano-lava-overview/1',
    id: 'proj-tengchong-like-01',
    name: '火山锥区熔岩流单元总览（示范工程）',
    areaName: '黑空山—大空山邻区（示范数据）',
    coordinateNote: '局部工程坐标，单位 m；导入 GeoJSON 时自动归一化到该坐标范围。',
    bounds: { minX: 0, minY: 0, maxX: WORLD.width, maxY: WORLD.height },
    createdAt: '2026-11-20T09:00:00+08:00',
    updatedAt: new Date().toISOString(),
    revision: 1,
    periods: PERIODS,
    cone,
    tephra,
    clasts,
    gullies,
    villages,
    flows,
    units,
    terrain: {
      kind: 'procedural-dem',
      name: '无人机航测地形 / DEM 山影（程序生成示范）',
      opacity: 1
    }
  };
  project.stats = {
    unitCount: units.length,
    flowCount: flows.length,
    clastCount: clasts.length / 4,
    featureCount: units.length + clasts.length / 4 + flows.length + gullies.length + villages.length + 2
  };
  return project;
}
