/**
 * S8.2 — debug overlay descriptors (REQ-131 P8 share, part 1): pure geometry/
 * state records computed from WorldState. No rendering (dm-0065).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInitialState } from '../../src/entities/World';
import { makeSampleLevel } from '../helpers/Samples';
import { buildGridLevel } from '../helpers/GridLevel';
import { startPlaytest } from '../../tools/level_editor/Playtest';
import {
  hitboxDescriptors,
  jumpArcDescriptor,
  normalDescriptor,
  pathDescriptors,
  physicsStateDescriptor,
  triggerDescriptors,
} from '../../tools/debug/Overlay';

const SAMPLE = makeSampleLevel();

test('hitboxDescriptors includes the player plus every entity, centered at position + collider offset', () => {
  const state = createInitialState(SAMPLE, 1);
  const descriptors = hitboxDescriptors(state.world);
  assert.equal(descriptors.length, 1 + SAMPLE.entities.length);
  assert.ok(descriptors.some((d) => d.id === 'player'));
  const spikeDesc = descriptors.find((d) => d.id === 'e-spike');
  assert.ok(spikeDesc);
  assert.deepEqual(spikeDesc!.center, { x: 9, y: 6 }); // offset (0,0) so center === position
  assert.deepEqual(spikeDesc!.halfExtents, { x: 0.5, y: 0.5 });
});

test('triggerDescriptors resolves source/target positions by entity id', () => {
  const state = createInitialState(SAMPLE, 1);
  const descriptors = triggerDescriptors(state.world);
  assert.equal(descriptors.length, SAMPLE.triggers.length);
  const openTrigger = descriptors.find((d) => d.id === 't-open');
  assert.ok(openTrigger);
  assert.deepEqual(openTrigger!.sourcePosition, { x: 6, y: 6 }); // e-pressurePlate position
  assert.equal(openTrigger!.targetPositions.length, 1);
  assert.deepEqual(openTrigger!.targetPositions[0], { x: 10, y: 5 }); // e-door position
  assert.equal(openTrigger!.action, 'openDoor');
});

test('pathDescriptors returns the authored waypoint polyline in world space for every mover, and nothing for non-movers', () => {
  const state = createInitialState(SAMPLE, 1);
  const descriptors = pathDescriptors(state.world);
  const kinds = new Set(descriptors.map((d) => d.id));
  assert.ok(kinds.has('e-movingPlatform'));
  assert.ok(kinds.has('e-movingHazard'));
  assert.equal(descriptors.length, 2); // exactly the two mover kinds present in the fixture

  const platform = descriptors.find((d) => d.id === 'e-movingPlatform')!;
  const def = SAMPLE.entities.find((e) => e.id === 'e-movingPlatform')!;
  const behavior = def.behavior as { waypoints: readonly { x: number; y: number }[] };
  assert.equal(platform.points.length, behavior.waypoints.length);
  assert.deepEqual(platform.points[0], { x: def.transform.position.x + behavior.waypoints[0].x, y: def.transform.position.y + behavior.waypoints[0].y });
});

test('normalDescriptor is null while airborne and (0,-1) once grounded (y-down convention)', () => {
  const state = createInitialState(SAMPLE, 1);
  assert.equal(state.world.playerGrounded, false);
  assert.equal(normalDescriptor(state.world), null);

  const grounded = { ...state.world, playerGrounded: true };
  assert.deepEqual(normalDescriptor(grounded), { x: 0, y: -1 });
});

test('physicsStateDescriptor snapshots grounded/jumpLock/runState', () => {
  const state = createInitialState(SAMPLE, 1);
  const desc = physicsStateDescriptor(state.world);
  assert.equal(desc.grounded, false);
  assert.equal(desc.jumpLockPhase, 'available');
  assert.equal(desc.runState, 'playing');
});

const RUNWAY = buildGridLevel('overlay-runway', ['S....G', '######']);

test('jumpArcDescriptor previews forward motion without mutating the live session state', () => {
  const session = startPlaytest(RUNWAY, 1);
  session.feedInput({ moveAxis: 0, jumpPressed: true, resetPressed: false });
  const before = session.currentState();

  const arc = jumpArcDescriptor(before, 20);
  assert.ok(arc.points.length >= 1);
  assert.deepEqual(arc.points[0], before.world.playerPosition);
  assert.ok(arc.ticksSimulated > 0, 'the anticipating/spent jump lock should still be simulating motion');

  // Read-only proof: the live session's state is untouched by the preview.
  assert.deepEqual(session.currentState(), before);
});

test('jumpArcDescriptor honestly stops early when the run leaves "playing" mid-preview', () => {
  const state = createInitialState(RUNWAY, 1);
  const completed = { ...state, world: { ...state.world, runState: 'completed' as const } };
  const arc = jumpArcDescriptor(completed, 10);
  assert.equal(arc.ticksSimulated, 0);
  assert.deepEqual(arc.points, [completed.world.playerPosition]);
});
