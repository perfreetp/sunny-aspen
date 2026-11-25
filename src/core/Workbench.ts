import Konva from 'konva';
import type {
  GradientLine,
  HotZone,
  LayerKey,
  Point,
  TemperatureTable,
  ToolId,
  ViewId,
  WorkbenchSnapshot
} from '../types';
import { createGeometry, DESIGN_H, DESIGN_W, type Geometry, type Rect } from '../lib/geometry';
import { TEMP_BANDS, clamp, formatTemp, tempColor } from '../lib/temperature';
import {
  clipPolygonToBand,
  pointInPolygon,
  polygonCentroid,
  simplifyPath,
  tracePoints
} from '../lib/polygon';
import { TemperatureField, type FieldSnapshot } from './TemperatureField';
import { createSampleTable } from '../data/sample';

interface BrushSession {
  layer: number;
  before: FieldSnapshot;
  pushed: boolean;
  last: Point;
}

interface HistoryEntry {
  layer: number;
  snapshot: FieldSnapshot;
}

type Interaction = 'brush' | 'hot-lasso' | 'hot-move' | 'gradient-draw' | null;

const BRUSH_RADIUS: Record<1 | 2 | 3, number> = {
  1: 18,
  2: 34,
  3: 54
};

const INK_FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';

function flatPoints(points: Point[]): number[] {
  return points.flatMap((p) => [p.x, p.y]);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export class Workbench {
  private readonly container: HTMLDivElement;
  private readonly onUpdate: (snapshot: WorkbenchSnapshot) => void;
  private readonly stage: Konva.Stage;
  private readonly baseLayer: Konva.Layer;
  private readonly cloudLayer: Konva.Layer;
  private readonly heatLayer: Konva.Layer;
  private readonly hotLayer: Konva.Layer;
  private readonly annotationLayer: Konva.Layer;

  private geometry: Geometry = createGeometry(['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08'], 8);
  private table?: TemperatureTable;
  private selectedDate = '';
  private fields = new Map<number, TemperatureField>();

  private view: ViewId = 'profile';
  private tool: ToolId = 'brush';
  private selectedLayer = 1;
  private brushSize: 1 | 2 | 3 = 2;
  private tempIndex = 5;
  private threshold = 30;

  private layerVisibility: Record<LayerKey, boolean> = {
    cloud: true,
    heat: true,
    hotZone: true,
    gradient: true
  };

  private history: HistoryEntry[] = [];
  private session: BrushSession | null = null;
  private interaction: Interaction = null;
  private lassoPoints: Point[] = [];
  private lassoLine: Konva.Line | null = null;
  private moveState: { pointer: Point; points: Point[] } | null = null;

  private hotZone?: HotZone;
  private gradient?: GradientLine;

  private hotMaskCanvas: HTMLCanvasElement;
  private hotLine: Konva.Line | null = null;
  private hotClipGroup: Konva.Group | null = null;
  private hotLabel: Konva.Label | null = null;
  private gradientGroup: Konva.Group | null = null;
  private gradientLineNode: Konva.Line | null = null;
  private gradientMarker: Konva.Group | null = null;
  private gradientLabel: Konva.Label | null = null;
  private cursor: Konva.Group | null = null;
  private cursorRing: Konva.Circle | null = null;

  private matchedCount = 0;
  private importMessage = '已载入内置示例温度表，可直接体验导入、笔刷和圈选。';
  private importError = '';
  private status = '笔刷模式：在某个粮层内按下并拖动，颜色代表所选温度档。';
  private exporting = false;
  private readonly resizeObserver: ResizeObserver;

  constructor(container: HTMLDivElement, onUpdate: (snapshot: WorkbenchSnapshot) => void) {
    this.container = container;
    this.onUpdate = onUpdate;

    this.baseLayer = new Konva.Layer({ id: 'base-layer' });
    this.cloudLayer = new Konva.Layer({ id: 'cloud-layer', listening: false });
    this.heatLayer = new Konva.Layer({ id: 'heat-layer' });
    this.hotLayer = new Konva.Layer({ id: 'hot-layer' });
    this.annotationLayer = new Konva.Layer({ id: 'annotation-layer' });

    this.stage = new Konva.Stage({
      container: this.container,
      width: DESIGN_W,
      height: DESIGN_H
    });
    this.stage.add(this.baseLayer, this.cloudLayer, this.heatLayer, this.hotLayer, this.annotationLayer);

    this.resizeObserver = new ResizeObserver(() => this.fitStageToContainer());
    this.resizeObserver.observe(this.container);
    this.fitStageToContainer();

    this.hotMaskCanvas = document.createElement('canvas');
    this.hotMaskCanvas.width = DESIGN_W;
    this.hotMaskCanvas.height = DESIGN_H;

    this.stage.on('pointerdown', this.handlePointerDown);
    this.stage.on('pointermove', this.handlePointerMove);
    this.stage.on('pointerup', this.handlePointerUp);
    this.stage.on('pointerleave', this.handlePointerLeave);
    window.addEventListener('pointerup', this.handleWindowPointerUp);

    this.setTable(createSampleTable());
    this.updateCursorStyle();
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    window.removeEventListener('pointerup', this.handleWindowPointerUp);
    this.stage.destroy();
  }

  private fitStageToContainer(): void {
    const width = this.container.clientWidth || DESIGN_W;
    const height = this.container.clientHeight || (width * DESIGN_H) / DESIGN_W;
    const scale = Math.min(width / DESIGN_W, height / DESIGN_H);
    this.stage.content.style.transformOrigin = 'top left';
    this.stage.content.style.transform = `scale(${scale})`;
  }

  // ---------------------------------------------------------------------------
  // Public state / commands
  // ---------------------------------------------------------------------------

  reportImportError(message: string): void {
    this.importError = message;
    this.emit();
  }

  setTable(table: TemperatureTable): void {
    this.table = table;    this.selectedDate = table.dates[table.dates.length - 1] ?? '';
    this.geometry = createGeometry(table.cables, table.layerCount);
    this.selectedLayer = clamp(this.selectedLayer, 1, table.layerCount);
    this.hotZone = undefined;
    this.gradient = undefined;
    this.history = [];
    this.importError = '';
    this.importMessage = `已解析 ${table.fileName ?? '温度表'}：${table.records.length} 行，${table.cables.length} 条电缆，${table.layerCount} 层${
      table.skippedRows ? `，跳过 ${table.skippedRows} 行` : ''
    }。`;
    this.resetFields();
    this.seedFieldsFromReadings();
    this.buildScene();
    this.emit();
  }

  selectDate(date: string): void {
    if (!this.table || !this.table.dates.includes(date) || date === this.selectedDate) return;
    this.selectedDate = date;
    this.history = [];
    this.resetFields();
    this.seedFieldsFromReadings();
    this.buildScene();
    this.status = `已切换到 ${date}，云图按该日测点重新落格。`;
    this.emit();
  }

  setView(view: ViewId): void {
    if (this.view === view) return;
    this.view = view;
    this.status =
      view === 'layer'
        ? `分层热力图：当前第 ${this.selectedLayer} 层，层间数据独立。`
        : '剖面云图：笔刷、高温区和梯度线均在当前剖面坐标中。';
    this.buildScene();
    this.emit();
  }

  setSelectedLayer(layer: number): void {
    const next = clamp(Math.round(layer), 1, this.geometry.layerCount);
    if (next === this.selectedLayer) return;
    this.selectedLayer = next;
    if (this.view === 'layer') this.buildScene();
    else this.buildScene();
    this.emit();
  }

  setTool(tool: ToolId): void {
    this.tool = tool;
    this.interaction = null;

    // Activate the layer the chosen tool writes to so a tool never appears dead
    // because its dedicated layer was previously hidden.
    if (tool === 'brush' && !this.layerVisibility.cloud) {
      this.layerVisibility.cloud = true;
      this.cloudLayer.visible(true);
    }
    if ((tool === 'hotzone' || tool === 'reshape') && !this.layerVisibility.hotZone) {
      this.layerVisibility.hotZone = true;
      this.hotLayer.visible(true);
    }
    if (tool === 'gradient' && !this.layerVisibility.gradient) {
      this.layerVisibility.gradient = true;
      this.gradientGroup?.visible(true);
    }

    this.status = {
      brush: '笔刷模式：选择温度档和笔刷大小，沿粮层拖动；一次连续笔划可一次撤销。',
      reshape: '塑形模式：拖动高温区白色控制点改变边界，红色温度蒙版会按新边界重新裁剪。',
      hotzone: '圈选模式：沿可疑高温区域闭合圈拖一圈，松手后生成高温区。',
      gradient: '梯度线模式：沿粮层高度从上层向下层拉一条线，自动标出温度突变层。'
    }[tool];
    this.buildScene();
    this.updateCursorStyle();
    this.emit();
  }

  setBrushSize(size: 1 | 2 | 3): void {
    this.brushSize = size;
    this.updateCursor();
    this.emit();
  }

  setTempIndex(index: number): void {
    this.tempIndex = clamp(index, 0, TEMP_BANDS.length - 1);
    this.updateCursor();
    this.emit();
  }

  setThreshold(threshold: number): void {
    this.threshold = threshold;
    if (this.hotZone) {
      this.hotZone.threshold = threshold;
      this.updateHotZoneStats();
    }
    this.updateHotMask();
    this.buildHotZone();
    this.emit();
  }

  setLayerVisible(key: LayerKey, visible: boolean): void {
    this.layerVisibility[key] = visible;
    if (key === 'cloud') this.cloudLayer.visible(visible);
    if (key === 'heat') this.heatLayer.visible(visible);
    if (key === 'hotZone') this.hotLayer.visible(visible);
    if (key === 'gradient' && this.gradientGroup) this.gradientGroup.visible(visible);
    this.stage.batchDraw();
    this.emit();
  }

  undo(): void {
    const entry = this.history.pop();
    if (!entry) return;
    this.fields.get(entry.layer)?.restore(entry.snapshot);
    this.updateHotMask();
    this.stage.batchDraw();
    this.status = `已撤销第 ${entry.layer} 层上的一笔，云图恢复到该笔刷之前。`;
    this.emit();
  }

  resetCloudToReadings(): void {
    this.history = [];
    this.resetFields();
    this.seedFieldsFromReadings();
    this.updateHotMask();
    this.buildScene();
    this.status = '云图已重置为导入测点的插值结果。';
    this.emit();
  }

  clearHotZone(): void {
    this.hotZone = undefined;
    this.buildHotZone();
    this.emit();
  }

  async exportBaseMap(): Promise<void> {
    if (this.exporting) return;
    this.exporting = true;

    const heatWasVisible = this.heatLayer.visible();
    const gradientWasVisible = this.gradientGroup?.visible() ?? true;
    const cursorWasVisible = this.cursor?.visible() ?? false;

    // 研判底图固定合成：坐标底图 + 云图 + 高温区边界/蒙版。
    this.heatLayer.visible(false);
    this.gradientGroup?.visible(false);
    this.cursor?.visible(false);
    this.stage.draw();

    try {
      const stageUrl = await new Promise<string>((resolve, reject) => {
        this.stage.toDataURL({
          pixelRatio: 2,
          mimeType: 'image/png',
          callback: (url) => (url ? resolve(url) : reject(new Error('导出失败')))
        });
      });
      const stageImage = await loadImage(stageUrl);

      const footerHeight = 104;
      const output = document.createElement('canvas');
      output.width = DESIGN_W * 2;
      output.height = (DESIGN_H + footerHeight) * 2;
      const ctx = output.getContext('2d')!;
      ctx.scale(2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, DESIGN_W, DESIGN_H + footerHeight);
      ctx.drawImage(stageImage, 0, 0, DESIGN_W, DESIGN_H);

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(32, DESIGN_H + 14);
      ctx.lineTo(DESIGN_W - 32, DESIGN_H + 14);
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.font = `700 20px ${INK_FONT}`;
      ctx.fillText('粮情研判底图', 40, DESIGN_H + 43);
      ctx.font = `13px ${INK_FONT}`;
      ctx.fillStyle = '#475569';
      const line1 = `数据日期：${this.selectedDate || '未导入'}　电缆：${this.geometry.cableIds.length} 条　粮层：${this.geometry.layerCount} 层　高温阈值：≥${this.threshold}℃`;
      ctx.fillText(line1, 40, DESIGN_H + 68);
      const line2 = this.hotZone
        ? `高温区：${this.hotZone.points.length} 个边界控制点；最高 ${formatTemp(this.hotZone.maxTemp)}，平均 ${formatTemp(
            this.hotZone.avgTemp
          )}。红色蒙版随边界贴合。`
        : '高温区：未圈选。';
      ctx.fillText(line2, 40, DESIGN_H + 90);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#b91c1c';
      ctx.font = `800 22px ${INK_FONT}`;
      ctx.fillText('研判底图 · 技术员留存', DESIGN_W - 40, DESIGN_H + 48);
      ctx.font = `12px ${INK_FONT}`;
      ctx.fillStyle = '#64748b';
      ctx.fillText(`导出时间 ${new Date().toLocaleString('zh-CN')}`, DESIGN_W - 40, DESIGN_H + 76);
      ctx.textAlign = 'left';

      await new Promise<void>((resolve, reject) => {
        output.toBlob((blob) => {
          if (!blob) {
            reject(new Error('PNG 编码失败'));
            return;
          }
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `粮堆剖面研判底图_${this.selectedDate || 'current'}.png`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          resolve();
        }, 'image/png');
      });

      this.status = '研判底图 PNG 已生成，包含当前剖面云图与高温区位置。';
    } finally {
      this.exporting = false;
      this.heatLayer.visible(heatWasVisible && this.layerVisibility.heat);
      this.gradientGroup?.visible(gradientWasVisible && this.layerVisibility.gradient);
      this.cursor?.visible(cursorWasVisible && this.tool === 'brush');
      this.stage.batchDraw();
      this.emit();
    }
  }

  getSnapshot(): WorkbenchSnapshot {
    return this.createSnapshot();
  }

  // ---------------------------------------------------------------------------
  // Scene construction
  // ---------------------------------------------------------------------------

  private resetFields(): void {
    this.fields.clear();
    for (let layer = 1; layer <= this.geometry.layerCount; layer += 1) {
      this.fields.set(layer, new TemperatureField(layer));
    }
  }

  private readingMapForSelectedDate(): Map<string, number> {
    const map = new Map<string, number>();
    if (!this.table) return map;
    for (const record of this.table.records) {
      if (record.date !== this.selectedDate) continue;
      map.set(`${record.cableId}#${record.layer}`, record.temp);
    }
    return map;
  }

  private seedFieldsFromReadings(): void {
    const readings = this.readingMapForSelectedDate();
    this.matchedCount = readings.size;
    this.fields.forEach((field, layer) => {
      const layerReadings = this.geometry.cableIds
        .map((cableId, index) => ({
          x: this.geometry.cableXs[index],
          temp: readings.get(`${cableId}#${layer}`)
        }))
        .filter((r): r is { x: number; temp: number } => Number.isFinite(r.temp));
      field.clear();
      field.seedFromReadings(layerReadings, this.geometry.grid.left, this.geometry.grid.width);
      field.render();
    });
    this.updateHotMask();
  }

  private buildScene(): void {
    this.baseLayer.destroyChildren();
    this.cloudLayer.destroyChildren();
    this.heatLayer.destroyChildren();
    this.hotLayer.destroyChildren();
    this.annotationLayer.destroyChildren();

    this.gradientGroup = null;
    this.gradientLineNode = null;
    this.gradientMarker = null;
    this.gradientLabel = null;
    this.hotLine = null;
    this.hotClipGroup = null;
    this.hotLabel = null;
    this.cursor = null;
    this.cursorRing = null;
    this.lassoLine = null;

    if (this.view === 'profile') {
      this.buildProfileBase();
      this.buildProfileCloud();
      this.buildProfileHeat();
    } else {
      this.buildLayerBase();
      this.buildLayerCloud();
      this.buildLayerHeat();
    }
    this.buildHotZone();
    this.buildGradient();
    this.buildCursor();

    this.cloudLayer.visible(this.layerVisibility.cloud);
    this.heatLayer.visible(this.layerVisibility.heat);
    this.hotLayer.visible(this.layerVisibility.hotZone);
    (this.gradientGroup as Konva.Group | null)?.visible(this.layerVisibility.gradient);
    this.updateCursor();
    this.stage.batchDraw();
  }

  private addBackground(layer: Konva.Layer): void {
    layer.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: DESIGN_W,
        height: DESIGN_H,
        fill: '#ffffff',
        listening: false
      })
    );
  }

  private addLegend(layer: Konva.Layer, y = 604): void {
    layer.add(
      new Konva.Text({
        x: 112,
        y: y - 2,
        text: '温度分档',
        fontSize: 14,
        fontStyle: '700',
        fontFamily: INK_FONT,
        fill: '#334155',
        listening: false
      })
    );

    const startX = 190;
    const itemWidth = 101;
    TEMP_BANDS.forEach((band, index) => {
      const x = startX + index * itemWidth;
      layer.add(
        new Konva.Rect({
          x,
          y: y + 1,
          width: 20,
          height: 14,
          cornerRadius: 3,
          fill: band.color,
          listening: false
        })
      );
      layer.add(
        new Konva.Text({
          x: x + 26,
          y,
          text: band.rangeLabel,
          fontSize: 12,
          fontFamily: INK_FONT,
          fill: '#475569',
          listening: false
        })
      );
    });

    layer.add(
      new Konva.Text({
        x: 112,
        y: y + 25,
        text: `红色温度蒙版仅显示 ≥${this.threshold}℃ 区域，并裁剪在高温区边界内；控制点拖动后立即重新贴合。`,
        fontSize: 12,
        fontFamily: INK_FONT,
        fill: '#64748b',
        listening: false
      })
    );
  }

  private buildProfileBase(): void {
    const layer = this.baseLayer;
    const g = this.geometry;
    const grid = g.grid;
    this.addBackground(layer);

    layer.add(
      new Konva.Text({
        x: 40,
        y: 26,
        text: '粮堆剖面温度云图',
        fontSize: 27,
        fontStyle: '800',
        fontFamily: INK_FONT,
        fill: '#0f172a',
        listening: false
      })
    );
    layer.add(
      new Konva.Text({
        x: 42,
        y: 64,
        text: `${this.selectedDate || '未选择日期'}　|　${this.table?.fileName ?? '未导入'}　|　测点按电缆编号 × 层号落到格点`,
        fontSize: 14,
        fontFamily: INK_FONT,
        fill: '#64748b',
        listening: false
      })
    );

    // Grain mass and horizontal layer bands.
    layer.add(
      new Konva.Rect({
        x: grid.left,
        y: grid.top,
        width: grid.width,
        height: grid.height,
        fill: '#f6eddc',
        stroke: '#8a6a3d',
        strokeWidth: 2,
        cornerRadius: 18,
        listening: false
      })
    );

    for (let l = 1; l <= g.layerCount; l += 1) {
      const top = g.layerTop(l);
      const h = grid.height / g.layerCount;
      layer.add(
        new Konva.Rect({
          x: grid.left + 2,
          y: top + 1,
          width: grid.width - 4,
          height: h - 2,
          fill: l % 2 === 0 ? 'rgba(180, 132, 63, 0.08)' : 'rgba(255,255,255,0.16)',
          listening: false
        })
      );
      layer.add(
        new Konva.Line({
          points: [grid.left + 10, top, grid.right - 10, top],
          stroke: '#d7c6a8',
          strokeWidth: 1,
          listening: false
        })
      );
      layer.add(
        new Konva.Text({
          x: 42,
          y: g.layerCenter(l) - 9,
          width: 58,
          align: 'right',
          text: g.layerCount > 12 ? `L${l}` : `第${l}层`,
          fontSize: 13,
          fontStyle: l === this.selectedLayer ? '800' : '500',
          fontFamily: INK_FONT,
          fill: l === this.selectedLayer ? '#1d4ed8' : '#64748b',
          listening: false
        })
      );
    }

    layer.add(
      new Konva.Line({
        points: [grid.left + 10, grid.bottom, grid.right - 10, grid.bottom],
        stroke: '#c7b18c',
        strokeWidth: 1.2,
        listening: false
      })
    );

    // Selected layer outline.
    const selectedTop = g.layerTop(this.selectedLayer);
    const selectedHeight = grid.height / g.layerCount;
    layer.add(
      new Konva.Rect({
        x: grid.left + 3,
        y: selectedTop + 2,
        width: grid.width - 6,
        height: selectedHeight - 4,
        stroke: '#2563eb',
        strokeWidth: 2,
        dash: [8, 6],
        cornerRadius: 8,
        listening: false
      })
    );

    const readings = this.readingMapForSelectedDate();
    const showLabels = g.cableIds.length <= 10 && g.layerCount <= 10;

    g.cableIds.forEach((cableId, ci) => {
      const x = g.cableXs[ci];
      layer.add(
        new Konva.Line({
          points: [x, grid.top + 8, x, grid.bottom - 8],
          stroke: '#94a3b8',
          strokeWidth: 1.4,
          dash: [7, 7],
          listening: false
        })
      );
      layer.add(
        new Konva.Text({
          x: x - 34,
          y: grid.top - 27,
          width: 68,
          align: 'center',
          text: cableId,
          fontSize: 13,
          fontStyle: '800',
          fontFamily: INK_FONT,
          fill: '#334155',
          listening: false
        })
      );

      for (let l = 1; l <= g.layerCount; l += 1) {
        const y = g.layerCenter(l);
        const temp = readings.get(`${cableId}#${l}`);
        const radius = g.layerCount > 12 || g.cableIds.length > 12 ? 4 : 5.8;
        const point = new Konva.Circle({
          x,
          y,
          radius: radius + 7,
          fill: 'transparent',
          listening: true
        });
        point.on('click', () => {
          this.status = `${cableId} · 第${l}层：${formatTemp(temp)}（${this.selectedDate}）`;
          this.emit();
        });
        layer.add(point);

        layer.add(
          new Konva.Circle({
            x,
            y,
            radius,
            fill: temp === undefined ? '#cbd5e1' : this.tempColorSafe(temp),
            stroke: '#ffffff',
            strokeWidth: 2,
            shadowColor: 'rgba(15,23,42,0.28)',
            shadowBlur: 4,
            shadowOffsetY: 1,
            listening: false
          })
        );

        if (showLabels && temp !== undefined) {
          layer.add(
            new Konva.Text({
              x: x + 9,
              y: y - 17,
              text: temp.toFixed(1),
              fontSize: 11.5,
              fontFamily: INK_FONT,
              fill: '#0f172a',
              shadowColor: '#ffffff',
              shadowBlur: 3,
              shadowOffsetX: 0,
              shadowOffsetY: 0,
              listening: false
            })
          );
        }
      }
    });

    layer.add(
      new Konva.Text({
        x: grid.left,
        y: grid.bottom + 14,
        text: '水平方向为测温电缆编号/位置；纵向为粮层高度（第 1 层在粮面下，层号向下增加）',
        fontSize: 13,
        fontFamily: INK_FONT,
        fill: '#64748b',
        listening: false
      })
    );

    this.addLegend(layer);
  }

  private buildProfileCloud(): void {
    const g = this.geometry;
    this.fields.forEach((field, layer) => {
      const bandHeight = g.grid.height / g.layerCount;
      this.cloudLayer.add(
        new Konva.Image({
          x: g.grid.left,
          y: g.layerTop(layer),
          width: g.grid.width,
          height: bandHeight + 0.5,
          image: field.canvas,
          listening: false
        })
      );
    });
  }

  private buildProfileHeat(): void {
    const g = this.geometry;
    const readings = this.readingMapForSelectedDate();
    const spacing = g.cableIds.length > 1 ? g.cableXs[1] - g.cableXs[0] : 96;
    const cellWidth = Math.min(82, spacing * 0.68);
    const cellHeight = g.grid.height / g.layerCount;

    g.cableIds.forEach((cableId, ci) => {
      const x = g.cableXs[ci];
      for (let l = 1; l <= g.layerCount; l += 1) {
        const temp = readings.get(`${cableId}#${l}`);
        if (temp === undefined) continue;
        this.heatLayer.add(
          new Konva.Rect({
            x: x - cellWidth / 2,
            y: g.layerTop(l) + cellHeight * 0.18,
            width: cellWidth,
            height: cellHeight * 0.64,
            cornerRadius: 8,
            fill: this.tempColorSafe(temp),
            opacity: 0.34,
            stroke: 'rgba(255,255,255,0.75)',
            strokeWidth: 1,
            listening: false
          })
        );
      }
    });
  }

  private buildLayerBase(): void {
    const layer = this.baseLayer;
    const g = this.geometry;
    const chart = g.chart;
    this.addBackground(layer);

    layer.add(
      new Konva.Text({
        x: 40,
        y: 26,
        text: `第 ${this.selectedLayer} 层 · 分层热力图`,
        fontSize: 27,
        fontStyle: '800',
        fontFamily: INK_FONT,
        fill: '#0f172a',
        listening: false
      })
    );
    layer.add(
      new Konva.Text({
        x: 42,
        y: 64,
        text: `${this.selectedDate}　|　每层持有独立温度场；切换层号只更换当前图，不与其他层串数据`,
        fontSize: 14,
        fontFamily: INK_FONT,
        fill: '#64748b',
        listening: false
      })
    );

    layer.add(
      new Konva.Rect({
        x: chart.left,
        y: chart.top,
        width: chart.width,
        height: chart.height,
        cornerRadius: 18,
        fill: '#f8fafc',
        stroke: '#cbd5e1',
        strokeWidth: 1.5,
        listening: false
      })
    );

    [0.25, 0.5, 0.75].forEach((ratio) => {
      const y = chart.top + chart.height * ratio;
      layer.add(
        new Konva.Line({
          points: [chart.left + 14, y, chart.right - 14, y],
          stroke: '#e2e8f0',
          strokeWidth: 1,
          listening: false
        })
      );
    });

    const field = this.fields.get(this.selectedLayer);
    const stats = field?.averageInBand();
    const cards: Array<[string, string, string]> = [
      ['本层平均', formatTemp(stats?.avg), '#2563eb'],
      ['最低', formatTemp(stats?.min), '#0284c7'],
      ['最高', formatTemp(stats?.max), '#dc2626']
    ];
    cards.forEach(([label, value, color], i) => {
      const x = 700 + i * 105;
      layer.add(
        new Konva.Rect({ x, y: 92, width: 94, height: 58, cornerRadius: 12, fill: '#f8fafc', stroke: '#e2e8f0' })
      );
      layer.add(new Konva.Text({ x: x + 12, y: 101, text: label, fontSize: 12, fill: '#64748b', fontFamily: INK_FONT }));
      layer.add(
        new Konva.Text({
          x: x + 12,
          y: 121,
          text: value,
          fontSize: 17,
          fontStyle: '800',
          fill: color,
          fontFamily: INK_FONT
        })
      );
    });

    g.cableIds.forEach((cableId, i) => {
      const x = g.cableXs[i];
      layer.add(
        new Konva.Text({
          x: x - 42,
          y: chart.bottom + 16,
          width: 84,
          align: 'center',
          text: cableId,
          fontSize: 13,
          fontStyle: '800',
          fontFamily: INK_FONT,
          fill: '#334155',
          listening: false
        })
      );
    });

    layer.add(
      new Konva.Text({
        x: chart.left,
        y: chart.bottom + 42,
        text: '色块为该层各电缆测点；柔化云图为该层独立笔刷/插值温度场。可直接在本图用笔刷补刷该层。',
        fontSize: 13,
        fontFamily: INK_FONT,
        fill: '#64748b',
        listening: false
      })
    );

    this.addLegend(layer, 594);
  }

  private buildLayerCloud(): void {
    const field = this.fields.get(this.selectedLayer);
    if (!field) return;
    const chart = this.geometry.chart;
    this.cloudLayer.add(
      new Konva.Image({
        x: chart.left + 4,
        y: chart.top + 4,
        width: chart.width - 8,
        height: chart.height - 8,
        image: field.canvas,
        cornerRadius: 14,
        listening: false
      })
    );
  }

  private buildLayerHeat(): void {
    const g = this.geometry;
    const chart = g.chart;
    const readings = this.readingMapForSelectedDate();
    const spacing = g.cableIds.length > 1 ? g.cableXs[1] - g.cableXs[0] : 100;
    const cellWidth = Math.min(108, spacing * 0.72);
    const cellHeight = 128;
    const y = chart.top + 34;

    g.cableIds.forEach((cableId, i) => {
      const x = g.cableXs[i];
      const temp = readings.get(`${cableId}#${this.selectedLayer}`);
      if (temp === undefined) return;
      this.heatLayer.add(
        new Konva.Rect({
          x: x - cellWidth / 2,
          y,
          width: cellWidth,
          height: cellHeight,
          cornerRadius: 16,
          fill: this.tempColorSafe(temp),
          opacity: 0.72,
          stroke: '#ffffff',
          strokeWidth: 3,
          shadowColor: 'rgba(15,23,42,0.16)',
          shadowBlur: 10,
          shadowOffsetY: 4,
          listening: false
        })
      );
      this.heatLayer.add(
        new Konva.Text({
          x: x - cellWidth / 2,
          y: y + cellHeight / 2 - 15,
          width: cellWidth,
          align: 'center',
          text: temp.toFixed(1),
          fontSize: 28,
          fontStyle: '900',
          fontFamily: INK_FONT,
          fill: this.readableTextColor(temp),
          shadowColor: 'rgba(255,255,255,0.35)',
          shadowBlur: 2,
          listening: false
        })
      );
      this.heatLayer.add(
        new Konva.Text({
          x: x - cellWidth / 2,
          y: y + cellHeight / 2 + 18,
          width: cellWidth,
          align: 'center',
          text: '℃',
          fontSize: 14,
          fontFamily: INK_FONT,
          fill: this.readableTextColor(temp),
          listening: false
        })
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Hot zone
  // ---------------------------------------------------------------------------

  private updateHotMask(): void {
    const ctx = this.hotMaskCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, DESIGN_W, DESIGN_H);
    if (!this.hotZone) return;

    const g = this.geometry;
    this.fields.forEach((field, layer) => {
      const bandHeight = g.grid.height / g.layerCount;
      const mask = field.renderMask(this.hotZone?.threshold ?? this.threshold);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(mask, g.grid.left, g.layerTop(layer), g.grid.width, bandHeight);
    });
  }

  private buildHotZone(): void {
    this.hotLayer.destroyChildren();
    this.hotLine = null;
    this.hotClipGroup = null;
    this.hotLabel = null;
    if (!this.hotZone || this.hotZone.points.length < 3) return;

    if (this.view === 'profile') this.buildProfileHotZone();
    else this.buildLayerHotZoneProjection();
  }

  private buildProfileHotZone(): void {
    const zone = this.hotZone!;
    this.updateHotMask();

    const clipGroup = new Konva.Group({
      listening: false,
      clipFunc: (context) => tracePoints(context, zone.points)
    });
    clipGroup.add(
      new Konva.Image({
        x: 0,
        y: 0,
        width: DESIGN_W,
        height: DESIGN_H,
        image: this.hotMaskCanvas,
        listening: false
      })
    );
    this.hotLayer.add(clipGroup);
    this.hotClipGroup = clipGroup;

    const line = new Konva.Line({
      points: flatPoints(zone.points),
      closed: true,
      stroke: '#dc2626',
      strokeWidth: 3,
      fill: 'rgba(220,38,38,0.10)',
      dash: [11, 7],
      shadowColor: 'rgba(220,38,38,0.35)',
      shadowBlur: 8,
      hitStrokeWidth: 18,
      listening: this.tool === 'reshape'
    });

    line.on('pointerdown', (event) => {
      if (this.tool !== 'reshape') return;
      event.cancelBubble = true;
      const p = this.stage.getPointerPosition();
      if (!p) return;
      this.interaction = 'hot-move';
      this.moveState = { pointer: p, points: zone.points.map((point) => ({ ...point })) };
    });
    this.hotLayer.add(line);
    this.hotLine = line;

    if (this.tool === 'reshape') {
      zone.points.forEach((point, index) => {
        const anchor = new Konva.Circle({
          x: point.x,
          y: point.y,
          radius: 7.5,
          fill: '#ffffff',
          stroke: '#dc2626',
          strokeWidth: 2.5,
          draggable: true,
          shadowColor: 'rgba(15,23,42,0.25)',
          shadowBlur: 4
        });
        anchor.on('dragmove', () => {
          const p = { x: anchor.x(), y: anchor.y() };
          zone.points[index] = p;
          this.hotLine?.points(flatPoints(zone.points));
          const center = polygonCentroid(zone.points);
          this.hotLabel?.position({ x: center.x - 70, y: center.y - 18 });
          this.hotLayer.batchDraw();
        });
        anchor.on('dragend', () => {
          this.updateHotZoneStats();
          this.status = '高温区边界已塑形，温度蒙版已按新边界重新裁剪贴合。';
          this.emit();
        });
        this.hotLayer.add(anchor);
      });
    }

    const center = polygonCentroid(zone.points);
    const label = new Konva.Label({ x: center.x - 78, y: center.y - 18, listening: false });
    label.add(new Konva.Tag({ fill: '#b91c1c', cornerRadius: 8, shadowColor: 'rgba(0,0,0,0.2)', shadowBlur: 6 }));
    label.add(
      new Konva.Text({
        text: this.hotZoneSummaryText(),
        fill: '#ffffff',
        fontStyle: '800',
        fontSize: 14,
        fontFamily: INK_FONT,
        padding: 8
      })
    );
    this.hotLayer.add(label);
    this.hotLabel = label;
  }

  private buildLayerHotZoneProjection(): void {
    const zone = this.hotZone!;
    const g = this.geometry;
    const band = clipPolygonToBand(zone.points, g.layerTop(this.selectedLayer), g.layerBottom(this.selectedLayer));
    if (band.length < 3) {
      this.hotLayer.add(
        new Konva.Text({
          x: g.chart.left,
          y: 176,
          width: g.chart.width,
          align: 'center',
          text: '高温区在本层没有截面；请切换其他层或返回剖面塑形',
          fontSize: 13,
          fill: '#b91c1c',
          fontFamily: INK_FONT,
          listening: false
        })
      );
      return;
    }

    const bandTop = g.layerTop(this.selectedLayer);
    const bandHeight = g.grid.height / g.layerCount;
    const projected = band.map((p) => ({
      x: p.x,
      y: g.chart.top + 6 + ((p.y - bandTop) / bandHeight) * (g.chart.height - 12)
    }));

    this.updateHotMask();
    const clipGroup = new Konva.Group({
      listening: false,
      clipFunc: (context) => tracePoints(context, projected)
    });
    clipGroup.add(
      new Konva.Image({
        x: g.chart.left + 4,
        y: g.chart.top + 4,
        width: g.chart.width - 8,
        height: g.chart.height - 8,
        image: this.hotMaskCanvas,
        crop: {
          x: g.grid.left,
          y: bandTop,
          width: g.grid.width,
          height: bandHeight
        },
        listening: false
      })
    );
    this.hotLayer.add(clipGroup);

    this.hotLayer.add(
      new Konva.Line({
        points: flatPoints(projected),
        closed: true,
        stroke: '#dc2626',
        strokeWidth: 2.5,
        fill: 'rgba(220,38,38,0.08)',
        dash: [9, 6],
        listening: false
      })
    );
  }

  private updateHotZoneStats(): void {
    if (!this.hotZone) return;
    const zone = this.hotZone;
    let weightedSum = 0;
    let weight = 0;
    let max = -Infinity;
    let count = 0;

    this.fields.forEach((field, layer) => {
      const bandTop = this.geometry.layerTop(layer);
      const bandHeight = this.geometry.grid.height / this.geometry.layerCount;
      for (let ix = 0; ix < field.nx; ix += 1) {
        for (let iy = 0; iy < field.ny; iy += 1) {
          const index = iy * field.nx + ix;
          const temp = field.temp[index];
          const cover = field.cover[index];
          if (Number.isNaN(temp) || cover < 0.12) continue;
          const p = {
            x: this.geometry.grid.left + ((ix + 0.5) / field.nx) * this.geometry.grid.width,
            y: bandTop + ((iy + 0.5) / field.ny) * bandHeight
          };
          if (!pointInPolygon(p, zone.points)) continue;
          count += 1;
          weightedSum += temp * cover;
          weight += cover;
          max = Math.max(max, temp);
        }
      }
    });

    zone.areaCells = count;
    zone.maxTemp = Number.isFinite(max) ? max : undefined;
    zone.avgTemp = weight > 0 ? weightedSum / weight : undefined;
    if (this.hotLabel) {
      const text = this.hotLabel.findOne('Text') as Konva.Text | undefined;
      text?.text(this.hotZoneSummaryText());
    }
  }

  private hotZoneSummaryText(): string {
    if (!this.hotZone) return '';
    const max = this.hotZone.maxTemp === undefined ? '--' : this.hotZone.maxTemp.toFixed(1);
    const avg = this.hotZone.avgTemp === undefined ? '--' : this.hotZone.avgTemp.toFixed(1);
    return `高温区 ≥${this.threshold}℃  最高 ${max}  平均 ${avg}`;
  }

  // ---------------------------------------------------------------------------
  // Gradient line
  // ---------------------------------------------------------------------------

  private buildGradient(): void {
    if (this.view !== 'profile' || !this.gradient) return;
    const group = new Konva.Group({ listening: true, visible: this.layerVisibility.gradient });
    this.gradientGroup = group;

    const line = new Konva.Line({
      points: [this.gradient.a.x, this.gradient.a.y, this.gradient.b.x, this.gradient.b.y],
      stroke: '#7c3aed',
      strokeWidth: 4,
      lineCap: 'round',
      dash: [2, 0],
      shadowColor: 'rgba(124,58,237,0.3)',
      shadowBlur: 8,
      hitStrokeWidth: 20
    });
    group.add(line);
    this.gradientLineNode = line;

    [
      ['a', this.gradient.a] as const,
      ['b', this.gradient.b] as const
    ].forEach(([key, point]) => {
      const anchor = new Konva.Circle({
        x: point.x,
        y: point.y,
        radius: 8,
        fill: '#ffffff',
        stroke: '#7c3aed',
        strokeWidth: 3,
        draggable: this.tool === 'gradient' || this.tool === 'reshape'
      });
      anchor.on('dragmove', () => {
        if (!this.gradient) return;
        this.gradient[key] = { x: anchor.x(), y: anchor.y() };
        this.gradientLineNode?.points([
          this.gradient.a.x,
          this.gradient.a.y,
          this.gradient.b.x,
          this.gradient.b.y
        ]);
        this.recomputeAndRenderGradient();
      });
      anchor.on('dragend', () => this.emit());
      group.add(anchor);
    });

    const marker = new Konva.Group({ listening: false });
    marker.add(
      new Konva.Circle({ x: 0, y: 0, radius: 10, fill: '#7c3aed', stroke: '#fff', strokeWidth: 3 })
    );
    marker.add(new Konva.Text({ x: -4, y: -7, text: '!', fontSize: 15, fontStyle: '900', fill: '#fff' }));
    group.add(marker);
    this.gradientMarker = marker;

    const label = new Konva.Label({ listening: false });
    label.add(new Konva.Tag({ fill: '#6d28d9', cornerRadius: 8, padding: 6 }));
    label.add(
      new Konva.Text({
        text: '',
        fill: '#fff',
        fontSize: 14,
        fontStyle: '800',
        fontFamily: INK_FONT,
        padding: 7
      })
    );
    group.add(label);
    this.gradientLabel = label;

    this.annotationLayer.add(group);
    this.recomputeAndRenderGradient();
  }

  private sampleFieldBilinear(field: TemperatureField, x: number, y: number, rect: Rect): number {
    const fx = clamp(((x - rect.left) / rect.width) * (field.nx - 1), 0, field.nx - 1.001);
    const fy = clamp(((y - rect.top) / rect.height) * (field.ny - 1), 0, field.ny - 1.001);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const at = (x: number, y: number): number => {
      const value = field.temp[y * field.nx + x];
      return Number.isNaN(value) ? Number.NaN : value;
    };
    const v00 = at(x0, y0);
    const v10 = at(Math.min(x0 + 1, field.nx - 1), y0);
    const v01 = at(x0, Math.min(y0 + 1, field.ny - 1));
    const v11 = at(Math.min(x0 + 1, field.nx - 1), Math.min(y0 + 1, field.ny - 1));
    if ([v00, v10, v01, v11].some(Number.isNaN)) {
      const nearest = field.temp[Math.round(fy) * field.nx + Math.round(fx)];
      return Number.isNaN(nearest) ? Number.NaN : nearest;
    }
    const a = v00 * (1 - tx) + v10 * tx;
    const b = v01 * (1 - tx) + v11 * tx;
    return a * (1 - ty) + b * ty;
  }

  private computeGradient(): GradientLine['result'] {
    if (!this.gradient) return null;
    const { a, b } = this.gradient;
    if (Math.abs(b.y - a.y) < 8) return null;

    const averages: number[] = [];
    for (let layer = 1; layer <= this.geometry.layerCount; layer += 1) {
      const field = this.fields.get(layer);
      if (!field) {
        averages.push(Number.NaN);
        continue;
      }
      const top = this.geometry.layerTop(layer);
      const bottom = this.geometry.layerBottom(layer);
      const yLow = Math.max(Math.min(a.y, b.y), top);
      const yHigh = Math.min(Math.max(a.y, b.y), bottom);
      if (yHigh <= yLow) {
        averages.push(Number.NaN);
        continue;
      }
      let sum = 0;
      let count = 0;
      const samples = 14;
      for (let i = 0; i <= samples; i += 1) {
        const y = yLow + ((yHigh - yLow) * i) / samples;
        const t = (y - a.y) / (b.y - a.y);
        const x = a.x + (b.x - a.x) * t;
        const temp = this.sampleFieldBilinear(field, x, y, this.geometry.grid);
        if (!Number.isNaN(temp)) {
          sum += temp;
          count += 1;
        }
      }
      averages.push(count ? sum / count : Number.NaN);
    }

    let best: GradientLine['result'] = null;
    for (let boundaryLayer = 1; boundaryLayer < this.geometry.layerCount; boundaryLayer += 1) {
      const upper = averages[boundaryLayer - 1];
      const lower = averages[boundaryLayer];
      if (Number.isNaN(upper) || Number.isNaN(lower)) continue;
      const delta = lower - upper;
      if (!best || Math.abs(delta) > Math.abs(best.delta)) {
        const y = this.geometry.layerTop(boundaryLayer + 1);
        const t = (y - a.y) / (b.y - a.y);
        const x = a.x + (b.x - a.x) * t;
        best = { layer: boundaryLayer + 1, delta, x, y, averages };
      }
    }
    return best;
  }

  private recomputeAndRenderGradient(): void {
    if (!this.gradient) return;
    this.gradient.result = this.computeGradient();
    const result = this.gradient.result;
    if (result && this.gradientMarker && this.gradientLabel) {
      this.gradientMarker.position({ x: result.x, y: result.y });
      this.gradientMarker.visible(true);
      const direction = result.delta >= 0 ? '升高' : '降低';
      const text = `温度突变：第 ${result.layer} 层，${direction} ${Math.abs(result.delta).toFixed(1)}℃`;
      const textNode = this.gradientLabel.findOne('Text') as Konva.Text | undefined;
      textNode?.text(text);
      this.gradientLabel.position({ x: clamp(result.x + 16, 120, 760), y: clamp(result.y - 44, 96, 560) });
      this.gradientLabel.visible(true);
    } else {
      this.gradientMarker?.visible(false);
      this.gradientLabel?.visible(false);
    }
    this.annotationLayer.batchDraw();
  }

  // ---------------------------------------------------------------------------
  // Pointer interactions
  // ---------------------------------------------------------------------------

  private handlePointerDown = (event: Konva.KonvaEventObject<PointerEvent>): void => {
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return;

    if (this.tool === 'brush') this.startBrushStroke(pointer);
    if (this.tool === 'hotzone') this.startLasso(pointer);
    if (this.tool === 'gradient') this.startGradient(pointer);
  };

  private handlePointerMove = (event: Konva.KonvaEventObject<PointerEvent>): void => {
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return;
    this.updateCursor(pointer);

    if (this.interaction === 'brush' && this.session) {
      this.brushTo(pointer);
    } else if (this.interaction === 'hot-lasso') {
      const last = this.lassoPoints[this.lassoPoints.length - 1];
      if (!last || Math.hypot(pointer.x - last.x, pointer.y - last.y) > 4) {
        this.lassoPoints.push(pointer);
        this.lassoLine?.points(flatPoints(this.lassoPoints));
        this.hotLayer.batchDraw();
      }
    } else if (this.interaction === 'gradient-draw' && this.gradient) {
      this.gradient.b = pointer;
      this.gradientLineNode?.points([this.gradient.a.x, this.gradient.a.y, pointer.x, pointer.y]);
      this.recomputeAndRenderGradient();
    } else if (this.interaction === 'hot-move' && this.moveState && this.hotZone) {
      const dx = pointer.x - this.moveState.pointer.x;
      const dy = pointer.y - this.moveState.pointer.y;
      this.hotZone.points = this.moveState.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      this.hotLine?.points(flatPoints(this.hotZone.points));
      const center = polygonCentroid(this.hotZone.points);
      this.hotLabel?.position({ x: center.x - 78, y: center.y - 18 });
      this.hotLayer.batchDraw();
    }
  };

  private handlePointerUp = (): void => {
    this.finishInteraction();
  };

  private handleWindowPointerUp = (): void => {
    this.finishInteraction();
  };

  private handlePointerLeave = (): void => {
    if (this.cursor && !this.session) this.cursor.visible(false);
    this.stage.batchDraw();
  };

  private finishInteraction(): void {
    if (this.interaction === 'brush') {
      if (this.session?.pushed) {
        this.updateHotMask();
        this.status = `第 ${this.session.layer} 层笔刷已落笔；撤销可整笔回退。`;
      }
      this.session = null;
    }

    if (this.interaction === 'hot-lasso') {
      this.finishLasso();
    }

    if (this.interaction === 'gradient-draw') {
      if (this.gradient && Math.hypot(this.gradient.b.x - this.gradient.a.x, this.gradient.b.y - this.gradient.a.y) < 18) {
        this.gradient = undefined;
        this.buildScene();
      } else {
        this.recomputeAndRenderGradient();
        this.status = this.gradient?.result
          ? `梯度线完成，最大突变在第 ${this.gradient.result.layer} 层。`
          : '梯度线完成，但跨层有效温度不足。';
      }
    }

    if (this.interaction === 'hot-move' && this.hotZone) {
      this.updateHotZoneStats();
      this.status = '高温区整体位置已移动，内部温度蒙版同步贴合。';
    }

    this.interaction = null;
    this.moveState = null;
    this.updateCursor();
    this.emit();
  }

  private activeBrushRect(layer: number): Rect | null {
    if (this.view === 'profile') {
      return {
        left: this.geometry.grid.left,
        right: this.geometry.grid.right,
        top: this.geometry.layerTop(layer),
        bottom: this.geometry.layerBottom(layer),
        width: this.geometry.grid.width,
        height: this.geometry.grid.height / this.geometry.layerCount
      };
    }
    return this.geometry.chart;
  }

  private startBrushStroke(p: Point): void {
    let layer: number | null;
    if (this.view === 'profile') layer = this.geometry.layerAtY(p.y);
    else layer = this.selectedLayer;

    if (!layer) {
      this.status = '请把笔刷放在剖面粮层区域内。';
      this.emit();
      return;
    }
    if (this.view === 'layer' && (p.x < this.geometry.chart.left || p.x > this.geometry.chart.right)) {
      this.status = '请在分层热力图区域内刷写。';
      this.emit();
      return;
    }

    const field = this.fields.get(layer);
    if (!field) return;
    this.session = { layer, before: field.snapshot(), pushed: false, last: p };
    this.interaction = 'brush';
    this.paintBrushSegment(p, p);
  }

  private brushTo(p: Point): void {
    if (!this.session) return;
    this.paintBrushSegment(this.session.last, p);
    this.session.last = p;
  }

  private paintBrushSegment(from: Point, to: Point): void {
    const session = this.session;
    if (!session) return;
    const field = this.fields.get(session.layer);
    const rect = this.activeBrushRect(session.layer);
    if (!field || !rect) return;

    if (!session.pushed) {
      this.history.push({ layer: session.layer, snapshot: session.before });
      if (this.history.length > 30) this.history.shift();
      session.pushed = true;
    }

    const radiusWorld = BRUSH_RADIUS[this.brushSize];
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / (radiusWorld * 0.28)));
    const radiusX = (radiusWorld / rect.width) * field.nx;
    const radiusY = (radiusWorld / rect.height) * field.ny;
    const brushTemp = TEMP_BANDS[this.tempIndex].brushTemp;

    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      const fx = ((x - rect.left) / rect.width) * field.nx;
      const fy = ((y - rect.top) / rect.height) * field.ny;
      field.dab(fx, fy, radiusX, radiusY, brushTemp);
    }
    field.render();
    this.cloudLayer.batchDraw();
  }

  private startLasso(p: Point): void {
    this.interaction = 'hot-lasso';
    this.lassoPoints = [p];
    this.lassoLine = new Konva.Line({
      points: [p.x, p.y],
      stroke: '#dc2626',
      strokeWidth: 3,
      closed: false,
      dash: [10, 6],
      fill: 'rgba(220,38,38,0.08)',
      listening: false
    });
    this.hotLayer.add(this.lassoLine);
  }

  private finishLasso(): void {
    if (this.interaction !== 'hot-lasso') return;
    const raw = this.lassoPoints;
    this.lassoLine?.destroy();
    this.lassoLine = null;

    if (raw.length < 8) {
      this.status = '圈选点太少，请按住鼠标沿区域连续画一圈。';
      this.buildHotZone();
      return;
    }

    const boundsWidth = Math.max(...raw.map((p) => p.x)) - Math.min(...raw.map((p) => p.x));
    const boundsHeight = Math.max(...raw.map((p) => p.y)) - Math.min(...raw.map((p) => p.y));
    if (boundsWidth < 24 || boundsHeight < 18) {
      this.status = '圈选范围太小，请重新圈出一块高温异常区域。';
      this.buildHotZone();
      return;
    }

    const points = simplifyPath(raw, 24, 16);
    this.hotZone = { points, threshold: this.threshold };
    this.updateHotZoneStats();
    this.updateHotMask();
    this.tool = 'reshape';
    this.buildScene();
    this.updateCursorStyle();
    this.status = '高温区已生成。可拖动白色控制点改变边界，也可拖动半透明区域整体移动。';
  }

  private startGradient(p: Point): void {
    this.interaction = 'gradient-draw';
    this.gradient = { a: { ...p }, b: { ...p }, result: null };
    this.buildGradient();
  }

  // ---------------------------------------------------------------------------
  // Cursor / snapshot helpers
  // ---------------------------------------------------------------------------

  private buildCursor(): void {
    if (this.tool !== 'brush') return;
    const group = new Konva.Group({ x: -100, y: -100, listening: false, visible: false });
    const ring = new Konva.Circle({
      radius: BRUSH_RADIUS[this.brushSize],
      stroke: TEMP_BANDS[this.tempIndex].color,
      strokeWidth: 2,
      fill: TEMP_BANDS[this.tempIndex].color,
      opacity: 0.16
    });
    const cross = new Konva.Line({
      points: [-8, 0, 8, 0, 0, -8, 0, 8],
      stroke: TEMP_BANDS[this.tempIndex].color,
      strokeWidth: 1.5
    });
    group.add(ring, cross);
    this.cursorRing = ring;
    this.cursor = group;
    this.annotationLayer.add(group);
  }

  private updateCursor(p?: Point): void {
    if (!this.cursor || !this.cursorRing) return;
    const radius = BRUSH_RADIUS[this.brushSize];
    this.cursorRing.radius(radius);
    const color = TEMP_BANDS[this.tempIndex].color;
    this.cursorRing.stroke(color);
    this.cursorRing.fill(color);
    if (p && this.tool === 'brush') {
      const inLayer = this.view === 'profile' ? this.geometry.layerAtY(p.y) !== null : true;
      const inChart =
        this.view === 'layer'
          ? p.x >= this.geometry.chart.left &&
            p.x <= this.geometry.chart.right &&
            p.y >= this.geometry.chart.top - 20 &&
            p.y <= this.geometry.chart.bottom + 20
          : true;
      this.cursor.position(p);
      this.cursor.visible(inLayer && inChart);
    } else if (!p) {
      this.cursor.visible(false);
    }
    this.annotationLayer.batchDraw();
  }

  private updateCursorStyle(): void {
    this.stage.container().style.cursor = this.tool === 'brush' ? 'none' : this.tool === 'reshape' ? 'default' : 'crosshair';
  }

  private tempColorSafe(temp: number): string {
    return tempColor(temp);
  }

  private readableTextColor(temp: number): string {
    return temp >= 25 && temp < 32 ? '#7c2d12' : '#ffffff';
  }

  private emit(): void {
    this.onUpdate(this.createSnapshot());
  }

  private createSnapshot(): WorkbenchSnapshot {
    return {
      ready: true,
      view: this.view,
      tool: this.tool,
      selectedLayer: this.selectedLayer,
      layerCount: this.geometry.layerCount,
      dates: this.table?.dates ?? [],
      selectedDate: this.selectedDate,
      cableCount: this.geometry.cableIds.length,
      recordCount: this.table?.records.length ?? 0,
      matchedCount: this.matchedCount,
      fileName: this.table?.fileName ?? '',
      importMessage: this.importMessage,
      importError: this.importError,
      brushSize: this.brushSize,
      tempIndex: this.tempIndex,
      threshold: this.threshold,
      layerVisibility: { ...this.layerVisibility },
      canUndo: this.history.length > 0,
      undoDepth: this.history.length,
      hasHotZone: !!this.hotZone,
      hasGradient: !!this.gradient?.result,
      status: this.status,
      hotZoneSummary: this.hotZone ? this.hotZoneSummaryText() : '尚未圈选高温区',
      gradientSummary: this.gradient?.result
        ? `突变层：第 ${this.gradient.result.layer} 层；温差 ${Math.abs(this.gradient.result.delta).toFixed(1)}℃`
        : '尚未生成有效梯度线'
    };
  }
}
