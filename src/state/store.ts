import { clamp, uid } from '../lib/format';
import { createDefaultProject } from './defaultProject';
import { KIND_RANK } from '../types';
import type {
  BrushSettings,
  HistoryEntry,
  ID,
  Layer,
  Project,
  ToolId,
} from '../types';

const HISTORY_LIMIT = 60;

export class StudioStore extends EventTarget {
  project: Project = createDefaultProject();
  selectedIds: ID[] = ['layer_placeholder'];

  tool: ToolId = 'select';
  brush: BrushSettings = {
    size: 110,
    hardness: 0.58,
    opacity: 0.72,
    mode: 'hide',
  };

  currentTime = 0;
  playing = false;
  loop = true;
  timeFilter = false;

  zoom = 1;
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];

  constructor() {
    super();
    // Select the deliberately over-bright demo strobe layer after ids exist.
    const strobe = this.project.layers.find((layer) => layer.name.includes('高频频闪'));
    this.selectedIds = strobe ? [strobe.id] : [];
  }

  on(type: string, listener: EventListener): () => void {
    this.addEventListener(type, listener);
    return () => this.removeEventListener(type, listener);
  }

  emit(type: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  emitChange(): void {
    this.emit('change');
  }

  capture(): Project {
    return structuredClone(this.project);
  }

  /** Run a discrete mutation and record one undoable entry. */
  mutate(label: string, fn: () => void): void {
    const before = this.capture();
    fn();
    this.pushHistory(label, before);
    this.emitChange();
  }

  /** Record a gesture after the live mutation has already been applied. */
  commitGesture(label: string, before: Project | undefined | null): void {
    if (!before) return;
    const after = this.capture();
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    this.pushHistory(label, before, after);
    this.emitChange();
  }

  private pushHistory(label: string, before: Project, after: Project = this.capture()): void {
    this.past.push({ label, before, after, at: Date.now() });
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
    this.emit('historychange');
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  undoLabel(): string | undefined {
    return this.past.at(-1)?.label;
  }

  redoLabel(): string | undefined {
    return this.future.at(-1)?.label;
  }

  undo(): void {
    const entry = this.past.pop();
    if (!entry) return;
    this.future.push(entry);
    this.project = structuredClone(entry.before);
    this.validateSelection();
    this.playing = false;
    this.emit('historychange');
    this.emit('playbackchange');
    this.emit('projectreset');
    this.emitChange();
  }

  redo(): void {
    const entry = this.future.pop();
    if (!entry) return;
    this.past.push(entry);
    this.project = structuredClone(entry.after);
    this.validateSelection();
    this.playing = false;
    this.emit('historychange');
    this.emit('playbackchange');
    this.emit('projectreset');
    this.emitChange();
  }

  private validateSelection(): void {
    const ids = new Set(this.project.layers.map((layer) => layer.id));
    this.selectedIds = this.selectedIds.filter((id) => ids.has(id));
    if (this.selectedIds.length === 0) {
      const preferred = this.project.layers.find((layer) => layer.kind === 'light') ?? this.project.layers.at(-1);
      if (preferred) this.selectedIds = [preferred.id];
    }
    this.emit('selectionchange');
  }

  select(ids: ID[] | ID | null, additive = false): void {
    const next = ids === null ? [] : Array.isArray(ids) ? ids : [ids];
    if (additive) {
      const set = new Set(this.selectedIds);
      for (const id of next) {
        if (set.has(id)) set.delete(id);
        else set.add(id);
      }
      this.selectedIds = [...set];
    } else {
      this.selectedIds = [...new Set(next)];
    }
    this.emit('selectionchange');
  }

  get selectedLayers(): Layer[] {
    return this.selectedIds
      .map((id) => this.project.layers.find((layer) => layer.id === id))
      .filter((layer): layer is Layer => Boolean(layer));
  }

  get activeLayer(): Layer | undefined {
    const activeId = this.selectedIds.at(-1);
    return this.project.layers.find((layer) => layer.id === activeId) ?? this.selectedLayers.at(-1);
  }

  setTool(tool: ToolId): void {
    this.tool = tool;
    if (tool === 'mask' && this.selectedLayers.length !== 1) {
      const only = this.activeLayer;
      if (only) this.selectedIds = [only.id];
      this.emit('selectionchange');
    }
    this.emit('toolchange');
  }

  setBrush(patch: Partial<BrushSettings>): void {
    Object.assign(this.brush, patch);
    this.emit('brushchange');
  }

  patchLayerLive(id: ID, patch: Partial<Layer>): void {
    const layer = this.project.layers.find((item) => item.id === id);
    if (!layer) return;
    Object.assign(layer, patch);
    this.emit('layerlive', { id, patch });
  }

  insertLayer(layer: Layer, select = true): void {
    this.mutate(`添加${layer.name}`, () => {
      const rank = KIND_RANK[layer.kind];
      let insertAt = this.project.layers.length;
      for (let i = 0; i < this.project.layers.length; i += 1) {
        if (KIND_RANK[this.project.layers[i].kind] > rank) {
          insertAt = i;
          break;
        }
        if (KIND_RANK[this.project.layers[i].kind] === rank) insertAt = i + 1;
      }
      this.project.layers.splice(insertAt, 0, layer);
      if (select) this.selectedIds = [layer.id];
    });
  }

  deleteLayers(ids: ID[] = this.selectedIds): void {
    if (ids.length === 0) return;
    this.mutate(ids.length > 1 ? `删除 ${ids.length} 层` : '删除图层', () => {
      const set = new Set(ids);
      this.project.layers = this.project.layers.filter((layer) => !set.has(layer.id));
      this.selectedIds = this.selectedIds.filter((id) => !set.has(id));
      this.validateSelection();
    });
  }

  duplicateLayer(id: ID): void {
    const source = this.project.layers.find((layer) => layer.id === id);
    if (!source) return;
    const copy: Layer = structuredClone(source);
    copy.id = uid('layer');
    copy.name = `${source.name} 副本`;
    copy.x += 36;
    copy.y += 28;
    copy.strokes = source.strokes.map((stroke) => ({ ...stroke, id: uid('stroke'), points: stroke.points.map((p) => ({ ...p })) }));
    this.insertLayer(copy);
  }

  toggleVisible(id: ID): void {
    this.mutate('切换可见性', () => {
      const layer = this.project.layers.find((item) => item.id === id);
      if (layer) layer.visible = !layer.visible;
    });
  }

  toggleLocked(id: ID): void {
    this.mutate('切换锁定', () => {
      const layer = this.project.layers.find((item) => item.id === id);
      if (layer) layer.locked = !layer.locked;
    });
  }

  setLayerKind(id: ID, kind: Layer['kind']): void {
    this.mutate('调整层级分组', () => {
      const layer = this.project.layers.find((item) => item.id === id);
      if (!layer || layer.kind === 'background' || kind === 'background') return;
      layer.kind = kind;
      // Stable sort keeps within-category order while enforcing light > smoke > spark.
      this.project.layers = [...this.project.layers].sort(
        (a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind],
      );
    });
  }

  moveLayerInCategory(id: ID, direction: -1 | 1): void {
    this.mutate('调整同组层级', () => {
      const layers = this.project.layers;
      const index = layers.findIndex((layer) => layer.id === id);
      if (index < 0) return;
      const kind = layers[index].kind;
      let target = index + direction;
      while (target >= 0 && target < layers.length && layers[target].kind !== kind) {
        target += direction;
      }
      if (target < 0 || target >= layers.length) return;
      [layers[index], layers[target]] = [layers[target], layers[index]];
    });
  }

  setTime(time: number): void {
    this.currentTime = clamp(time, 0, this.project.duration);
    this.emit('timechange');
  }

  setPlaying(playing: boolean): void {
    this.playing = playing;
    if (playing) this.timeFilter = true;
    this.emit('playbackchange');
  }

  togglePlay(): void {
    if (!this.playing && this.currentTime >= this.project.duration - 0.01) this.currentTime = 0;
    this.setPlaying(!this.playing);
  }

  setTimeFilter(value: boolean): void {
    this.timeFilter = value;
    this.emit('playbackchange');
    this.emitChange();
  }

  setLoop(value: boolean): void {
    this.loop = value;
    this.emit('playbackchange');
  }

  setZoom(zoom: number): void {
    this.zoom = clamp(zoom, 0.25, 4);
    this.emit('viewchange');
  }

  zoomBy(factor: number): void {
    this.setZoom(this.zoom * factor);
  }

  requestFit(): void {
    this.emit('fitrequested');
  }

  notify(message: string, tone: 'info' | 'success' | 'error' = 'info'): void {
    this.emit('toast', { message, tone });
  }
}

export const store = new StudioStore();
