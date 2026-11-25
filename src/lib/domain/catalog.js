export const GRAIN_TYPES = [
  {
    id: 'wheat',
    label: '小麦',
    bulkDensity: 0.78, // t/m³
    ventilationRate: 8, // m³/(h·t), 方案估算取值
    resistance: '中高',
    note: '孔隙较小，粮层阻力偏高'
  },
  {
    id: 'corn',
    label: '玉米',
    bulkDensity: 0.72,
    ventilationRate: 6,
    resistance: '中',
    note: '颗粒大，通风阻力较低'
  },
  {
    id: 'paddy',
    label: '稻谷',
    bulkDensity: 0.57,
    ventilationRate: 9,
    resistance: '高',
    note: '籽粒表面粗糙，需注意降水均匀性'
  },
  {
    id: 'soybean',
    label: '大豆',
    bulkDensity: 0.74,
    ventilationRate: 7,
    resistance: '中高',
    note: '含油籽粒，避免过高风速和破碎'
  }
];

export const DUCT_FORMS = [
  { id: 'above', label: '地上笼', widthFactor: 1, roughness: '冲孔钢板地上风道' },
  { id: 'trench', label: '地槽风道', widthFactor: 0.88, roughness: '土建地槽 + 冲孔盖板' },
  { id: 'perforated', label: '穿孔地板', widthFactor: 0.72, roughness: '全底面穿孔通风板' }
];

export const MAIN_ROUTES = [
  { id: 'straight', label: '穿心一字形', branchMode: 'comb', hint: '主风道沿直径贯穿，支风道两侧梳齿布置' },
  { id: 'tee', label: 'T 形主风道', branchMode: 'comb', hint: '一字主管加中央 T 形段，支路分区汇风' },
  { id: 'radial', label: '中心放射形', branchMode: 'radial', hint: '中心汇风管接出多路放射支风道' },
  { id: 'ring', label: '环形主风道', branchMode: 'ring', hint: '环管沿仓底布置，支风道径向搭接' }
];

export const PARAM_LIMITS = {
  innerDiameter: { min: 10, max: 30, step: 0.1, unit: 'm' },
  eaveHeight: { min: 12, max: 32, step: 0.1, unit: 'm' },
  coneAngle: { min: 25, max: 45, step: 1, unit: '°' },
  grainLine: { min: 2, max: 30, step: 0.1, unit: 'm' },
  branchCount: { min: 2, max: 16, step: 1, unit: '路' },
  arrayRows: { min: 2, max: 16, step: 1, unit: '排' },
  arrayCols: { min: 2, max: 24, step: 1, unit: '列' }
};

export const DEFAULT_PARAMS_A = {
  innerDiameter: 18,
  eaveHeight: 20,
  coneAngle: 35,
  grainLine: 15.2,
  grainType: 'wheat',
  ductForm: 'above',
  mainRoute: 'straight',
  branchCount: 8,
  arrayRows: 6,
  arrayCols: 10,
  seed: '20261108'
};

export const DEFAULT_PARAMS_B = {
  innerDiameter: 21.5,
  eaveHeight: 22.5,
  coneAngle: 38,
  grainLine: 17.4,
  grainType: 'corn',
  ductForm: 'trench',
  mainRoute: 'radial',
  branchCount: 10,
  arrayRows: 7,
  arrayCols: 12,
  seed: '20260719'
};
