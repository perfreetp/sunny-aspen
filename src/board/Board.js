import { Canvas, FabricImage, IText, Line, Circle, Point, util } from 'fabric';
import { Dim, toLocalCentered } from './Dim';

let _uid = 1;
const nid = () => 'o' + _uid++;

export const LAYERS = [
  { id: 'base', name: '底图(总装/流道)' },
  { id: 'section', name: '剖切视图' },
  { id: 'tag', name: '编号标注' },
  { id: 'dim', name: '尺寸标注' },
];

const TAG_FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** 比例尺换算:给定 px/米 与缩放,返回一个"好看"的整米数及对应屏幕像素宽 */
export function niceScale(pxPerMeter, zoom, targetPx = 120) {
  if (!pxPerMeter) return null;
  const rawM = targetPx / (pxPerMeter * zoom);
  const pow = Math.pow(10, Math.floor(Math.log10(rawM)));
  let best = pow / 10;
  for (const k of [0.1, 0.2, 0.5, 1, 2, 5, 10]) {
    const m = k * pow;
    if (m <= rawM) best = m;
  }
  return { meters: best, px: best * pxPerMeter * zoom };
}

export class Board {
  constructor(el, host, hooks = {}) {
    this.hooks = hooks;
    this.host = host;
    this.canvas = new Canvas(el, {
      preserveObjectStacking: true,
      stopContextMenu: true,
      selectionColor: 'rgba(41,128,185,0.12)',
      selectionBorderColor: '#2980b9',
    });
    this.canvas.setDimensions({ width: host.clientWidth, height: host.clientHeight });

    // 四个逻辑图层:显隐 + 锁定
    this.layers = {
      base: { visible: true, locked: true },
      section: { visible: true, locked: false },
      tag: { visible: true, locked: false },
      dim: { visible: true, locked: false },
    };

    this.mode = 'select';
    this.calib = { pxPerMeter: 0, datumY: 0, datumElev: 0, runnerD: 0 };
    this.calibInputs = { runnerD: 5, datumElev: 520 };
    this.runnerMid = null;
    this.bandMeters = 8;
    this.dimStyle = { strokeWidth: 1.5, arrowSize: 9, fontSize: 14 };

    this.undoStack = [];
    this.redoStack = [];

    this.sectionPts = null;
    this.cutline = null;
    this.grips = [];
    this.sectionImg = null;
    this.sectionLabel = null;
    this.mainImage = null;

    this._calibClicks = [];
    this._calibMarks = [];
    this._datumObjs = [];
    this._spaceDown = false;
    this._panning = null;
    this._tfBefore = null;

    this._bind();

    this._ro = new ResizeObserver(() => {
      this.canvas.setDimensions({ width: host.clientWidth, height: host.clientHeight });
      this.canvas.requestRenderAll();
    });
    this._ro.observe(host);

    this._emitLayers();
    this._emitCalib();
    this._emitHist();
  }

  dispose() {
    this._ro.disconnect();
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.canvas.dispose();
  }

  // ---------------------------------------------------------------- 事件绑定

  _bind() {
    const c = this.canvas;

    c.on('mouse:wheel', (opt) => {
      const e = opt.e;
      e.preventDefault();
      e.stopPropagation();
      let zoom = c.getZoom() * 0.999 ** e.deltaY;
      zoom = clamp(zoom, 0.05, 30);
      c.zoomToPoint(new Point(e.offsetX, e.offsetY), zoom);
      this.hooks.onZoom?.(zoom);
    });

    c.on('mouse:down', (opt) => this._onMouseDown(opt));
    c.on('mouse:move', (opt) => this._onMouseMove(opt));
    c.on('mouse:up', (opt) => this._onMouseUp(opt));

    // 拖动剖切线端点 / 拖动剖切视图时联动
    c.on('object:moving', (e) => {
      const t = e.target;
      if (t?.data?.role === 'grip') this._onGripDrag(t, false);
      else if (t === this.sectionImg) this._followBound();
    });
    c.on('object:scaling', (e) => {
      if (e.target === this.sectionImg) this._followBound();
    });

    // 一次手势结束:烘焙缩放 → 归一化 → 记一步撤销
    c.on('object:modified', (e) => {
      const t = e.target;
      if (!t) return;
      if (t.data?.role === 'grip') {
        this._onGripDrag(t, true);
        return;
      }
      if (t.type === 'activeselection') {
        // 框选整体变换:先解散,把缩放烘进每个子对象(字号跟着变、位置不跑偏)
        const children = t.getObjects().slice();
        c.discardActiveObject();
        children.forEach((ch) => this._bake(ch));
      } else {
        this._bake(t);
      }
      if (t.type === 'dim') t.normalize();
      if (t.data?.layer === 'tag' && t.data.boundTo) this._rebindTag(t);
      if (t === this.sectionImg) this._followBound();
      this._pushTransformCmd();
      c.requestRenderAll();
    });

    const emitSel = () => this._emitSelection();
    c.on('selection:created', emitSel);
    c.on('selection:updated', emitSel);
    c.on('selection:cleared', emitSel);

    this._onKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        this._spaceDown = true;
        if (this.mode === 'select') this.canvas.defaultCursor = 'grab';
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => {
      if (e.code === 'Space') {
        this._spaceDown = false;
        this._applyCursor();
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  _applyCursor() {
    this.canvas.defaultCursor =
      this.mode === 'pan' ? 'grab' : this.mode === 'select' ? 'default' : 'crosshair';
  }

  // ---------------------------------------------------------------- 模式

  setMode(m) {
    this.mode = m;
    const isSelect = m === 'select';
    this.canvas.skipTargetFind = !isSelect && m !== 'pan';
    this.canvas.selection = isSelect;
    if (!isSelect) this.canvas.discardActiveObject();
    if (m === 'calib-runner') this._clearCalibMarks();
    this._applyCursor();
    this.canvas.requestRenderAll();
  }

  setCalibInputs(v) {
    Object.assign(this.calibInputs, v);
  }

  setBandMeters(v) {
    this.bandMeters = v;
  }

  // ---------------------------------------------------------------- 鼠标手势

  _scenePt(opt) {
    return this.canvas.getScenePoint(opt.e);
  }

  _onMouseDown(opt) {
    const e = opt.e;
    if (this._spaceDown || this.mode === 'pan') {
      this._panning = { x: e.clientX, y: e.clientY };
      this.canvas.selection = false;
      this.canvas.defaultCursor = 'grabbing';
      return;
    }
    if (this.mode === 'select') {
      this._captureBefore(opt);
      return;
    }
    const p = this._scenePt(opt);
    if (this.mode === 'calib-runner') this._calibRunnerClick(p);
    else if (this.mode === 'calib-elev') this._calibElevClick(p);
    else if (this.mode === 'section') this._sectionStart(p);
    else if (this.mode === 'dim') this._dimStart(p);
  }

  _onMouseMove(opt) {
    if (this._panning) {
      const e = opt.e;
      const v = this.canvas.viewportTransform;
      v[4] += e.clientX - this._panning.x;
      v[5] += e.clientY - this._panning.y;
      this._panning = { x: e.clientX, y: e.clientY };
      this.canvas.requestRenderAll();
      return;
    }
    if (this._secP1) {
      const p = this._scenePt(opt);
      this._secP2 = { x: p.x, y: p.y };
      if (this._secPreview) this.canvas.remove(this._secPreview);
      this._secPreview = new Line([this._secP1.x, this._secP1.y, p.x, p.y], {
        stroke: '#e67e22',
        strokeWidth: 2,
        strokeDashArray: [8, 5],
        selectable: false,
        evented: false,
      });
      this.canvas.add(this._secPreview);
      this.canvas.requestRenderAll();
      return;
    }
    if (this._dimDrawing) {
      const p = this._scenePt(opt);
      const d = this._dimDrawing;
      const local = toLocalCentered(d, p.x, p.y);
      d.moveEndpointLocal(1, local);
      this.canvas.requestRenderAll();
    }
  }

  _onMouseUp() {
    if (this._panning) {
      this._panning = null;
      this.canvas.selection = this.mode === 'select';
      this._applyCursor();
      return;
    }
    this._tfBefore = null; // 未触发 modified 的点击不留快照
    if (this._secP1) this._sectionFinish();
    if (this._dimDrawing) this._dimFinish();
  }

  // ---------------------------------------------------------------- 图层

  toggleLayer(id, key) {
    this.layers[id][key] = !this.layers[id][key];
    this.applyLayers();
    this.canvas.discardActiveObject();
    this._emitSelection();
    this._emitLayers();
    this.canvas.requestRenderAll();
  }

  applyLayers() {
    this.canvas.getObjects().forEach((o) => {
      const l = o.data?.layer;
      if (!l) return;
      const st = this.layers[l];
      const passive = ['datum', 'calibMark', 'cutline'].includes(o.data?.role);
      o.visible = st.visible;
      o.evented = o.selectable = st.visible && !st.locked && !passive;
    });
  }

  _emitLayers() {
    this.hooks.onLayers?.(JSON.parse(JSON.stringify(this.layers)));
  }

  // ---------------------------------------------------------------- 导入底图

  async importImage(file, role) {
    const url = URL.createObjectURL(file);
    let el;
    try {
      el = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('图片加载失败'));
        i.src = url;
      });
    } finally {
      // objectURL 在 Image 解码后即可释放
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    const img = new FabricImage(el, { originX: 'left', originY: 'top' });
    img.data = { id: nid(), layer: 'base', role: role === 'main' ? 'main' : 'flow' };
    const zoom = this.canvas.getZoom();
    const vpt = this.canvas.viewportTransform;
    const viewW = this.canvas.width / zoom;
    const viewH = this.canvas.height / zoom;
    const s = Math.min((viewW * 0.7) / img.width, (viewH * 0.7) / img.height, 1);
    img.scale(s);
    const cx = -vpt[4] / zoom + viewW / 2;
    const cy = -vpt[5] / zoom + viewH / 2;
    img.set({ left: cx - (img.width * s) / 2, top: cy - (img.height * s) / 2 });
    this._add(img);
    if (role === 'main') this.mainImage = img;
    this.pushCmd('导入图片', () => this._remove(img), () => this._add(img));
    this.canvas.requestRenderAll();
  }

  // ---------------------------------------------------------------- 标定

  _clearCalibMarks() {
    this._calibMarks.forEach((m) => this.canvas.remove(m));
    this._calibMarks = [];
    this._calibClicks = [];
  }

  _calibRunnerClick(p) {
    const mark = new Circle({
      left: p.x,
      top: p.y,
      originX: 'center',
      originY: 'center',
      radius: 5,
      fill: '#e74c3c',
      selectable: false,
      evented: false,
    });
    mark.data = { id: nid(), layer: 'base', role: 'calibMark' };
    this.canvas.add(mark);
    this._calibMarks.push(mark);
    this._calibClicks.push({ x: p.x, y: p.y });
    if (this._calibClicks.length < 2) {
      this.canvas.requestRenderAll();
      return;
    }
    const [a, b] = this._calibClicks;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const d = this.calibInputs.runnerD;
    if (!d || d <= 0) {
      this.hooks.onError?.('请先在工具栏填写转轮直径 D1(米)');
      this._clearCalibMarks();
      this.hooks.onModeDone?.();
      return;
    }
    this.calib.pxPerMeter = dist / d;
    this.calib.runnerD = d;
    this.runnerMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // 两点间加一条标记线
    const line = new Line([a.x, a.y, b.x, b.y], {
      stroke: '#e74c3c',
      strokeWidth: 1.5,
      selectable: false,
      evented: false,
    });
    line.data = { id: nid(), layer: 'base', role: 'calibMark' };
    this.canvas.add(line);
    this._calibMarks.push(line);
    this._calibClicks = [];
    this._applyAutoLayout();
    this._emitCalib();
    this.hooks.onModeDone?.();
  }

  _calibElevClick(p) {
    this.calib.datumY = p.y;
    this.calib.datumElev = this.calibInputs.datumElev;
    this._applyAutoLayout();
    this._drawDatum();
    this._emitCalib();
    this.hooks.onModeDone?.();
  }

  /** 标定后自动摆图:转轮中点移到 x=0,安装高程线移到 y=0 */
  _applyAutoLayout() {
    if (!this.calib.pxPerMeter) return;
    const dx = this.runnerMid ? -this.runnerMid.x : 0;
    const dy = -this.calib.datumY;
    if (!dx && !dy) return;
    this.canvas.getObjects().forEach((o) => {
      if (o.data?.layer === 'base') {
        o.left += dx;
        o.top += dy;
        o.setCoords();
      }
    });
    if (this.runnerMid) this.runnerMid = { x: 0, y: this.runnerMid.y + dy };
    this.calib.datumY = 0;
    this._drawDatum();
    this.canvas.requestRenderAll();
  }

  _drawDatum() {
    this._datumObjs.forEach((o) => this.canvas.remove(o));
    this._datumObjs = [];
    if (!this.calib.pxPerMeter) return;
    const y = this.calib.datumY;
    const line = new Line([-20000, y, 20000, y], {
      stroke: '#e74c3c',
      strokeWidth: 1.5,
      strokeDashArray: [14, 6],
      selectable: false,
      evented: false,
    });
    line.data = { id: nid(), layer: 'base', role: 'datum' };
    const label = new IText(`安装高程 ${Number(this.calib.datumElev).toFixed(2)}m`, {
      left: (this.runnerMid?.x ?? 0) + 30,
      top: y - 26,
      fontSize: 16,
      fill: '#e74c3c',
      fontFamily: TAG_FONT,
      backgroundColor: 'rgba(255,255,255,0.85)',
      selectable: false,
      evented: false,
    });
    label.data = { id: nid(), layer: 'base', role: 'datum' };
    this.canvas.add(line, label);
    this._datumObjs = [line, label];
    this.applyLayers();
  }

  _emitCalib() {
    this.hooks.onCalib?.({ ...this.calib });
  }

  // ---------------------------------------------------------------- 剖切线 / 剖切视图

  _sectionStart(p) {
    this._secP1 = { x: p.x, y: p.y };
    this._secP2 = null;
  }

  _sectionFinish() {
    const p1 = this._secP1;
    const p2 = this._secP2;
    this._secP1 = this._secP2 = null;
    if (this._secPreview) {
      this.canvas.remove(this._secPreview);
      this._secPreview = null;
    }
    if (!p2 || Math.hypot(p2.x - p1.x, p2.y - p1.y) < 10) {
      this.canvas.requestRenderAll();
      return;
    }
    // 替换旧剖切线
    [this.cutline, ...this.grips].filter(Boolean).forEach((o) => this.canvas.remove(o));
    this.cutline = null;
    this.grips = [];
    this.sectionPts = [p1, p2];
    this._drawCutline();
    const pts = this.sectionPts;
    this.pushCmd(
      '画剖切线',
      () => {
        [this.cutline, ...this.grips].filter(Boolean).forEach((o) => this._remove(o));
        this.cutline = null;
        this.grips = [];
        this.sectionPts = null;
      },
      () => {
        this.sectionPts = pts.map((p) => ({ ...p }));
        this._drawCutline();
      }
    );
    this.hooks.onModeDone?.();
  }

  _drawCutline() {
    const [a, b] = this.sectionPts;
    this.cutline = new Line([a.x, a.y, b.x, b.y], {
      stroke: '#e67e22',
      strokeWidth: 2.5,
      strokeDashArray: [12, 6],
      selectable: false,
      evented: false,
    });
    this.cutline.data = { id: nid(), layer: 'section', role: 'cutline' };
    this.canvas.add(this.cutline);
    this.grips = [a, b].map((p, i) => {
      const g = new Circle({
        left: p.x,
        top: p.y,
        originX: 'center',
        originY: 'center',
        radius: 7,
        fill: '#fff',
        stroke: '#e67e22',
        strokeWidth: 2,
        hasControls: false,
        hasBorders: false,
        hoverCursor: 'move',
      });
      g.data = { id: nid(), layer: 'section', role: 'grip', grip: i };
      this.canvas.add(g);
      return g;
    });
    this.applyLayers();
    this.canvas.requestRenderAll();
  }

  _onGripDrag(grip, finalize) {
    const i = grip.data.grip;
    this.sectionPts[i] = { x: grip.left, y: grip.top };
    // 重画剖切线(重建 Line 最稳妥)
    if (this.cutline) this.canvas.remove(this.cutline);
    const [a, b] = this.sectionPts;
    this.cutline = new Line([a.x, a.y, b.x, b.y], {
      stroke: '#e67e22',
      strokeWidth: 2.5,
      strokeDashArray: [12, 6],
      selectable: false,
      evented: false,
    });
    this.cutline.data = { id: nid(), layer: 'section', role: 'cutline' };
    this.canvas.add(this.cutline);
    this.applyLayers();
    if (finalize && this.sectionImg) this.generateSection({ silent: true });
    this.canvas.requestRenderAll();
  }

  /** 由剖切线生成剖切视图:把底图沿线旋转裁出一条带状视图,单独成层 */
  generateSection({ silent = false } = {}) {
    const img0 = this.mainImage;
    const pts = this.sectionPts;
    if (!img0 || !pts) {
      this.hooks.onError?.('请先导入总装图并画一条剖切线');
      return;
    }
    const inv = util.invertTransform(img0.calcTransformMatrix());
    const toImg = (p) => {
      const l = util.transformPoint(p, inv);
      return { x: l.x + img0.width / 2, y: l.y + img0.height / 2 };
    };
    const P1 = toImg(pts[0]);
    const P2 = toImg(pts[1]);
    const W = Math.max(2, Math.hypot(P2.x - P1.x, P2.y - P1.y));
    const pxPerMeter = this.calib.pxPerMeter || 20;
    const bandCanvasPx = this.bandMeters * pxPerMeter;
    const H = Math.max(2, bandCanvasPx / img0.scaleX);
    const ang = Math.atan2(P2.y - P1.y, P2.x - P1.x);

    // 限制离屏画布尺寸,超出则按比例缩小
    const sf = Math.min(1, 4096 / W, 2048 / H);
    const off = document.createElement('canvas');
    off.width = Math.round(W * sf);
    off.height = Math.round(H * sf);
    const ctx = off.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, off.width, off.height);
    ctx.scale(sf, sf);
    ctx.translate(0, H / 2);
    ctx.rotate(-ang);
    ctx.translate(-P1.x, -P1.y);
    ctx.drawImage(img0.getElement(), 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, off.width, off.height);

    const dispScale = img0.scaleX / sf;
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const canvasAng = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    const n = { x: -Math.sin(canvasAng), y: Math.cos(canvasAng) };
    const offset = bandCanvasPx / 2 + 1.5 * pxPerMeter;

    const oldImg = this.sectionImg;
    const oldLabel = this.sectionLabel;
    const img = new FabricImage(off, {
      originX: 'center',
      originY: 'center',
      left: mid.x + n.x * offset,
      top: mid.y + n.y * offset,
      angle: (canvasAng * 180) / Math.PI,
      scaleX: dispScale,
      scaleY: dispScale,
    });
    img.data = {
      id: oldImg?.data?.id ?? nid(),
      layer: 'section',
      role: 'sectionView',
    };
    const label = new IText(`A-A 剖面(带宽 ${this.bandMeters}m)`, {
      originX: 'center',
      originY: 'center',
      left: mid.x + n.x * (offset + bandCanvasPx / 2 + 24),
      top: mid.y + n.y * (offset + bandCanvasPx / 2 + 24),
      fontSize: 16,
      fill: '#2c3e50',
      fontFamily: TAG_FONT,
      backgroundColor: 'rgba(255,255,255,0.85)',
    });
    label.data = {
      id: nid(),
      layer: 'section',
      role: 'sectionLabel',
      boundTo: img.data.id,
      anchorLocal: null,
    };
    label.data.anchorLocal = toLocalCentered(img, label.left, label.top);

    if (oldImg) this.canvas.remove(oldImg);
    if (oldLabel) this.canvas.remove(oldLabel);
    this.sectionImg = img;
    this.sectionLabel = label;
    this._add(img);
    this._add(label);
    this._followBound();

    if (!silent) {
      this.pushCmd(
        '生成剖切视图',
        () => {
          this._remove(img);
          this._remove(label);
          if (oldImg) this._add(oldImg);
          if (oldLabel) this._add(oldLabel);
          this.sectionImg = oldImg ?? null;
          this.sectionLabel = oldLabel ?? null;
        },
        () => {
          if (oldImg) this._remove(oldImg);
          if (oldLabel) this._remove(oldLabel);
          this._add(img);
          this._add(label);
          this.sectionImg = img;
          this.sectionLabel = label;
        }
      );
    }
    this.canvas.requestRenderAll();
  }

  // ---------------------------------------------------------------- 编号标注

  _makeTag(equip, xOff = 0) {
    const sec = this.sectionImg;
    let y;
    if (this.calib.pxPerMeter && equip.elev != null && !isNaN(equip.elev)) {
      y = this.calib.datumY - (equip.elev - this.calib.datumElev) * this.calib.pxPerMeter;
    } else {
      y = sec ? sec.getCenterPoint().y : 0;
    }
    const x = (sec ? sec.getCenterPoint().x : 0) + xOff;
    const t = new IText(equip.code, {
      left: x,
      top: y,
      originX: 'center',
      originY: 'center',
      fontSize: 18,
      fill: '#1a1a1a',
      backgroundColor: 'rgba(255,244,163,0.95)',
      fontFamily: TAG_FONT,
      textAlign: 'center',
    });
    t.data = { id: nid(), layer: 'tag', equipId: equip.id };
    if (sec) {
      t.data.boundTo = sec.data.id;
      t.data.anchorLocal = toLocalCentered(sec, x, y);
    }
    return t;
  }

  placeTag(equip) {
    const t = this._makeTag(equip);
    this._add(t);
    this.pushCmd('贴编号', () => this._remove(t), () => this._add(t));
    this.canvas.setActiveObject(t);
    this.canvas.requestRenderAll();
    this._emitSelection();
  }

  placeAllTags(equips) {
    const added = equips.map((eq, i) => this._makeTag(eq, (i - (equips.length - 1) / 2) * 40));
    added.forEach((t) => this._add(t));
    this.pushCmd(
      '全部贴标',
      () => added.forEach((t) => this._remove(t)),
      () => added.forEach((t) => this._add(t))
    );
    this.canvas.requestRenderAll();
  }

  _rebindTag(t) {
    const sec = this.sectionImg;
    if (!sec || t.data.boundTo !== sec.data.id) return;
    t.data.anchorLocal = toLocalCentered(sec, t.left, t.top);
  }

  _boundObjs() {
    const id = this.sectionImg?.data?.id;
    if (!id) return [];
    return this.canvas.getObjects().filter((o) => o.data?.boundTo === id);
  }

  _followBound() {
    const sec = this.sectionImg;
    if (!sec) return;
    const M = sec.calcTransformMatrix();
    this._boundObjs().forEach((o) => {
      if (!o.data.anchorLocal) return;
      const pos = util.transformPoint(o.data.anchorLocal, M);
      o.set({ left: pos.x, top: pos.y });
      o.setCoords();
    });
  }

  setTagFontSize(px) {
    const targets = this._selectedTags();
    if (!targets.length || !px) return 0;
    const before = this._snapshot(targets);
    targets.forEach((t) => t.set('fontSize', px));
    const after = this._snapshot(targets);
    this.pushCmd(
      '改字号',
      () => targets.forEach((t) => this._applyState(t, before.get(t.data.id))),
      () => targets.forEach((t) => this._applyState(t, after.get(t.data.id)))
    );
    this.canvas.requestRenderAll();
    this._emitSelection();
    return targets.length;
  }

  _selectedTags() {
    const ao = this.canvas.getActiveObject();
    if (!ao) return [];
    if (ao.type === 'activeselection')
      return ao.getObjects().filter((o) => o.data?.layer === 'tag');
    return ao.data?.layer === 'tag' ? [ao] : [];
  }

  // ---------------------------------------------------------------- 尺寸标注

  _dimStart(p) {
    const d = new Dim(
      { x: p.x, y: p.y },
      { x: p.x + 0.01, y: p.y + 0.01 },
      { ...this.dimStyle, pxPerMeter: this.calib.pxPerMeter }
    );
    d.data = { id: nid(), layer: 'dim' };
    this._add(d);
    this._dimDrawing = d;
  }

  _dimFinish() {
    const d = this._dimDrawing;
    this._dimDrawing = null;
    d.normalize();
    if (d.lengthPx() < 8) {
      this._remove(d);
      this.canvas.requestRenderAll();
      return;
    }
    this.pushCmd('画尺寸', () => this._remove(d), () => this._add(d));
    this.canvas.setActiveObject(d);
    this.canvas.requestRenderAll();
    this.hooks.onModeDone?.();
  }

  setDimStyle(patch) {
    Object.assign(this.dimStyle, patch);
    this.canvas.getObjects().forEach((o) => {
      if (o.type !== 'dim') return;
      if (patch.strokeWidth != null) o.strokeWidth = patch.strokeWidth;
      if (patch.arrowSize != null) o.arrowSize = patch.arrowSize;
      if (patch.fontSize != null) o.fontSize = patch.fontSize;
      o.normalize();
    });
    this.canvas.requestRenderAll();
  }

  // ---------------------------------------------------------------- 删除

  deleteSelection() {
    const ao = this.canvas.getActiveObject();
    if (!ao) return;
    const objs = ao.type === 'activeselection' ? ao.getObjects().slice() : [ao];
    const all = new Set();
    objs.forEach((o) => {
      if (!o.data) return;
      if (['datum', 'calibMark'].includes(o.data.role)) return;
      if (o.data.role === 'grip') return;
      all.add(o);
      if (o === this.cutline) this.grips.forEach((g) => all.add(g));
    });
    if (!all.size) return;
    const list = [...all];
    this.canvas.discardActiveObject();
    list.forEach((o) => this._remove(o));
    if (list.includes(this.cutline)) {
      this.cutline = null;
      this.grips = [];
      this.sectionPts = null;
    }
    if (list.includes(this.sectionImg)) this.sectionImg = null;
    if (list.includes(this.sectionLabel)) this.sectionLabel = null;
    this.pushCmd(
      '删除',
      () => list.forEach((o) => this._add(o)),
      () => list.forEach((o) => this._remove(o))
    );
    this._emitSelection();
    this.canvas.requestRenderAll();
  }

  // ---------------------------------------------------------------- 撤销 / 重做

  pushCmd(label, undo, redo) {
    this.undoStack.push({ label, undo, redo });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this._emitHist();
  }

  undo() {
    const c = this.undoStack.pop();
    if (!c) return;
    c.undo();
    this.redoStack.push(c);
    this.canvas.discardActiveObject();
    this._emitSelection();
    this._emitHist();
    this.canvas.requestRenderAll();
  }

  redo() {
    const c = this.redoStack.pop();
    if (!c) return;
    c.redo();
    this.undoStack.push(c);
    this.canvas.discardActiveObject();
    this._emitSelection();
    this._emitHist();
    this.canvas.requestRenderAll();
  }

  _emitHist() {
    this.hooks.onHist?.({ undo: this.undoStack.length, redo: this.redoStack.length });
  }

  // 变换快照:一次手势 = 一步撤销(不按每次 mousemove 记)
  _captureBefore(opt) {
    const ao = this.canvas.getActiveObject() || opt.target;
    if (!ao || ao.data?.role === 'grip') return;
    let objs = ao.type === 'activeselection' ? ao.getObjects().slice() : [ao];
    if (ao === this.sectionImg) objs = objs.concat(this._boundObjs());
    this._tfBefore = this._snapshot(objs);
  }

  _snapshot(objs) {
    const m = new Map();
    objs.forEach((o) => m.set(o.data.id, this._stateOf(o)));
    return m;
  }

  _stateOf(o) {
    const s = {};
    if (o.group && o.group.type === 'activeselection') {
      // 组内子对象:记录换算后的绝对状态,保证撤销时位置不跑偏
      const M = o.group.calcTransformMatrix();
      const p = util.transformPoint({ x: o.left, y: o.top }, M);
      s.left = p.x;
      s.top = p.y;
      s.scaleX = o.scaleX * o.group.scaleX;
      s.scaleY = o.scaleY * o.group.scaleY;
      s.angle = o.angle + o.group.angle;
    } else {
      s.left = o.left;
      s.top = o.top;
      s.scaleX = o.scaleX;
      s.scaleY = o.scaleY;
      s.angle = o.angle;
    }
    if (o.data?.layer === 'tag') {
      s.fontSize = o.fontSize;
      s.text = o.text;
    }
    if (o.type === 'dim') {
      s.rel = JSON.parse(JSON.stringify(o.rel));
      s.abs = JSON.parse(JSON.stringify(o._abs));
    }
    return s;
  }

  _applyState(o, s) {
    o.set({ left: s.left, top: s.top, scaleX: s.scaleX, scaleY: s.scaleY, angle: s.angle });
    if (s.fontSize != null) o.set('fontSize', s.fontSize);
    if (s.text != null) o.set('text', s.text);
    if (s.rel) {
      o.rel = JSON.parse(JSON.stringify(s.rel));
      o._abs = JSON.parse(JSON.stringify(s.abs));
      o.normalize();
    }
    o.setCoords();
  }

  _pushTransformCmd() {
    if (!this._tfBefore) return;
    const before = this._tfBefore;
    this._tfBefore = null;
    const ids = [...before.keys()];
    const objs = ids.map((id) => this._find(id)).filter(Boolean);
    const after = this._snapshot(objs);
    if (JSON.stringify([...before]) === JSON.stringify([...after])) return;
    this.pushCmd(
      '变换',
      () => ids.forEach((id) => {
        const o = this._find(id);
        if (o) this._applyState(o, before.get(id));
      }),
      () => ids.forEach((id) => {
        const o = this._find(id);
        if (o) this._applyState(o, after.get(id));
      })
    );
  }

  _find(id) {
    return this.canvas.getObjects().find((o) => o.data?.id === id);
  }

  /** 把缩放烘进对象本身:标签烘进字号,尺寸烘进端点,图片保留 scale */
  _bake(obj) {
    if (!obj) return;
    const sx = obj.scaleX ?? 1;
    const sy = obj.scaleY ?? 1;
    if (Math.abs(sx - 1) < 1e-6 && Math.abs(sy - 1) < 1e-6) return;
    if (obj.data?.layer === 'tag') {
      obj.set({
        fontSize: Math.max(6, Math.round(obj.fontSize * sy)),
        scaleX: 1,
        scaleY: 1,
      });
    } else if (obj.type === 'dim') {
      const c = obj.getCenterPoint();
      obj._abs = obj.rel.map((p) => ({ x: c.x + p.x * sx, y: c.y + p.y * sy }));
      obj.fontSize = Math.max(6, obj.fontSize * sy);
      obj.set({ scaleX: 1, scaleY: 1 });
      obj.normalize();
    }
    // 图片/其他:保留 scale,不处理
    obj.setCoords();
  }

  // ---------------------------------------------------------------- 基础增删

  _add(o) {
    this.canvas.add(o);
    this.applyLayers();
  }

  _remove(o) {
    this.canvas.remove(o);
  }

  _emitSelection() {
    const ao = this.canvas.getActiveObject();
    let tags = [];
    let count = 0;
    if (ao) {
      const objs = ao.type === 'activeselection' ? ao.getObjects() : [ao];
      count = objs.length;
      tags = objs.filter((o) => o.data?.layer === 'tag');
    }
    this.hooks.onSelect?.({
      count,
      tags: tags.length,
      fontSize: tags.length ? tags[0].fontSize : '',
    });
  }

  // ---------------------------------------------------------------- 导出

  exportPNG(equipments, title) {
    const m = 2;
    const src = this.canvas.toCanvasElement(m); // 只渲染可见对象 → 按当前图层显隐导出
    const W = src.width;
    const H = src.height;
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(src, 0, 0);

    // 图名
    ctx.fillStyle = '#111';
    ctx.font = `bold ${15 * m}px ${TAG_FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title || '抽水蓄能机组剖切交底图', 10 * m, 8 * m);

    // 比例尺(左下)
    const sb = niceScale(this.calib.pxPerMeter, this.canvas.getZoom());
    if (sb) {
      const bw = sb.px * m;
      const x = 16 * m;
      const y = H - 24 * m;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5 * m;
      ctx.beginPath();
      ctx.moveTo(x, y - 5 * m);
      ctx.lineTo(x, y);
      ctx.lineTo(x + bw, y);
      ctx.lineTo(x + bw, y - 5 * m);
      ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y - 3 * m, bw / 2, 3 * m);
      ctx.font = `${11 * m}px ${TAG_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(sb.meters >= 1 ? `${sb.meters} m` : `${sb.meters * 100} cm`, x + bw / 2, y - 7 * m);
    }

    // 指北针(右上)
    const nx = W - 34 * m;
    const ny = 34 * m;
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(nx, ny - 16 * m);
    ctx.lineTo(nx + 8 * m, ny + 10 * m);
    ctx.lineTo(nx, ny + 4 * m);
    ctx.lineTo(nx - 8 * m, ny + 10 * m);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = `bold ${12 * m}px ${TAG_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('N', nx, ny + 13 * m);

    // 设备编号表(右下)
    const rows = equipments.slice(0, 24);
    if (rows.length) {
      const cols = [30, 80, 110, 90];
      const rh = 20;
      const tw = cols.reduce((a, b) => a + b, 0) * m;
      const th = (rows.length + 1) * rh * m;
      const tx = W - tw - 14 * m;
      const ty = H - th - 14 * m;
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.fillRect(tx, ty, tw, th);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1 * m;
      ctx.strokeRect(tx, ty, tw, th);
      ctx.font = `${10 * m}px ${TAG_FONT}`;
      ctx.fillStyle = '#111';
      ctx.textBaseline = 'middle';
      const heads = ['序号', '设备编号', '名称', '安装高程(m)'];
      let cx0 = tx;
      heads.forEach((h, i) => {
        ctx.textAlign = 'center';
        ctx.fillText(h, cx0 + (cols[i] * m) / 2, ty + (rh * m) / 2);
        cx0 += cols[i] * m;
      });
      rows.forEach((r, ri) => {
        const ry = ty + (ri + 1) * rh * m;
        ctx.strokeStyle = '#999';
        ctx.beginPath();
        ctx.moveTo(tx, ry);
        ctx.lineTo(tx + tw, ry);
        ctx.stroke();
        const vals = [String(ri + 1), r.code, r.name, r.elev != null && !isNaN(r.elev) ? Number(r.elev).toFixed(2) : ''];
        let cx = tx;
        vals.forEach((v, i) => {
          ctx.textAlign = 'center';
          ctx.fillText(String(v), cx + (cols[i] * m) / 2, ry + (rh * m) / 2);
          cx += cols[i] * m;
        });
      });
      let vx = tx;
      ctx.strokeStyle = '#999';
      cols.forEach((cw) => {
        ctx.beginPath();
        ctx.moveTo(vx, ty);
        ctx.lineTo(vx, ty + th);
        ctx.stroke();
        vx += cw * m;
      });
      ctx.beginPath();
      ctx.moveTo(vx, ty);
      ctx.lineTo(vx, ty + th);
      ctx.stroke();
    }

    out.toBlob((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = '机组剖切交底图.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  }
}
