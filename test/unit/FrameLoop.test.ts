/**
 * S11.2 — FrameLoop: the FrameScheduler seam + pure frame-delta derivation
 * (REQ-170/171 release; dm-0121/dm-0124 rAF conformance). Proves the loop
 * feeds an HONEST, UNCLAMPED raw delta — Clock.advance (src/core/Clock.ts)
 * owns MAX_FRAME_SECONDS bounding, never duplicated here.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createFakeFrameScheduler, deriveFrameDelta, startFrameLoop } from '../../render/shell/FrameLoop';

test('deriveFrameDelta: the first frame (no prior timestamp) yields zero delta', () => {
  const delta = deriveFrameDelta(null, 1000);
  assert.equal(delta.realDeltaSeconds, 0);
  assert.equal(delta.timestampMs, 1000);
});

test('deriveFrameDelta: subsequent frames yield (current - previous) / 1000 seconds', () => {
  const delta = deriveFrameDelta(1000, 1016.67);
  assert.ok(Math.abs(delta.realDeltaSeconds - 0.01667) < 1e-6);
});

test('deriveFrameDelta never clamps — a large gap (tab-backgrounded stall) passes through raw (dm-0124)', () => {
  const delta = deriveFrameDelta(0, 5000);
  assert.equal(delta.realDeltaSeconds, 5, 'a 5-second stall must reach the caller as 5, unclamped — Clock.advance owns MAX_FRAME_SECONDS, not this module');
});

test('startFrameLoop calls onFrame once per scheduler step, with the correct derived delta', () => {
  const { scheduler, step } = createFakeFrameScheduler();
  const deltas: number[] = [];
  startFrameLoop(scheduler, (realDeltaSeconds) => deltas.push(realDeltaSeconds));

  step(1000);
  step(1016);
  step(1032);

  assert.equal(deltas.length, 3);
  assert.equal(deltas[0], 0, 'first frame has no prior reference');
  assert.ok(Math.abs(deltas[1] - 0.016) < 1e-9);
  assert.ok(Math.abs(deltas[2] - 0.016) < 1e-9);
});

test('startFrameLoop re-arms exactly one pending frame after each step — never double-schedules', () => {
  const { scheduler, step, pendingCount } = createFakeFrameScheduler();
  startFrameLoop(scheduler, () => {});

  assert.equal(pendingCount(), 1, 'the initial requestFrame call arms exactly one pending callback');
  step(1000);
  assert.equal(pendingCount(), 1, 'after firing, exactly one new callback must be re-armed — never zero, never two');
  step(1016);
  assert.equal(pendingCount(), 1);
});

test('stop() cancels the pending frame and prevents any further onFrame calls', () => {
  const { scheduler, step, pendingCount } = createFakeFrameScheduler();
  let calls = 0;
  const handle = startFrameLoop(scheduler, () => {
    calls++;
  });

  step(1000);
  assert.equal(calls, 1);
  handle.stop();
  assert.equal(pendingCount(), 0, 'stop() must cancel the pending frame');
  step(1016);
  assert.equal(calls, 1, 'no further onFrame calls after stop()');
});

test('stop() is safe to call more than once', () => {
  const { scheduler } = createFakeFrameScheduler();
  const handle = startFrameLoop(scheduler, () => {});
  assert.doesNotThrow(() => {
    handle.stop();
    handle.stop();
  });
});
