/* ── doc.js · 工程文档模型 ─────────────────────────────────────────────────
 * 时间基：帧。阶段内关键帧用归一化 u∈[0,1] 存储，因此
 *   · 改某阶段时长 → 该阶段内节奏自动重排，后续阶段顺次平移；
 *   · 熔岩流前缘的两点之间按 u 插值，天然跟着重排。
 *
 * 轨道：cone 锥体 / lava 熔岩流 / tephra 碎屑层。
 * 每个轨道 = visible + 样式 + keys[]（至少 1 个关键帧）。
 * ─────────────────────────────────────────────────────────────────────── */

import { CONE_BY_ID, TEPHRA_BY_ID, TEMPLATE_BY_ID, ERUPTION_TEMPLATES } from './presets.js';
import { clamp } from './geom.js';

export const FORMAT = 'eruption-seq';
export const DOC_VERSION = 1;

let seq = 0;
const uid = (p) => `${p}_${(seq++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export const nowISO = () => new Date().toISOString();

/* ── 基础构造 ────────────────────────────────────────────────────────────── */

export function makeConeTrack(presetId = 'scoria', keys) {
  const p = CONE_BY_ID[presetId] || CONE_BY_ID.scoria;
  return {
    visible: true,
    presetId: p.id,
    tone: p.tone,
    keys: keys || [{ id: uid('k'), u: 0, dx: 0, dy: 0, sx: 1, sy: 1 }]
  };
}

export function makeLavaTrack(front = 0, keys) {
  return {
    visible: true,
    style: 'channel',
    tone: 0.6,
    keys: keys || [{ id: uid('k'), u: 0, front, width: 1, dx: 0, dy: 0 }]
  };
}

export function makeTephraTrack(presetId = 'ash-thin', thickness = 0.3, keys) {
  const p = TEPHRA_BY_ID[presetId] || TEPHRA_BY_ID['ash-thin'];
  return {
    visible: true,
    presetId: p.id,
    tone: p.tone,
    grain: p.grain,
    fall: p.fall,
    keys: keys || [{ id: uid('k'), u: 0, thickness, cover: p.cover, dx: 0, dy: 0 }]
  };
}

export function makePhase(over = {}) {
  return {
    id: uid('ph'),
    name: over.name || '新阶段',
    kind: over.kind || '持续喷发',
    note: over.note || '',
    durF: Math.round(over.durF ?? 96),
    plume: over.plume ?? 0.3,
    umbrella: !!over.umbrella,
    tracks: over.tracks || {
      cone: makeConeTrack('scoria'),
      lava: makeLavaTrack(0),
      tephra: makeTephraTrack('ash-thin', 0.2)
    }
  };
}

export function blankProject(name = '未命名喷发') {
  return {
    format: FORMAT,
    version: DOC_VERSION,
    name,
    fps: 24,
    width: 1920,
    height: 1080,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    groups: [],
    settings: { ghostMode: 'reference', tolerance: 24, labels: true, showGround: true },
    phases: [makePhase({ name: '阶段 1', durF: 120, kind: '持续喷发' })]
  };
}

/* 由喷发类型模板铺阶段序列；锥体按野外产状依次入轨 */
export function projectFromTemplate(tplId, name) {
  const tpl = TEMPLATE_BY_ID[tplId] || ERUPTION_TEMPLATES[0];
  const doc = blankProject(name || `${tpl.name}喷发`);
  doc.template = tpl.id;
  doc.phases = [];
  let prevFront = 0;
  let prevThick = 0.15;
  for (const d of tpl.phases) {
    const front = clamp(d.lava ?? 0, 0, 2.2);
    const lavaKeys =
      Math.abs(front - prevFront) < 1e-3
        ? [{ id: uid('k'), u: 0, front, width: 1, dx: 0, dy: 0 }]
        : [
            { id: uid('k'), u: 0, front: prevFront, width: 0.94, dx: 0, dy: 0 },
            { id: uid('k'), u: 1, front, width: 1, dx: 0, dy: 0 }
          ];
    const thick = clamp(d.thick ?? 0.3, 0, 1);
    const tephraKeys = [
      { id: uid('k'), u: 0, thickness: prevThick, cover: TEPHRA_BY_ID[d.tephra]?.cover ?? 0.6, dx: 0, dy: 0 },
      { id: uid('k'), u: 1, thickness: thick, cover: TEPHRA_BY_ID[d.tephra]?.cover ?? 0.6, dx: 0, dy: 0 }
    ];
    doc.phases.push(
      makePhase({
        name: d.name,
        kind: d.kind || CONE_BY_ID[d.cone]?.mode || '持续喷发',
        note: d.note,
        durF: d.durF,
        plume: d.plume ?? 0.3,
        umbrella: !!d.umbrella,
        tracks: {
          cone: makeConeTrack(d.cone),
          lava: makeLavaTrack(front, lavaKeys),
          tephra: makeTephraTrack(d.tephra, thick, tephraKeys)
        }
      })
    );
    prevFront = front;
    prevThick = thick;
  }
  doc.groups = [
    { id: uid('g'), name: '锥体 + 碎屑层', tracks: ['cone', 'tephra'] }
  ];
  return doc;
}

/* ── 派生量 ──────────────────────────────────────────────────────────────── */

export function phaseStart(doc, idx) {
  let f = 0;
  for (let i = 0; i < idx; i++) f += doc.phases[i].durF;
  return f;
}

export function totalFrames(doc) {
  return doc.phases.reduce((a, p) => a + p.durF, 0);
}

export function phaseAtFrame(doc, frame) {
  const total = totalFrames(doc);
  const f = clamp(frame, 0, Math.max(0, total - 1e-6));
  let acc = 0;
  for (let i = 0; i < doc.phases.length; i++) {
    const p = doc.phases[i];
    if (f < acc + p.durF || i === doc.phases.length - 1) {
      const local = clamp(f - acc, 0, p.durF);
      return { index: i, phase: p, start: acc, local, u: p.durF > 0 ? local / p.durF : 0 };
    }
    acc += p.durF;
  }
  return { index: 0, phase: doc.phases[0], start: 0, local: 0, u: 0 };
}

export function groupOf(doc, trackKey) {
  return doc.groups.find((g) => g.tracks.includes(trackKey)) || null;
}

export function trackKeysOfGroup(doc, trackKey) {
  const g = groupOf(doc, trackKey);
  return g ? g.tracks.slice() : [trackKey];
}

/* ── 关键帧工具 ─────────────────────────────────────────────────────────── */

export const TRACK_DEFAULTS = {
  cone: { dx: 0, dy: 0, sx: 1, sy: 1 },
  lava: { front: 0, width: 1, dx: 0, dy: 0 },
  tephra: { thickness: 0.3, cover: 0.6, dx: 0, dy: 0 }
};

export function sortKeys(track) {
  track.keys.sort((a, b) => a.u - b.u);
}

export function keyNear(track, u, tolFrames = 0.75, durF = 1) {
  const tol = durF > 0 ? tolFrames / durF : 1;
  let best = null;
  let bd = Infinity;
  for (const k of track.keys) {
    const d = Math.abs(k.u - u);
    if (d <= tol && d < bd) {
      bd = d;
      best = k;
    }
  }
  return best;
}

/** 找到当前帧应编辑的关键帧：邻近则用之，否则按插值新建一个“打点”。 */
export function ensureKeyAt(track, u, kind, durF, mode = 'auto') {
  const hit = keyNear(track, u, 0.75, durF);
  if (hit) return { key: hit, created: false };
  if (mode === 'existing-only') return { key: null, created: false };
  const val = sampleTrackKeys(track, kind, clamp(u, 0, 1));
  const key = { id: uid('k'), u: clamp(u, 0, 1), ...val };
  track.keys.push(key);
  sortKeys(track);
  return { key, created: true };
}

/** 关键帧列表按全局帧显示 */
export function keyFrameOf(phaseStartFrame, durF, key) {
  return Math.round(phaseStartFrame + key.u * durF);
}

/* 关键帧插值（smoothstep 缓动，可切换线性） */
export function sampleTrackKeys(track, kind, u) {
  const keys = track.keys;
  if (!keys.length) return { ...TRACK_DEFAULTS[kind] };
  if (keys.length === 1) return stripKey(keys[0]);
  if (u <= keys[0].u) return stripKey(keys[0]);
  const last = keys[keys.length - 1];
  if (u >= last.u) return stripKey(last);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (u >= a.u && u <= b.u) {
      const span = b.u - a.u || 1;
      const t = (u - a.u) / span;
      const e = a.ease === 'linear' ? t : t * t * (3 - 2 * t);
      const out = {};
      for (const k of Object.keys(TRACK_DEFAULTS[kind])) {
        out[k] = (a[k] ?? TRACK_DEFAULTS[kind][k]) + ((b[k] ?? TRACK_DEFAULTS[kind][k]) - (a[k] ?? TRACK_DEFAULTS[kind][k])) * e;
      }
      return out;
    }
  }
  return stripKey(last);
}

export function stripKey(k) {
  const o = {};
  for (const key of Object.keys(k)) if (key !== 'id' && key !== 'u' && key !== 'ease') o[key] = k[key];
  return o;
}

/* ── 编辑操作（均返回新文档，便于撤销） ─────────────────────────────────── */

export function withDoc(doc, fn) {
  const next = structuredClone(doc);
  fn(next);
  next.updatedAt = nowISO();
  return next;
}

export function setPhaseDur(doc, idx, durF) {
  return withDoc(doc, (d) => {
    d.phases[idx].durF = Math.max(6, Math.round(durF));
  });
}

export function addPhaseAfter(doc, idx, phase) {
  return withDoc(doc, (d) => {
    d.phases.splice(idx + 1, 0, phase || makePhase({ name: `阶段 ${d.phases.length + 1}` }));
  });
}

export function removePhase(doc, idx) {
  return withDoc(doc, (d) => {
    if (d.phases.length <= 1) return;
    d.phases.splice(idx, 1);
  });
}

export function movePhase(doc, idx, delta) {
  return withDoc(doc, (d) => {
    const j = idx + delta;
    if (j < 0 || j >= d.phases.length) return;
    const [p] = d.phases.splice(idx, 1);
    d.phases.splice(j, 0, p);
  });
}

export function clonePhase(doc, idx) {
  return withDoc(doc, (d) => {
    const src = d.phases[idx];
    const copy = structuredClone(src);
    copy.id = uid('ph');
    for (const tk of ['cone', 'lava', 'tephra']) {
      for (const k of copy.tracks[tk].keys) k.id = uid('k');
    }
    copy.name = `${src.name} 副本`;
    d.phases.splice(idx + 1, 0, copy);
  });
}

export function applyTemplate(doc, tplId) {
  const fresh = projectFromTemplate(tplId, doc.name);
  fresh.createdAt = doc.createdAt;
  fresh.settings = { ...doc.settings };
  return fresh;
}

/** 把锥体形态图鉴中的产状赋给某阶段（“按野外产状依次拉进阶段”） */
export function applyConePreset(doc, phaseIdx, presetId) {
  return withDoc(doc, (d) => {
    const p = d.phases[phaseIdx];
    const preset = CONE_BY_ID[presetId];
    if (!preset) return;
    p.tracks.cone.presetId = preset.id;
    p.tracks.cone.tone = preset.tone;
    // 换产状时只在该阶段类型为空/占位时才更新类型，避免覆盖用户已选
    if (!p.kind || p.kind === '') p.kind = preset.mode || p.kind;
  });
}

export function applyTephraPreset(doc, phaseIdx, presetId) {
  return withDoc(doc, (d) => {
    const p = d.phases[phaseIdx];
    const preset = TEPHRA_BY_ID[presetId];
    if (!preset) return;
    const t = p.tracks.tephra;
    t.presetId = preset.id;
    t.tone = preset.tone;
    t.grain = preset.grain;
    t.fall = preset.fall;
    for (const k of t.keys) k.cover = preset.cover;
  });
}

export const setTrackProp = (doc, idx, trackKey, patch) =>
  withDoc(doc, (d) => Object.assign(d.phases[idx].tracks[trackKey], patch));

/* ── 分组 ───────────────────────────────────────────────────────────────── */

export function setGroup(doc, trackKeys, name) {
  return withDoc(doc, (d) => {
    for (const g of d.groups) g.tracks = g.tracks.filter((t) => !trackKeys.includes(t));
    d.groups = d.groups.filter((g) => g.tracks.length > 1);
    d.groups.push({ id: uid('g'), name: name || trackKeys.map((t) => TRACK_LABEL[t]).join(' + '), tracks: trackKeys.slice() });
  });
}

export function clearGroupOf(doc, trackKey) {
  return withDoc(doc, (d) => {
    for (const g of d.groups) g.tracks = g.tracks.filter((t) => t !== trackKey);
    d.groups = d.groups.filter((g) => g.tracks.length > 1);
  });
}

export const TRACK_LABEL = { cone: '锥体', lava: '熔岩流', tephra: '碎屑层' };

/* ── 校验 / 迁移 ───────────────────────────────────────────────────────── */

export function validateDoc(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('文件不是有效的工程 JSON');
  if (raw.format !== FORMAT) throw new Error('不是本工具的工程文件（format 不匹配）');
  if (!Array.isArray(raw.phases) || raw.phases.length === 0) throw new Error('工程中没有阶段');
  const doc = structuredClone(raw);
  doc.version = DOC_VERSION;
  doc.settings = Object.assign({ ghostMode: 'reference', tolerance: 24, labels: true, showGround: true }, doc.settings || {});
  doc.groups = Array.isArray(doc.groups) ? doc.groups : [];
  doc.fps = [12, 24, 25, 30, 60].includes(doc.fps) ? doc.fps : 24;
  doc.width = doc.width || 1920;
  doc.height = doc.height || 1080;
  for (const p of doc.phases) {
    p.durF = Math.max(6, Math.round(p.durF || 96));
    p.tracks = p.tracks || {};
    p.tracks.cone = Object.assign(makeConeTrack('scoria'), p.tracks.cone || {});
    p.tracks.lava = Object.assign(makeLavaTrack(0), p.tracks.lava || {});
    p.tracks.tephra = Object.assign(makeTephraTrack('ash-thin', 0.2), p.tracks.tephra || {});
    for (const t of ['cone', 'lava', 'tephra']) {
      const k = p.tracks[t];
      k.keys = (Array.isArray(k.keys) && k.keys.length ? k.keys : [{ id: uid('k'), u: 0, ...TRACK_DEFAULTS[t] }]).map((kk) => ({
        id: kk.id || uid('k'),
        u: clamp(+kk.u || 0, 0, 1),
        ...TRACK_DEFAULTS[t],
        ...stripKey(kk)
      }));
      sortKeys(k);
    }
  }
  return doc;
}
