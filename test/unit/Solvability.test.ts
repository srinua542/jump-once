/**
 * S4.2 — the exactly-one-jump solvability audit (REQ-141).
 *
 *  - known-SOLVABLE fixtures classify 'solvable', and every such verdict
 *    carries a witness tape that, replayed with no agent, actually completes
 *    the level (self-proving);
 *  - a level requiring TWO jumps is 'unsolvable' — the axiom is ground truth
 *    (the search never gets a second jump because the engine's lock never
 *    grants one), proving the audit rejects multi-jump levels by construction;
 *  - a walled-off goal with no path is 'unsolvable' (frontier exhausts);
 *  - determinism: same (def, options) ⇒ identical verdict twice;
 *  - the search fallback finds a goal the archetypes miss (fast path is an
 *    optimization, not the classifier).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildGridLevel } from '../helpers/GridLevel';
import { replayTape } from '../../src/eval/AgentHarness';
import {
  DEFAULT_SOLVABILITY_OPTIONS,
  auditSolvability,
  witnessCompletes,
} from '../../src/eval/local/Solvability';
import { searchReachability } from '../../src/eval/local/Search';

// A flat stroll — the fast path settles it with an archetype witness.
const CORRIDOR = buildGridLevel('s42-corridor', [
  '##############',
  '#S..........G#',
  '##############',
]);

// One spiked gap (cols 9–10): solvable with exactly the one jump. Same shape
// the S4.1 harness proves all five archetypes clear.
const ONE_GAP = buildGridLevel('s42-one-gap', [
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

// Two spiked gaps (cols 4–5 and 12–13) with a stand-on-it middle platform
// (cols 6–11): clearing both would need a second jump the axiom never grants
// → UNSOLVABLE. The one jump lands you on the middle, spent.
const TWO_GAPS = buildGridLevel('s42-two-gaps', [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#S................G#',
  '####..######..######',
  '####..######..######',
  '####xx######xx######',
  '####################',
]);

// The goal sits behind a full-height interior wall (col 5); the room is
// floored so the player can neither pass nor die → frontier exhausts →
// UNSOLVABLE.
const SEALED = buildGridLevel('s42-sealed', [
  '############',
  '#S...#....G#',
  '#....#.....#',
  '#....#.....#',
  '############',
]);

test('a flat corridor is solvable via the archetype fast path, with a self-proving witness', () => {
  const verdict = auditSolvability(CORRIDOR);
  assert.equal(verdict.classification, 'solvable');
  assert.equal(verdict.method, 'archetype');
  assert.ok(verdict.witness, 'a solvable verdict must carry a witness tape');
  assert.equal(witnessCompletes(CORRIDOR, verdict), true, 'the witness must actually complete the level');
});

test('a single spiked gap is solvable within the one jump', () => {
  const verdict = auditSolvability(ONE_GAP);
  assert.equal(verdict.classification, 'solvable');
  assert.equal(witnessCompletes(ONE_GAP, verdict), true);
  // Replaying the witness lands the player in the goal region.
  const final = replayTape(ONE_GAP, verdict.witness!.seed, verdict.witness!.frames);
  assert.equal(final.world.runState, 'completed');
});

test('a level that would require TWO jumps is unsolvable — the axiom is ground truth', () => {
  const verdict = auditSolvability(TWO_GAPS);
  assert.equal(verdict.classification, 'unsolvable', 'one jump cannot clear two gaps');
  assert.equal(verdict.method, 'search');
  assert.equal(verdict.witness, undefined);
});

test('a walled-off goal is unsolvable (the reachable frontier exhausts with no goal)', () => {
  const verdict = auditSolvability(SEALED);
  assert.equal(verdict.classification, 'unsolvable');
  assert.ok(verdict.nodesExplored > 0, 'the search must have actually explored');
});

test('determinism: the verdict (and any witness) is identical across two audits', () => {
  const a = auditSolvability(ONE_GAP);
  const b = auditSolvability(ONE_GAP);
  assert.deepEqual(a, b);
});

test('the bounded search alone (no archetypes) reaches the goal on the gap fixture', () => {
  const graph = searchReachability(ONE_GAP, DEFAULT_SOLVABILITY_OPTIONS.seed, {
    ...DEFAULT_SOLVABILITY_OPTIONS.search,
    stopAtGoal: true,
  });
  assert.ok(graph.goalIndex >= 0, 'search must find a goal leaf');
});

test('inconclusive is reported (never a false "unsolvable") when the node cap bites first', () => {
  // A cap of a handful of nodes cannot close even a trivial frontier.
  const verdict = auditSolvability(SEALED, {
    ...DEFAULT_SOLVABILITY_OPTIONS,
    search: { holdTicks: 8, maxNodes: 5, stopAtGoal: true },
  });
  assert.equal(verdict.classification, 'inconclusive');
});
