import assert from 'node:assert/strict';
import { test } from 'node:test';

import { StateManager, deepFreeze } from '../../src/core/StateManager';
import { createClock } from '../../src/core/Clock';
import { createRng } from '../../src/core/Rng';
import { NEUTRAL_INPUT, type GameState } from '../../src/core/State';

interface TestWorld {
  readonly counter: number;
}

function makeState(tick: number, counter: number): GameState<TestWorld> {
  return {
    tick,
    clock: createClock(),
    rng: createRng(1),
    input: NEUTRAL_INPUT,
    world: { counter },
  };
}

test('getState() returns the snapshot passed to the constructor', () => {
  const initial = makeState(0, 0);
  const manager = new StateManager(initial);

  assert.equal(manager.getState(), initial);
});

test('getPreviousState() equals the initial snapshot before any commit', () => {
  const initial = makeState(0, 0);
  const manager = new StateManager(initial);

  assert.equal(manager.getPreviousState(), initial);
  assert.equal(manager.getPreviousState(), manager.getState());
});

test('commit() swaps in the new snapshot as current and retains the old one as previous', () => {
  const initial = makeState(0, 0);
  const manager = new StateManager(initial);
  const next = makeState(1, 1);

  manager.commit(next);

  assert.equal(manager.getState(), next);
  assert.equal(manager.getPreviousState(), initial);
});

test('commit() is the only mutation point: sequential commits shift previous forward each time', () => {
  const manager = new StateManager(makeState(0, 0));
  const s1 = makeState(1, 1);
  const s2 = makeState(2, 2);

  manager.commit(s1);
  manager.commit(s2);

  assert.equal(manager.getState(), s2);
  assert.equal(manager.getPreviousState(), s1, 'previous must be the immediately prior current, not the original initial state');
});

test('commit() is idempotent: committing the same object twice only shifts previous, no accumulation', () => {
  const initial = makeState(0, 0);
  const manager = new StateManager(initial);
  const next = makeState(1, 1);

  manager.commit(next);
  manager.commit(next);

  assert.equal(manager.getState(), next);
  assert.equal(manager.getPreviousState(), next, 'committing the identical snapshot again just shifts previous to itself');
});

test('commit() returns the committed snapshot', () => {
  const manager = new StateManager(makeState(0, 0));
  const next = makeState(1, 1);

  const returned = manager.commit(next);

  assert.equal(returned, next);
});

test('freezeOnCommit defaults to false: committed snapshots are not frozen', () => {
  const manager = new StateManager(makeState(0, 0));
  const next = makeState(1, 1);
  manager.commit(next);

  assert.ok(!Object.isFrozen(manager.getState()));
});

test('freezeOnCommit:true deep-freezes committed snapshots so in-place mutation throws in strict mode', () => {
  const manager = new StateManager(makeState(0, 0), { freezeOnCommit: true });
  const next = makeState(1, 1);
  manager.commit(next);

  const frozen = manager.getState();
  assert.ok(Object.isFrozen(frozen));
  assert.ok(Object.isFrozen(frozen.world));
  assert.throws(() => {
    (frozen as { tick: number }).tick = 999;
  }, TypeError);
});

test('freezeOnCommit:true also freezes the initial seed snapshot', () => {
  const initial = makeState(0, 0);
  const manager = new StateManager(initial, { freezeOnCommit: true });

  assert.ok(Object.isFrozen(manager.getState()));
  assert.ok(Object.isFrozen(manager.getPreviousState()));
});

test('deepFreeze() freezes nested objects recursively', () => {
  const value = { a: { b: { c: 1 } } };
  deepFreeze(value);

  assert.ok(Object.isFrozen(value));
  assert.ok(Object.isFrozen(value.a));
  assert.ok(Object.isFrozen(value.a.b));
});

test('deepFreeze() is a no-op on primitives and null', () => {
  assert.equal(deepFreeze(5), 5);
  assert.equal(deepFreeze('x'), 'x');
  assert.equal(deepFreeze(null), null);
});
