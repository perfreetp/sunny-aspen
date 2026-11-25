export interface Point {
  x: number;
  y: number;
}

export interface TemperatureRecord {
  date: string;
  cableId: string;
  layer: number;
  temp: number;
}

export interface TemperatureTable {
  records: TemperatureRecord[];
  dates: string[];
  cables: string[];
  layerCount: number;
  fileName?: string;
  skippedRows?: number;
}

export type ToolId = 'brush' | 'reshape' | 'hotzone' | 'gradient';
export type ViewId = 'profile' | 'layer';
export type LayerKey = 'cloud' | 'heat' | 'hotZone' | 'gradient';

export interface HotZone {
  points: Point[];
  threshold: number;
  maxTemp?: number;
  avgTemp?: number;
  areaCells?: number;
}

export interface GradientResult {
  layer: number;
  delta: number;
  x: number;
  y: number;
  averages: number[];
}

export interface GradientLine {
  a: Point;
  b: Point;
  result?: GradientResult | null;
}

export interface WorkbenchSnapshot {
  ready: boolean;
  view: ViewId;
  tool: ToolId;
  selectedLayer: number;
  layerCount: number;
  dates: string[];
  selectedDate: string;
  cableCount: number;
  recordCount: number;
  matchedCount: number;
  fileName: string;
  importMessage: string;
  importError: string;
  brushSize: 1 | 2 | 3;
  tempIndex: number;
  threshold: number;
  layerVisibility: Record<LayerKey, boolean>;
  canUndo: boolean;
  undoDepth: number;
  hasHotZone: boolean;
  hasGradient: boolean;
  status: string;
  hotZoneSummary: string;
  gradientSummary: string;
}
