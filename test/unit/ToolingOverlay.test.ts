/**
 * S9.9 — render/tooling/Overlay: painting all six P8 debug descriptor kinds
 * (tools/debug/Overlay.ts, unmodified) into plain-data primitives.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInitialState } from '../../src/entities/World';
import { makeSampleLevel } from '../helpers/Samples';
import { buildGridLevel } from '../helpers/GridLevel';
import { NORMAL_ARROW_LENGTH_WORLD_UNITS, paintOverlays, type OverlayPolyline } from '../../render/tooling/Overlay';

const SAMPLE = makeSampleLevel();

test('paintOverlays emits one rect per hitbox descriptor (player + every entity)', () => {
  const state = createInitialState(SAMPLE, 1);
  const primitives = paintOverlays(state, 5);
  const rects = primitives.filter((p) => p.kind === 'rect');
  assert.equal(rects.length, 1 + SAMPLE.entities.length);
  assert.ok(rects.some((r) => r.id === 'player'));
  assert.ok(rects.some((r) => r.id === 'e-spike'));
});

test('paintOverlays emits one trigger polyline per resolvable (source, target) pair', () => {
  const state = createInitialState(SAMPLE, 1);
  const primitives = paintOverlays(state, 5);
  const triggerLines = primitives.filter((p): p is OverlayPolyline => p.kind === 'polyline' && p.source === 'trigger');
  assert.ok(triggerLines.some((l) => l.id === 't-open#0'));
  for (const line of triggerLines) assert.equal(line.points.length, 2);
});

test('paintOverlays emits one path polyline per mover, matching its authored waypoints', () => {
  const state = createInitialState(SAMPLE, 1);
  const primitives = paintOverlays(state, 5);
  const pathLines = primitives.filter((p): p is OverlayPolyline => p.kind === 'polyline' && p.source === 'path');
  const ids = new Set(pathLines.map((l) => l.id));
  assert.ok(ids.has('e-movingPlatform'));
  assert.ok(ids.has('e-movingHazard'));
  assert.equal(pathLines.length, 2);
});

const RUNWAY = buildGridLevel('overlay-tooling-runway', ['S....G', '######']);

test('paintOverlays always emits exactly one jump-arc polyline, read-only (never mutates the passed state)', () => {
  const state = createInitialState(RUNWAY, 1);
  const before = JSON.stringify(state);
  const primitives = paintOverlays(state, 10);
  const arcs = primitives.filter((p): p is OverlayPolyline => p.kind === 'polyline' && p.source === 'jumpArc');
  assert.equal(arcs.length, 1);
  assert.equal(arcs[0].id, 'jump-arc');
  assert.ok(arcs[0].points.length >= 1);
  assert.equal(JSON.stringify(state), before, 'paintOverlays must never mutate the state it is handed');
});

test('paintOverlays emits no normal polyline while airborne, and one of the expected length once grounded', () => {
  const state = createInitialState(RUNWAY, 1);
  assert.equal(state.world.playerGrounded, false);
  const airborne = paintOverlays(state, 1);
  assert.ok(!airborne.some((p) => p.kind === 'polyline' && p.source === 'normal'));

  const grounded = { ...state, world: { ...state.world, playerGrounded: true } };
  const primitives = paintOverlays(grounded, 1);
  const normalLine = primitives.find((p): p is OverlayPolyline => p.kind === 'polyline' && p.source === 'normal');
  assert.ok(normalLine);
  assert.deepEqual(normalLine!.points[0], grounded.world.playerPosition);
  assert.deepEqual(normalLine!.points[1], {
    x: grounded.world.playerPosition.x,
    y: grounded.world.playerPosition.y - NORMAL_ARROW_LENGTH_WORLD_UNITS,
  });
});

test('paintOverlays always emits exactly one physics-state label summarizing grounded/jumpLock/runState', () => {
  const state = createInitialState(RUNWAY, 1);
  const primitives = paintOverlays(state, 1);
  const labels = primitives.filter((p) => p.kind === 'label');
  assert.equal(labels.length, 1);
  assert.match(labels[0].text, /grounded=false phase=available run=playing/);
});
