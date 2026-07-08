import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  FIXED_STEP_SECONDS,
  MAX_FRAME_SECONDS,
  advance,
  createClock,
  interpolationAlpha,
} from '../../src/core/Clock';

test('createClock() starts at zero accumulator and zero stepIndex', () => {
  const clock = createClock();
  assert.equal(clock.accumulator, 0);
  assert.equal(clock.stepIndex, 0);
});

test('advance() with a delta smaller than one fixed step banks it and reports zero steps', () => {
  const clock = createClock();
  const result = advance(clock, FIXED_STEP_SECONDS / 3);

  assert.equal(result.steps, 0);
  assert.ok(Math.abs(result.next.accumulator - FIXED_STEP_SECONDS / 3) < 1e-12);
  assert.equal(result.next.stepIndex, 0);
});

test('advance() with exactly one fixed step consumes the accumulator and reports one step', () => {
  const clock = createClock();
  const result = advance(clock, FIXED_STEP_SECONDS);

  assert.equal(result.steps, 1);
  assert.ok(Math.abs(result.next.accumulator) < 1e-12);
  assert.equal(result.next.stepIndex, 1);
});

test('advance() banks leftover time across multiple calls until a whole step accumulates', () => {
  let clock = createClock();

  const first = advance(clock, FIXED_STEP_SECONDS * 0.6);
  clock = first.next;
  assert.equal(first.steps, 0);

  const second = advance(clock, FIXED_STEP_SECONDS * 0.6);
  clock = second.next;

  assert.equal(second.steps, 1, 'two partial banks totalling 1.2 steps must fire exactly one step');
  assert.ok(Math.abs(clock.accumulator - FIXED_STEP_SECONDS * 0.2) < 1e-9);
});

test('advance() reports multiple whole steps for a large delta', () => {
  const clock = createClock();
  const result = advance(clock, FIXED_STEP_SECONDS * 4.5);

  assert.equal(result.steps, 4);
  assert.ok(Math.abs(result.next.accumulator - FIXED_STEP_SECONDS * 0.5) < 1e-9);
  assert.equal(result.next.stepIndex, 4);
});

test('advance() clamps a real delta above MAX_FRAME_SECONDS instead of banking catch-up steps', () => {
  const clock = createClock();
  const hugeDelta = MAX_FRAME_SECONDS + 10;
  const result = advance(clock, hugeDelta);

  const expectedSteps = Math.floor(MAX_FRAME_SECONDS / FIXED_STEP_SECONDS);
  assert.equal(result.steps, expectedSteps, 'excess time beyond MAX_FRAME_SECONDS must be dropped, not banked');
});

test('advance() clamps a negative delta to zero rather than draining the accumulator', () => {
  const clock = createClock();
  const result = advance(clock, -1);

  assert.equal(result.steps, 0);
  assert.equal(result.next.accumulator, 0);
});

test('stepIndex is monotonic and increases by exactly the number of steps reported', () => {
  let clock = createClock();
  const a = advance(clock, FIXED_STEP_SECONDS * 2);
  clock = a.next;
  const b = advance(clock, FIXED_STEP_SECONDS * 3);
  clock = b.next;

  assert.equal(a.next.stepIndex, 2);
  assert.equal(clock.stepIndex, 5);
});

test('advance() does not mutate the input clock state', () => {
  const clock = createClock();
  const before = { ...clock };
  advance(clock, FIXED_STEP_SECONDS * 2.5);
  assert.deepEqual(clock, before);
});

test('interpolationAlpha() reports fractional progress toward the next step in [0, 1)', () => {
  const clock = createClock();
  assert.equal(interpolationAlpha(clock), 0);

  const quarter = advance(clock, FIXED_STEP_SECONDS * 0.25).next;
  assert.ok(Math.abs(interpolationAlpha(quarter) - 0.25) < 1e-9);

  const wholeStepConsumed = advance(clock, FIXED_STEP_SECONDS).next;
  assert.ok(Math.abs(interpolationAlpha(wholeStepConsumed)) < 1e-12, 'alpha resets after a whole step is consumed');
});
