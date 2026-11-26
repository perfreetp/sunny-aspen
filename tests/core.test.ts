import { describe, expect, it } from 'vitest';
import { hazenGradient, velocityOf, chooseMainPipe, solve, nextPipeUp } from '../src/core/hydraulics';
import { buildLayout } from '../src/core/layout';
import { defaultParams } from '../src/core/defaults';
import { pipe, PIPES } from '../src/core/catalogue';
import type { ProjectParams } from '../src/core/types';

function makeParams(mut: (p: ProjectParams) => void = () => {}): ProjectParams {
  const p = defaultParams();
  mut(p);
  return p;
}

function run(params: ProjectParams, seed = 1234, overrides = { branchOffset: {}, branchSpacing: {}, branchDiameter: {} }) {
  const layout = buildLayout({ params, overrides, seed });
  return solve({ layout, params });
}

describe('Hazen-Williams', () => {
  it('matches a hand-computed gradient', () => {
    // Q = 60 m³/h, DN110 PE (96.2 mm), C = 130
    const q = 60 / 3600;
    const d = 0.0962;
    const r = d / 4;
    const v = q / ((Math.PI * d * d) / 4);
    const expected = Math.pow(v / (0.849 * 130 * Math.pow(r, 0.63)), 1 / 0.54);
    expect(hazenGradient(q, 96.2, 130)).toBeCloseTo(expected, 10);
    expect(hazenGradient(0, 96.2, 130)).toBe(0);
  });

  it('is monotone in flow and falls with diameter', () => {
    const q = 2 / 3600;
    expect(hazenGradient(q * 2, 50, 130)).toBeGreaterThan(hazenGradient(q, 50, 130));
    expect(hazenGradient(q, 30, 130)).toBeGreaterThan(hazenGradient(q, 60, 130));
  });

  it('velocity follows continuity', () => {
    const q = 3.6;
    const d = 0.0436; // m³/h -> m³/s below
    const expected = (q / 3600) / ((Math.PI * d * d) / 4);
    expect(velocityOf(q / 3600, 43.6)).toBeCloseTo(expected, 9);
  });
});

describe('pipe selection', () => {
  it('never exceeds the head pipe diameter', () => {
    const id = chooseMainPipe(50000, 1.5, 'pe63');
    expect(pipe(id).dn).toBeLessThanOrEqual(63);
  });

  it('picks the smallest pipe that keeps velocity in range', () => {
    const id = chooseMainPipe(2000, 1.5, 'pe110');
    const q = 2000 / 3_600_000;
    expect(velocityOf(q, pipe(id).innerMm)).toBeLessThanOrEqual(1.5);
    // and it is the smallest such pipe: one DN down would be too fast
    const idx = PIPES.findIndex((p) => p.id === id);
    const prev = PIPES[idx - 1];
    if (prev) expect(velocityOf(q, prev.innerMm)).toBeGreaterThan(1.5);
  });

  it('steps up from pe16 through the catalogue', () => {
    expect(nextPipeUp('pe16')?.dn).toBe(20);
    expect(nextPipeUp('pe125')).toBeNull();
  });
});

describe('layout generation', () => {
  it('places branches along the main between head and tail', () => {
    const params = makeParams();
    const layout = buildLayout({ params, overrides: { branchOffset: {}, branchSpacing: {}, branchDiameter: {} }, seed: 7 });
    expect(layout.branches.length).toBeGreaterThan(5);
    for (const b of layout.branches) {
      expect(b.u).toBeGreaterThan(layout.main.uFrom);
      expect(b.u).toBeLessThan(layout.main.uTo);
      expect(b.lengthM).toBeGreaterThan(params.greenhouse.spanM - 4);
    }
  });

  it('is reproducible from the seed', () => {
    const params = makeParams();
    const o = { branchOffset: {}, branchSpacing: {}, branchDiameter: {} };
    const a = buildLayout({ params, overrides: o, seed: 99 });
    const b = buildLayout({ params, overrides: o, seed: 99 });
    const c = buildLayout({ params, overrides: o, seed: 100 });
    expect(b.branches.map((x) => x.u)).toEqual(a.branches.map((x) => x.u));
    expect(b.branches.map((x) => x.emitters.map((e) => e.s))).toEqual(
      a.branches.map((x) => x.emitters.map((e) => e.s)),
    );
    expect(c.branches.map((x) => x.u)).not.toEqual(a.branches.map((x) => x.u));
  });

  it('produces drip and sprinkler emitters in the right zones', () => {
    const params = makeParams();
    const layout = buildLayout({ params, overrides: { branchOffset: {}, branchSpacing: {}, branchDiameter: {} }, seed: 5 });
    const b = layout.branches[0];
    expect(b.zones.map((z) => z.type)).toEqual(['drip', 'sprinkler']);
    const sprinklerS = b.emitters.filter((e) => e.type === 'sprinkler').map((e) => e.s);
    expect(sprinklerS.length).toBeGreaterThan(0);
    const zone = b.zones[1];
    expect(Math.min(...sprinklerS)).toBeGreaterThanOrEqual(zone.from - 1e-6);
    expect(Math.max(...sprinklerS)).toBeLessThanOrEqual(zone.to + 1e-6);
  });

  it('snaps generated branches out of working aisles', () => {
    const params = makeParams((p) => {
      p.branch.followBeds = false;
      p.branch.spacingM = 2.0;
      p.branch.firstOffsetM = 3.3;
      p.branch.avoidAisles = true;
    });
    const layout = buildLayout({ params, overrides: { branchOffset: {}, branchSpacing: {}, branchDiameter: {} }, seed: 3 });
    const result = solve({ layout, params });
    expect(result.conflicts).toHaveLength(0);
  });

  it('reports branches that cross a working aisle', () => {
    const params = makeParams((p) => {
      p.branch.followBeds = false;
      p.branch.spacingM = 2.0;
      p.branch.firstOffsetM = 3.3;
      p.branch.avoidAisles = false;
      p.branch.jitterMm = 0;
    });
    const layout = buildLayout({ params, overrides: { branchOffset: {}, branchSpacing: {}, branchDiameter: {} }, seed: 3 });
    const result = solve({ layout, params });
    expect(result.conflicts.length).toBeGreaterThan(0);
    for (const c of result.conflicts) {
      const br = layout.branches[c.branchIndex];
      expect(br.u).toBeGreaterThan(c.aisle.u0);
      expect(br.u).toBeLessThan(c.aisle.u1);
    }
  });
});

describe('hydraulic solve', () => {
  it('keeps the standard preset within limits', () => {
    const result = run(makeParams());
    expect(result.main.flags).toBe(0);
    expect(result.main.totalFlowLph).toBeGreaterThan(1000);
    expect(result.branches.every((b) => b.flags === 0)).toBe(true);
  });

  it('warns on a starved branch', () => {
    const params = makeParams((p) => {
      p.branch.diameterId = 'pe16';
      p.greenhouse.spanM = 20;
      p.branch.sprinklerZoneM = 20;
      p.sprinkler = {
        specId: 'spr-250',
        qLph: 250,
        hNomM: 25,
        exponent: 0.5,
        radiusM: 4,
        spacingFactor: 1,
      };
    });
    const result = run(params);
    expect(result.branches.some((b) => b.flags > 0)).toBe(true);
    const warn = result.warnings.find((w) => w.kind === 'velocity' && w.branchIndex !== undefined);
    expect(warn).toBeDefined();
    expect(warn?.advice).toMatch(/DN|流量/);
  });

  it('warns and suggests a bigger pipe when the friction budget is blown', () => {
    const params = makeParams((p) => {
      p.branch.diameterId = 'pe16';
      p.greenhouse.spanM = 20;
      p.drip.spacingM = 0.15;
      p.drip.qnLph = 8;
      p.branch.spacingM = 8;
      p.branch.sprinklerZoneM = 0;
    });
    const result = run(params);
    const br = result.branches.find((b) => b.flags > 0);
    expect(br).toBeDefined();
    const over = br?.segments.filter((s) => s.status === 'warn') ?? [];
    expect(over.length).toBeGreaterThan(0);
    const withAdvice = over.find((s) => s.advice);
    expect(withAdvice?.advice).toMatch(/DN20|DN25|缩短/);
    expect(withAdvice?.budget).toBeGreaterThan(0);
    expect(withAdvice!.cumLoss).toBeGreaterThan(withAdvice!.budget);
  });

  it('recomputes downstream segments when the head pipe changes but keeps hand edits', () => {
    const params = makeParams();
    const base = run(params);
    const branch = base.layout.branches[2];
    const movedU = branch.u + 0.37;
    const overrides = {
      branchOffset: { [branch.key]: movedU },
      branchSpacing: { [base.layout.branches[4].key]: 0.42 },
      branchDiameter: {},
    };

    const thin = makeParams((p) => {
      p.main.headDiameterId = 'pe40';
    });
    const a = solve({
      params: thin,
      layout: buildLayout({ params: thin, overrides, seed: base.layout.seed }),
    });
    const fat = makeParams((p) => {
      p.main.headDiameterId = 'pe110';
    });
    const b = solve({
      params: fat,
      layout: buildLayout({ params: fat, overrides, seed: base.layout.seed }),
    });

    // hand-moved branch stays exactly where the technician put it
    for (const res of [a, b]) {
      const moved = res.layout.branches.find((x) => x.key === branch.key);
      expect(moved?.u).toBeCloseTo(movedU, 6);
      expect(moved?.pinned).toBe(true);
      const spaced = res.layout.branches[4];
      expect(spaced.dripSpacingM).toBeCloseTo(0.42, 6);
      expect(spaced.spacingOverridden).toBe(true);
    }
    // and the hydraulics upstream of the branches really did change
    expect(a.main.segments[0].diameterId).not.toEqual(b.main.segments[0].diameterId);
    expect(a.main.segments[0].hf).toBeGreaterThan(b.main.segments[0].hf);
  });

  it('changing spacing on one branch never moves a neighbour', () => {
    const params = makeParams();
    const base = run(params);
    const target = base.layout.branches[3];
    const before = base.layout.branches.map((b) => b.emitters.map((e) => e.s));

    const overrides = { branchOffset: {}, branchSpacing: { [target.key]: 0.5 }, branchDiameter: {} };
    const after = solve({ params, layout: buildLayout({ params, overrides, seed: base.layout.seed }) });

    const reordered = after.layout.branches.map((b) => b.emitters.map((e) => e.s));
    for (let i = 0; i < before.length; i++) {
      if (i === target.index) {
        expect(reordered[i]).not.toEqual(before[i]);
        // new spacing must actually be ~0.5 m
        const gaps = reordered[i].slice(1).map((s, k) => s - reordered[i][k]);
        const mean = gaps.reduce((x, y) => x + y, 0) / gaps.length;
        expect(mean).toBeGreaterThan(0.35);
        expect(mean).toBeLessThan(0.65);
      } else {
        expect(reordered[i]).toEqual(before[i]);
      }
    }
  });

  it('is bit-for-bit reproducible for the same seed and params', () => {
    const params = makeParams();
    const a = run(params, 424242);
    const b = run(params, 424242);
    expect(b.fingerprint).toBe(a.fingerprint);
    expect(b.totals).toEqual(a.totals);
    expect(b.main.segments.map((s) => s.hf)).toEqual(a.main.segments.map((s) => s.hf));
  });

  it('segments the main into pressure zones from the source', () => {
    const params = makeParams((p) => {
      p.hydraulic.zoneKPa = 20;
    });
    const result = run(params);
    expect(result.main.zones.length).toBeGreaterThan(1);
    expect(result.main.zones[0].uFrom).toBeCloseTo(result.layout.main.uFrom, 6);
    const last = result.main.zones[result.main.zones.length - 1];
    expect(last.uTo).toBeCloseTo(result.layout.main.uTo, 6);
    for (const z of result.main.zones) expect(Number.isFinite(z.endKPa)).toBe(true);
    // zones tile the main with no gaps or overlaps
    for (let i = 1; i < result.main.zones.length; i++) {
      expect(result.main.zones[i].uFrom).toBeCloseTo(result.main.zones[i - 1].uTo, 9);
      expect(result.main.zones[i].endKPa).toBeLessThanOrEqual(result.main.zones[i - 1].endKPa + 1e-6);
    }
    const total = result.main.zones.reduce((a, z) => a + z.lengthM, 0);
    expect(total).toBeCloseTo(result.layout.main.uTo - result.layout.main.uFrom, 6);
  });

  it('labels the source-side zone with the headworks pressure', () => {
    const params = makeParams();
    const result = run(params);
    const first = result.main.zones[0];
    expect(first.startKPa).toBeCloseTo(result.main.headworksHead * 9.81, 6);
    expect(first.endKPa).toBeLessThan(first.startKPa + 1e-9);
  });

  it('tapers the main down as flow drops', () => {
    const params = makeParams((p) => {
      p.main.headDiameterId = 'pe110';
      p.main.autoTaper = true;
    });
    const result = run(params);
    const dns = result.main.segments.map((s) => pipe(s.diameterId).dn);
    for (let i = 1; i < dns.length; i++) expect(dns[i]).toBeLessThanOrEqual(dns[i - 1]);
    expect(new Set(dns).size).toBeGreaterThan(1);
  });
});

describe('seedbed alignment', () => {
  it('every generated branch sits on a seedbed centre line', () => {
    const params = makeParams();
    const layout = buildLayout({
      params,
      overrides: { branchOffset: {}, branchSpacing: {}, branchDiameter: {} },
      seed: 1,
    });
    const centers = layout.beds.map((b) => (b.u0 + b.u1) / 2);
    for (const br of layout.branches) {
      const near = centers.filter((c) => Math.abs(c - br.u) < 0.35);
      expect(near.length, `branch ${br.index} at ${br.u.toFixed(2)} is off-bed`).toBeGreaterThan(0);
    }
  });

  it('beds begin past the main so the main never crosses a bed', () => {
    const params = makeParams();
    const layout = buildLayout({
      params,
      overrides: { branchOffset: {}, branchSpacing: {}, branchDiameter: {} },
      seed: 1,
    });
    for (const bed of layout.beds) expect(bed.v0).toBeGreaterThan(layout.main.v);
  });
});

describe('uniformity reporting', () => {
  it('never compares a drip emitter against a sprinkler in one deviation figure', () => {
    const params = makeParams();
    const result = run(params);
    for (const br of result.branches) {
      const hasBoth =
        br.emitters.some((e) => e.type === 'drip') && br.emitters.some((e) => e.type === 'sprinkler');
      if (hasBoth) {
        // A mixed branch with a good main must not report a four-digit spread.
        expect(br.flowDeviationPct).toBeLessThan(30);
      }
      expect(Number.isFinite(br.flowDeviationPct)).toBe(true);
      expect(br.flowDeviationPct).toBeGreaterThanOrEqual(0);
    }
  });

  it('reports a growing spread as a branch starves', () => {
    const good = run(makeParams()).branches[0].flowDeviationPct;
    const starved = run(
      makeParams((p) => {
        p.branch.diameterId = 'pe16';
        p.greenhouse.spanM = 20;
        p.drip.spacingM = 0.15;
        p.drip.qnLph = 8;
        p.branch.spacingM = 8;
        p.branch.sprinklerZoneM = 0;
      }),
    ).branches[0].flowDeviationPct;
    expect(starved).toBeGreaterThan(good);
    expect(starved).toBeLessThan(100);
  });
});
