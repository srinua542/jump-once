import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NEUTRAL_INPUT, type GameState, type InputFrame } from '../../src/core/State';
import { createClock } from '../../src/core/Clock';
import { createRng } from '../../src/core/Rng';

test('NEUTRAL_INPUT represents no player intent on any axis', () => {
  assert.equal(NEUTRAL_INPUT.moveAxis, 0);
  assert.equal(NEUTRAL_INPUT.jumpPressed, false);
  assert.equal(NEUTRAL_INPUT.resetPressed, false);
});

test('NEUTRAL_INPUT is a valid InputFrame value', () => {
  const frame: InputFrame = NEUTRAL_INPUT;
  assert.ok(frame.moveAxis === -1 || frame.moveAxis === 0 || frame.moveAxis === 1);
});

test('GameState<TWorld> composes tick/clock/rng/input with an arbitrary world payload', () => {
  interface World {
    readonly score: number;
  }

  const state: GameState<World> = {
    tick: 0,
    clock: createClock(),
    rng: createRng(1),
    input: NEUTRAL_INPUT,
    world: { score: 0 },
  };

  assert.equal(state.tick, 0);
  assert.equal(state.world.score, 0);
  assert.deepEqual(state.input, NEUTRAL_INPUT);
});

test('GameState is decoupled from gameplay: an empty object world compiles and holds', () => {
  const state: GameState<Record<string, never>> = {
    tick: 5,
    clock: createClock(),
    rng: createRng(2),
    input: NEUTRAL_INPUT,
    world: {},
  };

  assert.equal(state.tick, 5);
  assert.deepEqual(state.world, {});
});
