/**
 * S3.6 — environmental elements (REQ-151): moving platforms (closed-form,
 * dm-0016), platform carry, collapsing floors, frictionless ice.
 *
 *  - a mover's position is a pure function of elapsed ticks (ping-pong for
 *    linear, wrap for looping); returns to start after a full period;
 *  - a triggered mover with no activationTick is dormant at waypoint[0];
 *  - platform CARRY: a grounded rider tracks a horizontally-moving platform,
 *    stays grounded on an upward-moving one, and is stopped by a wall;
 *  - a collapsing floor latches first contact, collapses after its delay,
 *    goes non-solid, and the player then falls through;
 *  - frictionless ICE preserves horizontal momentum (no decel on release);
 *  - determinism: the full pipeline replays bit-identically; purity holds.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createClock, FIXED_STEP_SECONDS } from '../../src/core/Clock';
import { createRng } from '../../src/core/Rng';
import { deepFreeze } from '../../src/core/StateManager';
import { NEUTRAL_INPUT, type InputFrame } from '../../src/core/State';
import { vec2 } from '../../src/core/Vec2';
import { TUNING } from '../../src/components/Tuning';
import type { BehaviorDef } from '../../src/components/Behavior';
import type { EntityDef } from '../../src/components/Entity';
import { LEVEL_SCHEMA_VERSION, type LevelDefinition } from '../../src/components/Level';
import { instantiateWorld, type JumpOnceState } from '../../src/entities/World';
import { entityKinematicsSystem } from '../../src/systems/EntityKinematics';
import { lifecycleSystem } from '../../src/systems/Lifecycle';
import { playerControlSystem } from '../../src/systems/PlayerControl';
import { playerPhysicsSystem } from '../../src/systems/PlayerPhysics';
import { hazardsAndGoalSystem } from '../../src/systems/HazardsAndGoal';
import { asEntityId } from '../helpers/Samples';

function makeLevel(opts: {
  width: number;
  height: number;
  spawn: { x: number; y: number };
  entities: readonly EntityDef[];
  extraSolid?: ReadonlyArray<{ col: number; row: number }>;
}): LevelDefinition {
  const { width, height, spawn } = opts;
  const tiles: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const isBorder = row === 0 || row === height - 1 || col === 0 || col === width - 1;
      tiles.push(isBorder ? 1 : 0);
    }
  }
  for (const { col, row } of opts.extraSolid ?? []) tiles[row * width + col] = 1;
  return {
    schemaVersion: LEVEL_SCHEMA_VERSION,
    levelId: 'unit-env',
    title: 'Environmental unit level',
    gdos: {
      targetKgNode: 'kg:test/env',
      difficultyVectors: { executionPrecision: 0, readingComplexity: 0, timingStrictness: 0, routeAmbiguity: 0 },
      emotionalBudgetCurve: [
        { at: 0, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
        { at: 1, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
      ],
      creatorMomentFrame: { tickWindow: [0, 1], description: 'n/a (unit fixture)' },
    },
    tilemap: { width, height, tileSize: 1, tiles },
    entities: opts.entities,
    triggers: [],
    constraints: {
      spawn: vec2(spawn.x, spawn.y),
      goal: { position: vec2(width - 1.5, 1.5), halfExtents: vec2(0.4, 0.4) },
      parTimeTiersSeconds: [10, 5],
    },
  };
}

function entity(id: string, x: number, y: number, hx: number, hy: number, behavior: BehaviorDef): EntityDef {
  return {
    id: asEntityId(id),
    transform: { position: vec2(x, y), facing: 1 },
    collider: { halfExtents: vec2(hx, hy), offset: vec2(0, 0) },
    behavior,
  };
}

function makeState(def: LevelDefinition): JumpOnceState {
  return { tick: 0, clock: createClock(), rng: createRng(1), input: NEUTRAL_INPUT, world: instantiateWorld(def) };
}

/** Full canonical pipeline order (P3 plan): kinematics → control → physics → outcome. */
function tick(state: JumpOnceState, input: InputFrame): JumpOnceState {
  let s: JumpOnceState = { ...state, tick: state.tick + 1, input };
  s = lifecycleSystem.step(s);
  s = entityKinematicsSystem.step(s);
  s = playerControlSystem.step(s);
  s = playerPhysicsSystem.step(s);
  s = hazardsAndGoalSystem.step(s);
  return s;
}

/* ── Closed-form mover kinematics ────────────────────────────────────── */

test('looping platform: exact closed-form position, returns to start after one full period', () => {
  const plat = entity('p', 5, 5, 1, 0.25, { kind: 'movingPlatform', waypoints: [vec2(0, 0), vec2(4, 0)], speed: 2, mode: 'looping' });
  const def = makeLevel({ width: 20, height: 10, spawn: { x: 2, y: 2 }, entities: [plat] });
  let s = makeState(def);
  // Loop path 0→4→0 has length 8; speed 2 → period 4s = 240 ticks.
  const quarter = 60; // 1s → distance 2 → at local x=2 (midway out)
  for (let i = 0; i < quarter; i++) s = tick(s, NEUTRAL_INPUT);
  assert.ok(Math.abs(s.world.entities[0].position.x - 7) < 1e-9, 'at 1s the platform is at base+2');
  for (let i = quarter; i < 240; i++) s = tick(s, NEUTRAL_INPUT);
  assert.ok(Math.abs(s.world.entities[0].position.x - 5) < 1e-9, 'after a full period it is back at base');
  assert.ok(Math.abs(s.world.entities[0].position.y - 5) < 1e-9);
});

test('linear platform ping-pongs: reaches the far end at half period, comes back', () => {
  const plat = entity('p', 3, 5, 1, 0.25, { kind: 'movingPlatform', waypoints: [vec2(0, 0), vec2(6, 0)], speed: 3, mode: 'linear' });
  const def = makeLevel({ width: 24, height: 10, spawn: { x: 1.5, y: 2 }, entities: [plat] });
  let s = makeState(def);
  // Open length 6, speed 3 → reaches far end at 2s (120 ticks), back at 4s.
  for (let i = 0; i < 120; i++) s = tick(s, NEUTRAL_INPUT);
  assert.ok(Math.abs(s.world.entities[0].position.x - 9) < 1e-9, 'far end = base+6 at half period');
  for (let i = 120; i < 240; i++) s = tick(s, NEUTRAL_INPUT);
  assert.ok(Math.abs(s.world.entities[0].position.x - 3) < 1e-9, 'back at base at full period');
});

test('triggered mover with no activation is dormant at waypoint[0]', () => {
  const plat = entity('p', 5, 5, 1, 0.25, { kind: 'movingPlatform', waypoints: [vec2(0, 0), vec2(4, 0)], speed: 2, mode: 'triggered' });
  const def = makeLevel({ width: 20, height: 10, spawn: { x: 2, y: 2 }, entities: [plat] });
  let s = makeState(def);
  for (let i = 0; i < 200; i++) s = tick(s, NEUTRAL_INPUT);
  assert.deepEqual(s.world.entities[0].position, vec2(5, 5), 'dormant until activated (S3.7 sets activationTick)');
  assert.deepEqual(s.world.entities[0].velocity, vec2(0, 0));
});

/* ── Platform carry ──────────────────────────────────────────────────── */

test('carry: a grounded rider tracks a horizontally-moving platform', () => {
  const plat = entity('p', 5, 8, 1.5, 0.25, { kind: 'movingPlatform', waypoints: [vec2(0, 0), vec2(6, 0)], speed: 3, mode: 'linear' });
  const def = makeLevel({ width: 24, height: 12, spawn: { x: 5, y: 6 }, entities: [plat] });
  let s = makeState(def);
  // Let the player fall onto the platform.
  for (let i = 0; i < 90 && !(s.world.playerGrounded && s.world.playerGroundEntity === 0); i++) s = tick(s, NEUTRAL_INPUT);
  assert.equal(s.world.playerGroundEntity, 0, 'player must land on the platform');
  const platX0 = s.world.entities[0].position.x;
  const playerX0 = s.world.playerPosition.x;
  for (let i = 0; i < 30; i++) s = tick(s, NEUTRAL_INPUT);
  const platDelta = s.world.entities[0].position.x - platX0;
  const playerDelta = s.world.playerPosition.x - playerX0;
  assert.ok(platDelta > 1, 'the platform actually moved');
  assert.ok(Math.abs(playerDelta - platDelta) < 1e-9, 'the rider tracked the platform exactly');
  assert.equal(s.world.playerGroundEntity, 0, 'still riding');
});

test('carry: a rider stays grounded on an upward-moving platform (grounding is robust)', () => {
  const plat = entity('p', 5, 8, 1.5, 0.25, { kind: 'movingPlatform', waypoints: [vec2(0, 0), vec2(0, -3)], speed: 2, mode: 'linear' });
  const def = makeLevel({ width: 16, height: 14, spawn: { x: 5, y: 6 }, entities: [plat] });
  let s = makeState(def);
  for (let i = 0; i < 90 && !(s.world.playerGrounded && s.world.playerGroundEntity === 0); i++) s = tick(s, NEUTRAL_INPUT);
  assert.equal(s.world.playerGroundEntity, 0, 'landed on the platform');
  const platY0 = s.world.entities[0].position.y;
  const playerY0 = s.world.playerPosition.y;
  let groundedEveryTick = true;
  for (let i = 0; i < 40; i++) {
    s = tick(s, NEUTRAL_INPUT);
    if (!(s.world.playerGrounded && s.world.playerGroundEntity === 0)) groundedEveryTick = false;
  }
  assert.equal(groundedEveryTick, true, 'the rider never loses the upward-moving platform');
  assert.ok(s.world.entities[0].position.y < platY0 - 0.5, 'the platform rose');
  assert.ok(Math.abs((s.world.playerPosition.y - playerY0) - (s.world.entities[0].position.y - platY0)) < 1e-9, 'rider rose with it');
});

/* ── Collapsing floors ───────────────────────────────────────────────── */

test('collapsing floor: latches contact, collapses after its delay, goes non-solid, player falls through', () => {
  const floor = entity('f', 5, 8, 1.5, 0.4, { kind: 'collapsingFloor', collapseDelaySeconds: 0.5 });
  const def = makeLevel({ width: 16, height: 14, spawn: { x: 5, y: 6 }, entities: [floor] });
  let s = makeState(def);
  // Land on the floor.
  for (let i = 0; i < 90 && !(s.world.playerGrounded && s.world.playerGroundEntity === 0); i++) s = tick(s, NEUTRAL_INPUT);
  assert.equal(s.world.playerGroundEntity, 0, 'landed on the collapsing floor');
  assert.equal(s.world.entities[0].collapsed, false, 'not collapsed on contact');
  const restY = s.world.playerPosition.y;
  // Run past the collapse delay (0.5s = 30 ticks) plus a margin.
  for (let i = 0; i < 60; i++) s = tick(s, NEUTRAL_INPUT);
  assert.equal(s.world.entities[0].collapsed, true, 'collapsed after the delay');
  assert.ok(s.world.playerPosition.y > restY + 0.5, 'player fell through the now-non-solid floor');
});

/* ── Frictionless ice ────────────────────────────────────────────────── */

test('ice: horizontal momentum is preserved — releasing input does not stop the slide', () => {
  const ice = entity('i', 8, 8, 4, 0.25, { kind: 'iceSurface' });
  const def = makeLevel({ width: 24, height: 12, spawn: { x: 6, y: 6 }, entities: [ice] });
  let s = makeState(def);
  for (let i = 0; i < 90 && !(s.world.playerGrounded && s.world.playerGroundEntity === 0); i++) s = tick(s, NEUTRAL_INPUT);
  assert.equal(s.world.playerGroundEntity, 0, 'standing on ice');
  // Accelerate right for a while.
  for (let i = 0; i < 20; i++) s = tick(s, { ...NEUTRAL_INPUT, moveAxis: 1 });
  const slidingVx = s.world.playerVelocity.x;
  assert.ok(slidingVx > 0, 'built rightward speed on ice');
  // Release: on ice, momentum persists (no instant stop).
  const afterRelease = tick(s, NEUTRAL_INPUT);
  assert.equal(afterRelease.world.playerVelocity.x, slidingVx, 'no friction: velocity is preserved on release');
});

test('ice ramps toward runSpeed rather than snapping to it instantly', () => {
  const ice = entity('i', 8, 8, 4, 0.25, { kind: 'iceSurface' });
  const def = makeLevel({ width: 24, height: 12, spawn: { x: 6, y: 6 }, entities: [ice] });
  let s = makeState(def);
  for (let i = 0; i < 90 && !(s.world.playerGrounded && s.world.playerGroundEntity === 0); i++) s = tick(s, NEUTRAL_INPUT);
  const first = tick(s, { ...NEUTRAL_INPUT, moveAxis: 1 });
  assert.ok(first.world.playerVelocity.x > 0 && first.world.playerVelocity.x < TUNING.runSpeed, 'one tick of ice accel is below run speed');
  assert.ok(Math.abs(first.world.playerVelocity.x - TUNING.iceAccel * FIXED_STEP_SECONDS) < 1e-9, 'exactly iceAccel·dt');
});

/* ── Determinism & purity ────────────────────────────────────────────── */

test('full pipeline with movers replays bit-identically', () => {
  const runOnce = (): string => {
    const plat = entity('p', 5, 8, 1.5, 0.25, { kind: 'movingPlatform', waypoints: [vec2(0, 0), vec2(6, 0)], speed: 3, mode: 'looping' });
    const ice = entity('i', 12, 10, 2, 0.25, { kind: 'iceSurface' });
    const def = makeLevel({ width: 24, height: 12, spawn: { x: 5, y: 6 }, entities: [plat, ice] });
    let s = makeState(def);
    for (let i = 0; i < 300; i++) s = tick(s, { ...NEUTRAL_INPUT, moveAxis: i % 4 === 0 ? 1 : 0 });
    return JSON.stringify(s.world);
  };
  assert.equal(runOnce(), runOnce());
});

test('entityKinematics is pure on frozen state and a no-op when nothing is dynamic', () => {
  const spike = entity('s', 5, 5, 0.5, 0.5, { kind: 'spike' }); // static, non-mover
  const def = makeLevel({ width: 12, height: 8, spawn: { x: 3, y: 3 }, entities: [spike] });
  const state = deepFreeze(makeState(def));
  const before = JSON.stringify(state);
  const next = entityKinematicsSystem.step(state);
  assert.equal(next, state, 'no movers, no collapse → same snapshot');
  assert.equal(JSON.stringify(state), before);
});
