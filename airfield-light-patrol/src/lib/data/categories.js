// 机场灯光要素类别定义：图层、颜色、默认简化阈值（米/像素，越小越早简化）与最小显示级别
// LOD 级别：0 = 完整灯组（最近），1 = 抽稀，2 = 聚合锚点（最远）

export const LOD_NAMES = ['完整灯组', '抽稀显示', '距离聚合'];

export const CATEGORIES = [
  {
    id: 'rwy_edge',
    name: '跑道边灯',
    group: '跑道灯光',
    color: 0xffffff,
    cssColor: '#f4f6ff',
    anchorColor: '#cfd8ff',
    defaultThresholds: { lod1: 0.25, lod2: 0.9 }, // m/px
    minLevel: 0,
    visible: true,
    pickable: true
  },
  {
    id: 'rwy_threshold',
    name: '跑道入口/末端灯',
    group: '跑道灯光',
    color: 0x39d98a,
    cssColor: '#39d98a',
    anchorColor: '#27b572',
    defaultThresholds: { lod1: 0.3, lod2: 1.1 },
    minLevel: 0,
    visible: true,
    pickable: true
  },
  {
    id: 'rwy_centerline',
    name: '跑道中线灯',
    group: '跑道灯光',
    color: 0xffffff,
    cssColor: '#ffffff',
    anchorColor: '#dfe6ff',
    defaultThresholds: { lod1: 0.22, lod2: 0.85 },
    minLevel: 0,
    visible: true,
    pickable: true
  },
  {
    id: 'rwy_tdz',
    name: '接地带灯',
    group: '跑道灯光',
    color: 0xffffff,
    cssColor: '#eef1ff',
    anchorColor: '#c6d0f5',
    defaultThresholds: { lod1: 0.24, lod2: 0.95 },
    minLevel: 0,
    visible: true,
    pickable: true
  },
  {
    id: 'twr_edge',
    name: '滑行道边灯',
    group: '滑行道灯光',
    color: 0x4aa3ff,
    cssColor: '#4aa3ff',
    anchorColor: '#2f7fd6',
    defaultThresholds: { lod1: 0.28, lod2: 1.0 },
    minLevel: 0,
    visible: true,
    pickable: true
  },
  {
    id: 'twr_centerline',
    name: '滑行道中线灯',
    group: '滑行道灯光',
    color: 0x37e0c4,
    cssColor: '#37e0c4',
    anchorColor: '#1fb59c',
    defaultThresholds: { lod1: 0.26, lod2: 0.95 },
    minLevel: 0,
    visible: true,
    pickable: true
  },
  {
    id: 'twr_guard',
    name: '跑道警戒灯',
    group: '滑行道灯光',
    color: 0xffb020,
    cssColor: '#ffb020',
    anchorColor: '#d98c00',
    defaultThresholds: { lod1: 0.4, lod2: 1.4 },
    minLevel: 0,
    visible: true,
    pickable: true
  },
  {
    id: 'approach',
    name: '进近灯光',
    group: '进近灯光',
    color: 0xff5a5a,
    cssColor: '#ff6b6b',
    anchorColor: '#d93f3f',
    defaultThresholds: { lod1: 0.35, lod2: 1.2 },
    minLevel: 0,
    visible: true,
    pickable: true
  },
  {
    id: 'apron',
    name: '机坪照明',
    group: '机坪灯光',
    color: 0xffd166,
    cssColor: '#ffd166',
    anchorColor: '#d9ab3f',
    defaultThresholds: { lod1: 0.45, lod2: 1.6 },
    minLevel: 0,
    visible: true,
    pickable: true
  },
  {
    id: 'obstruction',
    name: '障碍灯',
    group: '助航灯光',
    color: 0xff3b6b,
    cssColor: '#ff3b6b',
    anchorColor: '#c7234d',
    defaultThresholds: { lod1: 0.6, lod2: 2.0 },
    minLevel: 1, // 障碍灯远距离也保留
    visible: true,
    pickable: true
  },
  {
    id: 'boundary',
    name: '边界灯',
    group: '助航灯光',
    color: 0x8aa0c7,
    cssColor: '#8aa0c7',
    anchorColor: '#65799c',
    defaultThresholds: { lod1: 0.5, lod2: 1.8 },
    minLevel: 0,
    visible: true,
    pickable: true
  }
];

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

// 生成一份默认地景要素配置
export function defaultConfig() {
  return {
    version: 1,
    name: '机场灯光地景要素配置',
    generatedAt: null,
    // 全局简化强度：0.5 = 阈值减半（更早简化），2 = 阈值翻倍（更晚简化）
    simplificationBias: 1,
    categories: CATEGORIES.map((c) => ({
      id: c.id,
      name: c.name,
      visible: c.visible,
      minLevel: c.minLevel,
      thresholds: { ...c.defaultThresholds }
    }))
  };
}
