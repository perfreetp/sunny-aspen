/* ── store.svelte.js · 编辑器状态（Svelte 5 runes） ─────────────────────────
 * 设计要点：
 *  · doc 是唯一真源；画布、时间轴、导出播放器都只读它。
 *  · 拖动时直接改写 doc（不压历史），松手才提交一条历史 —— 因此松手后的
 *    回放与拖动预览读的是同一份数据，必然一致。
 *  · 关键帧一律以阶段内归一化 u 存储，改时长不影响节奏，只平移后续阶段。
 * ─────────────────────────────────────────────────────────────────────── */

import {
  blankProject, projectFromTemplate, validateDoc, phaseStart, totalFrames,
  phaseAtFrame, sampleTrackKeys, ensureKeyAt, sortKeys, withDoc,
  makePhase, setPhaseDur, addPhaseAfter, removePhase, movePhase, clonePhase,
  applyConePreset, applyTephraPreset, setGroup, clearGroupOf, groupOf,
  TRACK_DEFAULTS, nowISO, TRACK_LABEL
} from './doc.js';
import { CONE_BY_ID, TEPHRA_BY_ID } from './presets.js';

const AUTOSAVE_KEY = 'eruption-seq/autosave/v1';
const MAX_HISTORY = 120;

function snap(doc) {
  // $state 代理不能直接 structuredClone，先拿快照再深拷贝
  return structuredClone($state.snapshot(doc));
}
const plainSnap = (v) => structuredClone(v);

class Studio {
  doc = $state(blankProject('未命名喷发'));
  frame = $state(0);
  playing = $state(false);
  speed = $state(1);
  loop = $state(true);

  /* 选中态 */
  selectedPhase = $state(0);
  selectedTrack = $state('cone');
  activePart = $state(null);      // 'cone' | 'lava' | 'tephra' 被拖动的对象

  /* 显示选项 */
  showGhost = $state(true);
  ghostLava = $state(true);
  ghostTephra = $state(false);
  showLabels = $state(true);
  showGround = $state(true);
  onion = $state(false);          // 洋葱皮：上一帧叠影对比

  zoom = $state(1);
  tlZoom = $state(1);

  toast = $state(null);
  dirty = $state(false);
  savedAt = $state(null);

  /* 历史指针做成响应式镜像，供按钮 disabled 判断 */
  histLen = $state(1);
  histIndex = $state(0);

  #history = [];
  #hIndex = -1;
  #live = null;

  constructor() {
    this.#restoreAutosave();
    this.#history = [plainSnap($state.snapshot(this.doc))];
    this.#hIndex = 0;
    this.#syncHist();
    this.#autosave();
  }

  /* ── 派生 ─────────────────────────────────────────────────────────────── */

  get total() { return totalFrames(this.doc); }
  get phaseCount() { return this.doc.phases.length; }
  get current() { return phaseAtFrame(this.doc, this.frame); }
  get phase() { return this.doc.phases[this.selectedPhase] || this.doc.phases[0]; }
  get canUndo() { return this.histIndex > 0; }
  get canRedo() { return this.histIndex < this.histLen - 1; }

  phaseStartOf(i) { return phaseStart(this.doc, i); }
  durationOf(i) { return this.doc.phases[i].durF; }

  groupOfTrack(t) { return groupOf(this.doc, t); }
  tracksInGroup(t) {
    const g = groupOf(this.doc, t);
    return g ? g.tracks : [t];
  }

  /* ── 历史 ───────────────────────────────────────────────────────────────
   * 栈里保存「每一个状态，包括当前状态」；#hIndex 指向当前状态。
   * 撤销 = 指针前移，重做 = 指针后移。
   * 拖动不逐步入栈：beginLive 记下起点，endLive 在终点压入一次。
   * ───────────────────────────────────────────────────────────────────── */

  #pushState(state) {
    this.#history = this.#history.slice(0, this.#hIndex + 1);
    this.#history.push(state);
    if (this.#history.length > MAX_HISTORY) this.#history = this.#history.slice(-MAX_HISTORY);
    this.#hIndex = this.#history.length - 1;
    // 保证栈顶就是当前 doc
    this.#history[this.#hIndex] = plainSnap($state.snapshot(this.doc));
    this.#syncHist();
    this.dirty = true;
    this.#autosave();
  }

  /** 离散操作：改完立即压栈 */
  commit(fn, label) {
    const draft = plainSnap($state.snapshot(this.doc));
    const next = fn(draft);
    if (!next) return;
    this.doc = next;
    this.#pushState();
    this.clampFrame();
    if (label) this.say(label);
  }

  /** 拖动开始：记下起点（不入栈） */
  beginLive() {
    if (this.#live) return;
    this.#live = { before: plainSnap($state.snapshot(this.doc)) };
  }

  /** 拖动过程中直接改 doc */
  mutate(fn) {
    fn(this.doc);
    this.doc = $state.snapshot(this.doc);
    this.dirty = true;
  }

  /** 拖动结束：若确有变化，把终点压入一次历史 */
  endLive(label) {
    if (!this.#live) return;
    const before = this.#live.before;
    this.#live = null;
    const after = plainSnap($state.snapshot(this.doc));
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    this.#pushState();
    if (label) this.say(label);
  }

  #syncHist() {
    this.histLen = this.#history.length;
    this.histIndex = this.#hIndex;
  }

  undo() {
    if (!this.canUndo) return;
    this.#hIndex--;
    this.#syncHist();
    this.doc = structuredClone(this.#history[this.#hIndex]);
    this.clampFrame();
    this.dirty = true;
    this.#autosave();
    this.say('已撤销');
  }

  redo() {
    if (!this.canRedo) return;
    this.#hIndex++;
    this.#syncHist();
    this.doc = structuredClone(this.#history[this.#hIndex]);
    this.clampFrame();
    this.dirty = true;
    this.#autosave();
    this.say('已重做');
  }

  /* ── 播放 ─────────────────────────────────────────────────────────────── */

  play() {
    if (this.total <= 0) return;
    if (this.frame >= this.total - 1) this.frame = 0;
    this.playing = true;
  }
  pause() { this.playing = false; }
  toggle() { this.playing ? this.pause() : this.play(); }

  advance(dtMs) {
    if (!this.playing) return;
    const fps = this.doc.fps || 24;
    this.frameFloat = (this.frameFloat ?? this.frame) + (dtMs / 1000) * fps * this.speed;
    const total = this.total;
    if (this.frameFloat >= total - 1) {
      if (this.loop) this.frameFloat = 0;
      else { this.frameFloat = total - 1; this.playing = false; }
    }
    this.frame = Math.round(this.frameFloat);
  }

  setFrame(f) {
    if (!this.playing) this.frameFloat = f;
    this.frame = clampInt(f, 0, Math.max(0, this.total - 1));
    this.selectedPhase = phaseAtFrame(this.doc, this.frame).index;
  }

  step(delta) { this.pause(); this.setFrame(this.frame + delta); }

  /** 跳到某阶段起点 */
  gotoPhase(i) {
    this.pause();
    this.selectedPhase = clampInt(i, 0, this.phaseCount - 1);
    this.setFrame(phaseStart(this.doc, this.selectedPhase));
  }

  /** “退一格叠着看”：跳到上一帧并打开洋葱皮 */
  stepBackCompare() {
    this.pause();
    if (this.frame > 0) this.setFrame(this.frame - 1);
    this.onion = true;
  }
  clearOnion() { this.onion = false; }

  clampFrame() {
    const t = this.total;
    if (this.frame > t - 1) this.frame = Math.max(0, t - 1);
    if (this.selectedPhase > this.phaseCount - 1) this.selectedPhase = 0;
  }

  /* ── 工程操作 ─────────────────────────────────────────────────────────── */

  newFromTemplate(tplId, name) {
    const doc = projectFromTemplate(tplId, name);
    this.doc = doc;
    this.#resetHistory(doc);
    this.frame = 0; this.frameFloat = 0;
    this.selectedPhase = 0;
    this.pause();
    this.say('已按喷发类型铺好阶段序列');
  }

  newBlank() {
    const doc = blankProject('未命名喷发');
    this.doc = doc;
    this.#resetHistory(doc);
    this.frame = 0; this.selectedPhase = 0;
    this.pause();
  }

  #resetHistory(doc) {
    this.#history = [plainSnap($state.snapshot(doc))];
    this.#hIndex = 0;
    this.#syncHist();
    this.dirty = true;
    this.#autosave();
  }

  loadDoc(raw) {
    const doc = validateDoc(raw);
    this.doc = doc;
    this.#resetHistory(doc);
    this.clampFrame();
    this.pause();
    this.say('工程已载入');
  }

  rename(name) {
    this.commit((d) => { d.name = name; d.updatedAt = nowISO(); return d; });
  }

  setDuration(i, durF) {
    this.commit((d) => setPhaseDur(d, i, durF), `阶段「${this.doc.phases[i].name}」时长 → ${Math.round(durF)} 帧`);
  }

  addPhase(i) {
    this.commit((d) => addPhaseAfter(d, i, makePhase({ name: `阶段 ${d.phases.length + 1}` })), '已插入新阶段');
    this.gotoPhase(i + 1);
  }

  removePhase(i) {
    if (this.phaseCount <= 1) return;
    this.commit((d) => removePhase(d, i), '已删除阶段');
    this.clampFrame();
    this.selectedPhase = Math.min(this.selectedPhase, this.phaseCount - 1);
  }

  movePhase(i, delta) {
    this.commit((d) => movePhase(d, i, delta), '已调整阶段顺序');
    this.gotoPhase(clampInt(i + delta, 0, this.phaseCount - 1));
  }

  duplicatePhase(i) {
    this.commit((d) => clonePhase(d, i), '已复制阶段');
    this.gotoPhase(i + 1);
  }

  setPhaseField(i, key, value) {
    this.commit((d) => { d.phases[i][key] = value; return d; });
  }

  assignCone(phaseIdx, presetId) {
    this.commit((d) => applyConePreset(d, phaseIdx, presetId),
      `阶段「${this.doc.phases[phaseIdx].name}」锥体 → ${CONE_BY_ID[presetId]?.name || presetId}`);
  }

  assignTephra(phaseIdx, presetId) {
    this.commit((d) => applyTephraPreset(d, phaseIdx, presetId),
      `碎屑层 → ${TEPHRA_BY_ID[presetId]?.name || presetId}`);
  }

  setTrackField(phaseIdx, trackKey, patch, label) {
    this.commit((d) => { Object.assign(d.phases[phaseIdx].tracks[trackKey], patch); return d; }, label);
  }

  /* 分组：把指定轨道绑成一组（一起挪） */
  group(trackKeys, name) {
    if (trackKeys.length < 2) return;
    this.commit((d) => setGroup(d, trackKeys, name), `已编组：${trackKeys.map((t) => TRACK_LABEL[t]).join(' + ')}`);
  }
  ungroup(trackKey) {
    this.commit((d) => clearGroupOf(d, trackKey), '已解除编组');
  }

  /* ── 关键帧 ───────────────────────────────────────────────────────────── */

  /** 当前阶段、当前 u 处取（或建）关键帧 */
  keyAtCurrent(trackKey, mode = 'auto') {
    const ph = this.phase;
    const u = this.current.u;
    return ensureKeyAt(ph.tracks[trackKey], u, trackKey, ph.durF, mode);
  }

  /** 在当前位置打一个点（熔岩前缘打点等） */
  addKey(trackKey) {
    const ph = this.phase;
    const u = this.current.u;
    this.commit((d) => {
      const p = d.phases[this.selectedPhase];
      ensureKeyAt(p.tracks[trackKey], u, trackKey, p.durF, 'force');
      return d;
    }, `${TRACK_LABEL[trackKey]} 已打点`);
  }

  removeKey(trackKey, keyId) {
    this.commit((d) => {
      const t = d.phases[this.selectedPhase].tracks[trackKey];
      if (t.keys.length <= 1) return null;
      t.keys = t.keys.filter((k) => k.id !== keyId);
      return d;
    }, '已删除关键帧');
  }

  /** 拖动关键帧 / 改其 u */
  setKeyU(trackKey, keyId, u) {
    this.mutate((d) => {
      const t = d.phases[this.selectedPhase].tracks[trackKey];
      const k = t.keys.find((x) => x.id === keyId);
      if (k) { k.u = Math.max(0, Math.min(1, u)); sortKeys(t); }
    });
  }

  setKeyValue(trackKey, keyId, patch) {
    this.mutate((d) => {
      const t = d.phases[this.selectedPhase].tracks[trackKey];
      const k = t.keys.find((x) => x.id === keyId);
      if (k) Object.assign(k, patch);
    });
  }

  setKeyEase(trackKey, keyId, ease) {
    this.commit((d) => {
      const t = d.phases[this.selectedPhase].tracks[trackKey];
      const k = t.keys.find((x) => x.id === keyId);
      if (k) k.ease = ease;
      return d;
    }, ease === 'linear' ? '关键帧改为线性' : '关键帧改为缓动');
  }

  /* ── 提示 ─────────────────────────────────────────────────────────────── */

  say(msg) {
    this.toast = { msg, at: performance.now() };
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { if (this.toast && performance.now() - this.toast.at > 1400) this.toast = null; }, 2600);
  }

  /* ── 自动保存 ─────────────────────────────────────────────────────────── */

  #autosave() {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snap(this.doc)));
      this.savedAt = Date.now();
    } catch { /* 隐私模式等：忽略 */ }
  }

  #restoreAutosave() {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) {
        // 首次进入：给一个可用的范例，而不是空白
        this.doc = projectFromTemplate('strombolian', '斯特龙博利式喷发');
        return;
      }
      this.doc = validateDoc(JSON.parse(raw));
    } catch {
      this.doc = projectFromTemplate('strombolian', '斯特龙博利式喷发');
    }
  }
}

function clampInt(v, a, b) {
  v = Math.round(v);
  return v < a ? a : v > b ? b : v;
}

export const studio = new Studio();
export { snap, TRACK_DEFAULTS };
