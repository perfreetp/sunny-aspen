import { describe, expect, it } from 'vitest';
import { buildDesignModel, createDefaultParams, maxGridThickness } from './design';
import { buildGearContour } from './gearGeometry';
import { setNumericParam, studioState } from '../state/store';

describe('procedural design model', () => {
  it('reproduces exactly for the same params, seed and overrides', () => {
    const params = createDefaultParams();
    const overrides = { G2: 26, G4: 33 };

    const a = buildDesignModel(params, overrides);
    const b = buildDesignModel({ ...params }, { ...overrides });

    expect(b.fingerprint).toBe(a.fingerprint);
    expect(b.seedCode).toBe(a.seedCode);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('changes fingerprint when seed changes', () => {
    const a = buildDesignModel(createDefaultParams(), { G3: 28 });
    const b = buildDesignModel({ ...createDefaultParams(), seed: 42 }, { G3: 28 });
    expect(b.fingerprint).not.toBe(a.fingerprint);
  });

  it('preserves manual teeth while spacing changes positions', () => {
    const overrides = { G3: 38 };
    const before = buildDesignModel(createDefaultParams(), overrides);
    const after = buildDesignModel({ ...createDefaultParams(), spacing: 72 }, overrides);

    const g3Before = before.gears.find((g) => g.id === 'G3');
    const g3After = after.gears.find((g) => g.id === 'G3');
    const g5Before = before.gears.find((g) => g.id === 'G5');
    const g5After = after.gears.find((g) => g.id === 'G5');

    expect(g3After?.teeth).toBe(38);
    expect(g3After?.manual).toBe(true);
    expect(g3After?.position.x).not.toBe(g3Before?.position.x);
    expect(g5After?.position.x).toBeGreaterThan(g5Before?.position.x ?? 0);
  });

  it('clamps grille thickness according to spacing', () => {
    expect(maxGridThickness(24)).toBe(10);
    expect(maxGridThickness(40)).toBe(16);
    expect(maxGridThickness(200)).toBe(40);

    setNumericParam('gridThickness', 999);
    expect(studioState.params.gridThickness).toBe(maxGridThickness(studioState.params.spacing));

    setNumericParam('spacing', 24);
    expect(studioState.params.spacing).toBe(24);
    expect(studioState.params.gridThickness).toBe(10);
    expect(studioState.overrides.G3).toBe(28);
  });

  it('builds finite closed gear contours for every tooth profile', () => {
    for (const profile of ['involute', 'trapezoidal', 'arc'] as const) {
      const points = buildGearContour({ teeth: 24, module: 2, pressureAngleDeg: 20, profile });
      expect(points.length).toBeGreaterThan(80);
      expect(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);

      const first = points[0];
      const last = points[points.length - 1];
      expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeLessThan(8);
    }
  });
});
