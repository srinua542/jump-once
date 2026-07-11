/**
 * S8.3 — runtime inspection controller (REQ-131 P8 share, part 2): pause,
 * frame-step, variable manipulation, instant reload — all over the S8.1
 * playtest session. The load-bearing test (dm-0070): setVariable commits a
 * new state through StateManager and never mutates the prior frozen snapshot.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { InputFrame } from '../../src/core/State';
import { buildGridLevel } from '../helpers/GridLevel';
import { startPlaytest } from '../../tools/level_editor/Playtest';
import { createInspector } from '../../tools/debug/Inspector';

const LEVEL = buildGridLevel('inspector-runway', ['S....G', '######']);
const SEED = 7;

function right(): InputFrame {
  return { moveAxis: 1, jumpPressed: false, resetPressed: false };
}

test('pause gates feedInput: a paused inspector does not advance the tick', () => {
  const inspector = createInspector(startPlaytest(LEVEL, SEED));
  inspector.feedInput(right());
  const afterOne = inspector.currentState();
  assert.equal(afterOne.tick, 1);

  inspector.pause();
  assert.equal(inspector.isPaused(), true);
  const whilePaused = inspector.feedInput(right());
  assert.equal(whilePaused.tick, 1, 'feedInput must be a no-op while paused');
  assert.deepEqual(whilePaused, afterOne);

  inspector.resume();
  const afterResume = inspector.feedInput(right());
  assert.equal(afterResume.tick, 2, 'feedInput advances again after resume');
});

test('stepFrame advances exactly one tick even while paused (the normal debugging motion)', () => {
  const inspector = createInspector(startPlaytest(LEVEL, SEED));
  inspector.pause();
  const before = inspector.currentState();
  const stepped = inspector.stepFrame();
  assert.equal(stepped.tick, before.tick + 1);
  assert.equal(stepped.input.moveAxis, 0, 'frame-step uses neutral input');
  assert.equal(inspector.isPaused(), true, 'stepping does not un-pause');
});

test('setVariable commits a new authoritative state via StateManager — never an in-place mutation (dm-0070)', () => {
  const inspector = createInspector(startPlaytest(LEVEL, SEED));
  const before = inspector.currentState();
  // The committed snapshots are frozen (freezeOnCommit) — an in-place edit would throw.
  assert.ok(Object.isFrozen(before.world));

  const after = inspector.setVariable({ playerVelocity: { x: 9, y: -3 } });
  assert.deepEqual(after.world.playerVelocity, { x: 9, y: -3 });

  // The prior snapshot is untouched: setVariable produced a NEW state, it did not mutate `before`.
  assert.notEqual(after, before);
  assert.deepEqual(before.world.playerVelocity, { x: 0, y: 0 });
  assert.deepEqual(inspector.currentState(), after);
});

test('setVariable preserves every unpatched world field', () => {
  const inspector = createInspector(startPlaytest(LEVEL, SEED));
  const before = inspector.currentState();
  const after = inspector.setVariable({ attemptCount: 5 });
  assert.equal(after.world.attemptCount, 5);
  assert.deepEqual(after.world.playerPosition, before.world.playerPosition);
  assert.equal(after.world.level, before.world.level, 'the frozen level reference is preserved, never copied');
  assert.equal(after.tick, before.tick, 'setVariable does not advance the tick');
});

test('reload discards runtime progress and variable edits alike', () => {
  const inspector = createInspector(startPlaytest(LEVEL, SEED));
  inspector.feedInput(right());
  inspector.setVariable({ attemptCount: 42 });
  assert.equal(inspector.currentState().world.attemptCount, 42);

  const reloaded = inspector.reload();
  assert.equal(reloaded.tick, 0);
  assert.equal(reloaded.world.attemptCount, 0);
  assert.deepEqual(reloaded.world.playerPosition, LEVEL.constraints.spawn);
});

test('a setVariable-patched state still drives the engine deterministically on the next step', () => {
  const a = createInspector(startPlaytest(LEVEL, SEED));
  const b = createInspector(startPlaytest(LEVEL, SEED));
  a.setVariable({ playerVelocity: { x: 4, y: 0 } });
  b.setVariable({ playerVelocity: { x: 4, y: 0 } });
  const stepA = a.stepFrame();
  const stepB = b.stepFrame();
  assert.deepEqual(stepA, stepB, 'identical patch + identical step ⇒ identical state');
});
