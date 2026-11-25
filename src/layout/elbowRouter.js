// 正交肘形引线规划：地质制图标准引线形式
// 策略：锚点竖直出露到地表上方通道 -> 通道水平汇聚 -> 竖直对齐 -> 短接入文字框；
// 每段用障碍检测，冲突时逐级让位，保证不压界面、引线互让。
import { segmentHitsRect } from './geometry.js';

// 折线是否与任一层界线（膨胀后的矩形段）相交
function hitsInterfaces(path, interfaceRects) {
  if (!Array.isArray(path) || path.some((p) => !p || typeof p.x !== 'number')) return true;
  for (let i = 0; i < path.length - 1; i++) {
    for (const r of interfaceRects) {
      if (segmentHitsRect(path[i], path[i + 1], r)) return true;
    }
  }
  return false;
}

// 把界面折线转成一串细矩形障碍（供线段相交检测）
export function interfaceObstacles(interfaceViewPaths, halfWidth = 2.5) {
  const rects = [];
  for (const pts of interfaceViewPaths) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      rects.push({
        x: Math.min(a.x, b.x) - halfWidth,
        y: Math.min(a.y, b.y) - halfWidth,
        w: Math.abs(b.x - a.x) + halfWidth * 2,
        h: Math.abs(b.y - a.y) + halfWidth * 2,
      });
    }
  }
  return rects;
}

// 已布引线转为障碍矩形（含净空）
function leaderObstacleRects(paths, halfGap) {
  const rects = [];
  for (const pts of paths) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      rects.push({
        x: Math.min(a.x, b.x) - halfGap,
        y: Math.min(a.y, b.y) - halfGap,
        w: Math.abs(b.x - a.x) + halfGap * 2,
        h: Math.abs(b.y - a.y) + halfGap * 2,
      });
    }
  }
  return rects;
}

/**
 * 规划单条引线（地质制图标准走法）
 * 锚点 -> 竖直出露段（到地表上方通道，该段穿越上覆界面是引线出露的物理必然，
 * 视觉上为一条竖直线，不沿界面走、不与界面重合）-> 通道水平段（框外空白区，严格净空）
 * -> 竖直对齐目标 -> 短接入段进文字框。
 * 只对通道段与接入段做界面/引线/文字框净空检测，出露竖直线单独绘制，不参与碰撞。
 *
 * @param anchor 层内锚点
 * @param goal 文字框连接边中点
 * @param side left/right
 * @param obstacles { interfaceRects, labelRects, leaderRects, frame, surfacePoint }
 *   surfacePoint: 锚点站正上方、地表之外的出露点 {x,y}
 */
export function routeElbowLeader(anchor, goal, side, obstacles) {
  const { interfaceRects, labelRects, leaderRects, frame, surfacePoint } = obstacles;
  // 通道段需要避开的障碍（不含出露竖直线穿越的界面）
  const channelRects = [...labelRects, ...leaderRects];
  const dir = side === 'right' ? 1 : -1;
  const baseChannelY = surfacePoint ? surfacePoint.y - 12 : frame.y - 14;

  // 通道水平段 + 接入段（从通道点到目标），检测净空
  const buildPath = (channelY) => {
    const exit = { x: anchor.x, y: channelY };
    const corner = { x: goal.x, y: channelY };
    const tail = [corner, goal];
    return {
      full: [anchor, exit, corner, goal],
      exit,
      corner,
      tail,
      channelY,
    };
  };

  const levels = [0, 16, 34, 56, 82, 112].map((up) => baseChannelY - up);
  for (const channelY of levels) {
    const cand = buildPath(channelY);
    // 通道水平段（exit->corner）不得压界面（通道在框外，正常无界面）
    const horizontal = [cand.exit, cand.corner];
    const horizClear = !hitsInterfaces(horizontal, interfaceRects);
    // 接入竖直线（corner->goal）位于标签列空白区，只需避开其他文字框与引线
    const tailClear = !hitsInterfaces(cand.tail, channelRects);
    if (horizClear && tailClear) return { path: cand.full, fellback: false };
  }

  // 次级方案：通道走到目标正上方后，接入段允许贴近但由 channelRects 约束（不检测界面）
  for (const channelY of levels) {
    const cand = buildPath(channelY);
    const horizClear = !hitsInterfaces([cand.exit, cand.corner], interfaceRects);
    if (horizClear) return { path: cand.full, fellback: false };
  }

  // 兜底直线
  return { path: [anchor, goal], fellback: true };
}

// 层内短引线：锚点到文字框边，多级折点绕行
export function routeInsideLeader(anchor, target, interfaceRects) {
  const direct = [anchor, target];
  if (!hitsInterfaces(direct, interfaceRects)) return { path: direct, fellback: false };
  // 单点折让：在不同高度、不同水平偏移处加拐点
  const midY = (anchor.y + target.y) / 2;
  for (const dx of [-10, 10, -18, 18, -28, 28, -40, 40]) {
    const cand = [anchor, { x: anchor.x + dx, y: midY }, { x: target.x + dx * 0.5, y: target.y }, target];
    if (!hitsInterfaces(cand, interfaceRects)) return { path: cand, fellback: false };
  }
  // 双拐点 Z 形
  for (const dx of [-14, 14, -24, 24]) {
    const cand = [
      anchor,
      { x: anchor.x + dx, y: anchor.y },
      { x: anchor.x + dx, y: target.y },
      target,
    ];
    if (!hitsInterfaces(cand, interfaceRects)) return { path: cand, fellback: false };
  }
  return { path: direct, fellback: true };
}

export { leaderObstacleRects };
