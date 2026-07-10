/**
 * S7.2 — the REQ-012 jump-relevance audit (dm-0041/dm-0056): a level
 * completable WITHOUT the jump is a kill (jump-irrelevant, witness-proven);
 * a level whose no-jump frontier exhausts is a pass (jump-necessary); a
 * budget-capped search is honestly inconclusive. Zero Search.ts changes —
 * the S4.4 forbidden hook taints any state whose jump lock left 'available'.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_JUMP_RELEVANCE_OPTIONS,
  auditJumpRelevance,
  witnessCompletesWithoutJump,
} from '../../src/eval/local/Counterfactual';
import { auditSolvability } from '../../src/eval/local/Solvability';
import { buildGridLevel } from '../helpers/GridLevel';

// Flat corridor: walkable to the goal — the jump is pure decoration.
const WALKABLE = buildGridLevel('s72-walkable', [
  '##############',
  '#S..........G#',
  '##############',
]);

// One spiked gap: the S4.2-proven one-jump shape — without the jump, every
// route ends on the spikes or stalls on the left floor.
const NEEDS_JUMP = buildGridLevel('s72-needs-jump', [
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

// Sealed wall: unreachable with or without the jump (orthogonality doc-case).
const SEALED = buildGridLevel('s72-sealed', [
  '############',
  '#S...#....G#',
  '#....#.....#',
  '#....#.....#',
  '############',
]);

test('a walkable level is jump-irrelevant — the REQ-012 kill the tape proxy cannot see', () => {
  const verdict = auditJumpRelevance(WALKABLE);
  assert.equal(verdict.classification, 'jump-irrelevant');
  assert.ok(verdict.witness, 'a jump-irrelevant verdict must carry its no-jump witness');
  assert.ok(verdict.nodesExplored > 0);
  // The kill proxy alone would PASS this level: it is solvable, and an agent
  // could complete it without pressing jump. The counterfactual audit is what
  // catches it.
  assert.equal(auditSolvability(WALKABLE).classification, 'solvable');
});

test('the no-jump witness is self-proving: it completes with the lock still available', () => {
  const verdict = auditJumpRelevance(WALKABLE);
  assert.ok(witnessCompletesWithoutJump(WALKABLE, verdict));
});

test('a level whose gap demands THE jump is jump-necessary (frontier exhausted)', () => {
  const verdict = auditJumpRelevance(NEEDS_JUMP);
  assert.equal(verdict.classification, 'jump-necessary');
  assert.equal(verdict.witness, undefined);
  // REQ-012 composition: solvable AND jump-necessary = the pass.
  assert.equal(auditSolvability(NEEDS_JUMP).classification, 'solvable');
});

test('a starved node budget is honestly inconclusive, never a silent verdict', () => {
  const verdict = auditJumpRelevance(NEEDS_JUMP, {
    ...DEFAULT_JUMP_RELEVANCE_OPTIONS,
    search: { ...DEFAULT_JUMP_RELEVANCE_OPTIONS.search, maxNodes: 2 },
  });
  assert.equal(verdict.classification, 'inconclusive');
  assert.equal(verdict.witness, undefined);
});

test('orthogonality: an unsolvable level reports jump-necessary vacuously — consumers must compose with solvability', () => {
  const verdict = auditJumpRelevance(SEALED);
  assert.equal(verdict.classification, 'jump-necessary');
  assert.equal(auditSolvability(SEALED).classification, 'unsolvable');
});

test('witnessCompletesWithoutJump is false without a witness and false for a jump-using tape', () => {
  const necessary = auditJumpRelevance(NEEDS_JUMP);
  assert.equal(witnessCompletesWithoutJump(NEEDS_JUMP, necessary), false);
  // A genuine (jump-using) solvability witness fails the no-jump proof.
  const solvable = auditSolvability(NEEDS_JUMP);
  assert.ok(solvable.witness);
  assert.equal(
    witnessCompletesWithoutJump(NEEDS_JUMP, { classification: 'jump-irrelevant', witness: solvable.witness, nodesExplored: 0 }),
    false,
  );
});

test('the audit is deterministic: two runs, identical verdicts', () => {
  assert.deepEqual(auditJumpRelevance(WALKABLE), auditJumpRelevance(WALKABLE));
  assert.deepEqual(auditJumpRelevance(NEEDS_JUMP), auditJumpRelevance(NEEDS_JUMP));
});
