export type ID = string;

export type ToolId = 'select' | 'mask';

export type LayerKind = 'background' | 'spark' | 'smoke' | 'light' | 'image';

export type BlendMode = 'normal' | 'screen' | 'lighter' | 'multiply';

export type BrushMode = 'hide' | 'show';

export interface Point {
  x: number;
  y: number;
}

export interface MaskStroke {
  id: ID;
  mode: BrushMode;
  size: number;
  hardness: number;
  opacity: number;
  points: Point[];
}

export interface EffectConfig {
  /** Procedural renderer key variation. */
  variant: number;
  seed: number;
  color: string;
  color2?: string;
  density: number;
  speed: number;
  frequency: number;
  intensity: number;
  spread: number;
  drift: number;
}

export interface Layer {
  id: ID;
  name: string;
  kind: LayerKind;
  texture: string;
  assetId?: ID;
  assetName?: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  start: number;
  duration: number;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  strokes: MaskStroke[];
  effect: EffectConfig;
}

export interface Cue {
  id: ID;
  time: number;
  title: string;
  note?: string;
}

export interface Project {
  name: string;
  width: number;
  height: number;
  duration: number;
  /** Bottom-to-top stacking order. */
  layers: Layer[];
  cues: Cue[];
}

export interface BrushSettings {
  size: number;
  hardness: number;
  opacity: number;
  mode: BrushMode;
}

export interface HistoryEntry {
  label: string;
  before: Project;
  after: Project;
  at: number;
}

export const KIND_LABEL: Record<LayerKind, string> = {
  background: '底图',
  spark: '火星',
  smoke: '烟雾',
  light: '灯光',
  image: '素材',
};

/** Higher number renders closer to the stage/top. */
export const KIND_RANK: Record<LayerKind, number> = {
  background: 0,
  spark: 1,
  image: 1,
  smoke: 2,
  light: 3,
};
