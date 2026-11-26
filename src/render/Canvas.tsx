import { useEffect, useRef, useState } from 'react';
import { buildScene, fitViewport, toWorld, type Scene, type Viewport } from './scene';
import { PaperRenderer, type RenderOptions } from './PaperRenderer';
import { hitTest, type Hit } from './hit';
import type { Solution } from '../core/types';

export interface CanvasHandle {
  exportSvg: () => string | null;
  zoomToFit: () => void;
}

interface Props {
  solution: Solution;
  selectedBranch: number | null;
  highlightEmitter: { branchIndex: number; emitterIndex: number } | null;
  render: RenderOptions;
  sprinklerRadiusM: number;
  onSelectBranch: (index: number | null) => void;
  onSelectEmitter: (branchIndex: number, emitterIndex: number) => void;
  /** technician moved a branch along the main */
  onMoveBranch: (key: string, u: number) => void;
  /** technician dragged one emitter — changes that branch's spacing only */
  onSetBranchSpacing: (key: string, spacing: number) => void;
  onSelectMainSegment?: (index: number | null) => void;
  onSelectZone?: (index: number) => void;
  onHandle: (h: CanvasHandle | null) => void;
  fitToken: number;
}

type Drag =
  | { kind: 'none' }
  | { kind: 'branch'; index: number; key: string; startX: number; startY: number; u0: number }
  | {
      kind: 'emitter';
      index: number;
      key: string;
      emitterIndex: number;
      startX: number;
      startY: number;
      moved: boolean;
    }
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number };

const DRAG_THRESHOLD_PX = 5;
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 9;

interface Cam {
  zoom: number;
  /** extra translation in screen px, applied after fitting */
  panX: number;
  panY: number;
}

export function Canvas({
  solution,
  selectedBranch,
  highlightEmitter,
  render,
  sprinklerRadiusM,
  onSelectBranch,
  onSelectEmitter,
  onMoveBranch,
  onSetBranchSpacing,
  onSelectMainSegment,
  onSelectZone,
  onHandle,
  fitToken,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PaperRenderer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const vpRef = useRef<Viewport | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const dragRef = useRef<Drag>({ kind: 'none' });
  const drawRef = useRef<() => void>(() => {});
  const camRef = useRef<Cam>({ zoom: 1, panX: 0, panY: 0 });
  const [zoomLabel, setZoomLabel] = useState(100);
  // Bumping this remounts the <canvas>, which is the only way to give Paper a
  // pristine backing store after a size change (see PaperRenderer.mount).
  const [canvasEpoch, setCanvasEpoch] = useState(0);

  const buildVp = (): Viewport | null => {
    const { w, h } = sizeRef.current;
    if (w < 20 || h < 20) return null;
    const layout = solution.layout;
    const base = fitViewport(w, h, layout.uExtent, layout.vExtent, 76, 64);
    const cam = camRef.current;
    const z = cam.zoom;
    return {
      scale: base.scale * z,
      ox: base.ox + cam.panX - (layout.uExtent * base.scale * (z - 1)) / 2,
      oy: base.oy + cam.panY - (layout.vExtent * base.scale * (z - 1)) / 2,
      width: w,
      height: h,
    };
  };

  drawRef.current = () => {
    const renderer = rendererRef.current;
    const vp = buildVp();
    if (!renderer || !vp) return;
    vpRef.current = vp;
    const scene = buildScene(solution, vp, { selectedBranch, sprinklerRadiusM });
    sceneRef.current = scene;
    renderer.draw(scene, render);
    if (import.meta.env.DEV) {
      // Read-only geometry snapshot for automated UI checks (dev builds only).
      (window as unknown as { __irrigationScene?: unknown }).__irrigationScene = {
        viewport: vp,
        view: renderer.viewInfo(),
        branches: scene.branches.map((b) => ({
          index: b.index,
          key: b.key,
          u: b.u,
          labelPinned: b.pinned,
          x1: b.x1,
          y1: b.y1,
          x2: b.x2,
          y2: b.y2,
          emitters: b.emitters.map((e, i) => ({
            i: e.emitterIndex,
            x: e.x,
            y: e.y,
            type: e.type,
            // world distance from the branch inlet, stable across zoom/pan
            s: solution.layout.branches[b.index]?.emitters[i]?.s ?? 0,
          })),
        })),
        zones: scene.zones,
        emitterPitchPx: scene.emitterPitchPx,
      };
    }
    if (highlightEmitter) {
      const br = scene.branches.find((b) => b.index === highlightEmitter.branchIndex);
      const em = br?.emitters[highlightEmitter.emitterIndex];
      if (em) renderer.highlight(em.x, em.y);
    }
    setZoomLabel(Math.round(camRef.current.zoom * 100));
  };

  // ---- renderer lifecycle --------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = new PaperRenderer(canvas);
    rendererRef.current = r;
    onHandle({
      exportSvg: () => {
        try {
          r.paperScope().activate();
          return r.paperScope().project.exportSVG({ asString: true, bounds: 'content' }) as string;
        } catch {
          return null;
        }
      },
      zoomToFit: () => {
        camRef.current = { zoom: 1, panX: 0, panY: 0 };
        drawRef.current();
      },
    });
    return () => {
      onHandle(null);
      r.destroy();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The plan fills whatever vertical space the stage gives it; the fit is
  // width-driven, so the house sits centred like a drawing on a sheet.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const parent = host.parentElement;
    if (!parent) return;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      const prev = sizeRef.current;
      const changed = Math.abs(rect.width - prev.w) > 1.5 || Math.abs(rect.height - prev.h) > 1.5;
      sizeRef.current = { w: rect.width, h: rect.height };
      if (changed && prev.w > 0 && rendererRef.current) {
        // A size change needs a pristine canvas element (see PaperRenderer.mount)
        setCanvasEpoch((e) => e + 1);
        return;
      }
      drawRef.current();
    };
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    ro.observe(host);
    measure();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    drawRef.current();
  }, [solution, selectedBranch, highlightEmitter, render, sprinklerRadiusM]);

  useEffect(() => {
    camRef.current = { zoom: 1, panX: 0, panY: 0 };
    drawRef.current();
  }, [fitToken]);

  // ---- wheel zoom (non-passive so we can prevent page scroll) --------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vp = vpRef.current;
      if (!vp) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const before = toWorld(vp, px, py);
      const cam = camRef.current;
      const factor = Math.exp(-e.deltaY * 0.0016);
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom * factor));
      cam.zoom = next;
      const after = buildVp();
      if (!after) return;
      const now = toWorld(after, px, py);
      // keep the world point under the cursor fixed
      cam.panX += (now.u - before.u) * after.scale;
      cam.panY += (now.v - before.v) * after.scale;
      drawRef.current();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
    // re-bind whenever the <canvas> is remounted (canvasEpoch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasEpoch]);

  // ---- pointer handling ----------------------------------------------------
  const toLocal = (e: React.PointerEvent) => {
    const vp = vpRef.current;
    const canvas = canvasRef.current;
    if (!vp || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = toWorld(vp, x, y);
    return { x, y, u: w.u, v: w.v };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toLocal(e);
    const scene = sceneRef.current;
    if (!p || !scene) return;

    // Middle button / space-less panning: drag on empty canvas pans the view.
    const hit: Hit = e.button === 1 ? null : hitTest(scene, p.x, p.y, vpRef.current?.scale ?? 1, selectedBranch);
    if (e.button === 1 || e.shiftKey) {
      dragRef.current = {
        kind: 'pan',
        startX: p.x,
        startY: p.y,
        panX: camRef.current.panX,
        panY: camRef.current.panY,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (!hit) {
      onSelectBranch(null);
      onSelectMainSegment?.(null);
      dragRef.current = {
        kind: 'pan',
        startX: p.x,
        startY: p.y,
        panX: camRef.current.panX,
        panY: camRef.current.panY,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      drawRef.current();
      return;
    }
    if (hit.kind === 'branch') {
      const branch = solution.layout.branches.find((b) => b.index === hit.index);
      onSelectBranch(hit.index);
      onSelectMainSegment?.(null);
      if (branch) {
        dragRef.current = {
          kind: 'branch',
          index: hit.index,
          key: branch.key,
          startX: p.x,
          startY: p.y,
          u0: branch.u,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      drawRef.current();
      return;
    }
    if (hit.kind === 'emitter') {
      const branch = solution.layout.branches.find((b) => b.index === hit.branchIndex);
      onSelectBranch(hit.branchIndex);
      onSelectEmitter(hit.branchIndex, hit.emitterIndex);
      if (branch) {
        dragRef.current = {
          kind: 'emitter',
          index: hit.branchIndex,
          key: branch.key,
          emitterIndex: hit.emitterIndex,
          startX: p.x,
          startY: p.y,
          moved: false,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      drawRef.current();
      return;
    }
    if (hit.kind === 'main') {
      onSelectMainSegment?.(hit.index);
      onSelectBranch(null);
      dragRef.current = { kind: 'none' };
      drawRef.current();
      return;
    }
    if (hit.kind === 'zone') {
      onSelectZone?.(hit.index);
      dragRef.current = { kind: 'none' };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const p = toLocal(e);
    if (!p) return;

    if (drag.kind === 'pan') {
      camRef.current.panX = drag.panX + (p.x - drag.startX);
      camRef.current.panY = drag.panY + (p.y - drag.startY);
      drawRef.current();
      return;
    }
    if (drag.kind === 'branch') {
      if (Math.hypot(p.x - drag.startX, p.y - drag.startY) < DRAG_THRESHOLD_PX) return;
      const layout = solution.layout;
      const u = Math.min(layout.main.uTo - 0.15, Math.max(layout.main.uFrom + 0.15, p.u));
      onMoveBranch(drag.key, Math.round(u * 100) / 100);
      return;
    }
    if (drag.kind === 'emitter') {
      const moved = Math.hypot(p.x - drag.startX, p.y - drag.startY);
      if (moved > DRAG_THRESHOLD_PX) drag.moved = true;
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = { kind: 'none' };
    if (drag.kind === 'emitter' && drag.moved) {
      const p = toLocal(e);
      const branch = solution.layout.branches.find((b) => b.key === drag.key);
      if (p && branch) {
        const target = Math.max(0.05, Math.min(branch.lengthM - 0.05, p.v - branch.vFrom));
        const index = drag.emitterIndex;
        const first = branch.emitters[0]?.s ?? 0.3;
        const next = index > 0 ? (target - first) / index : target;
        const clamped = Math.max(0.08, Math.min(branch.lengthM - 0.1, next));
        onSetBranchSpacing(drag.key, Math.round(clamped * 1000) / 1000);
      }
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div className="canvas-host" ref={hostRef}>
      <canvas
        key={canvasEpoch}
        ref={canvasRef}
        className="canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="canvas-hud">
        <span className="hud-hint">滚轮缩放 · 空白处拖动平移 · 拖支管改位置 · 拖滴头改间距</span>
        <span className="hud-zoom">{zoomLabel}%</span>
        <button
          type="button"
          className="hud-btn"
          onClick={() => {
            camRef.current = { zoom: 1, panX: 0, panY: 0 };
            drawRef.current();
          }}
          title="复位视图"
        >
          复位
        </button>
      </div>
    </div>
  );
}
