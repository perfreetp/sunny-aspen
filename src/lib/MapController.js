import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import {
  buildSpatialIndex,
  querySpatialIndex,
  queryIndexBounds,
  polygonBounds,
  polygonsIntersect,
  rectIntersectsSegment
} from './geo.js';
import { createTerrainCanvas } from './terrain.js';
import { WORLD } from './sampleProject.js';

const UNIT_BOUNDARY_SCALE = 1.05;
const UNIT_LABEL_SCALE = 1.75;
const PERIOD_SUBLABEL_SCALE = 3.1;

function colorToNumber(color) {
  if (typeof color === 'number') return color;
  const hex = color.replace('#', '');
  return parseInt(hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex, 16);
}

export class MapController {
  constructor(host, options = {}) {
    this.host = host;
    this.options = options;
    this.role = options.role || 'mapper';
    this.project = options.project;
    this.settings = options.settings || {};
    this.peerSelections = [];
    this.comparisonZones = [];
    this.alertIds = new Set();
    this.index = null;
    this.unitById = new Map();
    this.periodGraphics = new Map();
    this.destroyed = false;
    this.frameHandle = 0;
    this.labelContext = document.createElement('canvas').getContext('2d');
    this.pointer = {
      down: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      x: 0,
      y: 0,
      worldX: 0,
      worldY: 0,
      moved: false,
      dragHandle: -1
    };
    this.draftPoints = [];
    this.lastHoverKey = '';
    this.boundCanvasPointerDown = this.onPointerDown.bind(this);
    this.boundCanvasPointerMove = this.onPointerMove.bind(this);
    this.boundCanvasPointerUp = this.onPointerUp.bind(this);
    this.boundDoubleClick = this.onDoubleClick.bind(this);
    this.boundContextMenu = (event) => event.preventDefault();
  }

  async init() {
    this.app = new Application();
    await this.app.init({
      resizeTo: this.host,
      antialias: true,
      background: '#dfe8df',
      autoDensity: true,
      preserveDrawingBuffer: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2)
    });
    if (this.destroyed) return;
    this.host.appendChild(this.app.canvas);
    this.app.canvas.classList.add('volcano-pixi-canvas');

    this.viewport = new Viewport({
      screenWidth: this.host.clientWidth || 800,
      screenHeight: this.host.clientHeight || 600,
      worldWidth: WORLD.width,
      worldHeight: WORLD.height,
      events: this.app.renderer.events,
      passiveWheel: false
    });
    this.viewport.sortableChildren = true;
    this.app.stage.addChild(this.viewport);
    this.viewport
      .drag({ pressDrag: true })
      .pinch()
      .wheel({ percent: 0.72, smooth: 5, interrupt: true })
      .decelerate({ friction: 0.94 })
      .clamp({ direction: 'all' })
      .clampZoom({ minScale: 0.24, maxScale: 16 });

    this.createLayers();
    this.app.canvas.addEventListener('pointerdown', this.boundCanvasPointerDown);
    this.app.canvas.addEventListener('pointermove', this.boundCanvasPointerMove);
    this.app.canvas.addEventListener('pointerup', this.boundCanvasPointerUp);
    this.app.canvas.addEventListener('pointercancel', this.boundCanvasPointerUp);
    this.app.canvas.addEventListener('dblclick', this.boundDoubleClick);
    this.app.canvas.addEventListener('contextmenu', this.boundContextMenu);
    this.viewport.on('moved', () => this.scheduleFrame());

    if (this.project) this.setProject(this.project, { fit: true });
    this.scheduleFrame();
  }

  createLayers() {
    this.terrainSprite = new Sprite();
    this.terrainSprite.zIndex = 1;
    this.terrainSprite.width = WORLD.width;
    this.terrainSprite.height = WORLD.height;

    this.tephraFill = new Graphics();
    this.tephraFill.zIndex = 2;
    this.clastLayer = new Graphics();
    this.clastLayer.zIndex = 3;
    this.zoneLayer = new Graphics();
    this.zoneLayer.zIndex = 4;

    this.unitFillContainer = new Container();
    this.unitFillContainer.sortableChildren = true;
    this.unitFillContainer.zIndex = 5;
    for (const period of this.project?.periods || []) {
      const graphics = new Graphics();
      graphics.zIndex = 20 - period.order;
      graphics.label = `fill-${period.id}`;
      this.periodGraphics.set(period.id, graphics);
      this.unitFillContainer.addChild(graphics);
    }

    this.gullyLayer = new Graphics();
    this.gullyLayer.zIndex = 6;
    this.flowBoundaryLayer = new Graphics();
    this.flowBoundaryLayer.zIndex = 7;
    this.unitBoundaryLayer = new Graphics();
    this.unitBoundaryLayer.zIndex = 8;
    this.referenceLineLayer = new Graphics();
    this.referenceLineLayer.zIndex = 9;
    this.markerLayer = new Graphics();
    this.markerLayer.zIndex = 10;
    this.frontLayer = new Graphics();
    this.frontLayer.zIndex = 11;
    this.alertLayer = new Graphics();
    this.alertLayer.zIndex = 18;
    this.selectionLayer = new Graphics();
    this.selectionLayer.zIndex = 20;
    this.hoverLayer = new Graphics();
    this.hoverLayer.zIndex = 21;
    this.editLayer = new Graphics();
    this.editLayer.zIndex = 22;
    this.drawLayer = new Graphics();
    this.drawLayer.zIndex = 23;

    this.viewport.addChild(
      this.terrainSprite,
      this.tephraFill,
      this.clastLayer,
      this.zoneLayer,
      this.unitFillContainer,
      this.gullyLayer,
      this.flowBoundaryLayer,
      this.unitBoundaryLayer,
      this.referenceLineLayer,
      this.markerLayer,
      this.frontLayer,
      this.alertLayer,
      this.selectionLayer,
      this.hoverLayer,
      this.editLayer,
      this.drawLayer
    );
  }

  setProject(project, { fit = false } = {}) {
    this.project = project;
    // Svelte effects can observe reloadToken between constructor and the
    // asynchronous Application initialization; init() performs the first draw.
    if (!this.viewport || !this.terrainSprite) return;
    this.unitById = new Map(project.units.map((unit) => [unit.id, unit]));
    this.index = buildSpatialIndex(project.units, 170);
    this.draftPoints = [];
    this.rebuildTerrain();
    this.rebuildTephraAndClasts();
    this.rebuildUnitFills();
    this.applyLayerVisibility();
    if (this.comparisonZones.length) this.setComparisonZones(this.comparisonZones);
    if (fit) this.fitWorld(false);
    this.scheduleFrame();
  }

  rebuildIndex() {
    if (this.project) this.index = buildSpatialIndex(this.project.units, 170);
  }

  rebuildTerrain() {
    if (this.terrainTexture) {
      this.terrainTexture.destroy(false);
      this.terrainTexture = null;
    }
    const terrain = this.project.terrain || { kind: 'procedural-dem' };
    if (terrain.kind === 'image' && terrain.dataUrl) {
      const image = new Image();
      image.onload = () => {
        if (this.destroyed) return;
        this.terrainTexture = Texture.from(image);
        this.terrainSprite.texture = this.terrainTexture;
        this.terrainSprite.width = WORLD.width;
        this.terrainSprite.height = WORLD.height;
      };
      image.src = terrain.dataUrl;
    } else {
      this.terrainTexture = Texture.from(createTerrainCanvas());
      this.terrainSprite.texture = this.terrainTexture;
      this.terrainSprite.width = WORLD.width;
      this.terrainSprite.height = WORLD.height;
    }
    this.terrainSprite.alpha = terrain.opacity ?? 1;
  }

  refreshTerrain() {
    this.rebuildTerrain();
  }

  rebuildTephraAndClasts() {
    const t = this.project.tephra;
    this.tephraFill.clear();
    if (t?.ring?.length) {
      this.drawRingPath(this.tephraFill, t.ring);
      this.tephraFill.fill({ color: '#8d8178', alpha: 0.24 });
    }

    this.clastLayer.clear();
    const clasts = this.project.clasts;
    if (clasts?.length) {
      for (let i = 0; i < clasts.length; i += 4) {
        const size = clasts[i + 2];
        this.clastLayer.rect(clasts[i], clasts[i + 1], size, size);
      }
      this.clastLayer.fill({ color: '#5f574f', alpha: 0.34 });
    }
  }

  rebuildUnitFills(onlyPeriodId = null) {
    for (const period of this.project.periods) {
      if (onlyPeriodId && period.id !== onlyPeriodId) continue;
      const graphics = this.periodGraphics.get(period.id);
      if (!graphics) continue;
      graphics.clear();
      const units = this.project.units;
      for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        if (unit.periodId !== period.id) continue;
        this.drawRingPath(graphics, unit.ring);
      }
      graphics.fill({ color: colorToNumber(period.color), alpha: 0.76 });
      graphics.visible = this.isPeriodVisible(period.id);
    }
  }

  redrawPeriodFill(periodId) {
    this.rebuildUnitFills(periodId);
  }

  drawRingPath(graphics, ring) {
    if (!ring?.length) return;
    graphics.moveTo(ring[0][0], ring[0][1]);
    for (let i = 1; i < ring.length; i++) graphics.lineTo(ring[i][0], ring[i][1]);
    graphics.closePath();
  }

  updateSettings(settings) {
    this.settings = settings || {};
    if (!this.viewport || !this.clastLayer) return;
    this.applyLayerVisibility();
    for (const period of this.project?.periods || []) {
      const graphics = this.periodGraphics.get(period.id);
      if (graphics) graphics.visible = this.isPeriodVisible(period.id);
    }
    this.scheduleFrame();
  }

  applyLayerVisibility() {
    const layers = this.settings.layers || {};
    if (!this.terrainSprite) return;
    this.terrainSprite.visible = layers.terrain !== false;
    this.tephraFill.visible = layers.tephra !== false;
    this.clastLayer.visible = layers.clasts !== false;
    this.unitFillContainer.visible = layers.units !== false;
    this.gullyLayer.visible = layers.gullies !== false;
    this.flowBoundaryLayer.visible = layers.periodBoundaries !== false && layers.flows !== false;
    this.unitBoundaryLayer.visible = layers.boundaries !== false;
    this.referenceLineLayer.visible = layers.cone !== false || layers.tephra !== false;
    this.markerLayer.visible = layers.villages !== false;
    this.frontLayer.visible = layers.fronts !== false;
    this.zoneLayer.visible = layers.refuges !== false;
  }

  isPeriodVisible(periodId) {
    const settings = this.settings || {};
    if (settings.hiddenPeriodIds?.includes(periodId)) return false;
    if (settings.onlyPeriod && settings.periodId && settings.periodId !== 'all' && periodId !== settings.periodId) {
      return false;
    }
    return true;
  }

  setPeerSelections(selections) {
    this.peerSelections = selections || [];
    this.scheduleFrame();
  }

  getOwnSelectionIds() {
    return this.peerSelections.find((p) => p.role === this.role)?.ids || [];
  }

  setComparisonZones(zones) {
    this.comparisonZones = zones || [];
    this.alertIds = new Set();
    for (const zone of this.comparisonZones) {
      if (!zone.ring?.length || !this.index) continue;
      const bounds = polygonBounds(zone.ring);
      const candidateIndexes = queryIndexBounds(this.index, bounds);
      for (const index of candidateIndexes) {
        const unit = this.project.units[index];
        if (!this.isPeriodVisible(unit.periodId)) continue;
        if (polygonsIntersect(unit.ring, zone.ring)) this.alertIds.add(unit.id);
      }
    }
    this.options.onComparisonChange?.({ ids: [...this.alertIds], zones: this.comparisonZones });
    this.scheduleFrame();
    return [...this.alertIds];
  }

  getScale() {
    return this.viewport?.scale?.x || 1;
  }

  getViewBounds(padding = 0) {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    const tl = this.viewport.toWorld(-padding, -padding);
    const br = this.viewport.toWorld(width + padding, height + padding);
    return {
      minX: Math.min(tl.x, br.x),
      minY: Math.min(tl.y, br.y),
      maxX: Math.max(tl.x, br.x),
      maxY: Math.max(tl.y, br.y)
    };
  }

  getVisibleUnitIndexes(padding = 80) {
    if (!this.index) return [];
    const bounds = this.getViewBounds(padding);
    return queryIndexBounds(this.index, bounds);
  }

  pickUnit(screenX, screenY) {
    const world = this.viewport.toWorld(screenX, screenY);
    const candidates = querySpatialIndex(this.index, world.x, world.y);
    const sorted = candidates
      .map((index) => ({ index, unit: this.project.units[index] }))
      .filter(({ unit }) => this.isPeriodVisible(unit.periodId))
      .sort((a, b) => {
        const pa = this.project.periods.findIndex((p) => p.id === a.unit.periodId);
        const pb = this.project.periods.findIndex((p) => p.id === b.unit.periodId);
        if (pa !== pb) return pa - pb; // newest period first
        return b.index - a.index;
      });
    for (const item of sorted) {
      const ring = item.unit.ring;
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];
        const intersects =
          yi > world.y !== yj > world.y &&
          world.x < ((xj - xi) * (world.y - yi)) / (yj - yi || Number.EPSILON) + xi;
        if (intersects) inside = !inside;
      }
      if (inside) return item.unit;
    }
    return null;
  }

  eventPoint(event) {
    const rect = this.app.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  onPointerDown(event) {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    this.options.onActivate?.();
    const p = this.eventPoint(event);
    const world = this.viewport.toWorld(p.x, p.y);
    this.pointer.down = true;
    this.pointer.pointerId = event.pointerId;
    this.pointer.startX = p.x;
    this.pointer.startY = p.y;
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    this.pointer.worldX = world.x;
    this.pointer.worldY = world.y;
    this.pointer.moved = false;
    this.pointer.dragHandle = -1;
    this.app.canvas.setPointerCapture?.(event.pointerId);

    if (this.options.tool === 'edit') {
      this.pointer.dragHandle = this.findEditHandle(world);
      if (this.pointer.dragHandle >= 0) {
        this.viewport.plugins.pause('drag');
        this.viewport.plugins.pause('pinch');
        this.app.canvas.style.cursor = 'grabbing';
      }
    }
  }

  onPointerMove(event) {
    const p = this.eventPoint(event);
    const world = this.viewport.toWorld(p.x, p.y);
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    this.pointer.worldX = world.x;
    this.pointer.worldY = world.y;
    if (this.pointer.down && Math.hypot(p.x - this.pointer.startX, p.y - this.pointer.startY) > 5) {
      this.pointer.moved = true;
    }

    if (this.pointer.dragHandle >= 0 && this.pointer.down) {
      const unit = this.getEditingUnit();
      if (unit) {
        unit.ring[this.pointer.dragHandle] = [world.x, world.y];
        unit.bounds = polygonBounds(unit.ring);
        unit.centroid = [
          (unit.bounds.minX + unit.bounds.maxX) / 2,
          (unit.bounds.minY + unit.bounds.maxY) / 2
        ];
        let front = unit.ring[0];
        let best = -Infinity;
        for (const point of unit.ring) {
          const score = Math.hypot(point[0] - 1280, point[1] - 760);
          if (score > best) {
            best = score;
            front = point;
          }
        }
        unit.front = front;
        this.redrawPeriodFill(unit.periodId);
        this.scheduleFrame();
      }
      return;
    }

    if (this.options.tool === 'edit') {
      const handle = this.findEditHandle(world);
      this.app.canvas.style.cursor = handle >= 0 ? 'grab' : this.pointer.moved ? 'grabbing' : 'crosshair';
    } else if (this.options.tool === 'draw') {
      this.app.canvas.style.cursor = 'crosshair';
      this.scheduleFrame();
    } else {
      const unit = this.pickUnit(p.x, p.y);
      this.app.canvas.style.cursor = unit ? 'pointer' : this.pointer.down ? 'grabbing' : 'grab';
      const key = unit?.id || `${Math.round(world.x / 24)},${Math.round(world.y / 24)}`;
      if (unit || key !== this.lastHoverKey) {
        this.lastHoverKey = key;
        this.options.onHover?.(
          unit
            ? {
                unit,
                x: p.x,
                y: p.y,
                worldX: world.x,
                worldY: world.y,
                period: this.project.periods.find((period) => period.id === unit.periodId),
                gully: this.project.gullies.find((g) => g.id === unit.gullyId)
              }
            : null
        );
        this.hoverLayer.clear();
        if (unit) this.drawUnitHighlight(this.hoverLayer, unit, 0xfde047, 2.2, 0.18);
      }
    }
  }

  onPointerUp(event) {
    if (!this.pointer.down) return;
    const p = this.eventPoint(event);
    const wasHandle = this.pointer.dragHandle >= 0;
    if (wasHandle) {
      const unit = this.getEditingUnit();
      this.viewport.plugins.resume('drag');
      this.viewport.plugins.resume('pinch');
      this.rebuildIndex();
      if (unit) this.options.onCommitEdit?.(unit);
    } else if (!this.pointer.moved) {
      if (this.options.tool === 'draw') {
        this.draftPoints.push([this.pointer.worldX, this.pointer.worldY]);
        this.scheduleFrame();
      } else {
        const unit = this.pickUnit(p.x, p.y);
        if (unit) {
          const ownIds = this.getOwnSelectionIds();
          let nextIds;
          if (event.shiftKey || event.ctrlKey || event.metaKey) {
            nextIds = ownIds.includes(unit.id) ? ownIds.filter((id) => id !== unit.id) : [...ownIds, unit.id];
          } else {
            nextIds = ownIds.length === 1 && ownIds[0] === unit.id ? [] : [unit.id];
          }
          this.options.onSelectionChange?.(nextIds);
        } else if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
          this.options.onSelectionChange?.([]);
        }
      }
    }
    this.pointer.down = false;
    this.pointer.pointerId = null;
    this.pointer.dragHandle = -1;
    try {
      this.app.canvas.releasePointerCapture?.(event.pointerId);
    } catch {
      // pointer capture may already be released
    }
    this.scheduleFrame();
  }

  onDoubleClick(event) {
    if (this.options.tool !== 'draw') return;
    event.preventDefault();
    event.stopPropagation();
    if (this.draftPoints.length >= 3) this.finishDrawing();
  }

  finishDrawing() {
    if (this.draftPoints.length < 3) return;
    const ring = this.draftPoints.map((p) => [...p]);
    this.draftPoints = [];
    this.options.onCreateZone?.(ring);
    this.scheduleFrame();
  }

  cancelDrawing() {
    this.draftPoints = [];
    this.scheduleFrame();
  }

  getEditingUnit() {
    if (this.options.tool !== 'edit') return null;
    const ids = this.getOwnSelectionIds();
    return ids.length === 1 ? this.unitById.get(ids[0]) : null;
  }

  findEditHandle(world) {
    const unit = this.getEditingUnit();
    if (!unit) return -1;
    const threshold = 13 / this.getScale();
    let bestIndex = -1;
    let bestDistance = threshold;
    unit.ring.forEach((point, index) => {
      const distance = Math.hypot(point[0] - world.x, point[1] - world.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  drawUnitHighlight(graphics, unit, color, widthMultiplier = 2, fillAlpha = 0.15) {
    graphics.clear();
    this.drawRingPath(graphics, unit.ring);
    graphics.fill({ color, alpha: fillAlpha });
    graphics.stroke({
      color,
      width: widthMultiplier / this.getScale(),
      alpha: 0.95,
      join: 'round',
      cap: 'round'
    });
  }

  scheduleFrame() {
    if (this.destroyed || this.frameHandle) return;
    this.frameHandle = requestAnimationFrame(() => {
      this.frameHandle = 0;
      if (this.destroyed || !this.viewport || !this.clastLayer) return;
      this.redrawDynamic();
      this.emitLabels();
      this.options.onViewChange?.(this.getViewState());
    });
  }

  getViewState() {
    return {
      role: this.role,
      scale: this.getScale(),
      bounds: this.getViewBounds(),
      center: { x: this.viewport.center.x, y: this.viewport.center.y }
    };
  }

  redrawDynamic() {
    if (!this.project) return;
    const scale = this.getScale();
    this.clastLayer.visible = (this.settings.layers?.clasts !== false) && scale > 0.42;
    this.redrawTephraLines(scale);
    this.redrawGullies(scale);
    this.redrawFlowBoundaries(scale);
    this.redrawUnitBoundaries(scale);
    this.redrawZones(scale);
    this.redrawFronts(scale);
    this.redrawMarkers(scale);
    this.redrawAlerts(scale);
    this.redrawSelections(scale);
    this.redrawEditHandles(scale);
    this.redrawDraft(scale);
  }

  redrawTephraLines(scale) {
    const layer = this.referenceLineLayer;
    layer.clear();
    if (this.settings.layers?.tephra !== false && this.project.tephra?.ring) {
      this.drawRingPath(layer, this.project.tephra.ring);
      layer.stroke({ color: '#75665b', width: 1.2 / scale, alpha: 0.72, join: 'round' });
    }
    if (this.settings.layers?.cone !== false && this.project.cone?.ring) {
      this.drawRingPath(layer, this.project.cone.ring);
      layer.stroke({ color: '#f8fafc', width: 4.2 / scale, alpha: 0.3, join: 'round' });
      this.drawRingPath(layer, this.project.cone.ring);
      layer.stroke({ color: '#3f3028', width: 2.1 / scale, alpha: 0.96, join: 'round' });
    }
  }

  redrawGullies(scale) {
    const layer = this.gullyLayer;
    layer.clear();
    if (this.settings.layers?.gullies === false) return;
    for (const gully of this.project.gullies) {
      layer.moveTo(gully.path[0][0], gully.path[0][1]);
      for (let i = 1; i < gully.path.length; i++) layer.lineTo(gully.path[i][0], gully.path[i][1]);
      layer.stroke({ color: '#2563eb', width: 2.2 / scale, alpha: 0.62, cap: 'round', join: 'round' });
      layer.moveTo(gully.mouth[0], gully.mouth[1]);
      layer.circle(gully.mouth[0], gully.mouth[1], 5 / scale);
      layer.fill({ color: '#1d4ed8', alpha: 0.9 });
      layer.stroke({ color: '#ffffff', width: 1.4 / scale, alpha: 0.9 });
    }
  }

  redrawFlowBoundaries(scale) {
    const layer = this.flowBoundaryLayer;
    layer.clear();
    if (this.settings.layers?.periodBoundaries === false) return;
    for (const flow of this.project.flows) {
      if (!this.isPeriodVisible(flow.periodId)) continue;
      const period = this.project.periods.find((p) => p.id === flow.periodId);
      this.drawRingPath(layer, flow.ring);
      layer.stroke({
        color: period?.color || '#334155',
        width: 2.8 / scale,
        alpha: 0.5,
        join: 'round'
      });
      this.drawRingPath(layer, flow.ring);
      layer.stroke({
        color: '#172033',
        width: 1.05 / scale,
        alpha: 0.86,
        join: 'round'
      });
    }
  }

  redrawUnitBoundaries(scale) {
    const layer = this.unitBoundaryLayer;
    layer.clear();
    if (this.settings.layers?.boundaries === false || scale < UNIT_BOUNDARY_SCALE) return;
    const indexes = this.getVisibleUnitIndexes(140);
    for (const index of indexes) {
      const unit = this.project.units[index];
      if (!this.isPeriodVisible(unit.periodId)) continue;
      this.drawRingPath(layer, unit.ring);
    }
    layer.stroke({ color: '#172033', width: 0.85 / scale, alpha: 0.72, join: 'round', cap: 'round' });
  }

  redrawZones(scale) {
    const layer = this.zoneLayer;
    layer.clear();
    if (this.settings.layers?.refuges === false) return;
    for (const zone of this.comparisonZones) {
      if (!zone.ring?.length) continue;
      this.drawRingPath(layer, zone.ring);
      layer.fill({ color: zone.color || '#7c3aed', alpha: zone.kind === 'custom' ? 0.2 : 0.13 });
      layer.stroke({
        color: zone.color || '#7c3aed',
        width: (zone.kind === 'custom' ? 2.4 : 2) / scale,
        alpha: 0.95,
        join: 'round',
        dash: zone.kind === 'builtin' ? [10 / scale, 7 / scale] : undefined
      });
    }
  }

  redrawFronts(scale) {
    const layer = this.frontLayer;
    layer.clear();
    if (this.settings.layers?.fronts === false || scale < 1.15) return;
    const indexes = this.getVisibleUnitIndexes(160);
    for (const index of indexes) {
      const unit = this.project.units[index];
      if (!this.isPeriodVisible(unit.periodId)) continue;
      layer.circle(unit.front[0], unit.front[1], 2.1 / scale);
      layer.fill({ color: '#111827', alpha: 0.72 });
    }
  }

  redrawMarkers(scale) {
    const layer = this.markerLayer;
    layer.clear();
    if (this.settings.layers?.villages === false) return;
    for (const village of this.project.villages) {
      layer.circle(village.x, village.y, 5.5 / scale);
      layer.fill({ color: '#ffffff', alpha: 0.96 });
      layer.stroke({ color: '#be123c', width: 2 / scale, alpha: 1 });
      layer.rect(village.x - 3 / scale, village.y - 3 / scale, 6 / scale, 6 / scale);
      layer.fill({ color: '#be123c', alpha: 1 });
    }
  }

  redrawAlerts(scale) {
    const layer = this.alertLayer;
    layer.clear();
    if (!this.alertIds.size) return;
    for (const id of this.alertIds) {
      const unit = this.unitById.get(id);
      if (!unit) continue;
      this.drawRingPath(layer, unit.ring);
    }
    layer.fill({ color: '#f59e0b', alpha: 0.22 });
    layer.stroke({ color: '#b45309', width: 1.8 / scale, alpha: 0.9 });
  }

  redrawSelections(scale) {
    const layer = this.selectionLayer;
    layer.clear();
    for (const peer of this.peerSelections) {
      for (const id of peer.ids || []) {
        const unit = this.unitById.get(id);
        if (!unit) continue;
        this.drawRingPath(layer, unit.ring);
        layer.fill({ color: peer.color, alpha: 0.16 });
        layer.stroke({ color: peer.color, width: 3.2 / scale, alpha: 0.5, join: 'round' });
        this.drawRingPath(layer, unit.ring);
        layer.stroke({ color: peer.color, width: 1.7 / scale, alpha: 1, join: 'round' });
      }
    }
  }

  redrawEditHandles(scale) {
    const layer = this.editLayer;
    layer.clear();
    const unit = this.getEditingUnit();
    if (!unit || this.options.tool !== 'edit') return;
    const size = 9 / scale;
    for (const [x, y] of unit.ring) {
      layer.rect(x - size / 2, y - size / 2, size, size);
      layer.fill({ color: '#ffffff', alpha: 1 });
      layer.stroke({ color: '#0891b2', width: 2 / scale });
    }
  }

  redrawDraft(scale) {
    const layer = this.drawLayer;
    layer.clear();
    if (this.options.tool !== 'draw') return;
    if (this.draftPoints.length) {
      layer.moveTo(this.draftPoints[0][0], this.draftPoints[0][1]);
      for (let i = 1; i < this.draftPoints.length; i++) layer.lineTo(this.draftPoints[i][0], this.draftPoints[i][1]);
      if (this.pointer.down || this.draftPoints.length > 1) layer.lineTo(this.pointer.worldX, this.pointer.worldY);
      layer.stroke({ color: '#7c3aed', width: 2 / scale, dash: [8 / scale, 6 / scale] });
      for (const [x, y] of this.draftPoints) {
        layer.circle(x, y, 4.5 / scale);
        layer.fill({ color: '#ffffff' });
        layer.stroke({ color: '#7c3aed', width: 1.6 / scale });
      }
    }
  }

  measureLabel(text, subtext = '') {
    const ctx = this.labelContext;
    ctx.font = '700 11px "Segoe UI", "Microsoft YaHei", sans-serif';
    const mainWidth = ctx.measureText(text).width;
    let subWidth = 0;
    if (subtext) {
      ctx.font = '600 9px "Segoe UI", "Microsoft YaHei", sans-serif';
      subWidth = ctx.measureText(subtext).width;
    }
    return { width: Math.max(mainWidth, subWidth) + 16, height: subtext ? 31 : 20 };
  }

  emitLabels() {
    if (!this.options.onLabels) return;
    const layers = this.settings.layers || {};
    if (layers.labels === false) {
      this.options.onLabels([]);
      return;
    }
    const scale = this.getScale();
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    const labels = [];
    const occupied = [];
    const occupies = (rect) => {
      for (const other of occupied) {
        if (
          Math.abs(rect.x - other.x) * 2 < rect.width + other.width &&
          Math.abs(rect.y - other.y) * 2 < rect.height + other.height
        ) {
          return true;
        }
      }
      occupied.push(rect);
      return false;
    };

    const addMajor = (x, y, text, kind, color, subtext = '', offsetY = 0) => {
      const screen = this.viewport.toScreen(x, y);
      const rect = { x: screen.x, y: screen.y + offsetY, width: this.measureLabel(text, subtext).width + 8, height: 22 };
      if (rect.x < -80 || rect.x > width + 80 || rect.y < -40 || rect.y > height + 40) return;
      if (!occupies(rect)) {
        labels.push({ id: `major-${kind}-${text}`, x: rect.x, y: rect.y, text, subtext, kind, color });
      }
    };

    if (layers.cone !== false) addMajor(1280, 470, '火山锥轮廓', 'cone', '#3f3028');
    if (layers.gullies !== false) {
      for (const gully of this.project.gullies) {
        const p = gully.path[42] || gully.path[Math.floor(gully.path.length / 2)];
        addMajor(p[0], p[1], gully.name, 'gully', '#1d4ed8');
      }
    }
    if (layers.villages !== false) {
      for (const village of this.project.villages) {
        addMajor(village.x, village.y, village.name, 'village', '#be123c', '', -18);
      }
    }

    if (scale < UNIT_LABEL_SCALE) {
      this.options.onLabels(labels);
      return;
    }

    const indexes = this.getVisibleUnitIndexes(40);
    const showPeriod = scale >= PERIOD_SUBLABEL_SCALE;
    const candidates = indexes
      .map((index) => this.project.units[index])
      .filter((unit) => this.isPeriodVisible(unit.periodId))
      .map((unit) => {
        const b = unit.bounds;
        const p1 = this.viewport.toScreen(b.minX, b.minY);
        const p2 = this.viewport.toScreen(b.maxX, b.maxY);
        return { unit, screenWidth: Math.abs(p2.x - p1.x), screenHeight: Math.abs(p2.y - p1.y) };
      })
      .filter((item) => item.screenWidth > 24 && item.screenHeight > 16)
      .sort((a, b) => b.screenWidth * b.screenHeight - a.screenWidth * a.screenHeight);

    for (const { unit } of candidates) {
      const period = this.project.periods.find((p) => p.id === unit.periodId);
      const subtext = showPeriod ? period.short : '';
      const size = this.measureLabel(unit.code, subtext);
      const screen = this.viewport.toScreen(unit.centroid[0], unit.centroid[1]);
      const rect = { x: screen.x, y: screen.y, ...size };
      if (rect.x - rect.width / 2 < 4 || rect.x + rect.width / 2 > width - 4) continue;
      if (rect.y - rect.height / 2 < 4 || rect.y + rect.height / 2 > height - 4) continue;
      if (size.width + 5 > this.screenRingWidth(unit.ring) || size.height + 3 > this.screenRingHeight(unit.ring)) continue;
      if (this.labelCrossesBoundaries(rect)) continue;
      if (occupies(rect)) continue;
      labels.push({
        id: unit.id,
        x: rect.x,
        y: rect.y,
        text: unit.code,
        subtext,
        kind: 'unit',
        color: period.color
      });
      if (labels.length > 260) break;
    }
    this.options.onLabels(labels);
  }

  screenRingWidth(ring) {
    const xs = ring.map((p) => this.viewport.toScreen(p[0], p[1]).x);
    return Math.max(...xs) - Math.min(...xs);
  }

  screenRingHeight(ring) {
    const ys = ring.map((p) => this.viewport.toScreen(p[0], p[1]).y);
    return Math.max(...ys) - Math.min(...ys);
  }

  labelCrossesBoundaries(rect) {
    const testRect = { x: rect.x, y: rect.y, width: rect.width + 5, height: rect.height + 3 };
    const leftTop = this.viewport.toWorld(rect.x - rect.width / 2 - 6, rect.y - rect.height / 2 - 6);
    const rightBottom = this.viewport.toWorld(rect.x + rect.width / 2 + 6, rect.y + rect.height / 2 + 6);
    const indexes = queryIndexBounds(this.index, {
      minX: Math.min(leftTop.x, rightBottom.x),
      maxX: Math.max(leftTop.x, rightBottom.x),
      minY: Math.min(leftTop.y, rightBottom.y),
      maxY: Math.max(leftTop.y, rightBottom.y)
    });
    let checked = 0;
    for (const index of indexes) {
      if (checked++ > 220) break;
      const unit = this.project.units[index];
      if (!this.isPeriodVisible(unit.periodId)) continue;
      const screenPoints = unit.ring.map(([x, y]) => {
        const point = this.viewport.toScreen(x, y);
        return [point.x, point.y];
      });
      for (let i = 0; i < screenPoints.length; i++) {
        if (rectIntersectsSegment(testRect, screenPoints[i], screenPoints[(i + 1) % screenPoints.length])) return true;
      }
    }
    return false;
  }

  labelCrossesRing(ring, rect) {
    const screenPoints = ring.map(([x, y]) => {
      const p = this.viewport.toScreen(x, y);
      return [p.x, p.y];
    });
    for (let i = 0; i < screenPoints.length; i++) {
      if (rectIntersectsSegment(rect, screenPoints[i], screenPoints[(i + 1) % screenPoints.length])) return true;
    }
    return false;
  }

  getVisibleUnits() {
    const indexes = this.getVisibleUnitIndexes(0);
    const units = indexes
      .map((index) => this.project.units[index])
      .filter((unit) => this.isPeriodVisible(unit.periodId));
    return {
      role: this.role,
      scale: this.getScale(),
      bounds: this.getViewBounds(),
      units
    };
  }

  fitWorld(animate = true) {
    if (!this.viewport) return;
    if (animate) this.viewport.animate({ time: 350, scale: this.viewport.findFit?.(WORLD.width, WORLD.height) || 0.45, position: { x: WORLD.width / 2, y: WORLD.height / 2 } });
    else this.viewport.fitWorld(true);
    this.scheduleFrame();
  }

  zoomIn() {
    this.viewport.zoomPercent(0.28, true);
    this.scheduleFrame();
  }

  zoomOut() {
    this.viewport.zoomPercent(-0.2, true);
    this.scheduleFrame();
  }

  flyToBounds(bounds, maxScale = 5) {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    const padding = 90;
    const scale = Math.min(
      maxScale,
      (width - padding * 2) / Math.max(1, bounds.maxX - bounds.minX),
      (height - padding * 2) / Math.max(1, bounds.maxY - bounds.minY)
    );
    this.viewport.animate({
      time: 520,
      position: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
      scale: Math.max(0.35, scale)
    });
    this.scheduleFrame();
  }

  flyToUnit(id) {
    const unit = this.unitById.get(id);
    if (unit) this.flyToBounds(unit.bounds, 7);
  }

  flyToFront(id) {
    const unit = this.unitById.get(id);
    if (unit) {
      const [x, y] = unit.front;
      this.viewport.animate({ time: 520, position: { x, y }, scale: 4.2 });
      this.scheduleFrame();
    }
  }

  flyToMouth(gullyId) {
    const gully = this.project.gullies.find((g) => g.id === gullyId);
    if (gully) {
      this.viewport.animate({ time: 650, position: { x: gully.mouth[0], y: gully.mouth[1] }, scale: 3.4 });
      this.scheduleFrame();
    }
  }

  async captureDataUrl() {
    this.app.renderer.render(this.app.stage);
    // preserveDrawingBuffer is enabled; canvas export is stable across two
    // simultaneous Pixi contexts and avoids an async extract blank frame.
    return this.app.canvas.toDataURL('image/png');
  }

  destroy() {
    this.destroyed = true;
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    this.app?.canvas?.removeEventListener('pointerdown', this.boundCanvasPointerDown);
    this.app?.canvas?.removeEventListener('pointermove', this.boundCanvasPointerMove);
    this.app?.canvas?.removeEventListener('pointerup', this.boundCanvasPointerUp);
    this.app?.canvas?.removeEventListener('pointercancel', this.boundCanvasPointerUp);
    this.app?.canvas?.removeEventListener('dblclick', this.boundDoubleClick);
    this.app?.canvas?.removeEventListener('contextmenu', this.boundContextMenu);
    try {
      this.viewport?.destroy({ children: true });
    } catch {
      // already destroyed
    }
    this.app?.destroy?.(true);
  }
}
