import { FabricObject, Control, Point, util } from 'fabric';

/** 画布坐标 → 对象本地(中心原点)坐标;fabric v6 移除了 toLocalPoint,自行实现 */
export function toLocalCentered(obj, x, y) {
  return util.transformPoint({ x, y }, util.invertTransform(obj.calcTransformMatrix()));
}

/**
 * 尺寸标注对象:一条尺寸线 + 两端箭头 + 中点文字。
 * 两个端点控制柄可在画完后继续拖动调整。
 * 文字默认自动换算长度(pxPerMeter),也可被 textOverride 覆盖。
 */
export class Dim extends FabricObject {
  static type = 'dim';

  constructor(p1, p2, options = {}) {
    super({ originX: 'left', originY: 'top', ...options });
    this.type = 'dim';
    this.strokeWidth = options.strokeWidth ?? 1.5;
    this.arrowSize = options.arrowSize ?? 9;
    this.fontSize = options.fontSize ?? 14;
    this.pxPerMeter = options.pxPerMeter ?? 0;
    this.textOverride = options.textOverride ?? null;
    this.stroke = options.stroke ?? '#c0392b';
    this.fill = options.fill ?? '#c0392b';
    this.objectCaching = false;
    this.lockRotation = true;
    this._abs = [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
    this.rel = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    this.normalize();
    this.controls = this._endpointControls();
  }

  _pad() {
    return Math.max(this.fontSize * 1.4, this.arrowSize) + 6;
  }

  /** 由 _abs 绝对坐标重算外接框与相对坐标 */
  normalize() {
    const pad = this._pad();
    const xs = this._abs.map((p) => p.x);
    const ys = this._abs.map((p) => p.y);
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    this.set({ left: minX, top: minY, width: maxX - minX, height: maxY - minY });
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.rel = this._abs.map((p) => ({ x: p.x - cx, y: p.y - cy }));
    this.setCoords();
    this.dirty = true;
  }

  /** 拖动端点过程中:只更新坐标,不重算外接框(避免手势抖动) */
  moveEndpointLocal(idx, local) {
    this.rel[idx] = { x: local.x, y: local.y };
    const cx = this.left + this.width / 2;
    const cy = this.top + this.height / 2;
    this._abs[idx] = { x: cx + local.x, y: cy + local.y };
    this.dirty = true;
  }

  lengthPx() {
    const [a, b] = this.rel;
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  label() {
    if (this.textOverride != null && this.textOverride !== '') return this.textOverride;
    if (this.pxPerMeter > 0) return (this.lengthPx() / this.pxPerMeter).toFixed(2) + 'm';
    return Math.round(this.lengthPx()) + 'px';
  }

  _endpointControls() {
    const make = (idx) =>
      new Control({
        cursorStyle: 'crosshair',
        positionHandler: (dim, finalMatrix, obj) => {
          const p = obj.rel[idx];
          return util.transformPoint(
            { x: p.x, y: p.y },
            util.multiplyTransformMatrices(obj.canvas.viewportTransform, obj.calcTransformMatrix())
          );
        },
        actionHandler: (e, transform, x, y) => {
          const obj = transform.target;
          const local = toLocalCentered(obj, x, y);
          obj.moveEndpointLocal(idx, local);
          obj.canvas.requestRenderAll();
          return true;
        },
        render: (ctx, left, top) => {
          ctx.save();
          ctx.beginPath();
          ctx.arc(left, top, 5, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#c0392b';
          ctx.stroke();
          ctx.restore();
        },
      });
    return { p1: make(0), p2: make(1) };
  }

  _drawArrow(ctx, tip, dirAng) {
    const s = this.arrowSize;
    const a1 = dirAng + Math.PI - 0.32;
    const a2 = dirAng + Math.PI + 0.32;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x + s * Math.cos(a1), tip.y + s * Math.sin(a1));
    ctx.lineTo(tip.x + s * Math.cos(a2), tip.y + s * Math.sin(a2));
    ctx.closePath();
    ctx.fillStyle = this.stroke;
    ctx.fill();
  }

  _render(ctx) {
    const [a, b] = this.rel;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.save();
    ctx.strokeStyle = this.stroke;
    ctx.lineWidth = this.strokeWidth;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    this._drawArrow(ctx, a, ang + Math.PI);
    this._drawArrow(ctx, b, ang);
    // 文字:沿线方向、上方居中,带白色描边便于压在底图上
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    let ta = ang;
    if (ta > Math.PI / 2) ta -= Math.PI;
    if (ta < -Math.PI / 2) ta += Math.PI;
    ctx.translate(mx, my);
    ctx.rotate(ta);
    ctx.font = `${this.fontSize}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const label = this.label();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeText(label, 0, -3);
    ctx.fillStyle = this.fill;
    ctx.fillText(label, 0, -3);
    ctx.restore();
  }
}
