/**
 * S8.4 — profiling instrumentation (REQ-132 P8 share): frame/section timing,
 * allocation counting, scene-load timing. A deterministic injected clock
 * proves the accumulation math without depending on real wall-clock timing.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Profiler, type Clock } from '../../tools/profiler/Profiler';
import { instantiateWorld } from '../../src/entities/World';
import { makeSampleLevel } from '../helpers/Samples';

/** A scripted clock returning successive values from a queue — fully deterministic. */
function scriptedClock(values: readonly number[]): Clock {
  let i = 0;
  return () => values[i++];
}

test('timeSection records count/total/mean/max across repeated calls', () => {
  // Each timeSection call reads the clock twice (start, end): deltas 10, 30, 20.
  const clock = scriptedClock([0, 10, 100, 130, 200, 220]);
  const profiler = new Profiler(clock);
  profiler.timeSection('step', () => {});
  profiler.timeSection('step', () => {});
  profiler.timeSection('step', () => {});

  const report = profiler.report();
  assert.equal(report.sections.length, 1);
  const step = report.sections[0];
  assert.equal(step.label, 'step');
  assert.equal(step.count, 3);
  assert.equal(step.totalMs, 60);
  assert.equal(step.meanMs, 20);
  assert.equal(step.maxMs, 30);
});

test('timeSection returns the wrapped function\'s value unchanged', () => {
  const profiler = new Profiler(scriptedClock([0, 1]));
  const value = profiler.timeSection('compute', () => 6 * 7);
  assert.equal(value, 42);
});

test('distinct labels accumulate independently and report sorted by label', () => {
  const profiler = new Profiler(scriptedClock([0, 5, 0, 9, 0, 1]));
  profiler.timeSection('physics', () => {});
  profiler.timeSection('render', () => {});
  profiler.timeSection('audio', () => {});
  const labels = profiler.report().sections.map((s) => s.label);
  assert.deepEqual(labels, ['audio', 'physics', 'render']);
});

test('countAllocations tallies deterministically', () => {
  const profiler = new Profiler(scriptedClock([0, 0]));
  profiler.countAllocations();
  profiler.countAllocations(4);
  profiler.countAllocations();
  assert.equal(profiler.report().allocations, 6);
});

test('sceneLoadTiming wraps a loader without altering its return value', () => {
  const profiler = new Profiler(scriptedClock([0, 12]));
  const level = makeSampleLevel();
  const world = profiler.sceneLoadTiming(() => instantiateWorld(level));
  // The world is exactly what instantiateWorld produced.
  assert.deepEqual(world, instantiateWorld(level));
  const report = profiler.report();
  const sceneLoad = report.sections.find((s) => s.label === 'sceneLoad');
  assert.ok(sceneLoad);
  assert.equal(sceneLoad!.totalMs, 12);
  assert.equal(sceneLoad!.count, 1);
});

test('a fresh profiler reports no sections and zero allocations', () => {
  const profiler = new Profiler(scriptedClock([]));
  const report = profiler.report();
  assert.deepEqual(report.sections, []);
  assert.equal(report.allocations, 0);
});

test('the default profiler uses a real monotonic wall clock (non-negative elapsed)', () => {
  const profiler = new Profiler();
  profiler.timeSection('real', () => {
    let x = 0;
    for (let i = 0; i < 1000; i++) x += i;
    return x;
  });
  const real = profiler.report().sections.find((s) => s.label === 'real');
  assert.ok(real);
  assert.ok(real!.totalMs >= 0, 'wall-clock elapsed is never negative');
});
