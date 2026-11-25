import Konva from 'konva';
import { store } from '../state/store';
import { assetRegistry } from '../state/assets';
import { uid, clamp } from '../lib/format';
import {
  createProceduralCanvas,
  makeCanvas,
  paintBackdrop,
  paintEffectFrame,
} from './textures';
import type { ID, Layer, MaskStroke, Point } from '../types';

interface RuntimeNode {
  group: Konva.Group;
  image: Konva.Image;
  content: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  output: HTMLCanvasElement;
  signature: string;
}

interface BrushGesture {
  layerId: ID;
  before: ReturnType<typeof store.capture>;
  stroke: MaskStroke;
  last: Point;
}

interface DragOrigin {
  id: ID;
  x: number;
  y: number;
}

export class StageController {
  private host: HTMLElement;
  private stage: Konva.Stage;
  private fxLayer: Konva.Layer;
  private uiLayer: Konva.Layer;
  private world: Konva.Group;
  private transformer: Konva.Transformer;
  private marquee: Konva.Rect;
  private brushCursor: Konva.Circle;
  private canvasFrame: Konva.Rect;

  private nodes = new Map<ID, RuntimeNode>();
  private resizeObserver: ResizeObserver;
  private rafId = 0;
  private lastTimestamp = performance.now();

  private brushGesture: BrushGesture | null = null;
  private moveGesture: {
    before: ReturnType<typeof store.capture>;
    startPointer: Point;
    origins: DragOrigin[];
  } | null = null;
  private marqueeStart: Point | null = null;
  private marqueeMoved = false;
  private gestureBefore: ReturnType<typeof store.capture> | null = null;
  private dragOrigins: DragOrigin[] = [];

  constructor(host: HTMLElement) {
    this.host = host;
    const width = host.clientWidth || 960;
    const height = host.clientHeight || 600;

    this.stage = new Konva.Stage({ container: host as HTMLDivElement, width, height });
    this.fxLayer = new Konva.Layer({ id: 'fx-layer', perfectDrawEnabled: false });
    this.world = new Konva.Group({ id: 'world' });
    this.fxLayer.add(this.world);
    this.stage.add(this.fxLayer);

    this.uiLayer = new Konva.Layer({ id: 'ui-layer' });
    this.transformer = new Konva.Transformer({
      rotateEnabled: true,
      keepRatio: false,
      ignoreStroke: true,
      borderStroke: '#67e8f9',
      anchorStroke: '#67e8f9',
      anchorFill: '#0b1220',
      anchorSize: 11,
      anchorCornerRadius: 3,
      borderDash: [6, 4],
      boundBoxFunc: (_oldBox, newBox) => {
        if (newBox.width < 12 || newBox.height < 12) return _oldBox;
        return newBox;
      },
    });
    this.marquee = new Konva.Rect({
      visible: false,
      fill: 'rgba(103, 232, 249, 0.12)',
      stroke: '#67e8f9',
      strokeWidth: 1.5,
      dash: [5, 4],
      listening: false,
    });
    this.brushCursor = new Konva.Circle({
      visible: false,
      stroke: '#67e8f9',
      strokeWidth: 2,
      dash: [7, 5],
      listening: false,
    });
    this.uiLayer.add(this.transformer, this.marquee, this.brushCursor);
    this.stage.add(this.uiLayer);

    this.canvasFrame = new Konva.Rect({
      x: 0,
      y: 0,
      width: store.project.width,
      height: store.project.height,
      fill: '#04070b',
      shadowColor: 'rgba(0,0,0,.75)',
      shadowBlur: 70,
      shadowOffsetY: 18,
      listening: false,
    });
    this.world.add(this.canvasFrame);

    this.bindStageEvents();
    this.bindStoreEvents();
    this.bindTransformerEvents();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);

    this.reconcile();
    this.fitView();
    this.startLoop();
  }

  private bindStoreEvents(): void {
    store.on('change', () => this.reconcile());
    store.on('projectreset', () => this.reconcile());
    store.on('selectionchange', () => this.syncSelection());
    store.on('toolchange', () => {
      this.applyTool();
      this.syncSelection();
    });
    store.on('brushchange', () => this.updateBrushCursorStyle());
    store.on('layerlive', ((event: CustomEvent) => {
      const { id } = event.detail as { id: ID; patch: Partial<Layer> };
      const layer = store.project.layers.find((item) => item.id === id);
      if (!layer) return;
      this.applyLayerTransform(layer);
      this.applyLayerAppearance(layer);
      if (event.detail.patch.effect || event.detail.patch.texture || event.detail.patch.assetId) {
        this.paintLayerAtDesignTime(layer);
      }
    }) as EventListener);
    store.on('timechange', () => this.renderAtCurrentTime());
    store.on('viewchange', () => this.applyView());
    store.on('fitrequested', () => this.fitView());
  }

  private bindStageEvents(): void {
    this.stage.on('pointerdown', (event) => this.onPointerDown(event));
    this.stage.on('pointermove', (event) => this.onPointerMove(event));
    this.stage.on('pointerup pointercancel pointerleave', (event) => this.onPointerUp(event));
    this.stage.on('pointerleave', () => {
      if (!this.brushGesture) this.brushCursor.visible(false);
      this.uiLayer.batchDraw();
    });

    this.host.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const factor = event.deltaY < 0 ? 1.09 : 1 / 1.09;
        store.zoomBy(factor);
      },
      { passive: false },
    );
  }

  private bindTransformerEvents(): void {
    this.transformer.on('transformstart', () => {
      this.gestureBefore = store.capture();
      store.setPlaying(false);
    });
    this.transformer.on('transform', () => {
      for (const node of this.transformer.nodes()) {
        const id = node.id() as ID;
        if (!id || !this.nodes.has(id)) continue;
        store.patchLayerLive(id, {
          x: node.x(),
          y: node.y(),
          scaleX: node.scaleX(),
          scaleY: node.scaleY(),
          rotation: node.rotation(),
        });
      }
    });
    this.transformer.on('transformend', () => {
      store.commitGesture('变换图层 / 蒙版', this.gestureBefore);
      this.gestureBefore = null;
      this.reconcile();
    });
  }

  resize(): void {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (width === 0 || height === 0) return;
    this.stage.width(width);
    this.stage.height(height);
    this.fitView(false);
  }

  fitView(resetZoom = true): void {
    if (resetZoom) store.zoom = 1;
    this.applyView();
  }

  private viewScale(): number {
    const padding = 34;
    const fit = Math.min(
      (this.stage.width() - padding * 2) / store.project.width,
      (this.stage.height() - padding * 2) / store.project.height,
    );
    return Math.max(0.05, fit) * store.zoom;
  }

  private applyView(): void {
    const scale = this.viewScale();
    this.world.scale({ x: scale, y: scale });
    this.world.position({
      x: (this.stage.width() - store.project.width * scale) / 2,
      y: (this.stage.height() - store.project.height * scale) / 2,
    });
    this.fxLayer.batchDraw();
    this.updateBrushCursorStyle();
  }

  private startLoop(): void {
    const tick = (now: number): void => {
      const delta = Math.min(0.05, (now - this.lastTimestamp) / 1000);
      this.lastTimestamp = now;
      if (store.playing) {
        let next = store.currentTime + delta;
        if (next >= store.project.duration) {
          if (store.loop) next %= store.project.duration;
          else {
            next = store.project.duration;
            store.setPlaying(false);
          }
        }
        store.setTime(next);
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    this.stage.destroy();
  }

  /* ------------------------------------------------------------------ */
  /* Reconciliation and rendering                                        */
  /* ------------------------------------------------------------------ */

  reconcile(): void {
    const ids = new Set(store.project.layers.map((layer) => layer.id));

    for (const [id, runtime] of this.nodes) {
      if (!ids.has(id)) {
        runtime.group.destroy();
        this.nodes.delete(id);
      }
    }

    // Canvas frame must remain the first child.
    this.canvasFrame.moveToBottom();

    for (const layer of store.project.layers) {
      let runtime = this.nodes.get(layer.id);
      const signature = `${layer.texture}|${layer.assetId ?? ''}|${layer.width}x${layer.height}`;
      if (runtime && runtime.signature !== signature) {
        runtime.group.destroy();
        this.nodes.delete(layer.id);
        runtime = undefined;
      }

      if (!runtime) runtime = this.createNode(layer, signature);
      if (runtime.group.getParent() !== this.world) this.world.add(runtime.group);
      // Repeated add() of an existing Konva node does not guarantee reordering.
      // Iterate bottom-to-top and explicitly move each node above the previous one.
      runtime.group.moveToTop();
      this.applyLayerTransform(layer);
      this.applyLayerAppearance(layer);
      this.rasterizeMask(layer, runtime);
      this.paintLayerAtDesignTime(layer);
    }

    this.applyTool();
    this.syncSelection();
    this.applyView();
    this.fxLayer.batchDraw();
    this.uiLayer.batchDraw();
  }

  private createNode(layer: Layer, signature: string): RuntimeNode {
    const content = makeCanvas(layer.width, layer.height);
    const mask = makeCanvas(layer.width, layer.height);
    const output = makeCanvas(layer.width, layer.height);

    const image = new Konva.Image({
      image: output,
      x: -layer.width / 2,
      y: -layer.height / 2,
      width: layer.width,
      height: layer.height,
      name: 'layer-image',
      perfectDrawEnabled: false,
    });

    const group = new Konva.Group({
      id: layer.id,
      name: 'effect-layer',
      x: layer.x,
      y: layer.y,
      rotation: layer.rotation,
      scaleX: layer.scaleX,
      scaleY: layer.scaleY,
      // Moving is handled with explicit coordinate conversion in onPointerMove.
      // Konva dragging inside a scaled world group can otherwise feel non-linear.
      draggable: false,
    });
    group.add(image);
    this.bindGroupPointerEvents(group);
    this.world.add(group);

    const runtime: RuntimeNode = { group, image, content, mask, output, signature };
    this.nodes.set(layer.id, runtime);
    return runtime;
  }

  private applyLayerTransform(layer: Layer): void {
    const runtime = this.nodes.get(layer.id);
    if (!runtime) return;
    runtime.group.position({ x: layer.x, y: layer.y });
    runtime.group.scale({ x: layer.scaleX, y: layer.scaleY });
    runtime.group.rotation(layer.rotation);
  }

  private applyLayerAppearance(layer?: Layer): void {
    const layers = layer ? [layer] : store.project.layers;
    for (const item of layers) {
      const runtime = this.nodes.get(item.id);
      if (!runtime) continue;
      runtime.group.opacity(item.opacity);
      runtime.group.visible(item.visible && this.isTimeVisible(item));
      runtime.group.draggable(false);
      runtime.group.listening(true);
      runtime.image.globalCompositeOperation(
        item.blendMode === 'normal' ? 'source-over' : (item.blendMode as Konva.ImageConfig['globalCompositeOperation']),
      );
    }
  }

  private isTimeVisible(layer: Layer): boolean {
    if (!store.timeFilter) return true;
    return store.currentTime + 0.001 >= layer.start && store.currentTime <= layer.start + layer.duration + 0.001;
  }

  private layerLocalTime(layer: Layer): number {
    const relative = store.currentTime - layer.start;
    if (relative >= 0 && relative <= layer.duration) return relative;
    return Math.min(1.05, Math.max(0.22, layer.duration * 0.28));
  }

  private paintContent(layer: Layer, content: HTMLCanvasElement, time: number): void {
    const ctx = content.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, layer.width, layer.height);

    const asset = assetRegistry.get(layer.assetId);
    if (asset) {
      ctx.drawImage(asset, 0, 0, layer.width, layer.height);
      return;
    }

    if (layer.texture === 'bg-front') {
      paintBackdrop(content, false);
      return;
    }
    if (layer.texture === 'bg-side') {
      paintBackdrop(content, true);
      return;
    }
    if (layer.texture.startsWith('fx-')) {
      paintEffectFrame(ctx, layer, time);
    } else {
      // Defensive fallback for an imported asset id that did not survive memory.
      const procedural = createProceduralCanvas(layer);
      ctx.drawImage(procedural, 0, 0);
    }
  }

  private composite(layer: Layer, runtime: RuntimeNode): void {
    const ctx = runtime.output.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, layer.width, layer.height);
    ctx.drawImage(runtime.content, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(runtime.mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  private paintLayerAtDesignTime(layer: Layer): void {
    const runtime = this.nodes.get(layer.id);
    if (!runtime) return;
    this.paintContent(layer, runtime.content, this.layerLocalTime(layer));
    this.composite(layer, runtime);
    runtime.image.image(runtime.output);
  }

  private renderAtCurrentTime(): void {
    for (const layer of store.project.layers) {
      const runtime = this.nodes.get(layer.id);
      if (!runtime || !layer.visible) continue;
      runtime.group.visible(this.isTimeVisible(layer));
      if (!this.isTimeVisible(layer)) continue;
      if (layer.texture.startsWith('fx-')) {
        this.paintContent(layer, runtime.content, this.layerLocalTime(layer));
        this.composite(layer, runtime);
        runtime.image.image(runtime.output);
      }
    }
    this.fxLayer.batchDraw();
  }

  /* ------------------------------------------------------------------ */
  /* Mask strokes                                                        */
  /* ------------------------------------------------------------------ */

  private rasterizeMask(layer: Layer, runtime?: RuntimeNode): void {
    const node = runtime ?? this.nodes.get(layer.id);
    if (!node) return;
    const ctx = node.mask.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, layer.width, layer.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, layer.width, layer.height);

    for (const stroke of layer.strokes) {
      for (let i = 1; i < stroke.points.length; i += 1) {
        this.paintBrushSegment(ctx, stroke, stroke.points[i - 1], stroke.points[i]);
      }
      if (stroke.points.length === 1) this.paintBrushDab(ctx, stroke, stroke.points[0]);
    }
  }

  private configureBrushContext(ctx: CanvasRenderingContext2D, stroke: MaskStroke): void {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke.size;
    if (stroke.mode === 'hide') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = `rgba(0,0,0,${stroke.opacity})`;
      ctx.fillStyle = `rgba(0,0,0,${stroke.opacity})`;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = `rgba(255,255,255,${stroke.opacity})`;
      ctx.fillStyle = `rgba(255,255,255,${stroke.opacity})`;
    }
  }

  private paintBrushSegment(
    ctx: CanvasRenderingContext2D,
    stroke: MaskStroke,
    from: Point,
    to: Point,
  ): void {
    // A single round line is fast and gives predictable per-stroke opacity.
    ctx.save();
    this.configureBrushContext(ctx, stroke);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    // Softer brushes receive a low-alpha wide envelope in the same stroke pass.
    if (stroke.hardness < 0.72) {
      const softness = 1 - stroke.hardness;
      ctx.lineWidth = stroke.size * (1.05 + softness * 0.55);
      ctx.globalAlpha = 0.16 * softness;
      ctx.stroke();
    }
    ctx.restore();
  }

  private paintBrushDab(ctx: CanvasRenderingContext2D, stroke: MaskStroke, point: Point): void {
    ctx.save();
    this.configureBrushContext(ctx, stroke);
    ctx.beginPath();
    ctx.arc(point.x, point.y, stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
    if (stroke.hardness < 0.72) {
      const softness = 1 - stroke.hardness;
      ctx.globalAlpha = 0.12 * softness;
      ctx.beginPath();
      ctx.arc(point.x, point.y, stroke.size * (0.58 + softness * 0.28), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private pointerToLayerPoint(layer: Layer, group: Konva.Group): Point | null {
    const stagePoint = this.stage.getPointerPosition();
    if (!stagePoint) return null;
    const transform = group.getAbsoluteTransform().copy();
    transform.invert();
    const local = transform.point(stagePoint);
    return { x: local.x + layer.width / 2, y: local.y + layer.height / 2 };
  }

  private startBrushStroke(): void {
    const layer = store.activeLayer;
    if (!layer || store.selectedLayers.length !== 1) {
      store.notify('请先在右侧或图层面板选择一个要画蒙版的层', 'error');
      return;
    }
    if (layer.locked) {
      store.notify('该层已锁定，请先解锁', 'error');
      return;
    }
    const runtime = this.nodes.get(layer.id);
    if (!runtime) return;
    const point = this.pointerToLayerPoint(layer, runtime.group);
    if (!point) return;

    store.setPlaying(false);
    const before = store.capture();
    const stroke: MaskStroke = {
      id: uid('stroke'),
      mode: store.brush.mode,
      size: store.brush.size,
      hardness: store.brush.hardness,
      opacity: store.brush.opacity,
      points: [point],
    };
    layer.strokes.push(stroke);
    this.brushGesture = { layerId: layer.id, before, stroke, last: point };

    const ctx = runtime.mask.getContext('2d');
    if (ctx) this.paintBrushDab(ctx, stroke, point);
    this.composite(layer, runtime);
    this.fxLayer.batchDraw();
  }

  private continueBrushStroke(): void {
    const gesture = this.brushGesture;
    if (!gesture) return;
    const layer = store.project.layers.find((item) => item.id === gesture.layerId);
    const runtime = this.nodes.get(gesture.layerId);
    if (!layer || !runtime) return;
    const point = this.pointerToLayerPoint(layer, runtime.group);
    if (!point) return;

    // Use the live stroke object from project, not the initial snapshot reference.
    const stroke = layer.strokes.find((item) => item.id === gesture.stroke.id) ?? gesture.stroke;
    const distance = Math.hypot(point.x - gesture.last.x, point.y - gesture.last.y);
    if (distance < 1.2) return;

    const ctx = runtime.mask.getContext('2d');
    if (ctx) this.paintBrushSegment(ctx, stroke, gesture.last, point);
    stroke.points.push(point);
    gesture.last = point;
    this.composite(layer, runtime);
    this.fxLayer.batchDraw();
  }

  private endBrushStroke(): void {
    const gesture = this.brushGesture;
    if (!gesture) return;
    const layer = store.project.layers.find((item) => item.id === gesture.layerId);
    if (layer) {
      const runtime = this.nodes.get(layer.id);
      if (runtime) {
        this.rasterizeMask(layer, runtime);
        this.composite(layer, runtime);
      }
      store.commitGesture('笔刷蒙版（按笔划撤销）', gesture.before);
    }
    this.brushGesture = null;
    this.fxLayer.batchDraw();
  }

  /* ------------------------------------------------------------------ */
  /* Selection, marquee, drag                                            */
  /* ------------------------------------------------------------------ */

  private findEffectGroup(target: Konva.Node | null | undefined): Konva.Group | null {
    let node: Konva.Node | null | undefined = target;
    while (node && node !== this.stage) {
      if (node instanceof Konva.Group && node.hasName('effect-layer')) return node;
      node = node.getParent();
    }
    return null;
  }

  private isTransformerTarget(target: Konva.Node | null | undefined): boolean {
    let node: Konva.Node | null | undefined = target;
    while (node) {
      if (node === this.transformer) return true;
      node = node.getParent();
    }
    return false;
  }

  private onPointerDown(event: any): void {
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return;
    if (this.isTransformerTarget(event.target)) return;

    if (store.tool === 'mask') {
      this.startBrushStroke();
      this.updateBrushCursor(pointer);
      return;
    }

    const group = this.findEffectGroup(event.target);
    if (group) {
      const id = group.id() as ID;
      const layer = store.project.layers.find((item) => item.id === id);
      if (layer && layer.kind !== 'background' && !layer.locked) return;
    }

    this.marqueeStart = pointer;
    this.marqueeMoved = false;
    this.marquee.position(pointer);
    this.marquee.size({ width: 1, height: 1 });
    this.marquee.visible(true);
  }

  private onPointerMove(_event: any): void {
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return;
    this.updateBrushCursor(pointer);

    if (this.moveGesture) {
      this.continueMoveGesture(pointer);
      return;
    }

    if (this.brushGesture) {
      this.continueBrushStroke();
      return;
    }

    if (this.marqueeStart) {
      const x = Math.min(this.marqueeStart.x, pointer.x);
      const y = Math.min(this.marqueeStart.y, pointer.y);
      const width = Math.abs(pointer.x - this.marqueeStart.x);
      const height = Math.abs(pointer.y - this.marqueeStart.y);
      if (width + height > 6) this.marqueeMoved = true;
      this.marquee.position({ x, y });
      this.marquee.size({ width, height });
      this.uiLayer.batchDraw();
    }
  }

  private onPointerUp(event: any): void {
    if (this.moveGesture) {
      this.endMoveGesture();
      return;
    }

    if (this.brushGesture) {
      this.endBrushStroke();
      return;
    }

    if (this.marqueeStart) {
      const box = this.marquee.getClientRect();
      this.marquee.visible(false);
      if (this.marqueeMoved && box.width > 4 && box.height > 4) {
        const hits: ID[] = [];
        for (const layer of store.project.layers) {
          if (!layer.visible || layer.locked) continue;
          const runtime = this.nodes.get(layer.id);
          if (!runtime || !runtime.group.visible()) continue;
          const rect = runtime.group.getClientRect({ skipShadow: true, relativeTo: this.stage });
          const intersects =
            rect.x < box.x + box.width &&
            rect.x + rect.width > box.x &&
            rect.y < box.y + box.height &&
            rect.y + rect.height > box.y;
          if (intersects) hits.push(layer.id);
        }
        if (hits.length > 0) {
          if (event?.evt?.shiftKey) store.select([...new Set([...store.selectedIds, ...hits])]);
          else store.select(hits);
        }
      } else if (!event?.evt?.shiftKey) {
        store.select([]);
      }
      this.marqueeStart = null;
      this.marqueeMoved = false;
      this.uiLayer.batchDraw();
    }
  }

  private bindGroupPointerEvents(group: Konva.Group): void {
    group.on('pointerdown', (event) => {
      if (store.tool !== 'select') return;
      const pointer = this.stage.getPointerPosition();
      if (!pointer) return;
      const id = group.id() as ID;
      const layer = store.project.layers.find((item) => item.id === id);
      // The full-canvas backdrop and locked layers must not swallow rubber-band starts.
      // They can still be selected from the layer list and adjusted in the inspector.
      if (!layer || layer.kind === 'background' || layer.locked) return;
      event.cancelBubble = true;

      if (event.evt?.shiftKey) store.select(id, true);
      else if (!store.selectedIds.includes(id)) store.select(id);

      if (!store.selectedIds.includes(id)) return;
      store.setPlaying(false);
      this.moveGesture = {
        before: store.capture(),
        startPointer: pointer,
        origins: store.selectedIds
          .map((selectedId) => {
            const selectedLayer = store.project.layers.find((item) => item.id === selectedId);
            return selectedLayer
              ? { id: selectedId, x: selectedLayer.x, y: selectedLayer.y }
              : null;
          })
          .filter((item): item is DragOrigin => Boolean(item)),
      };
    });
  }

  private continueMoveGesture(pointer: Point): void {
    const gesture = this.moveGesture;
    if (!gesture) return;
    const scale = this.viewScale();
    const dx = (pointer.x - gesture.startPointer.x) / scale;
    const dy = (pointer.y - gesture.startPointer.y) / scale;

    for (const origin of gesture.origins) {
      store.patchLayerLive(origin.id, {
        x: Math.round((origin.x + dx) * 100) / 100,
        y: Math.round((origin.y + dy) * 100) / 100,
      });
    }
  }

  private endMoveGesture(): void {
    const before = this.moveGesture?.before;
    this.moveGesture = null;
    if (before) store.commitGesture('移动选区 / 蒙版联动', before);
    store.emitChange();
  }

  private applyTool(): void {
    const brush = store.tool === 'mask';
    for (const layer of store.project.layers) {
      const runtime = this.nodes.get(layer.id);
      if (!runtime) continue;
      runtime.group.draggable(false);
    }
    this.host.style.cursor = brush ? 'none' : 'default';
    if (!brush) this.brushCursor.visible(false);
    this.updateBrushCursorStyle();
  }

  private syncSelection(): void {
    if (store.tool !== 'select') {
      this.transformer.nodes([]);
      this.transformer.visible(false);
      this.uiLayer.batchDraw();
      return;
    }
    const nodes = store.selectedIds
      .map((id) => this.nodes.get(id)?.group)
      .filter((node): node is Konva.Group => Boolean(node));
    const editable = nodes.filter((node) => {
      const layer = store.project.layers.find((item) => item.id === node.id());
      return layer && !layer.locked;
    });
    this.transformer.nodes(editable);
    this.transformer.visible(editable.length > 0);
    this.transformer.moveToTop();
    this.uiLayer.batchDraw();
  }

  private brushScreenRadius(): number {
    let absoluteScale = this.viewScale();
    const layer = store.activeLayer;
    const group = layer ? this.nodes.get(layer.id)?.group : undefined;
    if (group) {
      const scale = group.getAbsoluteScale();
      const average = (Math.abs(scale.x) + Math.abs(scale.y)) / 2;
      if (average > 0.001) absoluteScale = average;
    }
    return (store.brush.size / 2) * absoluteScale;
  }

  private updateBrushCursorStyle(): void {
    this.brushCursor.radius(this.brushScreenRadius());
    this.brushCursor.stroke(store.brush.mode === 'hide' ? '#67e8f9' : '#fbbf24');
    this.brushCursor.fill(store.brush.mode === 'hide' ? 'rgba(103,232,249,.05)' : 'rgba(251,191,36,.08)');
    this.uiLayer?.batchDraw();
  }

  private updateBrushCursor(pointer: Point): void {
    if (store.tool !== 'mask') {
      this.brushCursor.visible(false);
      return;
    }
    this.brushCursor.visible(true);
    this.brushCursor.position(pointer);
    this.brushCursor.radius(this.brushScreenRadius());
    this.uiLayer.batchDraw();
  }
}
