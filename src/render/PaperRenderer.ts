import paper from 'paper/dist/paper-core';
import type { DrawBranch, Scene } from './scene';

type Scope = paper.PaperScope;

export const COLORS = {
  bg: '#faf8f2',
  house: '#40403a',
  bedFill: '#e7efda',
  bedStroke: '#bccfab',
  aisle: '#efece2',
  aisleStroke: '#c9c3b2',
  main: '#1d5c86',
  branch: '#2e7d5b',
  warn: '#c9821a',
  warnLine: '#e0a326',
  danger: '#c33a2c',
  drip: '#2e7d5b',
  sprinkler: '#7448b0',
  label: '#3a4a52',
  ghost: '#96a1a8',
  water: '#1d5c86',
  white: '#ffffff',
  violet: '#7c53d6',
};

export interface RenderOptions {
  showLabels: boolean;
  showRanges: boolean;
  showBeds: boolean;
  showZones: boolean;
}

export class PaperRenderer {
  private scope: Scope;
  private ready = false;
  private canvas: HTMLCanvasElement;
  private size = { w: 0, h: 0 };
  private onResize: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.scope = this.mount();
    this.ready = true;
  }

  /**
   * Build a Paper scope for the current canvas size.
   *
   * Paper's CanvasView multiplies the backing store by devicePixelRatio and
   * also rescales the 2D context, and re-deriving `view.viewSize` on the same
   * element compounds both. A fresh element per size change keeps one project
   * point equal to one CSS pixel at any DPR.
   */
  private mount(): Scope {
    const scope = new paper.PaperScope();
    scope.setup(this.canvas);
    scope.activate();
    const w = this.size.w || this.canvas.clientWidth || 300;
    const h = this.size.h || this.canvas.clientHeight || 200;
    scope.view.viewSize = new scope.Size(Math.max(1, w), Math.max(1, h));
    scope.view.zoom = 1;
    return scope;
  }

  /** Paper.js scope, for callers that need the project/view directly. */
  paperScope(): Scope {
    return this.scope;
  }

  /** The element Paper is bound to; the host swaps it when the size changes. */
  element(): HTMLCanvasElement {
    return this.canvas;
  }

  /** Diagnostics for the view transform (used by the dev geometry snapshot). */
  viewInfo() {
    const v = this.scope.view;
    return {
      viewSize: { w: v.viewSize.width, h: v.viewSize.height },
      pixelRatio: v.pixelRatio,
      zoom: v.zoom,
      elementSize: { w: v.element.width, h: v.element.height },
      elementCss: { w: v.element.clientWidth, h: v.element.clientHeight },
      matrix: v.matrix.values.slice(),
      projects: this.scope.projects.length,
    };
  }

  /** Adopt a (possibly brand-new) canvas element after the host swapped it. */
  rebind(canvas: HTMLCanvasElement, width: number, height: number): Scope {
    this.canvas = canvas;
    this.size = { w: Math.max(1, Math.round(width)), h: Math.max(1, Math.round(height)) };
    this.destroy();
    this.scope = this.mount();
    this.ready = true;
    return this.scope;
  }

  /** Called by the host whenever the canvas needs to be re-created. */
  onElementSwap(cb: () => void) {
    this.onResize = cb;
  }

  destroy() {
    try {
      this.scope.activate();
      this.scope.project.clear();
      this.scope.remove();
    } catch {
      /* noop */
    }
    this.ready = false;
    void this.onResize;
  }

  /** Clear + redraw all static art. */
  draw(scene: Scene, opts: RenderOptions) {
    if (!this.ready) return;
    this.scope.activate();
    const layer = this.scope.project.activeLayer;
    layer.removeChildren();

    this.drawHouse(scene, opts);
    this.drawMain(scene);
    this.drawBranches(scene);
    this.drawEmitters(scene, opts);
    if (opts.showZones) this.drawZones(scene);
    this.drawHeadworks(scene);
    if (opts.showLabels) this.drawLabels(scene);

    this.scope.view.update();
  }

  private drawHouse(scene: Scene, opts: RenderOptions) {
    const S = this.scope;
    const { house } = scene;

    const plate = new S.Path.Rectangle({
      point: [house.x, house.y],
      size: [house.w, house.h],
      radius: 5,
    });
    plate.fillColor = new S.Color(COLORS.bg);
    plate.strokeColor = new S.Color(COLORS.house);
    plate.strokeWidth = 2.4;

    if (!opts.showBeds) return;

    const bedGroup = new S.Group();
    for (const bed of scene.beds) {
      const r = new S.Path.Rectangle({
        point: [bed.x, bed.y],
        size: [bed.w, bed.h],
        radius: 2,
      });
      r.fillColor = new S.Color(COLORS.bedFill);
      r.strokeColor = new S.Color(COLORS.bedStroke);
      r.strokeWidth = 0.8;
      bedGroup.addChild(r);
    }
    for (const aisle of scene.aisles) {
      const r = new S.Path.Rectangle({
        point: [aisle.x, aisle.y],
        size: [aisle.w, aisle.h],
      });
      r.fillColor = new S.Color(COLORS.aisle);
      r.strokeColor = new S.Color(aisle.conflict ? COLORS.danger : COLORS.aisleStroke);
      r.strokeWidth = aisle.conflict ? 1.3 : 0.7;
      r.dashArray = [4, 4];
      bedGroup.addChild(r);
    }
  }

  private drawMain(scene: Scene) {
    const S = this.scope;
    const group = new S.Group();
    for (const seg of scene.main.segments) {
      const halo = new S.Path.Line({ from: [seg.x1, seg.y1], to: [seg.x2, seg.y2] });
      halo.strokeColor = new S.Color(COLORS.white);
      halo.strokeWidth = seg.width + 5;
      halo.strokeCap = 'round';
      group.addChild(halo);
    }
    for (const seg of scene.main.segments) {
      const line = new S.Path.Line({ from: [seg.x1, seg.y1], to: [seg.x2, seg.y2] });
      line.strokeColor = new S.Color(
        seg.status === 'warn'
          ? COLORS.warnLine
          : seg.status === 'velocity'
            ? COLORS.danger
            : COLORS.main,
      );
      line.strokeWidth = seg.width;
      line.strokeCap = 'round';
      line.data = { kind: 'main-segment', index: seg.index };
      group.addChild(line);
    }
  }

  private drawBranches(scene: Scene) {
    const S = this.scope;
    for (const br of scene.branches) {
      const group = new S.Group();
      if (br.selected) {
        const halo = new S.Path.Line({ from: [br.x1, br.y1], to: [br.x2, br.y2] });
        halo.strokeColor = new S.Color('#1d5c86');
        halo.strokeWidth = br.width + 8;
        halo.strokeCap = 'round';
        halo.opacity = 0.15;
        group.addChild(halo);
      }
      if (br.conflict) {
        const pad = 6;
        const box = new S.Path.Rectangle({
          point: [br.x1 - pad, br.y1 - pad],
          size: [pad * 2, br.y2 - br.y1 + pad * 2],
          radius: 3,
        });
        box.fillColor = new S.Color('#fbe9e7');
        box.opacity = 0.8;
        box.strokeColor = new S.Color(COLORS.danger);
        box.strokeWidth = 1.5;
        box.dashArray = [5, 3];
        box.data = { kind: 'branch', index: br.index };
        group.addChild(box);
      }
      for (const seg of br.segments) {
        const line = new S.Path.Line({ from: [seg.x1, seg.y1], to: [seg.x2, seg.y2] });
        line.strokeColor = new S.Color(
          seg.status === 'warn'
            ? COLORS.warnLine
            : seg.status === 'velocity'
              ? COLORS.danger
              : COLORS.branch,
        );
        line.strokeWidth = seg.status === 'ok' ? br.width : br.width + 1.2;
        line.strokeCap = 'round';
        line.data = { kind: 'branch-segment', index: br.index, sub: seg.from };
        group.addChild(line);
      }
      const hit = new S.Path.Line({ from: [br.x1, br.y1], to: [br.x2, br.y2] });
      hit.strokeColor = new S.Color('#000000');
      hit.strokeWidth = Math.max(14, br.width + 10);
      hit.opacity = 0;
      hit.strokeCap = 'round';
      hit.data = { kind: 'branch', index: br.index };
      group.addChild(hit);
      if (br.pinned) {
        const pin = new S.Path.Circle({ center: [br.x1 + 4, br.y1 + 4], radius: 2.2 });
        pin.fillColor = new S.Color(COLORS.violet);
        group.addChild(pin);
      }
    }
  }

  private drawEmitters(scene: Scene, opts: RenderOptions) {
    const S = this.scope;
    if (opts.showRanges) {
      for (const c of scene.rangeCircles) {
        const circle = new S.Path.Circle({ center: [c.x, c.y], radius: c.r });
        circle.fillColor = new S.Color(COLORS.sprinkler);
        circle.opacity = 0.07;
        circle.strokeColor = new S.Color(COLORS.sprinkler);
        circle.strokeWidth = 0.5;
      }
    }
    // Below a certain on-screen pitch an emitter dot per head turns the branch
    // into a solid string. Switch to a tick pattern that still conveys spacing.
    const dense = scene.emitterPitchPx < 5.5;
    for (const br of scene.branches) {
      if (dense) {
        const first = br.emitters[0];
        const last = br.emitters[br.emitters.length - 1];
        if (first && last) {
          const path = new S.Path.Line({ from: [first.x, first.y], to: [last.x, last.y] });
          path.strokeColor = new S.Color(COLORS.drip);
          path.strokeWidth = 2.6;
          path.strokeCap = 'round';
          path.dashArray = [2, 3];
          path.opacity = 0.9;
        }
        // Sprinklers stay individually visible — they are sparse and important.
        for (const e of br.emitters) {
          if (e.type !== 'sprinkler') continue;
          this.emitterDot(e, br, S, 3.4);
        }
        continue;
      }
      for (const e of br.emitters) {
        this.emitterDot(e, br, S, e.type === 'sprinkler' ? 3.4 : 1.9);
      }
    }
  }

  private emitterDot(
    e: Scene['branches'][number]['emitters'][number],
    br: Scene['branches'][number],
    S: Scope,
    radius: number,
  ) {
    const c = new S.Path.Circle({ center: [e.x, e.y], radius });
    c.fillColor = new S.Color(e.type === 'sprinkler' ? COLORS.sprinkler : COLORS.drip);
    c.strokeColor = new S.Color(COLORS.white);
    c.strokeWidth = e.type === 'sprinkler' ? 0.8 : 0.4;
    c.data = { kind: 'emitter', index: br.index, sub: e.emitterIndex };
    if (e.type === 'sprinkler') {
      const ring = new S.Path.Circle({ center: [e.x, e.y], radius: radius + 1.8 });
      ring.strokeColor = new S.Color(COLORS.sprinkler);
      ring.strokeWidth = 0.6;
      ring.opacity = 0.5;
    }
  }

  private drawZones(scene: Scene) {
    const S = this.scope;
    // Labels can crowd when zones are short: keep them from touching by
    // walking right-to-left and pushing each one clear of its neighbour.
    const MIN_GAP = 52;
    const placed: number[] = [];
    const items = [...scene.zones].sort((a, b) => b.x2 - a.x2);
    const labelX = new Map<number, number>();
    for (const z of items) {
      let x = z.x2;
      for (const px of placed) {
        if (Math.abs(x - px) < MIN_GAP) x = px - MIN_GAP;
      }
      placed.push(x);
      labelX.set(z.index, x);
    }

    for (const z of scene.zones) {
      const lx = labelX.get(z.index) ?? z.x2;
      const tick = new S.Path.Line({
        from: [z.x2, z.y2 - 7],
        to: [z.x2, z.y2 + 7],
      });
      tick.strokeColor = new S.Color(COLORS.main);
      tick.strokeWidth = 1.3;
      tick.dashArray = [2, 2];

      const badge = new S.Path.Rectangle({
        point: [lx - 25, z.y2 - 35],
        size: [50, 16],
        radius: 4,
      });
      badge.fillColor = new S.Color(COLORS.white);
      badge.strokeColor = new S.Color(COLORS.main);
      badge.strokeWidth = 0.9;
      badge.data = { kind: 'zone', index: z.index };

      new S.PointText({
        point: [lx, z.y2 - 23.5],
        content: `${z.endKPa.toFixed(0)} kPa`,
        justification: 'center',
        fontSize: 9.5,
        fontFamily: 'Inter, "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif',
        fillColor: new S.Color(COLORS.label),
      });

      const stem = new S.Path.Line({
        from: [lx, z.y2 - 19],
        to: [z.x2, z.y2 - 7],
      });
      stem.strokeColor = new S.Color(COLORS.main);
      stem.strokeWidth = 0.7;
      stem.opacity = 0.7;
    }
  }

  private drawHeadworks(scene: Scene) {
    const S = this.scope;
    const { x, y, sourceX } = scene.headworks;
    const entry = scene.houseEntry;
    // Source -> headworks -> through the wall -> onto the main.
    const incoming = new S.Path.Line({ from: [sourceX, y], to: [x - 12, y] });
    incoming.strokeColor = new S.Color(COLORS.water);
    incoming.strokeWidth = 3;
    incoming.strokeCap = 'round';
    const outgoing = new S.Path.Line({ from: [x + 12, y], to: [entry.x + 1, entry.y] });
    outgoing.strokeColor = new S.Color(COLORS.water);
    outgoing.strokeWidth = 3;
    outgoing.strokeCap = 'round';

    const pump = new S.Path.Rectangle({ point: [x - 12, y - 11], size: [24, 22], radius: 4 });
    pump.fillColor = new S.Color(COLORS.white);
    pump.strokeColor = new S.Color(COLORS.main);
    pump.strokeWidth = 1.8;

    const glyph = new S.Path.Circle({ center: [x, y], radius: 4.2 });
    glyph.strokeColor = new S.Color(COLORS.main);
    glyph.strokeWidth = 1.6;

    const tick = new S.Path.Line({ from: [sourceX, y - 7], to: [sourceX, y + 7] });
    tick.strokeColor = new S.Color(COLORS.danger);
    tick.strokeWidth = 2;

    new S.PointText({
      point: [x, y - 19],
      content: '首部',
      justification: 'center',
      fontSize: 8.5,
      fontFamily: 'Inter, "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif',
      fillColor: new S.Color(COLORS.main),
    });
    new S.PointText({
      point: [sourceX, y + 21],
      content: '水源',
      justification: 'center',
      fontSize: 8.5,
      fontFamily: 'Inter, "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif',
      fillColor: new S.Color(COLORS.ghost),
    });
  }

  private drawLabels(scene: Scene) {
    const S = this.scope;
    for (const br of scene.branches) {
      new S.PointText({
        point: [br.labelX, br.labelY],
        content: br.label,
        fontSize: 8,
        fontFamily: 'Inter, "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif',
        fillColor: new S.Color(br.conflict ? COLORS.danger : COLORS.ghost),
        justification: 'center',
      });
    }
    for (const l of scene.mainLabels) {
      new S.PointText({
        point: [l.x, l.y],
        content: l.text,
        fontSize: 8.5,
        fontFamily: 'Inter, "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif',
        fillColor: new S.Color(l.status === 'warn' ? COLORS.warn : '#4b6b7d'),
        justification: 'center',
      });
    }
    for (const f of scene.branchFlags) {
      const badge = new S.Path.Rectangle({
        point: [f.x + 8, f.y - 7],
        size: [f.text.length * 8 + 8, 14],
        radius: 3,
      });
      badge.fillColor = new S.Color(f.kind === 'danger' ? COLORS.danger : COLORS.warn);
      new S.PointText({
        point: [f.x + 12, f.y + 3],
        content: f.text,
        fontSize: 8.5,
        fontFamily: 'Inter, "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif',
        fillColor: new S.Color(COLORS.white),
        justification: 'left',
      });
      void badge;
    }
  }

  /** Ring the emitter the technician is inspecting. Drawn on top of everything. */
  highlight(x: number, y: number) {
    if (!this.ready) return;
    this.scope.activate();
    const S = this.scope;
    const ring = new S.Path.Circle({ center: [x, y], radius: 9 });
    ring.strokeColor = new S.Color(COLORS.warn);
    ring.strokeWidth = 2;
    ring.dashArray = [3, 2];
    const halo = new S.Path.Circle({ center: [x, y], radius: 15 });
    halo.strokeColor = new S.Color(COLORS.warn);
    halo.strokeWidth = 0.9;
    halo.opacity = 0.45;
    this.scope.view.update();
  }
}

export type { DrawBranch };
