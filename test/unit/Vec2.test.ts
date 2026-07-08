import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ZERO,
  add,
  addScaled,
  clone,
  dot,
  equals,
  length,
  lengthSq,
  normalize,
  scale,
  sub,
  vec2,
} from '../../src/core/Vec2';

test('vec2() constructs a record with the given components', () => {
  const v = vec2(3, 4);
  assert.equal(v.x, 3);
  assert.equal(v.y, 4);
});

test('add() sums components and does not mutate operands', () => {
  const a = vec2(1, 2);
  const b = vec2(3, 4);
  const result = add(a, b);

  assert.deepEqual(result, { x: 4, y: 6 });
  assert.deepEqual(a, { x: 1, y: 2 });
  assert.deepEqual(b, { x: 3, y: 4 });
});

test('sub() subtracts components and does not mutate operands', () => {
  const a = vec2(5, 7);
  const b = vec2(2, 3);
  const result = sub(a, b);

  assert.deepEqual(result, { x: 3, y: 4 });
  assert.deepEqual(a, { x: 5, y: 7 });
  assert.deepEqual(b, { x: 2, y: 3 });
});

test('scale() multiplies both components and does not mutate the operand', () => {
  const a = vec2(2, -3);
  const result = scale(a, 5);

  assert.deepEqual(result, { x: 10, y: -15 });
  assert.deepEqual(a, { x: 2, y: -3 });
});

test('addScaled() computes a + b * s without mutating operands', () => {
  const a = vec2(1, 1);
  const b = vec2(2, 4);
  const result = addScaled(a, b, 0.5);

  assert.deepEqual(result, { x: 2, y: 3 });
  assert.deepEqual(a, { x: 1, y: 1 });
  assert.deepEqual(b, { x: 2, y: 4 });
});

test('dot() computes the scalar dot product', () => {
  assert.equal(dot(vec2(1, 2), vec2(3, 4)), 11);
  assert.equal(dot(vec2(1, 0), vec2(0, 1)), 0, 'orthogonal vectors dot to zero');
});

test('lengthSq() and length() are consistent for a 3-4-5 triangle', () => {
  const v = vec2(3, 4);
  assert.equal(lengthSq(v), 25);
  assert.equal(length(v), 5);
});

test('normalize() produces a unit vector preserving direction', () => {
  const v = vec2(3, 4);
  const n = normalize(v);

  assert.ok(Math.abs(length(n) - 1) < 1e-9);
  assert.ok(Math.abs(n.x - 0.6) < 1e-9);
  assert.ok(Math.abs(n.y - 0.8) < 1e-9);
});

test('normalize() of the zero vector returns ZERO rather than NaN', () => {
  const result = normalize(ZERO);
  assert.deepEqual(result, { x: 0, y: 0 });
  assert.ok(Number.isFinite(result.x) && Number.isFinite(result.y));
});

test('equals() compares components structurally', () => {
  assert.ok(equals(vec2(1, 2), vec2(1, 2)));
  assert.ok(!equals(vec2(1, 2), vec2(1, 3)));
});

test('clone() produces an equal but distinct record', () => {
  const a = vec2(1, 2);
  const b = clone(a);

  assert.deepEqual(b, a);
  assert.notEqual(b, a, 'clone must be a new object, not the same reference');
});

test('ZERO is the additive identity', () => {
  const v = vec2(7, -2);
  assert.deepEqual(add(v, ZERO), v);
});
