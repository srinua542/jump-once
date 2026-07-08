import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Engine } from '../../src/core/Engine';
import { createClock, FIXED_STEP_SECONDS } from '../../src/core/Clock';
import { createRng } from '../../src/core/Rng';
import { NEUTRAL_INPUT, type GameState } from '../../src/core/State';
import { StateManager } from '../../src/core/StateManager';
import type { System } from '../../src/systems/System';

interface TestWorld {
  readonly counter: number;
}

function createInitialState(): GameState<TestWorld> {
  return {
    tick: 0,
    clock: createClock(),
    rng: createRng(1),
    input: NEUTRAL_INPUT,
    world: { counter: 0 },
  };
}

const incrementSystem: System<TestWorld> = {
  id: 'increment',
  step: (state) => ({ ...state, world: { counter: state.world.counter + 1 } }),
};

test('tick() runs zero steps when delta is below one fixed step', () => {
  const manager = new StateManager(createInitialState());
  const engine = new Engine({ systems: [incrementSystem], stateManager: manager });

  const result = engine.tick(FIXED_STEP_SECONDS / 2);

  assert.equal(result.tick, 0);
  assert.equal(result.world.counter, 0);
});

test('tick() persists the banked accumulator across zero-step calls', () => {
  const manager = new StateManager(createInitialState());
  const engine = new Engine({ systems: [incrementSystem], stateManager: manager });

  engine.tick(FIXED_STEP_SECONDS * 0.6);
  const result = engine.tick(FIXED_STEP_SECONDS * 0.6);

  assert.equal(result.tick, 1, 'two partial banks totalling >1 step must fire exactly one step');
  assert.equal(result.world.counter, 1);
});

test('tick() runs exactly one whole step per FIXED_STEP_SECONDS of delta', () => {
  const manager = new StateManager(createInitialState());
  const engine = new Engine({ systems: [incrementSystem], stateManager: manager });

  const result = engine.tick(FIXED_STEP_SECONDS * 3);

  assert.equal(result.tick, 3);
  assert.equal(result.world.counter, 3);
});

test('tick advances by exactly 1 per step, never skipping or double-counting', () => {
  const manager = new StateManager(createInitialState());
  const engine = new Engine({ systems: [], stateManager: manager });

  const first = engine.tick(FIXED_STEP_SECONDS * 5);
  const second = engine.tick(FIXED_STEP_SECONDS * 2);

  assert.equal(first.tick, 5);
  assert.equal(second.tick, 7);
});

test('systems run in registration order as a pure pipeline', () => {
  const order: string[] = [];
  const a: System<TestWorld> = {
    id: 'a',
    step: (state) => {
      order.push('a');
      return { ...state, world: { counter: state.world.counter + 1 } };
    },
  };
  const b: System<TestWorld> = {
    id: 'b',
    step: (state) => {
      order.push('b');
      return { ...state, world: { counter: state.world.counter * 2 } };
    },
  };
  const manager = new StateManager(createInitialState());
  const engine = new Engine({ systems: [a, b], stateManager: manager });

  const result = engine.tick(FIXED_STEP_SECONDS);

  assert.deepEqual(order, ['a', 'b']);
  assert.equal(result.world.counter, 2, '(0 + 1) * 2 proves ordering a then b');
});

test('each fixed step is committed through StateManager, updating previous/current', () => {
  const initial = createInitialState();
  const manager = new StateManager(initial);
  const engine = new Engine({ systems: [incrementSystem], stateManager: manager });

  engine.tick(FIXED_STEP_SECONDS * 2);

  assert.equal(manager.getState().world.counter, 2);
  assert.equal(manager.getPreviousState().world.counter, 1, 'previous should be the second-to-last committed step, not the initial state');
});

test('does not mutate the previous snapshot in place', () => {
  const initial = createInitialState();
  const manager = new StateManager(initial);
  const engine = new Engine({ systems: [incrementSystem], stateManager: manager });

  engine.tick(FIXED_STEP_SECONDS);

  assert.equal(initial.world.counter, 0, 'the original initial snapshot must remain untouched');
  assert.equal(initial.tick, 0);
});

test('interpolationAlpha reflects fractional progress toward the next step', () => {
  const manager = new StateManager(createInitialState());
  const engine = new Engine({ systems: [incrementSystem], stateManager: manager });

  assert.equal(engine.interpolationAlpha, 0);

  engine.tick(FIXED_STEP_SECONDS * 0.25);

  assert.ok(Math.abs(engine.interpolationAlpha - 0.25) < 1e-9);
});

test('generic engine has no gameplay assumptions: works over an empty system pipeline', () => {
  const manager = new StateManager(createInitialState());
  const engine = new Engine<TestWorld>({ systems: [], stateManager: manager });

  const result = engine.tick(FIXED_STEP_SECONDS);

  assert.equal(result.tick, 1);
  assert.equal(result.world.counter, 0);
});
