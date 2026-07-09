/**
 * S4.5 — optimization windows, five-tier routing, and the delta metric
 * (REQ-101, REQ-102).
 *
 *  - five tiers are computed (Discovery ≥ Good ≥ Fast ≥ Expert ≥ World
 *    Record) and anchored to the archetype spread;
 *  - a level with a real jump has a positive Discovery−WR delta and is NOT
 *    rejected;
 *  - a trivial flat level (every archetype clears it identically) has ~zero
 *    delta and IS rejected (REQ-102: no optimization window);
 *  - the authored par-time cross-check flags an impossible optimal par (one
 *    faster than the sim's own World Record);
 *  - determinism: identical verdict across two runs.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildGridLevel } from '../helpers/GridLevel';
import { computeOptimizationWindow } from '../../src/eval/local/Optimization';

// Goal sits mid-field, far from any wall: every archetype walks straight to
// it in the same time → zero optimization window.
const FLAT = buildGridLevel('s45-flat', [
  '######################',
  '#S...G...............#',
  '######################',
]);

// A spiked gap demands the one jump; the naive First-Timer hesitates before
// it while the Expert-Speedrunner commits instantly → a real spread.
const GAP = buildGridLevel('s45-gap', [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#S................G#',
  '#########..#########',
  '#########..#########',
  '#########xx#########',
  '####################',
]);

// Same gap, but the designer claims an optimal par of 0.1 s — faster than any
// route the sim can actually run.
const IMPOSSIBLE_PAR = buildGridLevel(
  's45-impossible-par',
  [
    '####################',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#S................G#',
    '#########..#########',
    '#########..#########',
    '#########xx#########',
    '####################',
  ],
  [5, 0.1],
);

test('five tiers are computed and ordered Discovery ≥ Good ≥ Fast ≥ Expert ≥ World Record', () => {
  const v = computeOptimizationWindow(GAP);
  assert.equal(v.applicable, true);
  const t = v.tiers!;
  assert.ok(t.discovery >= t.good && t.good >= t.fast && t.fast >= t.expert && t.expert >= t.worldRecord,
    `tiers not monotonic: ${JSON.stringify(t)}`);
  assert.equal(v.deltaSeconds, t.discovery - t.worldRecord);
});

test('a level with a real jump has a positive delta and is not rejected', () => {
  const v = computeOptimizationWindow(GAP);
  assert.ok(v.deltaSeconds! > 0, 'the first-timer should be slower than the expert');
  assert.equal(v.rejected, false);
});

test('a trivial flat level has ~zero delta and is rejected (REQ-102)', () => {
  const v = computeOptimizationWindow(FLAT);
  assert.equal(v.applicable, true);
  assert.equal(v.deltaSeconds, 0);
  assert.equal(v.rejected, true, 'no optimization window → reject');
});

test('the par-time cross-check flags an optimal par faster than the sim World Record', () => {
  const ok = computeOptimizationWindow(GAP);
  assert.equal(ok.parPlausible, true, 'a 10 s optimal par is achievable');

  const bad = computeOptimizationWindow(IMPOSSIBLE_PAR);
  assert.equal(bad.parPlausible, false, 'a 0.1 s optimal par is impossible');
});

test('determinism: the verdict is identical across two computations', () => {
  const a = computeOptimizationWindow(GAP);
  const b = computeOptimizationWindow(GAP);
  assert.deepEqual(a, b);
});
