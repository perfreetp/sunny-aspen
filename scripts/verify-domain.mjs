import assert from 'node:assert/strict';
import { buildNetwork } from '../src/lib/domain/geometry.js';

const baseParams = {
  innerDiameter: 18,
  eaveHeight: 20,
  coneAngle: 35,
  grainLine: 15,
  grainType: 'wheat',
  ductForm: 'above',
  mainRoute: 'straight',
  branchCount: 8,
  arrayRows: 6,
  arrayCols: 10,
  seed: 'TEST-SEED'
};

const n1 = buildNetwork({ params: baseParams, branchOverrides: {}, removedVentIds: [] });
const n2 = buildNetwork({ params: { ...baseParams }, branchOverrides: {}, removedVentIds: [] });
assert.equal(JSON.stringify(n1.branches), JSON.stringify(n2.branches), 'same seed branches must be identical');
assert.equal(JSON.stringify(n1.vents), JSON.stringify(n2.vents), 'same seed vents must be identical');
assert.equal(n1.fingerprint, n2.fingerprint);

const otherSeed = buildNetwork({ params: { ...baseParams, seed: 'OTHER-SEED' } });
assert.notEqual(n1.fingerprint, otherSeed.fingerprint, 'different seed should change fingerprint');
assert.notEqual(JSON.stringify(n1.branches), JSON.stringify(otherSeed.branches), 'different seed should change branches');

const biggerD = buildNetwork({ params: { ...baseParams, innerDiameter: 26 } });
assert.ok(biggerD.stats.spacingX > n1.stats.spacingX, 'vent spacing should grow with inner diameter');
assert.ok(biggerD.stats.branchLengthM > n1.stats.branchLengthM, 'branch total length should grow with inner diameter');

const manuallyMoved = buildNetwork({
  params: { ...baseParams, innerDiameter: 18 },
  branchOverrides: { b2: { xM: 2.75 } }
});
const movedAfterDChange = buildNetwork({
  params: { ...baseParams, innerDiameter: 24 },
  branchOverrides: { b2: { xM: 2.75 } }
});
assert.equal(manuallyMoved.branches.find((b) => b.id === 'b2').manual, true);
assert.ok(Math.abs(movedAfterDChange.branches.find((b) => b.id === 'b2').points[0].x - 2.75) < 0.01,
  'manual comb branch absolute position should survive diameter change');
assert.notEqual(
  JSON.stringify(movedAfterDChange.branches.find((b) => b.id === 'b0').points),
  JSON.stringify(manuallyMoved.branches.find((b) => b.id === 'b0').points),
  'unmodified branches should rearrange after diameter change'
);

const deleted = buildNetwork({
  params: baseParams,
  removedVentIds: ['v-2-3']
});
assert.equal(deleted.stats.activeVentCount, 59);
assert.ok(!deleted.vents.some((v) => v.id === 'v-2-3'));

const deletedAfterGrainChange = buildNetwork({
  params: { ...baseParams, grainLine: 18.5 },
  removedVentIds: ['v-2-3']
});
assert.ok(!deletedAfterGrainChange.vents.some((v) => v.id === 'v-2-3'), 'deleted vent must not return');
assert.equal(deletedAfterGrainChange.stats.activeVentCount, 59);
const oldVent = deleted.vents.find((v) => v.id === 'v-1-1');
const newVent = deletedAfterGrainChange.vents.find((v) => v.id === 'v-1-1');
assert.ok(Math.abs(oldVent.x - newVent.x) + Math.abs(oldVent.y - newVent.y) > 0.01,
  'remaining vents should rearrange with grain line');

console.log('domain verification passed', {
  fingerprint: n1.fingerprint,
  spacingX: n1.stats.spacingX,
  branchLengthM: n1.stats.branchLengthM,
  airflowM3h: n1.stats.airflowM3h
});
