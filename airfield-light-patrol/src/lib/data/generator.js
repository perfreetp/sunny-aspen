// 机场测绘资料导入器（内置合成数据集，结构与真实测绘导入一致：跑道方位、滑行道布局、进近灯光构型）
import { mulberry32, samplePolyline, offsetPoint, localToLatLon } from './geo.js';
import { defaultConfig } from './categories.js';

const ARP = { lat: 39.1258, lon: 117.3527 }; // 机场参考点
const RUNWAY_AZIMUTH = 52; // 跑道方位 05/23

// ---- 布局常量（米，局部坐标：+X 沿跑道方向）----
const RUNWAYS = [
  { id: '05L/23R', x0: -1900, x1: 1900, y: -1100, width: 60 },
  { id: '05C/23C', x0: -1750, x1: 1750, y: 0, width: 60 },
  { id: '05R/23L', x0: -1900, x1: 1900, y: 1100, width: 45 }
];

// 二次贝塞尔采样（高速出口滑行道曲线）
function bezier(p0, p1, p2, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = (1 - t) ** 2;
    const b = 2 * (1 - t) * t;
    const c = t * t;
    pts.push([a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]]);
  }
  return pts;
}

const CONNECTOR_XS = [];
for (let x = -1600; x <= 1600; x += 200) CONNECTOR_XS.push(x); // 17 条垂直联络道
const CONNECTOR_IDS = ['D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V'];

const TAXIWAYS = [
  // 平行滑行道 A/B/C + X/Y
  { id: 'A', points: [[-2050, -1020], [-1200, -1020], [0, -1010], [1200, -1020], [2050, -1020]] },
  { id: 'B', points: [[-1900, 80], [-900, 70], [0, 80], [900, 70], [1900, 80]] },
  { id: 'C', points: [[-2050, 1180], [-1000, 1170], [0, 1180], [1000, 1170], [2050, 1180]] },
  { id: 'X', points: [[-1900, -700], [-800, -690], [0, -700], [800, -690], [1900, -700]] },
  { id: 'Y', points: [[-1900, 700], [-800, 710], [0, 700], [800, 710], [1900, 700]] },
  // 垂直联络道（200m 间距）
  ...CONNECTOR_IDS.map((id, i) => {
    const x = CONNECTOR_XS[i];
    return { id, points: [[x, -1020], [x, -560], [x, 0], [x, 560], [x, 1180]] };
  }),
  // 南侧围界绕行滑行道 W
  { id: 'W', points: [[-1800, -1740], [-600, -1750], [600, -1750], [1800, -1740]] },
  // 机坪出入口联络道
  { id: 'P1', points: [[-600, -1020], [-600, -1350], [-450, -1700]] },
  { id: 'P2', points: [[600, -1020], [600, -1350], [450, -1700]] }
];

// 高速出口滑行道（曲线，连接跑道与平行滑行道）
const HS_EXITS = [];
{
  let hsNo = 1;
  for (const rwy of RUNWAYS) {
    const halfW = rwy.width / 2;
    const targets =
      rwy.y < -500
        ? [[-1, -1020], [1, -700]]
        : rwy.y > 500
          ? [[1, 1180], [-1, 700]]
          : [[-1, -700], [1, 700]];
    for (const ex of [-1200, -600, 600, 1200]) {
      for (const [side, ty] of targets) {
        const p0 = [ex, rwy.y + side * halfW];
        const p2 = [ex + Math.sign(ex) * 260, ty];
        const p1 = [p2[0], p0[1]];
        HS_EXITS.push({ id: `HS${hsNo++}`, points: bezier(p0, p1, p2, 10) });
      }
    }
  }
}
TAXIWAYS.push(...HS_EXITS);

// 机坪机位（4 排共 96 个）
const APRON_ROWS = [
  { y: -1260, xs: Array.from({ length: 25 }, (_, i) => -1560 + i * 130) },
  { y: -1380, xs: Array.from({ length: 23 }, (_, i) => -1430 + i * 130) },
  { y: -1500, xs: Array.from({ length: 25 }, (_, i) => -1560 + i * 130) },
  { y: -1620, xs: Array.from({ length: 23 }, (_, i) => -1430 + i * 130) }
];

const TWR_EDGE_SPACING = 20;
const TWR_CL_SPACING = 7.5;

let dataset = null;

function makeFeature(id, categoryId, groupId, groupName, lineId, designIndex, x, y, extra = {}) {
  const { lat, lon } = localToLatLon(x, y, ARP, RUNWAY_AZIMUTH);
  return {
    id,
    categoryId,
    groupId,
    groupName,
    lineId,
    designIndex,
    x,
    y,
    lat: +lat.toFixed(8),
    lon: +lon.toFixed(8),
    status: 'ok', // ok | missing
    ...extra
  };
}

export function initDataset() {
  if (dataset) return dataset;
  const rnd = mulberry32(20261126);
  const features = [];
  const groupRegistry = [];
  const missingPlanned = []; // 预置缺失（模拟灯具损坏/拆除后未补录）

  const pushGroup = (groupId, groupName, categoryId, lineId) => {
    groupRegistry.push({ groupId, groupName, categoryId, lineId });
  };

  // ---------- 1. 跑道灯光 ----------
  for (const rwy of RUNWAYS) {
    const halfW = rwy.width / 2;
    const rwyName = rwy.id;
    const tag = rwyName.replace('/', '');

    // 跑道边灯 间距30m，两侧
    pushGroup(`RWY-${rwyName}-EDGE`, `${rwyName} 跑道边灯组`, 'rwy_edge', rwyName);
    let idx = 0;
    for (let x = rwy.x0; x <= rwy.x1 + 1e-6; x += 30) {
      for (const side of [-1, 1]) {
        features.push(
          makeFeature(`RWE-${tag}-${side < 0 ? 'L' : 'R'}-${String(idx + 1).padStart(3, '0')}`,
            'rwy_edge', `RWY-${rwyName}-EDGE`, `${rwyName} 跑道边灯组`, rwyName, idx,
            x, rwy.y + side * halfW)
        );
      }
      idx++;
    }

    // 中线灯 间距7.5m（精密进近跑道标准）
    pushGroup(`RWY-${rwyName}-CL`, `${rwyName} 中线灯组`, 'rwy_centerline', rwyName);
    idx = 0;
    for (let x = rwy.x0 + 3.75; x < rwy.x1; x += 7.5) {
      features.push(
        makeFeature(`RWC-${tag}-${String(idx + 1).padStart(3, '0')}`,
          'rwy_centerline', `RWY-${rwyName}-CL`, `${rwyName} 中线灯组`, rwyName, idx, x, rwy.y)
      );
      idx++;
    }

    // 接地带灯：入口内 900m，间距15m，两侧成对（3 排/侧）
    pushGroup(`RWY-${rwyName}-TDZ`, `${rwyName} 接地带灯组`, 'rwy_tdz', rwyName);
    idx = 0;
    for (const endX of [rwy.x0, rwy.x1]) {
      const dir = endX < 0 ? 1 : -1;
      for (let d = 15; d <= 900; d += 15) {
        for (const off of [9, 18, 27]) {
          for (const side of [-1, 1]) {
            features.push(
              makeFeature(`TDZ-${tag}-${String(idx + 1).padStart(3, '0')}`,
                'rwy_tdz', `RWY-${rwyName}-TDZ`, `${rwyName} 接地带灯组`, rwyName, idx,
                endX + dir * d, rwy.y + side * off)
            );
            idx++;
          }
        }
      }
    }

    // 入口灯 / 末端灯（横排）+ 翼排灯
    for (const [endX, rtag, gname] of [
      [rwy.x0, 'THR05', '入口灯'],
      [rwy.x1, 'END23', '末端灯']
    ]) {
      pushGroup(`RWY-${rwyName}-${rtag}`, `${rwyName} ${gname}组`, 'rwy_threshold', rwyName);
      let t = 0;
      for (let yy = -halfW; yy <= halfW + 1e-6; yy += 3) {
        features.push(
          makeFeature(`RWT-${tag}-${rtag}-${String(t + 1).padStart(2, '0')}`,
            'rwy_threshold', `RWY-${rwyName}-${rtag}`, `${rwyName} ${gname}组`, rwyName, t, endX, rwy.y + yy)
        );
        t++;
      }
      // 翼排灯（横排外侧竖向 5 灯 ×2）
      for (const side of [-1, 1]) {
        for (let k = 0; k < 5; k++) {
          features.push(
            makeFeature(`RWW-${tag}-${rtag}-${side < 0 ? 'L' : 'R'}${k + 1}`,
              'rwy_threshold', `RWY-${rwyName}-${rtag}`, `${rwyName} ${gname}组（翼排）`, rwyName, t,
              endX + (k - 2) * 3, rwy.y + side * (halfW + 8))
          );
          t++;
        }
      }
    }
  }

  // ---------- 2. 滑行道灯光 ----------
  for (const tw of TAXIWAYS) {
    // 中线灯 7.5m
    const clPts = samplePolyline(tw.points, TWR_CL_SPACING);
    pushGroup(`TWY-${tw.id}-CL`, `滑行道 ${tw.id} 中线灯组`, 'twr_centerline', tw.id);
    clPts.forEach((p, i) => {
      features.push(
        makeFeature(`TWC-${tw.id}-${String(i + 1).padStart(3, '0')}`,
          'twr_centerline', `TWY-${tw.id}-CL`, `滑行道 ${tw.id} 中线灯组`, tw.id, i, p.x, p.y)
      );
    });

    // 边灯 20m（两侧偏移 11.5m）
    const edgePts = samplePolyline(tw.points, TWR_EDGE_SPACING);
    pushGroup(`TWY-${tw.id}-EDGE`, `滑行道 ${tw.id} 边灯组`, 'twr_edge', tw.id);
    let eidx = 0;
    for (const p of edgePts) {
      for (const side of [-1, 1]) {
        const o = offsetPoint(p, side * 11.5);
        features.push(
          makeFeature(`TWE-${tw.id}-${side < 0 ? 'L' : 'R'}-${String(eidx + 1).padStart(3, '0')}`,
            'twr_edge', `TWY-${tw.id}-EDGE`, `滑行道 ${tw.id} 边灯组`, tw.id, eidx, o.x, o.y)
        );
      }
      eidx++;
    }

    // 预置缺失段：A、E、K 三条滑行道的边灯断号
    if (['A', 'E', 'K'].includes(tw.id)) {
      const side = tw.id === 'A' ? -1 : 1;
      const startN = tw.id === 'A' ? 14 : tw.id === 'E' ? 9 : 17;
      const count = tw.id === 'A' ? 5 : 4;
      for (let n = startN; n < startN + count; n++) {
        missingPlanned.push({
          featureId: `TWE-${tw.id}-${side < 0 ? 'L' : 'R'}-${String(n + 1).padStart(3, '0')}`,
          lineId: tw.id,
          categoryId: 'twr_edge',
          reason: '灯具拆除未补录'
        });
      }
    }
  }

  // 跑道警戒灯 + 停止排灯（各联络道 × 各跑道）
  let guardIdx = 0;
  let stopIdx = 0;
  for (const tw of TAXIWAYS.filter((t) => CONNECTOR_IDS.includes(t.id))) {
    for (const rwy of RUNWAYS) {
      pushGroup(`GRD-${tw.id}-${rwy.id.replace('/', '')}`, `警戒灯组 ${tw.id}×${rwy.id}`, 'twr_guard', tw.id);
      for (const side of [-1, 1]) {
        features.push(
          makeFeature(`GRD-${String(++guardIdx).padStart(4, '0')}`,
            'twr_guard', `GRD-${tw.id}-${rwy.id.replace('/', '')}`, `警戒灯组 ${tw.id}×${rwy.id}`,
            tw.id, guardIdx, tw.points[0][0] + side * 6, rwy.y + (rwy.y > 0 ? -50 : 50),
            { subType: 'guard' })
        );
      }
      // 停止排灯：横穿联络道的 9 盏红色排灯
      pushGroup(`STP-${tw.id}-${rwy.id.replace('/', '')}`, `停止排灯 ${tw.id}×${rwy.id}`, 'twr_guard', tw.id);
      const halfW = rwy.width / 2;
      for (let k = 0; k < 9; k++) {
        const yy = rwy.y - halfW + 6 + (k * (halfW * 2 - 12)) / 8;
        features.push(
          makeFeature(`STP-${String(++stopIdx).padStart(4, '0')}`,
            'twr_guard', `STP-${tw.id}-${rwy.id.replace('/', '')}`, `停止排灯 ${tw.id}×${rwy.id}`,
            tw.id, stopIdx, tw.points[0][0] - 4, yy, { subType: 'stopbar' })
        );
      }
    }
  }

  // ---------- 3. 进近灯光（ICAO 简易构型加密：中线排 + 多道横排 + 顺序闪光灯）----------
  for (const rwy of RUNWAYS.slice(0, 2)) {
    for (const [endX, dir, label] of [[rwy.x0, -1, '05'], [rwy.x1, 1, '23']]) {
      const gid = `APR-${rwy.id.replace('/', '')}-${label}`;
      pushGroup(gid, `进近灯组 ${rwy.id} ${label}`, 'approach', rwy.id);
      let ai = 0;
      const stations = [];
      for (let d = 30; d <= 300; d += 30) stations.push(d);
      for (let d = 360; d <= 900; d += 60) stations.push(d);
      for (const d of stations) {
        features.push(
          makeFeature(`APL-${label}-${rwy.id.replace('/', '')}-C${String(ai + 1).padStart(2, '0')}`,
            'approach', gid, `进近灯组 ${rwy.id} ${label}`, rwy.id, ai, endX + dir * d, rwy.y)
        );
        ai++;
      }
      // 横排灯：150/300m 展 45m，450/600/750m 展 60m
      for (const [d, wing] of [[150, 45], [300, 45], [450, 60], [600, 60], [750, 60]]) {
        for (let w = -wing; w <= wing; w += 15) {
          if (w === 0) continue;
          features.push(
            makeFeature(`APL-${label}-${rwy.id.replace('/', '')}-B${String(ai + 1).padStart(2, '0')}`,
              'approach', gid, `进近灯组 ${rwy.id} ${label}`, rwy.id, ai, endX + dir * d, rwy.y + w)
          );
          ai++;
        }
      }
      // 进近顺序闪光灯
      for (let w = -30; w <= 30; w += 15) {
        features.push(
          makeFeature(`APS-${label}-${rwy.id.replace('/', '')}-${String(ai + 1).padStart(2, '0')}`,
            'approach', gid, `进近顺序闪光灯 ${rwy.id} ${label}`, rwy.id, ai, endX + dir * 210, rwy.y + w,
            { flash: true })
        );
        ai++;
      }
    }
  }

  // ---------- 4. 机坪照明（96 机位 × 6 灯）----------
  let standNo = 1;
  for (const row of APRON_ROWS) {
    for (const sx of row.xs) {
      const sid = String(standNo).padStart(3, '0');
      const gid = `APRON-STAND-${sid}`;
      pushGroup(gid, `机位 ${sid} 照明`, 'apron', `STAND${sid}`);
      const pts = [[0, 0], [-18, -20], [18, -20], [-18, 20], [18, 20], [0, 26]];
      pts.forEach(([dx, dy], k) => {
        features.push(
          makeFeature(`APN-${sid}-${k + 1}`,
            'apron', gid, `机位 ${sid} 照明`, `STAND${sid}`, k, sx + dx, row.y + dy,
            { subType: k === 0 ? 'guide' : k === 5 ? 'mast' : 'stand-edge' })
        );
      });
      standNo++;
    }
  }

  // ---------- 5. 障碍灯（周边建筑/天线 120 处）----------
  const obstacles = [];
  for (let i = 0; i < 120; i++) {
    const ang = (i / 120) * Math.PI * 2 + rnd() * 0.1;
    const rad = 2600 + rnd() * 1600;
    obstacles.push({ x: Math.cos(ang) * rad, y: Math.sin(ang) * rad, h: 15 + Math.round(rnd() * 75) });
  }
  pushGroup('OBS-ALL', '周边障碍物障碍灯组', 'obstruction', 'OBS');
  obstacles.forEach((o, i) => {
    features.push(
      makeFeature(`OBS-${String(i + 1).padStart(3, '0')}`,
        'obstruction', 'OBS-ALL', '周边障碍物障碍灯组', 'OBS', i, o.x, o.y, { heightM: o.h })
    );
  });

  // ---------- 6. 边界灯（围界，50m 间距）----------
  pushGroup('BND-ALL', '机场围界边界灯组', 'boundary', 'BND');
  const bnd = [[-2500, -1800], [2500, -1800], [2500, 1800], [-2500, 1800], [-2500, -1800]];
  const bndPts = samplePolyline(bnd, 50);
  bndPts.forEach((p, i) => {
    features.push(
      makeFeature(`BND-${String(i + 1).padStart(3, '0')}`,
        'boundary', 'BND-ALL', '机场围界边界灯组', 'BND', i, p.x, p.y)
    );
  });

  // ---------- 应用预置缺失 ----------
  const fIndex = new Map(features.map((f) => [f.id, f]));
  for (const m of missingPlanned) {
    const f = fIndex.get(m.featureId);
    if (f) f.status = 'missing';
  }

  const byCategory = {};
  for (const f of features) byCategory[f.categoryId] = (byCategory[f.categoryId] || 0) + 1;

  dataset = {
    meta: {
      arp: ARP,
      runwayAzimuth: RUNWAY_AZIMUTH,
      runways: RUNWAYS,
      taxiways: TAXIWAYS,
      apronRows: APRON_ROWS,
      boundary: bnd,
      surveySource: '合成机场测绘资料（结构等同实测导入）',
      importedAt: '2026-11-26'
    },
    features,
    groups: groupRegistry,
    config: defaultConfig(),
    stats: {
      total: features.length,
      missing: features.filter((f) => f.status === 'missing').length,
      byCategory,
      groupCount: groupRegistry.length
    },
    bounds: (() => {
      const xs = features.map((f) => f.x);
      const ys = features.map((f) => f.y);
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    })()
  };
  return dataset;
}

export function getDataset() {
  if (!dataset) initDataset();
  return dataset;
}

export function exportConfigJson(config) {
  return JSON.stringify({ ...config, generatedAt: new Date().toISOString() }, null, 2);
}
