/**
 * S9.3 — Camera: pure exponential smoothing toward a target world position.
 * Never in WorldState, never mutates its inputs, never snaps instantly.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCamera, updateCamera, DEFAULT_CAMERA_PROFILE, type CameraState } from '../../render/scene/Camera';

test('updateCamera moves partway toward the target, not instantly', () => {
  const camera = createCamera(0, 0);
  const next = updateCamera(camera, { x: 100, y: 0 });
  assert.ok(next.x > 0 && next.x < 100, `expected a partial step, got x=${next.x}`);
  assert.equal(next.x, DEFAULT_CAMERA_PROFILE.smoothing * 100);
});

test('repeated updates converge toward the target without ever overshooting', () => {
  let camera = createCamera(0, 0);
  const target = { x: 50, y: -30 };
  let prevDistance = Infinity;
  for (let i = 0; i < 200; i++) {
    camera = updateCamera(camera, target);
    const distance = Math.hypot(target.x - camera.x, target.y - camera.y);
    assert.ok(distance <= prevDistance, 'distance to target must be monotonically non-increasing');
    prevDistance = distance;
  }
  assert.ok(Math.abs(camera.x - target.x) < 0.01 && Math.abs(camera.y - target.y) < 0.01, 'expected convergence within 200 steps');
});

test('updateCamera never mutates its input CameraState', () => {
  const camera: CameraState = Object.freeze(createCamera(10, 10));
  const next = updateCamera(camera, { x: 20, y: 20 });
  assert.equal(camera.x, 10);
  assert.equal(camera.y, 10);
  assert.notEqual(next, camera);
});

test('a target equal to the current position is a true fixed point', () => {
  const camera = createCamera(5, 5);
  const next = updateCamera(camera, { x: 5, y: 5 });
  assert.deepEqual(next, camera);
});
