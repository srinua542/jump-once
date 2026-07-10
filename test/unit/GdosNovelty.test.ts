/**
 * S5.5 — novelty search (REQ-053; dm-0038). The metric is a pure
 * (candidate, corpus[]) → divergence over fixed-length descriptors
 * (mechanic histogram + geometry signature + trajectory shape); an identical
 * level diverges 0, a different one diverges more, and an empty corpus yields
 * null (nothing exists to diverge from). Weights are profile calibration.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ENTITY_KINDS } from '../../src/components/Behavior';
import { DEFAULT_PROFILE } from '../../src/eval/gdos/Profile';
import {
  GEOMETRY_BANDS,
  TRAJECTORY_BUCKETS,
  buildDescriptor,
  descriptorDistance,
  noveltyDivergence,
} from '../../src/eval/gdos/Novelty';
import { emptyTape, makeLevel, makeBundle } from '../helpers/GdosFixtures';
import { TAPE_SCHEMA_VERSION } from '../../src/schema/TapeIO';
import type { ArchetypeRun } from '../../src/eval/gdos/Evidence';

/** A run whose tape holds real frames (walk right, jump at `jumpAt`). */
function runWithTape(ticks: number, jumpAt: number): ArchetypeRun {
  const frames = [];
  for (let i = 0; i < ticks; i++) {
    frames.push({ moveAxis: 1 as const, jumpPressed: i === jumpAt, resetPressed: false });
  }
  return {
    archetype: 'firstTime',
    outcome: 'completed',
    attempts: 0,
    ticksElapsed: ticks,
    tape: { schemaVersion: TAPE_SCHEMA_VERSION, levelId: 'novelty-fixture', seed: 1, frames },
  };
}

test('descriptor has the documented fixed shape', () => {
  const d = buildDescriptor(makeBundle({ runs: [runWithTape(80, 40)] }));
  assert.equal(d.mechanicHistogram.length, ENTITY_KINDS.length);
  assert.equal(d.geometrySignature.length, GEOMETRY_BANDS * GEOMETRY_BANDS);
  assert.equal(d.trajectoryShape.length, TRAJECTORY_BUCKETS + 3);
});

test('an identical level diverges 0 from itself', () => {
  const bundle = makeBundle({
    def: makeLevel({ id: 'same', entities: [{ kind: 'spring', x: 3, y: 4 }] }),
    runs: [runWithTape(80, 40)],
  });
  const d = buildDescriptor(bundle);
  assert.equal(descriptorDistance(d, d, DEFAULT_PROFILE), 0);
  const result = noveltyDivergence(d, [d], DEFAULT_PROFILE);
  assert.equal(result.divergence, 0);
  assert.equal(result.nearestIndex, 0);
});

test('a mechanically and geometrically different level diverges more', () => {
  const base = buildDescriptor(makeBundle({
    def: makeLevel({ id: 'base', width: 12, height: 6, entities: [{ kind: 'spike', x: 3, y: 4 }] }),
    runs: [runWithTape(80, 10)],
  }));
  const near = buildDescriptor(makeBundle({
    def: makeLevel({ id: 'near', width: 12, height: 6, entities: [{ kind: 'spike', x: 5, y: 4 }] }),
    runs: [runWithTape(80, 10)],
  }));
  const far = buildDescriptor(makeBundle({
    def: makeLevel({ id: 'far', width: 30, height: 12, entities: [{ kind: 'spring', x: 3, y: 4 }, { kind: 'conveyor', x: 6, y: 4 }, { kind: 'gravityZone', x: 9, y: 4 }] }),
    runs: [runWithTape(300, 250)],
  }));
  const dNear = descriptorDistance(base, near, DEFAULT_PROFILE);
  const dFar = descriptorDistance(base, far, DEFAULT_PROFILE);
  assert.ok(dFar > dNear, `far ${dFar} should exceed near ${dNear}`);

  // Divergence against a corpus picks the nearest member.
  const result = noveltyDivergence(base, [far, near], DEFAULT_PROFILE);
  assert.equal(result.nearestIndex, 1);
  assert.equal(result.divergence, dNear);
});

test('an empty corpus yields null divergence', () => {
  const d = buildDescriptor(makeBundle({ runs: [runWithTape(80, 40)] }));
  const result = noveltyDivergence(d, [], DEFAULT_PROFILE);
  assert.equal(result.divergence, null);
  assert.equal(result.nearestIndex, -1);
});

test('a bundle with no completion still yields a well-formed descriptor (hasTrajectory 0)', () => {
  const bundle = makeBundle({
    runs: [{ archetype: 'firstTime', outcome: 'timeout', attempts: 25, ticksElapsed: 3600, tape: emptyTape('gdos-fixture') }],
  });
  const d = buildDescriptor(bundle);
  assert.equal(d.trajectoryShape[TRAJECTORY_BUCKETS + 2], 0); // hasTrajectory
});

test('trajectory shape distinguishes an early jump from a late jump on the same layout', () => {
  const def = makeLevel({ id: 'jump-timing' });
  const early = buildDescriptor(makeBundle({ def, runs: [runWithTape(100, 5)] }));
  const late = buildDescriptor(makeBundle({ def, runs: [runWithTape(100, 95)] }));
  assert.ok(descriptorDistance(early, late, DEFAULT_PROFILE) > 0);
});
