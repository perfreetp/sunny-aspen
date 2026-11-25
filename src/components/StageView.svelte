<script>
  /* StageView —— PixiJS 画布：渲染 + 直接操作（拖动 / 缩放 / 前缘把手）
   *
   * 拖动时改写的是同一份 doc，指针抬起后才提交历史；回放读同一份 doc，
   * 因此“松手后回放与拖动预览一致”是结构性的，而不是靠人工对齐。 */
  import { onMount, onDestroy } from 'svelte';
  import {
    sampleScene, samplePhase, coneGeom, W, H
  } from '../lib/scene.js';
  import {
    createRenderer, StageRenderer, fitView, toWorld, applyViewWorld
  } from '../lib/render-pixi.js';
  import { coneFlankPoint, clamp } from '../lib/geom.js';
  import { Container } from 'pixi.js';
  import { studio } from '../lib/store.svelte.js';

  let host = $state(null);
  let wrap = $state(null);
  let ready = $state(false);
  let err = $state(null);
  let box = $state({ w: 960, h: 540 });
  let hover = $state(null);

  let app, world, gizmoLayer, renderer, gizmoRenderer, ro;
  let drag = $state(null);

  const view = $derived(fitView(W, H, box.w, box.h));

  /* ── 渲染 ─────────────────────────────────────────────────────────────── */

  $effect(() => {
    if (!ready) return;
    const scene = sampleScene(studio.doc, studio.frame, {
      ghost: studio.showGhost,
      ghostLava: studio.ghostLava,
      ghostTephra: studio.ghostTephra,
      labels: studio.showLabels,
      showGround: studio.showGround,
      mode: 'edit'
    });
    drawScene(scene);
    applyViewWorld(world, view);
    applyViewWorld(gizmoLayer, view);
  });

  function drawScene(scene) {
    renderer.draw(scene.prims);
    drawGizmos(scene);
  }

  function drawGizmos(scene) {
    const list = [];
    const st = scene.state;
    const g = scene.cone;
    const showHandles = studio.showLabels;

    if (showHandles && st.cone.visible) {
      const a = hover === 'cone' ? 0.95 : 0.42;
      list.push({
        t: 'line',
        pts: [[g.baseLeft, g.rimY], [g.baseRight, g.rimY], [g.baseRight, g.baseY], [g.baseLeft, g.baseY], [g.baseLeft, g.rimY]],
        color: '#e6a86b', width: 1.4, alpha: a, dash: [9, 7]
      });
      // 右下角缩放把手
      list.push({ t: 'rect', x: g.baseRight - 7, y: g.baseY - 7, w: 14, h: 14, fill: '#ffd0a0', alpha: 0.92 });
      list.push({ t: 'rect', x: g.baseRight - 7, y: g.baseY - 7, w: 14, h: 14, fill: null, stroke: '#7a4a1e', strokeW: 1.4, strokeAlpha: 0.8 });
      // 左上角把手（对称缩放）
      list.push({ t: 'rect', x: g.baseLeft - 7, y: g.rimY - 7, w: 14, h: 14, fill: '#c39872', alpha: 0.8 });
    }

    if (showHandles && st.lava.visible && scene.lava) {
      const tip = scene.lava.tip;
      list.push({ t: 'circle', x: tip[0], y: tip[1] - 3, r: 9.5, fill: '#ffa04a', alpha: hover === 'lava' ? 1 : 0.82 });
      list.push({ t: 'circle', x: tip[0], y: tip[1] - 3, r: 17, fill: null, stroke: '#ff9a3c', strokeW: 1.4, strokeAlpha: 0.45 });
      list.push({
        t: 'text', x: tip[0] + 24, y: tip[1] - 34,
        text: `前缘 ${scene.lava.frontFrac.toFixed(2)}`,
        size: 17, color: '#ffd9bb', alpha: 0.8
      });
      if (scene.lava.overrun > 0.6) {
        list.push({
          t: 'text', x: tip[0] + 24, y: tip[1] - 12,
          text: `越过锥缘 ${Math.round(scene.lava.overrun)}px`,
          size: 16, color: '#ffb02e', alpha: 0.9
        });
      }
    }

    if (showHandles && st.tephra.visible && scene.tephra) {
      const sp = scene.tephra.spread;
      list.push({
        t: 'line',
        pts: [[g.baseLeft - sp, g.baseY + 4], [g.baseRight + sp, g.baseY + 4]],
        color: '#a9b8c9', width: 1.6, alpha: 0.45, dash: [6, 6]
      });
    }

    /* 洋葱皮：上一帧轮廓 */
    if (studio.onion && studio.frame > 0) {
      const prev = sampleScene(studio.doc, studio.frame - 1, { labels: false, showGround: false });
      if (prev.state.cone.visible) {
        list.push({ t: 'poly', pts: prev.cone.poly, fill: null, stroke: '#ffe27a', strokeW: 1.5, strokeAlpha: 0.42, dashed: true });
      }
      if (prev.lava) {
        list.push({ t: 'poly', pts: prev.lava.ribbon, fill: null, stroke: '#ffe27a', strokeW: 2, strokeAlpha: 0.85, dashed: true });
        list.push({ t: 'circle', x: prev.lava.tip[0], y: prev.lava.tip[1], r: 5.5, fill: '#ffe27a', alpha: 0.9 });
      }
    }

    gizmoRenderer.draw(list);
  }

  /* ── 命中测试 ─────────────────────────────────────────────────────────── */

  function canvasXY(e) {
    const r = app.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * box.w, y: ((e.clientY - r.top) / r.height) * box.h };
  }

  function worldXY(e) {
    return toWorld(canvasXY(e).x, canvasXY(e).y, view);
  }

  function hitR() {
    return 22 / view.scale;
  }

  function hitTest(p) {
    if (!ready) return null;
    const scene = sampleScene(studio.doc, studio.frame, { labels: false, showGround: false });
    const st = scene.state;
    const g = scene.cone;
    const r = hitR();

    if (st.cone.visible) {
      if (Math.hypot(p.x - g.baseRight, p.y - g.baseY) < r) return { type: 'scale', corner: 'br', part: 'cone' };
      if (Math.hypot(p.x - g.baseLeft, p.y - g.rimY) < r) return { type: 'scale', corner: 'tl', part: 'cone' };
    }
    if (st.lava.visible && scene.lava) {
      const tip = scene.lava.tip;
      if (Math.hypot(p.x - tip[0], p.y - (tip[1] - 3)) < r * 1.15) return { type: 'lavaTip', part: 'lava' };
    }
    if (st.cone.visible && pointInPoly(p.x, p.y, g.poly)) return { type: 'move', part: 'cone' };
    if (st.tephra.visible && scene.tephra && p.y > g.baseY - 6 && p.y < g.baseY + scene.tephra.thickness * 2 + 8
      && p.x > g.baseLeft - scene.tephra.spread && p.x < g.baseRight + scene.tephra.spread) {
      return { type: 'move', part: 'tephra' };
    }
    return null;
  }

  function pointInPoly(px, py, pts) {
    let ins = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-9) + xi) ins = !ins;
    }
    return ins;
  }

  /* ── 拖动 ─────────────────────────────────────────────────────────────── */

  function onPointerDown(e) {
    if (e.button !== 0) return;
    const p = worldXY(e);
    const hit = hitTest(p);
    if (!hit) return;
    e.preventDefault();
    studio.pause();
    app.canvas.setPointerCapture?.(e.pointerId);

    const phase = studio.phase;
    const u = studio.current.u;

    // 确保当前 u 处有可写关键帧（拖到哪就打到哪）
    const ensure = (t) => ensureKey(phase, t, u);
    studio.beginLive();

    if (hit.type === 'move') {
      const group = studio.tracksInGroup(hit.part);
      const starts = {};
      for (const t of group) {
        const k = ensure(t);
        if (k) starts[t] = { dx: k.dx ?? 0, dy: k.dy ?? 0 };
      }
      drag = { mode: 'move', part: hit.part, group, start: p, starts };
    } else if (hit.type === 'scale') {
      const k = ensure('cone');
      const scene = sampleScene(studio.doc, studio.frame, { labels: false });
      drag = {
        mode: 'scale', part: 'cone', corner: hit.corner, start: p,
        sx0: k.sx, sy0: k.sy,
        anchor: hit.corner === 'br'
          ? { x: scene.cone.baseLeft, y: scene.cone.rimY }
          : { x: scene.cone.baseRight, y: scene.cone.baseY },
        size: { w: scene.cone.hw * 2, h: scene.cone.h }
      };
    } else if (hit.type === 'lavaTip') {
      const k = ensure('lava');
      drag = { mode: 'lavaTip', part: 'lava', start: p, f0: k.front ?? 0 };
    }
  }

  function ensureKey(phase, trackKey, u) {
    const track = phase.tracks[trackKey];
    const tol = 0.9 / Math.max(1, phase.durF);
    let best = null, bd = Infinity;
    for (const k of track.keys) {
      const d = Math.abs(k.u - u);
      if (d < bd) { bd = d; best = k; }
    }
    if (best && bd <= Math.max(tol, 0.015)) return best;
    const val = samplePhase(phase, u)[trackKey];
    const key = { id: 'k' + Math.random().toString(36).slice(2, 7), u, ease: best?.ease };
    if (trackKey === 'cone') Object.assign(key, { dx: val.dx, dy: val.dy, sx: val.sx, sy: val.sy });
    else if (trackKey === 'lava') Object.assign(key, { front: val.front, width: val.width, dx: val.dx, dy: val.dy });
    else Object.assign(key, { thickness: val.thickness, cover: val.cover, dx: val.dx, dy: val.dy });
    track.keys.push(key);
    track.keys.sort((a, b) => a.u - b.u);
    return key;
  }

  function onPointerMove(e) {
    const p = worldXY(e);
    if (!drag) {
      const hit = hitTest(p);
      const nh = hit ? hit.part : null;
      if (nh !== hover) hover = nh;
      if (app?.canvas) {
        app.canvas.style.cursor = !hit ? 'default' : hit.type === 'move' ? 'grab' : hit.type === 'scale' ? 'nwse-resize' : 'ew-resize';
      }
      return;
    }
    const u = studio.current.u;
    const idx = studio.selectedPhase;

    if (drag.mode === 'move') {
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      studio.mutate((d) => {
        const P = d.phases[idx];
        for (const t of drag.group) {
          const k = nearestKey(P.tracks[t], u);
          if (k) { k.dx = drag.starts[t].dx + dx; k.dy = drag.starts[t].dy + dy; }
        }
      });
    } else if (drag.mode === 'scale') {
      studio.mutate((d) => {
        const P = d.phases[idx];
        const k = nearestKey(P.tracks.cone, u);
        if (!k) return;
        const a = drag.anchor;
        if (drag.corner === 'br') {
          // 右下把手：等比例缩放（保持锥体纵横比），以左上角为锚
          const w0 = drag.size.w, h0 = drag.size.h;
          const fw = (p.x - a.x) / w0;
          const fh = (a.y - p.y) / h0;
          // 取两轴中变化更明显的一轴作为缩放系数，避免横向拖动把高度压到 0
          const mag = Math.abs(fw - 1) > Math.abs(fh - 1) ? fw : fh;
          const f = clamp(drag.sx0 * Math.max(0.12, mag), 0.15, 3.0);
          k.sx = f;
          k.sy = clamp(drag.sy0 * (f / (drag.sx0 || 1)), 0.15, 3.0);
        } else {
          // 左上把手：以右下为锚，同样等比例
          const w0 = drag.size.w, h0 = drag.size.h;
          const fw = (a.x - p.x) / w0;
          const fh = (p.y - a.y) / h0;
          const mag = Math.abs(fw - 1) > Math.abs(fh - 1) ? fw : fh;
          const f = clamp(drag.sx0 * Math.max(0.12, mag), 0.15, 3.0);
          k.sx = f;
          k.sy = clamp(drag.sy0 * (f / (drag.sx0 || 1)), 0.15, 3.0);
        }
      });
    } else if (drag.mode === 'lavaTip') {
      const geom = coneGeom(samplePhase(studio.phase, u), studio.phase);
      const f = frontFromPoint(p, geom);
      studio.mutate((d) => {
        const P = d.phases[idx];
        const k = nearestKey(P.tracks.lava, u);
        if (k) k.front = clamp(f, 0, 2.2);
      });
    }
  }

  function nearestKey(track, u) {
    let best = null, bd = Infinity;
    for (const k of track.keys) {
      const d = Math.abs(k.u - u);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  /** 指针 → 沿坡弧长归一化的前缘位置（>1 表示已越过锥缘） */
  function frontFromPoint(p, geom) {
    const pts = [];
    const N = 46;
    for (let i = N; i >= 0; i--) {
      const [x, y] = coneFlankPoint(geom.preset.shape, geom.hw, geom.h, 'right', i / N);
      pts.push([geom.cx + x, geom.baseY - y]);
    }
    let L = 0, bestAt = 0, bd = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const seg = Math.hypot(bx - ax, by - ay);
      const t = seg > 1e-6 ? clamp(((p.x - ax) * (bx - ax) + (p.y - ay) * (by - ay)) / (seg * seg), 0, 1) : 0;
      const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t;
      const d2 = (p.x - cx) ** 2 + (p.y - cy) ** 2;
      if (d2 < bd) { bd = d2; bestAt = L + seg * t; }
      L += seg;
    }
    const toe = pts[pts.length - 1];
    if (p.x > toe[0]) bestAt = L + (p.x - toe[0]);
    return bestAt / (L || 1);
  }

  function onPointerUp() {
    if (!drag) return;
    const label = drag.mode === 'move'
      ? (drag.group.length > 1 ? '已拖动（编组同步）' : '已移动')
      : drag.mode === 'scale' ? '已缩放锥体' : '已调整熔岩前缘';
    drag = null;
    studio.endLive(label);
  }

  /* ── 生命周期 ─────────────────────────────────────────────────────────── */

  onMount(async () => {
    try {
      const r = await createRenderer(host, W, H);
      app = r.app;
      world = r.world;
      gizmoLayer = new Container();
      app.stage.addChild(gizmoLayer);
      renderer = new StageRenderer(world);
      gizmoRenderer = new StageRenderer(gizmoLayer);
      measure();
      ro = new ResizeObserver(measure);
      if (wrap) ro.observe(wrap);
      ready = true;
    } catch (e) {
      err = e?.message || String(e);
      console.error(e);
    }
  });

  function measure() {
    if (!wrap || !app) return;
    const r = wrap.getBoundingClientRect();
    const w = Math.max(280, Math.round(r.width));
    const h = Math.max(200, Math.round(r.height));
    box = { w, h };
    app.renderer.resize(w, h);
  }

  onDestroy(() => {
    ro?.disconnect();
    try { renderer?.destroy(); gizmoRenderer?.destroy(); } catch { /* noop */ }
    try { app?.destroy(true, { children: true }); } catch { /* noop */ }
  });
</script>

<div class="stage" bind:this={wrap}>
  <div
    class="pixi"
    bind:this={host}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    role="application"
    aria-label="火山剖面编辑画布"></div>

  {#if err}
    <div class="err">画布初始化失败：{err}</div>
  {/if}
  {#if !ready && !err}
    <div class="loading">正在初始化 WebGL 画布…</div>
  {/if}

  <div class="hud">
    {#if studio.showGhost}<span class="chip on">叠影 · 上一阶段</span>{/if}
    {#if studio.onion}<span class="chip warn">洋葱皮 · 上一帧 <button class="x" onclick={() => studio.clearOnion()} aria-label="关闭洋葱皮">×</button></span>{/if}
    {#if drag}<span class="chip">拖动中…</span>{/if}
  </div>
</div>

<style>
  .stage { position: relative; width: 100%; height: 100%; overflow: hidden; background: #0b0c12; }
  .pixi { position: absolute; inset: 0; touch-action: none; }
  .err { position: absolute; inset: 0; display: grid; place-content: center; color: #ff9c9c; font-size: 14px; padding: 24px; text-align: center; }
  .loading { position: absolute; inset: 0; display: grid; place-content: center; color: #6b6875; font-size: 13px; }
  .hud { position: absolute; left: 12px; bottom: 10px; display: flex; gap: 8px; pointer-events: none; }
  .chip {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; letter-spacing: .02em; padding: 4px 9px; border-radius: 999px;
    background: rgba(18,20,30,.78); border: 1px solid rgba(255,255,255,.08); color: #8d8b95;
  }
  .chip.on { color: #ffc79a; border-color: rgba(255,150,80,.32); background: rgba(58,31,17,.75); }
  .chip.warn { color: #ffe27a; border-color: rgba(255,226,122,.3); background: rgba(52,45,16,.78); pointer-events: auto; }
  .x { border: 0; background: none; color: inherit; cursor: pointer; font-size: 13px; line-height: 1; padding: 0 2px; }
</style>
