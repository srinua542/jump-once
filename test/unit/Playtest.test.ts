/**
 * S8.1 — the live-playtest driver (REQ-130 P8 share): an interactive wrapper
 * over the already-proven Engine/StateManager using the SAME CANONICAL_PIPELINE
 * and per-tick drive contract AgentHarness.runAgent/replayTape already use.
 * The determinism proof: feeding the same frames interactively produces the
 * identical final state replayTape produces from those frames headlessly.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { InputFrame } from '../../src/core/State';
import { replayTape } from '../../src/eval/AgentHarness';
import { buildGridLevel } from '../helpers/GridLevel';
import { startPlaytest } from '../../tools/level_editor/Playtest';

const LEVEL = buildGridLevel('playtest-runway', ['S....G', '######']);
const SEED = 42;

function neutral(): InputFrame {
  return { moveAxis: 0, jumpPressed: false, resetPressed: false };
}

function right(): InputFrame {
  return { moveAxis: 1, jumpPressed: false, resetPressed: false };
}

test('feedInput advances the tick by exactly 1 per call', () => {
  const session = startPlaytest(LEVEL, SEED);
  assert.equal(session.currentState().tick, 0);
  session.feedInput(neutral());
  assert.equal(session.currentState().tick, 1);
  session.feedInput(neutral());
  assert.equal(session.currentState().tick, 2);
});

test('interactive feedInput reproduces the identical final state as a headless replayTape of the same frames', () => {
  const frames: InputFrame[] = [right(), right(), right(), neutral(), right(), right()];
  const session = startPlaytest(LEVEL, SEED);
  let last = session.currentState();
  for (const frame of frames) last = session.feedInput(frame);

  const replayed = replayTape(LEVEL, SEED, frames);
  assert.deepEqual(last, replayed);
});

test('stepFrame advances exactly one tick with neutral input, independent of any previously fed input', () => {
  const session = startPlaytest(LEVEL, SEED);
  session.feedInput(right());
  const beforeStep = session.currentState();
  const after = session.stepFrame();
  assert.equal(after.tick, beforeStep.tick + 1);
  assert.equal(after.input.moveAxis, 0);
});

test('reload re-instantiates the level from scratch, discarding runtime progress', () => {
  const session = startPlaytest(LEVEL, SEED);
  session.feedInput(right());
  session.feedInput(right());
  assert.ok(session.currentState().tick > 0);

  const reloaded = session.reload();
  assert.equal(reloaded.tick, 0);
  assert.equal(reloaded.world.attemptCount, 0);
  assert.deepEqual(reloaded.world.playerPosition, LEVEL.constraints.spawn);
});

test('committed snapshots are frozen (immutability held, matching AgentHarness assembly)', () => {
  const session = startPlaytest(LEVEL, SEED);
  const state = session.feedInput(neutral());
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.world));
});

test('commit is the only mutation point: an explicit patch becomes the new authoritative state', () => {
  const session = startPlaytest(LEVEL, SEED);
  const current = session.currentState();
  const patched = session.commit({ ...current, world: { ...current.world, playerVelocity: { x: 7, y: 0 } } });
  assert.deepEqual(session.currentState(), patched);
  assert.deepEqual(session.currentState().world.playerVelocity, { x: 7, y: 0 });
});
