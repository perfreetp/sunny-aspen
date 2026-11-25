// 机场灯光地图引擎：PixiJS v7 + pixi-viewport v4
// 能力：空间网格剔除、三级 LOD（完整/抽稀/聚合）、对象池、标注碰撞避让、框选、跨视图联动
import { Application, Container, Graphics, Sprite, Texture, Text, Renderer } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { getDataset } from '../data/generator.js';
import { CATEGORY_MAP } from '../data/categories.js';

const CELL = 250; // 空间网格边长（米）
const TOL_PX = 9; // 拾取容差（屏幕像素）

function makeCircleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 2, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.95)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(16, 16, 15, 0, Math.PI * 2);
  g.fill();
  return Texture.from(c);
}

function makeDiamondTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.strokeStyle = '#ff4d4d';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(16, 3);
  g.lineTo(29, 16);
  g.lineTo(16, 29);
  g.lineTo(3, 16);
  g.closePath();
  g.stroke();
  return Texture.from(c);
}

function makeAnchorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.28)';
  g.beginPath();
  g.arc(16, 16, 14, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(16, 16, 12, 0, Math.PI * 2);
  g.stroke();
  return Texture.from(c);
}

export class MapEngine {
  /**
   * @param {HTMLElement} host 容器元素
   * @param {string} viewId overview | detail
   * @param {object} handlers { onSelect(id), onMarquee(report), onLodStats(stats) }
   */
  constructor(host, viewId, handlers) {
    this.host = host;
    this.viewId = viewId;
    this.handlers = handlers;
    this.ds = getDataset();
    this.features = this.ds.features;
    this.config = null; // 由外部 syncConfig 注入
    this.visibility = {};
    this.bias = 1;
    this.showMissing = true;
    this.marqueeMode = false;
    this._lastSig = '';
    this._selectedId = null;
    this._hoverId = null;
    this._destroyed = false;

    this._buildGrid();
    this._precomputeGroupAnchors();
    this._initPixi(); // Pixi v7：Application 同步初始化
    this._drawBaseMap();
    this._bindEvents();
    this._fitInitial();
    this._syncTransformAndRender(true);
  }

  // ---------- 空间索引 ----------
  _buildGrid() {
    this.grid = new Map();
    this.features.forEach((f, i) => {
      const key = this._cellKey(f.x, f.y);
      let arr = this.grid.get(key);
      if (!arr) this.grid.set(key, (arr = []));
      arr.push(i);
    });
  }

  _cellKey(x, y) {
    return `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
  }

  _precomputeGroupAnchors() {
    // 每个灯组的标注锚点（组内要素平均坐标）
    const acc = new Map();
    for (const f of this.features) {
      let a = acc.get(f.groupId);
      if (!a) acc.set(f.groupId, (a = { sx: 0, sy: 0, n: 0, name: f.groupName, cat: f.categoryId }));
      a.sx += f.x;
      a.sy += f.y;
      a.n++;
    }
    this.groupAnchors = [...acc.entries()].map(([id, a]) => ({
      id,
      name: a.name,
      cat: a.cat,
      x: a.sx / a.n,
      y: a.sy / a.n
    }));
    this.runwayAnchors = this.ds.meta.runways.map((r) => ({
      id: r.id,
      name: `跑道 ${r.id}`,
      x: (r.x0 + r.x1) / 2,
      y: r.y
    }));
  }

  // ---------- Pixi 初始化（v7 同步 API）----------
  _initPixi() {
    const w = this.host.clientWidth || 800;
    const h = this.host.clientHeight || 600;
    const rendererOpts = {
      width: w,
      height: h,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      backgroundAlpha: 0,
      powerPreference: 'high-performance'
    };
    // 显式创建 WebGL Renderer：v7 的 autoDetect 仅探测 WebGL1，WebGL2-only 环境会失败
    let renderer;
    try {
      renderer = new Renderer(rendererOpts);
    } catch (e) {
      throw new Error('Pixi WebGL 渲染器初始化失败：' + e.message);
    }
    this.app = new Application({ renderer });
    this.app.resizeTo = this.host;
    if (!this.app.renderer) throw new Error('Pixi 渲染器初始化失败（WebGL 不可用）');
    this.host.appendChild(this.app.view);
    this.app.view.style.position = 'absolute';
    this.app.view.style.inset = '0';

    this.texCircle = makeCircleTexture();
    this.texDiamond = makeDiamondTexture();
    this.texAnchor = makeAnchorTexture();

    this.viewport = new Viewport({
      screenWidth: w,
      screenHeight: h,
      events: this.app.renderer.events
    });
    this.app.stage.addChild(this.viewport);
    this.viewport
      .drag({ direction: 'all' })
      .wheel({ center: 'pointer', smooth: 12 })
      .pinch()
      .decelerate({ friction: 0.92 });

    this.baseLayer = new Graphics();
    this.anchorLayer = new Container();
    this.pointLayer = new Container();
    this.missingLayer = new Container();
    this.haloLayer = new Graphics();
    this.marqueeLayer = new Graphics();
    this.viewport.addChild(this.baseLayer, this.anchorLayer, this.pointLayer, this.missingLayer, this.haloLayer, this.marqueeLayer);

    // 各类别对象池
    this.pointPools = {};
    this.anchorPools = {};
    for (const cat of Object.keys(CATEGORY_MAP)) {
      this.pointPools[cat] = [];
      this.anchorPools[cat] = [];
    }
    this.missingPool = [];

    // HTML 标注层
    this.labelHost = document.createElement('div');
    this.labelHost.className = 'label-layer';
    this.host.appendChild(this.labelHost);
    this.labelPool = [];

    this.app.ticker.add(() => {
      if (this._destroyed) return;
      this._syncTransformAndRender(false);
      this._pulseHalos();
    });
  }

  _fitInitial() {
    if (!this.viewport) return;
    const b = this.ds.bounds;
    const w = this.host.clientWidth || 800;
    const h = this.host.clientHeight || 600;
    const pad = 120;
    const sx = (w - pad * 2) / (b.maxX - b.minX);
    const sy = (h - pad * 2) / (b.maxY - b.minY);
    const s = Math.min(sx, sy);
    this.viewport.scale.set(s);
    this.viewport.moveCenter(0, -300);
  }

  // ---------- 底图（测绘资料：跑道/滑行道/机坪/围界）----------
  _drawBaseMap() {
    const g = this.baseLayer;
    const m = this.ds.meta;

    // 机坪
    g.beginFill(0x232a38, 0.85).drawRect(-1700, -1520, 3400, 360).endFill();
    // 滑行道（v7：lineStyle 后构建折线，finishPoly 触发描边）
    for (const tw of m.taxiways) {
      g.lineStyle(23, 0x394256, 0.9, 0.5);
      g.moveTo(tw.points[0][0], tw.points[0][1]);
      for (let i = 1; i < tw.points.length; i++) g.lineTo(tw.points[i][0], tw.points[i][1]);
      g.finishPoly();
    }
    // 围界
    const bnd = m.boundary;
    g.lineStyle(3, 0x5b6b8c, 0.7);
    g.moveTo(bnd[0][0], bnd[0][1]);
    for (let i = 1; i < bnd.length; i++) g.lineTo(bnd[i][0], bnd[i][1]);
    g.finishPoly();
    g.lineStyle(0);

    // 跑道
    for (const r of m.runways) {
      const len = r.x1 - r.x0;
      g.beginFill(0x151a24, 0.92).drawRoundedRect(r.x0, r.y - r.width / 2, len, r.width, 8).endFill();
      // 中线虚线
      const dash = 30;
      g.beginFill(0x8a93a8, 0.8);
      for (let x = r.x0 + 40; x < r.x1 - 40; x += dash * 2) {
        g.drawRect(x, r.y - 0.8, dash, 1.6);
      }
      g.endFill();
      // 入口横纹
      g.beginFill(0x9aa4bb, 0.85);
      for (const ex of [r.x0 + 12, r.x1 - 12]) {
        for (let yy = -r.width / 2 + 6; yy < r.width / 2 - 6; yy += 8) {
          g.drawRect(ex - 1.5, r.y + yy, 3, 4);
        }
      }
      g.endFill();
      // 方位标注
      const style = { fill: 0x9fb0d0, fontSize: 26, fontWeight: '600' };
      const t = new Text(r.id.split('/')[0], style);
      t.anchor.set(0.5);
      t.position.set(r.x0 + 110, r.y);
      this.baseLayer.addChild(t);
      const t2 = new Text(r.id.split('/')[1], style);
      t2.anchor.set(0.5);
      t2.position.set(r.x1 - 110, r.y);
      t2.rotation = Math.PI;
      this.baseLayer.addChild(t2);
    }
  }

  // ---------- 交互事件 ----------
  _bindEvents() {
    const vp = this.viewport;

      vp.on('clicked', (data) => {
        if (this.marqueeMode) return;
        const w = data.world;
        const id = this._pick(w.x, w.y);
        this.handlers.onSelect(id);
      });

      vp.on('pointermove', (e) => {
        const s = e.global;
        const w = vp.toWorld(s.x, s.y);
        const id = this._pick(w.x, w.y);
        if (id !== this._hoverId) {
          this._hoverId = id;
          this.host.style.cursor = id ? 'pointer' : this.marqueeMode ? 'crosshair' : 'grab';
          this._syncTransformAndRender(true);
        }
      });

      // 框选
      vp.on('pointerdown', (e) => {
        if (!this.marqueeMode) return;
        this._marqueeStart = { ...vp.toWorld(e.global.x, e.global.y), sx: e.global.x, sy: e.global.y };
        vp.plugins.pause('drag');
        this.host.style.cursor = 'crosshair';
      });
      vp.on('pointermove', (e) => {
        if (!this._marqueeStart) return;
        const w = vp.toWorld(e.global.x, e.global.y);
        this._marqueeCur = w;
        this._drawMarquee();
      });
      const endMarquee = (e) => {
        if (!this._marqueeStart) return;
        const w = vp.toWorld(e.global.x, e.global.y);
        const rect = {
          minX: Math.min(this._marqueeStart.x, w.x),
          maxX: Math.max(this._marqueeStart.x, w.x),
          minY: Math.min(this._marqueeStart.y, w.y),
          maxY: Math.max(this._marqueeStart.y, w.y)
        };
        this._marqueeStart = null;
        this._marqueeCur = null;
        this.marqueeLayer.clear();
        if (this.marqueeMode) vp.plugins.resume('drag');
        this.host.style.cursor = 'grab';
        if (rect.maxX - rect.minX > 6 && rect.maxY - rect.minY > 6) {
          this._runMarquee(rect);
        }
      };
      vp.on('pointerup', endMarquee);
      vp.on('pointerupoutside', endMarquee);

      // Ctrl + 拖拽 = 旋转视图
      let rotateStart = null;
      vp.on('pointerdown', (e) => {
        if (!e.nativeEvent.ctrlKey) return;
        rotateStart = { sx: e.global.x, sy: e.global.y, rot: vp.rotation };
        vp.plugins.pause('drag');
      });
      vp.on('pointermove', (e) => {
        if (!rotateStart) return;
        const dx = e.global.x - rotateStart.sx;
        vp.rotation = rotateStart.rot + dx * 0.008;
      });
      const endRotate = () => {
        if (!rotateStart) return;
        rotateStart = null;
        if (!this.marqueeMode) vp.plugins.resume('drag');
        this._syncTransformAndRender(true);
      };
      vp.on('pointerup', endRotate);
      vp.on('pointerupoutside', endRotate);
  }

  _pick(wx, wy) {
    const scale = this.viewport.scale.x;
    const tol = TOL_PX / scale;
    const cx = Math.floor(wx / CELL);
    const cy = Math.floor(wy / CELL);
    let best = null;
    let bestD = tol;
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const arr = this.grid.get(`${gx},${gy}`);
        if (!arr) continue;
        for (const i of arr) {
          const f = this.features[i];
          if (f.status === 'missing' || !this.visibility[f.categoryId]) continue;
          const d = Math.hypot(f.x - wx, f.y - wy);
          if (d < bestD) {
            bestD = d;
            best = f.id;
          }
        }
      }
    }
    return best;
  }

  // ---------- 框选缺失分析 ----------
  _runMarquee(rect) {
    const inside = this.features.filter(
      (f) => f.x >= rect.minX && f.x <= rect.maxX && f.y >= rect.minY && f.y <= rect.maxY
    );
    if (!inside.length) {
      this.handlers.onMarquee({ rect, reports: [] });
      return;
    }
    // 按 类别+线路+侧别 归组，检测 designIndex 断号
    const groups = new Map();
    for (const f of inside) {
      const side = /-(L|R)-\d+$/.test(f.id) ? f.id.match(/-(L|R)-\d+$/)[1] : 'X';
      const key = `${f.categoryId}|${f.lineId}|${side}`;
      if (!groups.has(key)) groups.set(key, { cat: f.categoryId, line: f.lineId, side, ok: [], missing: [] });
      const g = groups.get(key);
      (f.status === 'missing' ? g.missing : g.ok).push(f);
    }
    const reports = [];
    for (const g of groups.values()) {
      const ids = new Set();
      // 1) 已登记缺失的要素
      for (const f of g.missing) ids.add(f.id);
      // 2) 内部断号：仅当缺号前后相邻灯都在选区内才成立，避免框选边界把未框入的灯误判为缺失
      if (g.ok.length >= 2) {
        const idxs = g.ok.map((f) => f.designIndex);
        const present = new Set(idxs);
        const tmpl = g.ok[0].id.replace(/\d+$/, '');
        const pad = (g.ok[0].id.match(/(\d+)$/) || ['', '3'])[1].length;
        for (let i = Math.min(...idxs) + 1; i < Math.max(...idxs); i++) {
          if (!present.has(i) && present.has(i - 1) && present.has(i + 1)) {
            ids.add(`${tmpl}${String(i + 1).padStart(pad, '0')}`);
          }
        }
      }
      if (ids.size) {
        reports.push({
          categoryId: g.cat,
          lineId: g.line,
          side: g.side,
          missingIds: [...ids].sort()
        });
      }
    }
    this.handlers.onMarquee({ rect, reports });
  }

  _drawMarquee() {
    const g = this.marqueeLayer;
    g.clear();
    if (!this._marqueeStart || !this._marqueeCur) return;
    const a = this._marqueeStart;
    const b = this._marqueeCur;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    g.beginFill(0x4aa3ff, 0.12).drawRect(x, y, w, h).endFill();
    g.lineStyle(2 / this.viewport.scale.x, 0x66b3ff, 0.95, 0.5);
    g.drawRect(x, y, w, h);
    g.lineStyle(0);
  }

  // ---------- 外部接口 ----------
  syncConfig(cfg) {
    this.config = cfg;
    this.bias = cfg.simplificationBias;
    this.visibility = Object.fromEntries(cfg.categories.map((c) => [c.id, c.visible]));
    this._syncTransformAndRender(true);
  }

  setMarqueeMode(on) {
    this.marqueeMode = on;
    if (this.app) this.host.style.cursor = on ? 'crosshair' : 'grab';
    if (this.viewport) {
      if (on) this.viewport.plugins.pause('drag');
      else this.viewport.plugins.resume('drag');
    }
    if (!on && this.viewport) this.marqueeLayer.clear();
  }

  setShowMissing(on) {
    this.showMissing = on;
    this._syncTransformAndRender(true);
  }

  setSelected(id) {
    this._selectedId = id;
    this._syncTransformAndRender(true);
  }

  /** 跨视图联动：飞行定位到要素 */
  flyToFeature(id, opts = {}) {
    const f = this.features.find((x) => x.id === id);
    if (!f || !this.viewport) return;
    this._selectedId = id;
    // v4 Animate 不支持 rotation，旋转直接复位；位置/缩放走动画
    if (!opts.keepRotation) this.viewport.rotation = 0;
    // 全图视图只做定位、维持全局感；局部视图放大到米级看完整灯组
    const defaultScale = this.viewId === 'overview' ? Math.max(this.viewport.scale.x, 0.08) : 0.9;
    this.viewport.animate({
      position: { x: f.x, y: f.y },
      scale: opts.zoomScale ?? defaultScale,
      time: 550,
      ease: 'easeInOutSine'
    });
  }

  rotateBy(deg) {
    if (!this.viewport) return;
    this.viewport.rotation += (deg * Math.PI) / 180;
    this._syncTransformAndRender(true);
  }

  resetRotation() {
    if (!this.viewport) return;
    this.viewport.rotation = 0;
    this._syncTransformAndRender(true);
  }

  fitAll() {
    if (!this.viewport) return;
    this._fitInitial();
    this._syncTransformAndRender(true);
  }

  getLodLevel(mpp, catCfg) {
    const t1 = catCfg.thresholds.lod1 * this.bias;
    const t2 = catCfg.thresholds.lod2 * this.bias;
    let level = 0;
    if (mpp >= t2) level = 2;
    else if (mpp >= t1) level = 1;
    if (catCfg.minLevel > 0 && level > 1) level = 1; // 高优先级类别不参与聚合
    return level;
  }

  // ---------- 每帧渲染 ----------
  _syncTransformAndRender(force) {
    if (!this.app || !this.viewport || !this.config) return;
    const vp = this.viewport;
    const sig = `${vp.x.toFixed(1)}|${vp.y.toFixed(1)}|${vp.scale.x.toFixed(4)}|${vp.rotation.toFixed(3)}`;
    if (!force && sig === this._lastSig) return;
    this._lastSig = sig;

    const scale = vp.scale.x;
    const mpp = 1 / scale;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;

    // 视锥世界范围（含旋转，取四角外包矩形）
    const corners = [vp.toWorld(0, 0), vp.toWorld(w, 0), vp.toWorld(w, h), vp.toWorld(0, h)];
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const vb = {
      minX: Math.min(...xs) - CELL,
      maxX: Math.max(...xs) + CELL,
      minY: Math.min(...ys) - CELL,
      maxY: Math.max(...ys) + CELL
    };

    const catCfg = Object.fromEntries(this.config.categories.map((c) => [c.id, c]));
    const levelOf = {};
    for (const c of this.config.categories) levelOf[c.id] = this.getLodLevel(mpp, c);

    // 单遍扫描可见网格
    const buckets = new Map(); // LOD2 聚合
    const ptr = Object.fromEntries(Object.keys(this.pointPools).map((k) => [k, 0]));
    const aptr = Object.fromEntries(Object.keys(this.anchorPools).map((k) => [k, 0]));
    let missPtr = 0;
    const lodCount = { 0: 0, 1: 0, 2: 0 };
    let visibleCount = 0;

    const gx0 = Math.floor(vb.minX / CELL);
    const gx1 = Math.floor(vb.maxX / CELL);
    const gy0 = Math.floor(vb.minY / CELL);
    const gy1 = Math.floor(vb.maxY / CELL);

    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gy = gy0; gy <= gy1; gy++) {
        const arr = this.grid.get(`${gx},${gy}`);
        if (!arr) continue;
        for (const i of arr) {
          const f = this.features[i];
          if (f.x < vb.minX || f.x > vb.maxX || f.y < vb.minY || f.y > vb.maxY) continue;
          if (!this.visibility[f.categoryId]) continue;
          visibleCount++;
          const level = levelOf[f.categoryId];
          lodCount[level]++;

          if (f.status === 'missing') {
            if (this.showMissing && level < 2) this._placeMissing(f, missPtr++, scale);
            continue;
          }
          if (level === 2) {
            const bk = `${f.categoryId}|${gx},${gy}`;
            let b = buckets.get(bk);
            if (!b) buckets.set(bk, (b = { cat: f.categoryId, gx, gy, sx: 0, sy: 0, n: 0 }));
            b.sx += f.x;
            b.sy += f.y;
            b.n++;
          } else {
            // LOD1 抽稀：按 designIndex 步长
            if (level === 1) {
              const stride = Math.min(8, Math.max(2, Math.round(mpp / (catCfg[f.categoryId].thresholds.lod1 * this.bias))));
              if (f.designIndex % stride !== 0) continue;
            }
            this._placePoint(f, ptr[f.categoryId]++, scale);
          }
        }
      }
    }

    // 聚合锚点
    for (const b of buckets.values()) {
      this._placeAnchor(b, aptr[b.cat]++, scale);
    }

    // 隐藏多余池对象
    for (const cat of Object.keys(this.pointPools)) {
      const pool = this.pointPools[cat];
      for (let i = ptr[cat]; i < pool.length; i++) pool[i].visible = false;
      const apool = this.anchorPools[cat];
      for (let i = aptr[cat]; i < apool.length; i++) apool[i].visible = false;
    }
    for (let i = missPtr; i < this.missingPool.length; i++) this.missingPool[i].visible = false;

    this._drawHalos(scale);
    this._updateLabels(mpp, vb);

    if (
      !this._lastStats ||
      this._lastStats[0] !== lodCount[0] ||
      this._lastStats[1] !== lodCount[1] ||
      this._lastStats[2] !== lodCount[2]
    ) {
      this._lastStats = [lodCount[0], lodCount[1], lodCount[2]];
      this.handlers.onLodStats({ lod0: lodCount[0], lod1: lodCount[1], lod2: lodCount[2], visible: visibleCount });
    }
  }

  _placePoint(f, slot, scale) {
    const pool = this.pointPools[f.categoryId];
    let s = pool[slot];
    if (!s) {
      s = new Sprite(this.texCircle);
      s.eventMode = 'none';
      s.anchor.set(0.5);
      this.pointLayer.addChild(s);
      pool.push(s);
    }
    const cat = CATEGORY_MAP[f.categoryId];
    s.visible = true;
    s.texture = this.texCircle;
    s.tint = cat.color;
    s.position.set(f.x, f.y);
    const px = f.categoryId === 'obstruction' ? 7 : 5;
    s.scale.set(px / 32 / scale);
  }

  _placeMissing(f, slot, scale) {
    let s = this.missingPool[slot];
    if (!s) {
      s = new Sprite(this.texDiamond);
      s.eventMode = 'none';
      s.anchor.set(0.5);
      this.missingLayer.addChild(s);
      this.missingPool.push(s);
    }
    s.visible = true;
    s.position.set(f.x, f.y);
    s.scale.set(9 / 32 / scale);
  }

  _placeAnchor(b, slot, scale) {
    const pool = this.anchorPools[b.cat];
    let s = pool[slot];
    if (!s) {
      s = new Sprite(this.texAnchor);
      s.eventMode = 'none';
      s.anchor.set(0.5);
      this.anchorLayer.addChild(s);
      pool.push(s);
    }
    const cat = CATEGORY_MAP[b.cat];
    s.visible = true;
    s.tint = cat.color;
    s.position.set(b.sx / b.n, b.sy / b.n);
    const px = 11 + Math.min(13, Math.sqrt(b.n) * 1.4);
    s.scale.set(px / 32 / scale);
  }

  _drawHalos(scale) {
    const g = this.haloLayer;
    g.clear();
    const draw = (id, color, width) => {
      const f = this.features.find((x) => x.id === id);
      if (!f || !this.visibility[f.categoryId]) return;
      g.lineStyle(width / scale, color, 0.95, 0.5);
      g.drawCircle(f.x, f.y, 13 / scale);
      g.lineStyle(0);
    };
    if (this._selectedId) draw(this._selectedId, 0xffd166, 2.4);
    if (this._hoverId && this._hoverId !== this._selectedId) draw(this._hoverId, 0xffffff, 1.4);
  }

  _pulseHalos() {
    if (!this.haloLayer) return;
    this.haloLayer.alpha = 0.75 + 0.25 * Math.sin(performance.now() / 280);
  }

  // ---------- HTML 标注（碰撞避让，旋转后自动重排）----------
  _updateLabels(mpp, vb) {
    const items = [];
    const push = (x, y, text, cls, priority) => {
      if (x < vb.minX || x > vb.maxX || y < vb.minY || y > vb.maxY) return;
      const s = this.viewport.toScreen(x, y);
      items.push({ x: s.x, y: s.y, text, cls, priority });
    };

    // 跑道名
    if (mpp < 6) for (const r of this.runwayAnchors) push(r.x, r.y, r.name, 'lb-runway', 2);
    // 灯组名（按缩放级别放开数量）
    const groupLimit = mpp < 0.8 ? 0 : mpp < 2.5 ? 1 : mpp < 5 ? 2 : 99;
    for (const a of this.groupAnchors) {
      const isApron = a.id.startsWith('APRON-STAND');
      if (isApron && groupLimit > 0) continue;
      if (!isApron && groupLimit > 2) continue;
      if (!this.visibility[a.cat]) continue;
      push(a.x, a.y, a.name, 'lb-group', 1);
    }
    // 选中/悬停要素编号（最高优先级）
    if (this._hoverId) {
      const f = this.features.find((x) => x.id === this._hoverId);
      if (f) push(f.x, f.y, f.id, 'lb-feature', 3);
    }
    if (this._selectedId) {
      const f = this.features.find((x) => x.id === this._selectedId);
      if (f) push(f.x, f.y, f.id, 'lb-feature lb-selected', 4);
    }

    items.sort((a, b) => b.priority - a.priority);

    // 碰撞检测：候选方位 右/上/下/左，全部冲突则隐藏
    const placed = [];
    let slot = 0;
    for (const it of items) {
      const el = this._labelSlot(slot++);
      el.textContent = it.text;
      el.className = `map-label ${it.cls}`;
      el.style.display = 'block';
      const lw = el.offsetWidth;
      const lh = el.offsetHeight;
      const candidates = [
        [10, -lh / 2],
        [-lw / 2, -lh - 8],
        [-lw / 2, 10],
        [-lw - 10, -lh / 2]
      ];
      let put = false;
      for (const [ox, oy] of candidates) {
        const rect = { x: it.x + ox, y: it.y + oy, w: lw, h: lh };
        if (!placed.some((p) => rect.x < p.x + p.w + 4 && rect.x + rect.w + 4 > p.x && rect.y < p.y + p.h + 2 && rect.y + rect.h + 2 > p.y)) {
          el.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
          placed.push(rect);
          put = true;
          break;
        }
      }
      if (!put) el.style.display = 'none';
    }
    for (let i = slot; i < this.labelPool.length; i++) this.labelPool[i].style.display = 'none';
  }

  _labelSlot(i) {
    let el = this.labelPool[i];
    if (!el) {
      el = document.createElement('div');
      this.labelHost.appendChild(el);
      this.labelPool.push(el);
    }
    return el;
  }

  destroy() {
    this._destroyed = true;
    if (this.app) {
      this.app.destroy(true, { children: true, texture: false });
    }
    this.labelHost?.remove();
  }
}
