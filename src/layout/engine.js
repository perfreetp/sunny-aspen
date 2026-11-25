// 标注排版引擎（纯函数，不依赖 paper.js/DOM，可在 Node 测试中直接跑）
// 职责：层内/层外放置决策、薄层自动外挪、肘形引线绕开层界线、引线互让、合并标注
import { buildLabelLines } from './labelContent.js';
import { inflateRect, rectsOverlap, dist } from './geometry.js';
import {
  interfaceObstacles, leaderObstacleRects,
  routeElbowLeader, routeInsideLeader,
} from './elbowRouter.js';

const PAD = 8;             // 文字框内边距
const LEADER_HALF_GAP = 5; // 已布引线两侧净空 (px)
const LABEL_GAP = 10;      // 层外标注上下间距

// 由标注记录生成待布局条目
function makeItems(records, section, transform, fontSet, style) {
  const { samples, stats } = section;
  const { toView } = transform;
  return records.map((rec) => {
    const lines = buildLabelLines(rec, stats, style);
    const m = fontSet.measureLines(lines, style.fontPx);
    const box = { w: m.w + PAD * 2, h: m.h + PAD * 2 };
    const members = rec.type === 'merged' ? rec.members.slice() : [rec.layerIdx];
    // 锚点站：单层用记录的 anchorFraction（默认 0.5），合并层取成员并集的中心
    const frac = rec.anchorFraction ?? 0.5;
    const stIdx = Math.round(frac * (samples.length - 1));
    const st = samples[stIdx];
    const topK = members[0];
    const botK = members[members.length - 1];
    const zAnchor = (st.topIfaces[topK] + st.topIfaces[Math.min(botK + 1, st.topIfaces.length - 1)]) / 2;
    const anchor = toView(st.s, zAnchor);
    // 层内可用空间（视图坐标，取锚点站处成员层总厚度）
    const zTop = st.topIfaces[topK];
    const zBot = botK + 1 < st.topIfaces.length
      ? st.topIfaces[botK + 1]
      : st.topIfaces[st.topIfaces.length - 1] - st.thickness[st.thickness.length - 1];
    const spacePx = (zTop - zBot) * transform.hScale * transform.vExag;
    return {
      rec, members, lines, metrics: m, box,
      anchor, stIdx, spacePx,
      side: rec.side ?? 'auto',
      pinned: rec.pinned ?? null,
      overrideWarn: null,
    };
  });
}

// 层内放置：框完全落在成员层多边形内（锚点站局部抽检，允许收窄框宽重试）
function tryPlaceInside(item, section, transform) {
  const { toView } = transform;
  const st = section.samples[item.stIdx];
  const topK = item.members[0], botK = item.members[item.members.length - 1];
  const zTop = st.topIfaces[topK];
  const zBot = botK + 1 < st.topIfaces.length
    ? st.topIfaces[botK + 1]
    : st.topIfaces[st.topIfaces.length - 1] - st.thickness[st.thickness.length - 1];
  const pTop = toView(st.s, zTop);
  const pBot = toView(st.s, zBot);
  const cx = item.anchor.x;
  const cy = (pTop.y + pBot.y) / 2;
  const metersPerStation = section.length / (section.samples.length - 1);

  const check = (w, h, shiftX) => {
    const x = cx + shiftX - w / 2;
    const rect = { x, y: cy - h / 2, w, h };
    if (rect.y < pTop.y + 4 || rect.y + rect.h > pBot.y - 4) return null;
    // 检查范围严格等于框宽覆盖的站数；框收窄时检查范围同步收窄
    const metersPerStation = section.length / (section.samples.length - 1);
    const span = Math.max(1, Math.ceil((w / 2) / transform.hScale / metersPerStation));
    const centerIdx = item.stIdx + Math.round(shiftX / transform.hScale / metersPerStation);
    for (let off = -span; off <= span; off++) {
      const idx = Math.max(0, Math.min(section.samples.length - 1, centerIdx + off));
      const s2 = section.samples[idx];
      const t2 = toView(s2.s, s2.topIfaces[topK]);
      const b2idx = Math.min(botK + 1, s2.topIfaces.length - 1);
      const b2z = b2idx === s2.topIfaces.length - 1 && botK === s2.topIfaces.length - 1
        ? s2.topIfaces[b2idx] - s2.thickness[b2idx]
        : s2.topIfaces[b2idx];
      const b2 = toView(s2.s, b2z);
      if (rect.y < t2.y + 3 || rect.y + rect.h > b2.y - 3) return null;
    }
    return rect;
  };

  // 逐档收窄框宽，并允许在锚点附近水平漂移找局部可容纳区（陡倾斜界面的标准处理）
  const widths = [item.box.w, item.box.w * 0.8, item.box.w * 0.62, item.box.w * 0.46, item.box.w * 0.34];
  const maxDrift = item.box.w * 0.9;
  for (const w of widths) {
    for (const shift of [0, -maxDrift * 0.4, maxDrift * 0.4, -maxDrift * 0.8, maxDrift * 0.8]) {
      const r = check(w, item.box.h, shift);
      if (r) return r;
    }
  }
  return null;
}

// 层外两列排布：按锚点高度排序，贪心落位，重叠则向下推；严格约束在画布边界内
function layoutSideColumn(items, side, transform, placedRects) {
  const margin = 16;
  const sorted = items
    .filter((it) => it.placement === 'outside' && it.assignedSide === side && !it.pinned)
    .sort((a, b) => a.anchor.y - b.anchor.y);
  for (const item of sorted) {
    const rect = {
      x: side === 'right' ? transform.width - margin - item.box.w : margin,
      y: item.anchor.y - item.box.h / 2,
      w: item.box.w,
      h: item.box.h,
    };
    // 与同列已放标注、以及层内标注推开
    let guard = 0;
    while (guard++ < 200 && placedRects.some((r) => rectsOverlap(inflateRect(rect, LABEL_GAP / 2), r.rect))) {
      rect.y += item.box.h + LABEL_GAP;
    }
    item.rect = rect;
    // 引线连接点朝向剖面：右列在框左边，左列在框右边
    item.labelAnchor = { x: side === 'right' ? rect.x : rect.x + rect.w, y: rect.y + rect.h / 2 };
    placedRects.push({ rect, item });
  }
}

// 计算已布引线的障碍矩形段逻辑已迁移到 elbowRouter.js（leaderObstacleRects）

/**
 * 主入口：computeLayout
 * @param {object} section buildSection 的结果
 * @param {object} transform makeSectionTransform 的结果
 * @param {object[]} records 标注记录（单层/合并），顺序即渲染顺序
 * @param {object} fontSet fontManager 的 FontSet
 * @param {object} style { fontPx, maxCharsPerLine, showThickness }
 */
export function computeLayout(section, transform, records, fontSet, style) {
  const items = makeItems(records, section, transform, fontSet, style);
  const placedRects = [];

  // 1. 层内放置尝试（合并标注空间要求更高）
  for (const item of items) {
    if (item.pinned) {
      item.placement = 'outside';
      item.assignedSide = item.pinned.side;
      item.rect = { ...item.pinned.rect };
      item.labelAnchor = {
        x: item.pinned.side === 'right' ? item.rect.x : item.rect.x + item.rect.w,
        y: item.rect.y + item.rect.h / 2,
      };
      placedRects.push({ rect: item.rect, item });
      continue;
    }
    const inside = tryPlaceInside(item, section, transform);
    const fits = inside && item.box.h <= item.spacePx - 8;
    if (fits) {
      item.placement = 'inside';
      item.rect = inside;
      item.labelAnchor = { x: inside.x + inside.w / 2, y: inside.y + inside.h / 2 };
      placedRects.push({ rect: inside, item });
    } else {
      // 薄层：自动挪到层外。side 记录优先，否则按锚点在剖面中的左右位置分流
      item.placement = 'outside';
      item.assignedSide = item.side === 'auto'
        ? (item.anchor.x < transform.width / 2 ? 'left' : 'right')
        : item.side;
    }
  }

  // 2. 层外两列排布（互相推开）
  layoutSideColumn(items, 'left', transform, placedRects);
  layoutSideColumn(items, 'right', transform, placedRects);

  // 安全兜底：任何遗漏 rect/labelAnchor 的层外标注，按其侧别补一个位置
  for (const item of items) {
    if (item.placement !== 'outside') continue;
    if (!item.rect) {
      const side = item.assignedSide ?? 'right';
      item.rect = {
        x: side === 'right' ? transform.width - 16 - item.box.w : 16,
        y: item.anchor.y - item.box.h / 2,
        w: item.box.w,
        h: item.box.h,
      };
    }
    if (!item.labelAnchor) {
      const side = item.assignedSide ?? 'right';
      item.labelAnchor = {
        x: side === 'right' ? item.rect.x : item.rect.x + item.rect.w,
        y: item.rect.y + item.rect.h / 2,
      };
    }
  }

  // 3. 构建几何障碍：层界线细矩形 + 已放置文字框（引线不压界面、不穿标注）
  const { toView } = transform;
  const interfaceViewPaths = section.interfaces.map((iface) => iface.map((p) => toView(p.s, p.z)));
  const interfaceRects = interfaceObstacles(interfaceViewPaths, 2.5);
  const frame = {
    x: transform.padX,
    y: transform.padTop,
    w: section.length * transform.hScale,
    h: (transform.maxZ - transform.minZ) * transform.hScale * transform.vExag,
  };
  const labelRects = placedRects
    .filter(({ item }) => item.placement === 'inside')
    .map(({ rect }) => inflateRect(rect, 3));

  // 4. 逐条布肘形引线：先布层外标注（更长更难走），再布层内短引线；
  //    已布引线实时加入障碍，实现几条引线挤在一起时互相让开
  const routed = [];
  const order = items
    .filter((it) => it.placement === 'outside')
    .sort((a, b) => Math.abs(a.anchor.x - a.labelAnchor.x) - Math.abs(b.anchor.x - b.labelAnchor.x))
    .concat(items.filter((it) => it.placement === 'inside'));

  for (const item of order) {
    if (item.placement === 'inside') {
      const target = { x: item.rect.x + item.rect.w / 2, y: item.rect.y - 2 };
      item.leader = routeInsideLeader(item.anchor, target, interfaceRects);
    } else {
      const leaderRects = leaderObstacleRects(routed, LEADER_HALF_GAP);
      // 锚点站正上方的地表出露点（界面 0 = 地形面）
      const st = section.samples[item.stIdx];
      const surfacePoint = toView(st.s, st.topIfaces[0]);
      item.leader = routeElbowLeader(item.anchor, item.labelAnchor, item.assignedSide, {
        interfaceRects, labelRects, leaderRects, frame, surfacePoint,
      });
    }
    if (item.leader?.path) routed.push(item.leader.path);
  }

  // 5. 合并标注的成员短支线：从合并锚点分别指向各成员层中部
  for (const item of items) {
    if (item.rec.type !== 'merged') continue;
    const st = section.samples[item.stIdx];
    item.memberTaps = item.members.map((k) => {
      const z = (st.topIfaces[k] + (k + 1 < st.topIfaces.length ? st.topIfaces[k + 1] : st.topIfaces[k] - st.thickness[k])) / 2;
      const p = toView(st.s, z);
      return { layerIdx: k, point: p, d: dist(p, item.anchor) };
    });
  }

  const warnings = [];
  if (items.some((it) => it.leader?.fellback)) {
    warnings.push('部分引线未能完全绕开障碍，已使用直线兜底，可手动拖动标注后重排');
  }
  const thinItems = items.filter((it) => it.placement === 'outside' && it.spacePx < it.box.h);
  if (thinItems.length >= 2) {
    warnings.push(`${thinItems.length} 个薄层标注已自动移至层外，可使用「合并薄层标注」`);
  }

  return {
    items: items.map((it) => ({
      id: it.rec.id,
      rec: it.rec,
      lines: it.lines,
      rect: it.rect,
      placement: it.placement,
      side: it.assignedSide ?? null,
      anchor: it.anchor,
      labelAnchor: it.labelAnchor,
      leader: it.leader,
      memberTaps: it.memberTaps ?? null,
      spacePx: it.spacePx,
      box: it.box,
    })),
    warnings,
  };
}
