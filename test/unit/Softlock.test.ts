/**
 * S4.3 — softlock (dead-zone) detection (REQ-141).
 *
 *  - the "oubliette": a level with a deep walled pit (solid floor, no hazard,
 *    walls taller than the one jump can clear) is flagged hasSoftlock, with a
 *    witness tape that drives the player INTO the trap and a trapped-region
 *    position inside the pit;
 *  - a flat corridor (goal always walkable, nothing to fall into) is clean —
 *    every reachable state can reach the goal, so no trapped state exists;
 *  - a truncated search yields exhaustive=false so a "clean" verdict is never
 *    claimed on incomplete evidence;
 *  - determinism: identical verdict across two runs.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildGridLevel } from '../helpers/GridLevel';
import { replayTape } from '../../src/eval/AgentHarness';
import {
  DEFAULT_SOFTLOCK_OPTIONS,
  detectSoftlock,
} from '../../src/eval/local/Softlock';

// The goal (col 1) is reachable by walking LEFT from spawn (col 4) on flat
// floor — no jump needed, so the level is solvable. To the RIGHT lies a
// 1-wide hole (col 8) into a 4-deep chamber with a solid bottom (no fall-out
// death) and flush walls (cols 7 & 9): the one jump clears ~2.7 tiles, far
// short of the 4-tile climb out. Walk right and fall in and you are trapped
// forever. The detector must flag that dead zone even though the goal is
// reachable elsewhere.
const OUBLIETTE = buildGridLevel('s43-oubliette', [
  '############',
  '#G..S......#',
  '########.###',
  '########.###',
  '########.###',
  '########.###',
  '############',
]);

// Flat, floored, walled — nothing to fall into, nothing to die on, goal
// always to the right. No reachable state is trapped.
const CORRIDOR = buildGridLevel('s43-corridor', [
  '##############',
  '#S..........G#',
  '##############',
]);

test('the oubliette is flagged: a reachable trapped region with a witness that falls in', () => {
  const verdict = detectSoftlock(OUBLIETTE);
  assert.equal(verdict.exhaustive, true, 'the search must close the frontier for a sound verdict');
  assert.equal(verdict.hasSoftlock, true);
  assert.ok(verdict.trappedCount > 0);
  assert.ok(verdict.witness, 'a softlock must carry a witness tape into the trap');

  // Every trapped state lives in the chamber column (col 8) — the only trap.
  for (const region of verdict.trappedRegions) {
    assert.ok(region.x > 7.5 && region.x < 9, `trapped x ${region.x} should be in the chamber column`);
  }
  // The bottom of the dead zone is deep in the pit, below the top floor.
  assert.ok(verdict.deepestTrapped, 'a softlock must report its deepest trapped state');
  assert.ok(verdict.deepestTrapped!.y > 3, `deepest trapped y ${verdict.deepestTrapped!.y} should be down in the pit`);

  // Replaying the witness leaves the player alive, fallen into the chamber — stuck.
  const final = replayTape(OUBLIETTE, verdict.witness!.seed, verdict.witness!.frames);
  assert.equal(final.world.runState, 'playing', 'the witness ends mid-life, trapped');
  assert.ok(final.world.playerPosition.x > 7.5, 'the witness drives the player into the chamber column');
});

test('a flat corridor is clean: exhaustive search, no trapped state', () => {
  const verdict = detectSoftlock(CORRIDOR);
  assert.equal(verdict.exhaustive, true);
  assert.equal(verdict.hasSoftlock, false);
  assert.equal(verdict.trappedCount, 0);
  assert.equal(verdict.witness, undefined);
});

test('a truncated search never claims "clean": exhaustive=false when the node cap bites', () => {
  const verdict = detectSoftlock(OUBLIETTE, {
    ...DEFAULT_SOFTLOCK_OPTIONS,
    search: { holdTicks: 8, maxNodes: 40, stopAtGoal: false },
  });
  assert.equal(verdict.exhaustive, false);
});

test('determinism: the verdict is identical across two audits', () => {
  const a = detectSoftlock(OUBLIETTE);
  const b = detectSoftlock(OUBLIETTE);
  assert.equal(a.hasSoftlock, b.hasSoftlock);
  assert.equal(a.trappedCount, b.trappedCount);
  assert.deepEqual(a.witness, b.witness);
});
