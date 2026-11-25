import type { Cue, EffectConfig, Layer, LayerKind, Project } from '../types';
import { uid } from '../lib/format';

export function defaultEffect(overrides: Partial<EffectConfig> = {}): EffectConfig {
  return {
    variant: 0,
    seed: Math.floor(Math.random() * 1_000_000_000),
    color: '#ffd166',
    color2: '#ff6b2c',
    density: 1,
    speed: 1,
    frequency: 11,
    intensity: 0.9,
    spread: 1,
    drift: 1,
    ...overrides,
  };
}

interface LayerSeed {
  name: string;
  kind: LayerKind;
  texture: string;
  assetId?: string;
  assetName?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  start: number;
  duration: number;
  opacity?: number;
  rotation?: number;
  blendMode?: Layer['blendMode'];
  effect?: Partial<EffectConfig>;
  locked?: boolean;
}

export function createLayer(seed: LayerSeed): Layer {
  const kindDefaults: Record<LayerKind, Partial<EffectConfig>> = {
    background: {},
    spark: {
      color: '#ffd166',
      color2: '#ff5a1f',
      density: 1.15,
      speed: 1,
      intensity: 1,
      spread: 1,
    },
    smoke: {
      color: '#aab4bd',
      color2: '#5d6872',
      density: 1,
      speed: 0.7,
      spread: 1.15,
      drift: 1,
      intensity: 0.72,
    },
    light: {
      color: '#ffe7a3',
      color2: '#7cc7ff',
      frequency: 13,
      intensity: 0.95,
      speed: 1,
    },
    image: {},
  };

  return {
    id: uid('layer'),
    name: seed.name,
    kind: seed.kind,
    texture: seed.texture,
    assetId: seed.assetId,
    assetName: seed.assetName,
    visible: true,
    locked: seed.locked ?? false,
    opacity: seed.opacity ?? (seed.kind === 'background' ? 1 : 0.82),
    blendMode:
      seed.blendMode ??
      (seed.kind === 'light' ? 'screen' : seed.kind === 'spark' ? 'lighter' : 'normal'),
    start: seed.start,
    duration: seed.duration,
    x: seed.x,
    y: seed.y,
    width: seed.width,
    height: seed.height,
    scaleX: 1,
    scaleY: 1,
    rotation: seed.rotation ?? 0,
    strokes: [],
    effect: defaultEffect({ ...kindDefaults[seed.kind], ...seed.effect }),
  };
}

function cue(time: number, title: string, note: string): Cue {
  return { id: uid('cue'), time, title, note };
}

export function createDefaultProject(): Project {
  const layers: Layer[] = [
    createLayer({
      name: '正面现场照片（示例）',
      kind: 'background',
      texture: 'bg-front',
      x: 960,
      y: 540,
      width: 1920,
      height: 1080,
      start: 0,
      duration: 12,
      opacity: 1,
      locked: false,
    }),

    createLayer({
      name: '火星 · 主迸点',
      kind: 'spark',
      texture: 'fx-spark',
      x: 1115,
      y: 500,
      width: 820,
      height: 560,
      start: 1.38,
      duration: 2.8,
      opacity: 0.95,
      effect: { seed: 10101, density: 1.35, variant: 0 },
    }),
    createLayer({
      name: '火星 · 低位散落',
      kind: 'spark',
      texture: 'fx-spark',
      x: 930,
      y: 690,
      width: 1050,
      height: 430,
      start: 1.55,
      duration: 3.4,
      opacity: 0.72,
      effect: { seed: 20202, color: '#ff9f1c', density: 0.9, variant: 1 },
    }),
    createLayer({
      name: '火星 · 二次爆裂',
      kind: 'spark',
      texture: 'fx-spark',
      x: 1060,
      y: 545,
      width: 720,
      height: 500,
      start: 2.42,
      duration: 2.1,
      opacity: 0.78,
      effect: { seed: 30303, color: '#fff3b0', color2: '#ff3d00', density: 0.8, variant: 2 },
    }),
    createLayer({
      name: '火星 · 地面余烬',
      kind: 'spark',
      texture: 'fx-spark',
      x: 850,
      y: 805,
      width: 980,
      height: 260,
      start: 1.8,
      duration: 5.2,
      opacity: 0.5,
      effect: { seed: 40404, density: 0.55, variant: 3, speed: 0.55 },
    }),

    createLayer({
      name: '烟雾 · 主团扩散',
      kind: 'smoke',
      texture: 'fx-smoke',
      x: 930,
      y: 650,
      width: 980,
      height: 620,
      start: 1.86,
      duration: 6.2,
      opacity: 0.72,
      effect: { seed: 50505, density: 1.25, spread: 1.35, variant: 0 },
    }),
    createLayer({
      name: '烟雾 · 底部翻涌',
      kind: 'smoke',
      texture: 'fx-smoke',
      x: 805,
      y: 770,
      width: 820,
      height: 390,
      start: 2.15,
      duration: 6.5,
      opacity: 0.62,
      effect: { seed: 60606, density: 1.05, variant: 1, color: '#c2cad1' },
    }),
    createLayer({
      name: '烟雾 · 右侧包裹',
      kind: 'smoke',
      texture: 'fx-smoke',
      x: 1110,
      y: 610,
      width: 760,
      height: 560,
      start: 2.55,
      duration: 5.8,
      opacity: 0.58,
      effect: { seed: 70707, density: 0.9, variant: 2, drift: 1.35 },
    }),
    createLayer({
      name: '烟雾 · 薄层遮本体',
      kind: 'smoke',
      texture: 'fx-smoke',
      x: 960,
      y: 610,
      width: 1120,
      height: 520,
      start: 3.1,
      duration: 5.4,
      opacity: 0.46,
      effect: { seed: 80808, density: 0.75, variant: 3, spread: 1.5 },
    }),

    createLayer({
      name: '灯光 · 触发白闪',
      kind: 'light',
      texture: 'fx-light',
      x: 1000,
      y: 420,
      width: 1280,
      height: 760,
      start: 1.34,
      duration: 2.2,
      opacity: 0.92,
      effect: { seed: 90909, color: '#fff7d6', color2: '#ffb703', frequency: 18, variant: 0 },
    }),
    createLayer({
      name: '灯光 · 高频频闪（待压暗）',
      kind: 'light',
      texture: 'fx-light',
      x: 960,
      y: 330,
      width: 1640,
      height: 760,
      start: 1.55,
      duration: 5.6,
      opacity: 0.74,
      effect: { seed: 11111, color: '#cdeaff', color2: '#4ea8de', frequency: 15, variant: 1 },
    }),
    createLayer({
      name: '灯光 · 侧台警示红',
      kind: 'light',
      texture: 'fx-light',
      x: 285,
      y: 285,
      width: 560,
      height: 560,
      start: 0.7,
      duration: 7.5,
      opacity: 0.34,
      effect: { seed: 22222, color: '#ff4d6d', color2: '#590d22', frequency: 4.2, variant: 2 },
    }),
  ];

  return {
    name: '本周剧场 · 机关触发瞬间合成 v1',
    width: 1920,
    height: 1080,
    duration: 12,
    layers,
    cues: [
      cue(0.0, '待机', '现场照片铺底，确认机关本体位置'),
      cue(1.2, '触发', '演员触碰机关，相机连拍开始'),
      cue(1.38, '首次白闪', '灯光最上层，先压住机关金属反光'),
      cue(1.55, '火星迸出', '主迸点与低位散落对齐触发轴'),
      cue(1.86, '烟雾喷出', '中间层开始扩散，蒙版随烟团移动'),
      cue(2.55, '包裹本体', '右侧烟团补住机关轮廓'),
      cue(3.2, '高频闪烁段', '太亮的帧用蒙版笔刷局部压暗'),
      cue(5.0, '持续扩散', '检查烟雾是否盖住机关本体'),
      cue(7.6, '效果收束', '灯光退出，烟雾缓慢散开'),
    ],
  };
}
