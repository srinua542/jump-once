/**
 * S3.3 — player controller: instant horizontal accel/decel (REQ-150),
 * the simulation's sole input consumer (dm-0019).
 *
 *  - moveAxis maps to vx = axis × TUNING.runSpeed, SET not ramped:
 *    engage, release (instant stop), reverse (instant flip);
 *  - vertical velocity and everything else untouched;
 *  - purity on frozen state;
 *  - composed pipeline [control, physics]: walks to the wall, pins flush,
 *    bit-identical replay under an input tape.
 *
 * Expectations computed from TUNING, never literals.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createClock, FIXED_STEP_SECONDS } from '../../src/core/Clock';
import { createRng } from '../../src/core/Rng';
import { deepFreeze } from '../../src/core/StateManager';
import { NEUTRAL_INPUT, type InputFrame } from '../../src/core/State';
import { vec2 } from '../../src/core/Vec2';
import { TUNING } from '../../src/components/Tuning';
import { LEVEL_SCHEMA_VERSION, type LevelDefinition } from '../../src/components/Level';
import { instantiateWorld, type JumpOnceState } from '../../src/entities/World';
import { playerControlSystem } from '../../src/systems/PlayerControl';
import { playerPhysicsSystem } from '../../src/systems/PlayerPhysics';

const HALF = TUNING.playerHalfExtents;

function makeRoomDef(): LevelDefinition {
  const width = 12;
  const height = 8;
  const tiles: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const isBorder = row === 0 || row === height - 1 || col === 0 || col === width - 1;
      tiles.push(isBorder ? 1 : 0);
    }
  }
  return {
    schemaVersion: LEVEL_SCHEMA_VERSION,
    levelId: 'unit-control-room',
    title: 'PlayerControl unit room',
    gdos: {
      targetKgNode: 'kg:test/control-room',
      difficultyVectors: { executionPrecision: 0, readingComplexity: 0, timingStrictness: 0, routeAmbiguity: 0 },
      emotionalBudgetCurve: [
        { at: 0, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
        { at: 1, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
      ],
      creatorMomentFrame: { tickWindow: [0, 1], description: 'n/a (unit fixture)' },
    },
    tilemap: { width, height, tileSize: 1, tiles },
    entities: [],
    triggers: [],
    constraints: {
      spawn: vec2(6, 6),
      goal: { position: vec2(10.5, 1.5), halfExtents: vec2(0.5, 0.5) },
      parTimeTiersSeconds: [10, 5],
    },
  };
}

function makeState(input: InputFrame): JumpOnceState {
  return {
    tick: 0,
    clock: createClock(),
    rng: createRng(1),
    input,
    world: instantiateWorld(makeRoomDef()),
  };
}

function withAxis(axis: -1 | 0 | 1): InputFrame {
  return { moveAxis: axis, jumpPressed: false, resetPressed: false };
}

test('moveAxis maps instantly to vx = axis × TUNING.runSpeed', () => {
  assert.equal(playerControlSystem.step(makeState(withAxis(1))).world.playerVelocity.x, TUNING.runSpeed);
  assert.equal(playerControlSystem.step(makeState(withAxis(-1))).world.playerVelocity.x, -TUNING.runSpeed);
  assert.equal(playerControlSystem.step(makeState(withAxis(0))).world.playerVelocity.x, 0);
});

test('instant decel and instant reversal: no ramp across consecutive frames', () => {
  const running = playerControlSystem.step(makeState(withAxis(1)));
  const reversed = playerControlSystem.step({ ...running, input: withAxis(-1) });
  assert.equal(reversed.world.playerVelocity.x, -TUNING.runSpeed, 'full reversal in one frame');
  const stopped = playerControlSystem.step({ ...reversed, input: withAxis(0) });
  assert.equal(stopped.world.playerVelocity.x, 0, 'full stop in one frame');
});

test('vertical velocity, position, and the rest of the state are untouched', () => {
  const state = makeState(withAxis(1));
  const falling: JumpOnceState = {
    ...state,
    world: { ...state.world, playerVelocity: vec2(0, 12) },
  };
  const next = playerControlSystem.step(falling);
  assert.equal(next.world.playerVelocity.y, 12);
  assert.deepEqual(next.world.playerPosition, falling.world.playerPosition);
  assert.equal(next.world.level, falling.world.level);
  assert.equal(next.tick, falling.tick);
  assert.equal(next.rng, falling.rng);
});

test('purity: a deep-frozen state is not mutated; unchanged intent returns the same snapshot', () => {
  const state = deepFreeze(makeState(withAxis(0)));
  const before = JSON.stringify(state);
  const next = playerControlSystem.step(state);
  assert.equal(JSON.stringify(state), before);
  assert.equal(next, state, 'vx already matches intent — no-op step returns the input snapshot');
});

test('pipeline [control, physics]: walks right, pins flush at the wall face, replays bit-identically', () => {
  const runOnce = (): string[] => {
    let state = makeState(NEUTRAL_INPUT);
    const log: string[] = [];
    for (let i = 0; i < 180; i++) {
      state = { ...state, tick: state.tick + 1, input: withAxis(1) };
      state = playerControlSystem.step(state);
      state = playerPhysicsSystem.step(state);
      log.push(JSON.stringify({ p: state.world.playerPosition, v: state.world.playerVelocity, g: state.world.playerGrounded }));
    }
    const final = state.world;
    assert.equal(final.playerPosition.x, 11 - HALF.x, 'flush at the left face of border col 11');
    assert.equal(final.playerGrounded, true, 'walked along the floor');
    return log;
  };
  assert.deepEqual(runOnce(), runOnce());
});

test('walking speed is exactly data-driven: one step advances x by runSpeed × dt in the open', () => {
  let state = makeState(withAxis(1));
  const x0 = state.world.playerPosition.x;
  state = playerControlSystem.step(state);
  state = playerPhysicsSystem.step(state);
  assert.equal(state.world.playerPosition.x, x0 + TUNING.runSpeed * FIXED_STEP_SECONDS);
});
