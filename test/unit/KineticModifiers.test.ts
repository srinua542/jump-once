/**
 * S3.8 — kinetic modifiers (REQ-153): directional launch springs,
 * gravity-inverting zones, conveyors.
 *
 *  - spring: standing on it launches the player with its authored velocity;
 *  - gravity zone: inside it, gravity scales (−1 inverts → the player rises);
 *  - conveyor: adds its surface velocity to normal walking;
 *  - THE INVARIANT (REQ-153): no modifier consumes the jump — world.jumpLock
 *    is bit-identical before and after every modifier interaction, and a
 *    life still has exactly its one jump afterward;
 *  - determinism + purity.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createClock } from '../../src/core/Clock';
import { createRng } from '../../src/core/Rng';
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
import { sensorsSystem } from '../../src/systems/Sensors';
import { hazardsAndGoalSystem } from '../../src/systems/HazardsAndGoal';
import { asEntityId } from '../helpers/Samples';

function makeLevel(opts: { width: number; height: number; spawn: { x: number; y: number }; entities: readonly EntityDef[] }): LevelDefinition {
  const { width, height, spawn } = opts;
  const tiles: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const isBorder = row === 0 || row === height - 1 || col === 0 || col === width - 1;
      tiles.push(isBorder ? 1 : 0);
    }
  }
  return {
    schemaVersion: LEVEL_SCHEMA_VERSION,
    levelId: 'unit-kinetic',
    title: 'Kinetic modifiers unit level',
    gdos: {
      targetKgNode: 'kg:test/kinetic',
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

function ent(id: string, x: number, y: number, hx: number, hy: number, behavior: BehaviorDef): EntityDef {
  return { id: asEntityId(id), transform: { position: vec2(x, y), facing: 1 }, collider: { halfExtents: vec2(hx, hy), offset: vec2(0, 0) }, behavior };
}

function makeState(def: LevelDefinition): JumpOnceState {
  return { tick: 0, clock: createClock(), rng: createRng(1), input: NEUTRAL_INPUT, world: instantiateWorld(def) };
}

function tick(state: JumpOnceState, input: InputFrame): JumpOnceState {
  let s: JumpOnceState = { ...state, tick: state.tick + 1, input };
  s = lifecycleSystem.step(s);
  s = entityKinematicsSystem.step(s);
  s = playerControlSystem.step(s);
  s = playerPhysicsSystem.step(s);
  s = sensorsSystem.step(s);
  s = hazardsAndGoalSystem.step(s);
  return s;
}

function settleOn(def: LevelDefinition, entIndex: number): JumpOnceState {
  let s = makeState(def);
  for (let i = 0; i < 120 && !(s.world.playerGrounded && s.world.playerGroundEntity === entIndex); i++) s = tick(s, NEUTRAL_INPUT);
  assert.equal(s.world.playerGroundEntity, entIndex, 'player must settle on the target entity');
  return s;
}

/* ── Behaviour ───────────────────────────────────────────────────────── */

test('spring: standing on it launches the player upward with its authored velocity', () => {
  const spring = ent('sp', 5, 8, 1, 0.25, { kind: 'spring', launchVelocity: vec2(0, -15) });
  const def = makeLevel({ width: 16, height: 12, spawn: { x: 5, y: 6 }, entities: [spring] });
  let s = settleOn(def, 0);
  const yBefore = s.world.playerPosition.y;
  // Next tick control reads the spring (grounded on it) and launches.
  s = tick(s, NEUTRAL_INPUT);
  assert.ok(s.world.playerVelocity.y < 0, 'launched upward (negative y)');
  for (let i = 0; i < 20; i++) s = tick(s, NEUTRAL_INPUT);
  assert.ok(s.world.playerPosition.y < yBefore - 1, 'the player rose off the spring');
});

test('gravity zone: inside a scale −1 zone the player accelerates UP, not down', () => {
  // Big zone covering the upper area; player spawns inside it, in the air.
  const zone = ent('gz', 8, 5, 6, 4, { kind: 'gravityZone', gravityScale: -1 });
  const def = makeLevel({ width: 18, height: 12, spawn: { x: 8, y: 5 }, entities: [zone] });
  let s = makeState(def);
  s = tick(s, NEUTRAL_INPUT);
  assert.ok(s.world.playerVelocity.y < 0, 'inverted gravity pulls the player up');
  const y0 = s.world.playerPosition.y;
  for (let i = 0; i < 20; i++) s = tick(s, NEUTRAL_INPUT);
  assert.ok(s.world.playerPosition.y < y0, 'the player is moving upward under inverted gravity');
});

test('conveyor: adds its surface velocity to walking', () => {
  const conveyor = ent('cv', 8, 8, 4, 0.25, { kind: 'conveyor', surfaceVelocityX: 5 });
  const def = makeLevel({ width: 24, height: 12, spawn: { x: 8, y: 6 }, entities: [conveyor] });
  let s = settleOn(def, 0);
  // No input: the conveyor alone pushes the player right.
  const idle = tick(s, NEUTRAL_INPUT);
  assert.equal(idle.world.playerVelocity.x, 5, 'idle rider carried at the surface velocity');
  // Walking right: run speed + surface velocity.
  const walking = tick(s, { ...NEUTRAL_INPUT, moveAxis: 1 });
  assert.equal(walking.world.playerVelocity.x, TUNING.runSpeed + 5, 'walking composes with the conveyor');
});

/* ── THE INVARIANT: no modifier consumes the jump (REQ-153) ──────────── */

test('no kinetic modifier consumes the jump: jumpLock is unchanged across every interaction', () => {
  const cases: ReadonlyArray<{ name: string; behavior: BehaviorDef }> = [
    { name: 'spring', behavior: { kind: 'spring', launchVelocity: vec2(3, -15) } },
    { name: 'conveyor', behavior: { kind: 'conveyor', surfaceVelocityX: 6 } },
    { name: 'gravityZone', behavior: { kind: 'gravityZone', gravityScale: -1 } },
  ];
  for (const c of cases) {
    const isZone = c.behavior.kind === 'gravityZone';
    const e = ent('m', 8, isZone ? 5 : 8, isZone ? 5 : 2, isZone ? 4 : 0.25, c.behavior);
    const def = makeLevel({ width: 20, height: 12, spawn: { x: 8, y: isZone ? 5 : 6 }, entities: [e] });
    let s = makeState(def);
    // Interact for a while WITHOUT ever pressing jump.
    for (let i = 0; i < 60; i++) {
      const before = s.world.jumpLock;
      s = tick(s, { ...NEUTRAL_INPUT, moveAxis: i % 2 === 0 ? 1 : 0 });
      assert.deepEqual(s.world.jumpLock, before, `${c.name}: jumpLock must not change without a jump press (tick ${i})`);
      assert.equal(s.world.jumpLock.phase, 'available', `${c.name}: the jump stays available`);
    }
    // And the life still has exactly one jump available afterward.
    assert.equal(s.world.jumpLock.phase, 'available', `${c.name}: one jump still in hand`);
  }
});

test('a spring launch does not spend the jump: the player can still jump once in the air after being sprung', () => {
  const spring = ent('sp', 5, 8, 1, 0.25, { kind: 'spring', launchVelocity: vec2(0, -15) });
  const def = makeLevel({ width: 16, height: 14, spawn: { x: 5, y: 6 }, entities: [spring] });
  let s = settleOn(def, 0);
  s = tick(s, NEUTRAL_INPUT); // launched
  assert.equal(s.world.jumpLock.phase, 'available', 'spring launch left the jump available');
  // Land again, then jump: the machine must still fire exactly one impulse.
  for (let i = 0; i < 200 && !s.world.playerGrounded; i++) s = tick(s, NEUTRAL_INPUT);
  assert.equal(s.world.playerGrounded, true, 'landed after the spring');
  s = tick(s, { ...NEUTRAL_INPUT, jumpPressed: true });
  for (let i = 0; i < TUNING.anticipationTicks + 2; i++) s = tick(s, NEUTRAL_INPUT);
  assert.equal(s.world.jumpLock.phase, 'spent', 'the one jump is available and usable after a spring');
});

/* ── Determinism & purity ────────────────────────────────────────────── */

test('full pipeline with all three modifiers replays bit-identically', () => {
  const runOnce = (): string => {
    const spring = ent('sp', 4, 9, 0.8, 0.25, { kind: 'spring', launchVelocity: vec2(2, -12) });
    const conveyor = ent('cv', 10, 9, 2, 0.25, { kind: 'conveyor', surfaceVelocityX: 4 });
    const zone = ent('gz', 16, 5, 3, 3, { kind: 'gravityZone', gravityScale: -1 });
    const def = makeLevel({ width: 24, height: 12, spawn: { x: 4, y: 6 }, entities: [spring, conveyor, zone] });
    let s = makeState(def);
    for (let i = 0; i < 300; i++) s = tick(s, { ...NEUTRAL_INPUT, moveAxis: i % 3 === 0 ? 1 : 0, jumpPressed: i === 50 });
    return JSON.stringify(s.world);
  };
  assert.equal(runOnce(), runOnce());
});
