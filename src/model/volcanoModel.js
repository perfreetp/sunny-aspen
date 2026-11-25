// 合成火山地质模型：地形 + 10 个岩层界面 + 地质图采样
// 坐标系：单位 m，范围 0..4000，火山口位于 (2000,2000)

export const MODEL_EXTENT = 4000;
export const SUMMIT = { x: 2000, y: 2000 };

// 岩层目录：idx 0 为最浅（最新）层，数字越大越老越深
export const LITHOLOGIES = [
  { idx: 0, key: 'q4', name: '第四系坡积物', age: 'Q4', pattern: 'dots', color: '#efe2c4' },
  { idx: 1, key: 'q3', name: '黑色玄武岩', age: 'Q3', pattern: 'v', color: '#9aa7b8' },
  { idx: 2, key: 'q2', name: '气孔状安山岩', age: 'Q2', pattern: 'circles', color: '#c98f6b' },
  { idx: 3, key: 'q1', name: '火山角砾岩', age: 'Q1', pattern: 'triangles', color: '#b56b6b' },
  { idx: 4, key: 'n2', name: '凝灰质砂岩', age: 'N2', pattern: 'lines', color: '#d8c98f' },
  { idx: 5, key: 'n1', name: '流纹质凝灰岩', age: 'N1', pattern: 'crosshatch', color: '#a9b07c' },
  { idx: 6, key: 'e3', name: '英安岩', age: 'E3', pattern: 'dashes', color: '#7fa89a' },
  { idx: 7, key: 'e2', name: '安山质熔岩', age: 'E2', pattern: 'waves', color: '#8d93b5' },
  { idx: 8, key: 'e1', name: '集块岩', age: 'E1', pattern: 'blocks', color: '#a58f7d' },
  { idx: 9, key: 'j3', name: '花岗岩基底', age: 'J3', pattern: 'plus', color: '#c2b8cf' },
];

const R = 1850; // 火山锥半径

function rOf(x, y) {
  return Math.hypot(x - SUMMIT.x, y - SUMMIT.y);
}

// 地形高程：锥状火山 + 放射状冲沟
export function surfaceZ(x, y) {
  const r = rOf(x, y);
  const t = Math.min(1, r / R);
  const theta = Math.atan2(y - SUMMIT.y, x - SUMMIT.x);
  const cone = 1480 * (1 - t) + 120;
  const gullies = 60 * Math.sin(6 * theta + 0.7) * t * (1 - t) * 2
    + 28 * Math.sin(11 * theta + 1.9) * t * (1 - t);
  const broad = 35 * Math.cos(3 * theta - 0.4) * t;
  return cone + gullies + broad;
}

// 各层在水平距离 r 处的真厚度（m）。
// 顶部两层（idx 0/1）在火山口附近急剧减薄 —— 12 号剖面穿过火山口时会出现标注挤压
const THICKNESS_FN = [
  (r) => 14 + 52 * Math.pow(Math.min(1, r / 700), 1.6),                          // Q4 坡积物
  (r) => 12 + 78 * Math.pow(Math.min(1, r / 900), 1.45),                         // Q3 玄武岩
  (r) => 56 + 52 * Math.min(1, r / 1400),                                        // Q2 安山岩
  (r) => 84 + 64 * Math.min(1, r / 1600),                                        // Q1 角砾岩
  (r) => 116 + 50 * Math.sin(r / 600 + 0.6) ** 2,                                // N2
  (r) => 138 + 44 * Math.min(1, r / 1200),                                       // N1
  (r) => 158 + 58 * Math.cos(r / 900) ** 2,                                      // E3
  (r) => 176 + 50 * Math.min(1, r / 1000),                                       // E2
  (r) => 196 + 40 * Math.sin(r / 700 + 1.2) ** 2,                                // E1
  (r) => 900,                                                                    // J3 基底（可视范围内）
];

export function thicknessAt(idx, x, y) {
  return Math.max(4, THICKNESS_FN[idx](rOf(x, y)));
}

// 采样：返回地形高程与各层界面高程（topIfaces[k] = 第 k 层顶面）
export function sampleModel(x, y) {
  const top = surfaceZ(x, y);
  const thickness = LITHOLOGIES.map((l) => thicknessAt(l.idx, x, y));
  const topIfaces = [];
  let z = top;
  for (let k = 0; k < LITHOLOGIES.length; k++) {
    topIfaces.push(z);
    z -= thickness[k];
  }
  return { x, y, r: rOf(x, y), top, thickness, topIfaces };
}

// 地质图：地表出露的是最浅层 idx 0（全模型均有第四系覆盖），
// 冲沟处下切露出 idx 1/2 —— 按地形局部曲率近似
export function surfaceLithology(x, y) {
  const r = rOf(x, y);
  const theta = Math.atan2(y - SUMMIT.y, x - SUMMIT.x);
  const gully = Math.sin(6 * theta + 0.7);
  if (r > R * 0.92) return 3;            // 外缘出露火山角砾岩
  if (gully < -0.55 && r > 250) return 2; // 冲沟出露安山岩
  if (gully < -0.25 && r > 700) return 1; // 浅切沟出露玄武岩
  return 0;
}

// 网格化采样（供平面地质图、伪三维渲染使用）
export function sampleGrid(n = 48) {
  const step = MODEL_EXTENT / (n - 1);
  const cells = new Array(n);
  for (let i = 0; i < n; i++) {
    cells[i] = new Array(n);
    for (let j = 0; j < n; j++) {
      const x = i * step, y = j * step;
      const s = sampleModel(x, y);
      cells[i][j] = { x, y, z: s.top, lith: surfaceLithology(x, y) };
    }
  }
  return { n, step, cells };
}

// 预设实测剖面线（地质图上的实测位置），共 12 条；12 号穿过火山口
export const MEASURED_SECTIONS = [
  { id: 'S01', name: '01 号实测剖面', origin: 'measured', points: [{ x: 200, y: 900 }, { x: 3800, y: 1150 }] },
  { id: 'S02', name: '02 号实测剖面', origin: 'measured', points: [{ x: 350, y: 1400 }, { x: 3650, y: 1650 }] },
  { id: 'S03', name: '03 号实测剖面', origin: 'measured', points: [{ x: 500, y: 2050 }, { x: 3900, y: 1900 }] },
  { id: 'S04', name: '04 号实测剖面', origin: 'measured', points: [{ x: 300, y: 2500 }, { x: 3700, y: 2350 }] },
  { id: 'S05', name: '05 号实测剖面', origin: 'measured', points: [{ x: 600, y: 3100 }, { x: 3800, y: 2900 }] },
  { id: 'S06', name: '06 号实测剖面', origin: 'measured', points: [{ x: 900, y: 300 }, { x: 1150, y: 3700 }] },
  { id: 'S07', name: '07 号实测剖面', origin: 'measured', points: [{ x: 1500, y: 350 }, { x: 1700, y: 3800 }] },
  { id: 'S08', name: '08 号实测剖面', origin: 'measured', points: [{ x: 2350, y: 300 }, { x: 2250, y: 3750 }] },
  { id: 'S09', name: '09 号实测剖面', origin: 'measured', points: [{ x: 2950, y: 400 }, { x: 2750, y: 3800 }] },
  { id: 'S10', name: '10 号实测剖面', origin: 'measured', points: [{ x: 600, y: 600 }, { x: 3400, y: 3300 }] },
  { id: 'S11', name: '11 号实测剖面', origin: 'measured', points: [{ x: 3300, y: 500 }, { x: 700, y: 3500 }] },
  { id: 'S12', name: '12 号实测剖面（火山口）', origin: 'measured', points: [{ x: 300, y: 2000 }, { x: 3700, y: 2000 }] },
];

let obliqueSeq = 13;
export function nextObliqueId() {
  const id = `S${String(obliqueSeq).padStart(2, '0')}`;
  obliqueSeq++;
  return id;
}
