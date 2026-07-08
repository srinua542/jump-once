import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createRng, nextFloat, nextInt } from '../../src/core/Rng';

test('createRng() forces the seed to a uint32', () => {
  const state = createRng(-1);
  assert.equal(state.seed, -1 >>> 0);
});

test('nextFloat() returns a value in [0, 1)', () => {
  let state = createRng(42);
  for (let i = 0; i < 100; i++) {
    const draw = nextFloat(state);
    assert.ok(draw.value >= 0 && draw.value < 1);
    state = draw.next;
  }
});

test('nextFloat() does not mutate the input state', () => {
  const state = createRng(7);
  const before = { ...state };
  nextFloat(state);
  assert.deepEqual(state, before);
});

test('same seed produces the same sequence across independent generators', () => {
  let a = createRng(12345);
  let b = createRng(12345);

  const sequenceA: number[] = [];
  const sequenceB: number[] = [];
  for (let i = 0; i < 20; i++) {
    const drawA = nextFloat(a);
    const drawB = nextFloat(b);
    sequenceA.push(drawA.value);
    sequenceB.push(drawB.value);
    a = drawA.next;
    b = drawB.next;
  }

  assert.deepEqual(sequenceA, sequenceB);
});

test('different seeds produce different sequences', () => {
  let a = createRng(1);
  let b = createRng(2);

  const drawA = nextFloat(a);
  const drawB = nextFloat(b);

  assert.notEqual(drawA.value, drawB.value);
});

test('there is no hidden global generator state: two draws from the same fixed seed never see prior calls', () => {
  const first = nextFloat(createRng(999));
  const second = nextFloat(createRng(999));
  assert.equal(first.value, second.value);
});

test('nextInt() draws an integer within [minInclusive, maxExclusive)', () => {
  let state = createRng(5);
  for (let i = 0; i < 200; i++) {
    const draw = nextInt(state, 3, 8);
    assert.ok(Number.isInteger(draw.value));
    assert.ok(draw.value >= 3 && draw.value < 8);
    state = draw.next;
  }
});

test('nextInt() with maxExclusive <= minInclusive returns minInclusive without advancing state', () => {
  const state = createRng(5);
  const draw = nextInt(state, 10, 10);

  assert.equal(draw.value, 10);
  assert.deepEqual(draw.next, state);
});

test('nextInt() is a deterministic function of its input state and range', () => {
  const state = createRng(2024);
  const first = nextInt(state, 0, 100);
  const second = nextInt(state, 0, 100);

  assert.deepEqual(first, second);
});
