/**
 * S3.1 — deterministic physics & collision core.
 *
 * Proves the P3 execution-plan techniques (dm-0016..dm-0018 as applicable):
 *  - semi-implicit Euler at the fixed step, terminal-fall clamp;
 *  - swept, axis-separated resolution: exact snap to tile faces, blocked
 *    axes zero their velocity component, downward support sets grounded;
 *  - NO TUNNELING at arbitrary velocities (seeded fuzz property, walls and
 *    floors one tile thick);
 *  - solid entities block (door closed), sensors/lethals don't (spike),
 *    door initiallyOpen doesn't;
 *  - purity (frozen input state, new output state) and bit-identical
 *    trajectory determinism.
 *
 * Expectations are computed from TUNING/FIXED_STEP_SECONDS, never literal
 * duplicates, so a ledgered tuning change doesn't silently rot this suite.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FIXED_STEP_SECONDS } from '../../src/core/Clock';
import { createRng, nextFloat } from '../../src/core/Rng';
import { deepFreeze } from '../../src/core/StateManager';
import { NEUTRAL_INPUT } from '../../src/core/State';
import { createClock } from '../../src/core/Clock';
import { vec2 } from '../../src/core/Vec2';
import { TUNING } from '../../src/components/Tuning';
import { COLLISION_CLASS_BY_KIND } from '../../src/components/CollisionClass';
import { ENTITY_KINDS, type BehaviorDef } from '../../src/components/Behavior';
import type { EntityDef } from '../../src/components/Entity';
import { LEVEL_SCHEMA_VERSION, type LevelDefinition } from '../../src/components/Level';
import { instantiateWorld, type JumpOnceState, type WorldState } from '../../src/entities/World';
import { playerPhysicsSystem, stepPlayerPhysics } from '../../src/systems/PlayerPhysics';
import { asEntityId, SAMPLE_BEHAVIORS } from '../helpers/Samples';

const DT = FIXED_STEP_SECONDS;
const HALF = TUNING.playerHalfExtents;

/**
 * Bordered rectangular room (tileSize 1): solid rows 0 and height-1, solid
 * cols 0 and width-1, plus any extra solid (col,row) cells. Entities optional.
 */
function makeRoom(options: {
  width: number;
  height: number;
  spawn: { x: number; y: number };
  extraSolid?: ReadonlyArray<{ col: number; row: number }>;
  entities?: readonly EntityDef[];
}): LevelDefinition {
  const { width, height, spawn } = options;
  const tiles: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const isBorder = row === 0 || row === height - 1 || col === 0 || col === width - 1;
      tiles.push(isBorder ? 1 : 0);
    }
  }
  for (const { col, row } of options.extraSolid ?? []) tiles[row * width + col] = 1;
  return {
    schemaVersion: LEVEL_SCHEMA_VERSION,
    levelId: 'unit-room',
    title: 'PlayerPhysics unit room',
    gdos: {
      targetKgNode: 'kg:test/unit-room',
      difficultyVectors: { executionPrecision: 0, readingComplexity: 0, timingStrictness: 0, routeAmbiguity: 0 },
      emotionalBudgetCurve: [
        { at: 0, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
        { at: 1, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
      ],
      creatorMomentFrame: { tickWindow: [0, 1], description: 'n/a (unit fixture)' },
    },
    tilemap: { width, height, tileSize: 1, tiles },
    entities: options.entities ?? [],
    triggers: [],
    constraints: {
      spawn: vec2(spawn.x, spawn.y),
      goal: { position: vec2(width - 1.5, 1.5), halfExtents: vec2(0.5, 0.5) },
      parTimeTiersSeconds: [10, 5],
    },
  };
}

function entityAt(kind: keyof typeof SAMPLE_BEHAVIORS, x: number, y: number, behavior?: BehaviorDef): EntityDef {
  return {
    id: asEntityId(`e-${kind}`),
    transform: { position: vec2(x, y), facing: 1 },
    collider: { halfExtents: vec2(0.5, 0.5), offset: vec2(0, 0) },
    behavior: behavior ?? SAMPLE_BEHAVIORS[kind],
  };
}

function worldWith(def: LevelDefinition, velocity: { x: number; y: number }): WorldState {
  return { ...instantiateWorld(def), playerVelocity: vec2(velocity.x, velocity.y) };
}

function stepN(world: WorldState, n: number): WorldState {
  let w = world;
  for (let i = 0; i < n; i++) w = stepPlayerPhysics(w);
  return w;
}

/* ── Integration & clamp ─────────────────────────────────────────────── */

test('semi-implicit Euler: velocity updates first, position moves by the NEW velocity', () => {
  const def = makeRoom({ width: 10, height: 20, spawn: { x: 5, y: 3 } });
  const w1 = stepPlayerPhysics(instantiateWorld(def));
  const expectedVy = TUNING.gravityY * DT;
  assert.equal(w1.playerVelocity.y, expectedVy);
  assert.equal(w1.playerPosition.y, 3 + expectedVy * DT);
  assert.equal(w1.playerPosition.x, 5);
  assert.equal(w1.playerGrounded, false);
});

test('fall speed clamps at TUNING.maxFallSpeed', () => {
  const def = makeRoom({ width: 10, height: 500, spawn: { x: 5, y: 3 } });
  const w = stepN(instantiateWorld(def), 300);
  assert.equal(w.playerVelocity.y, TUNING.maxFallSpeed);
});

/* ── Exact contact snapping ──────────────────────────────────────────── */

test('lands EXACTLY on the floor face, zeroes vy, sets grounded — and stays put while resting', () => {
  const def = makeRoom({ width: 10, height: 8, spawn: { x: 5, y: 6 } });
  const floorFaceY = 7; // top of the bottom border row
  const landed = stepN(instantiateWorld(def), 120);
  assert.equal(landed.playerPosition.y, floorFaceY - HALF.y);
  assert.equal(landed.playerVelocity.y, 0);
  assert.equal(landed.playerGrounded, true);
  const later = stepN(landed, 60);
  assert.equal(later.playerPosition.y, floorFaceY - HALF.y, 'resting must not jitter or sink');
  assert.equal(later.playerGrounded, true, 'resting must stay grounded every step');
});

test('ceiling: a huge upward velocity clamps exactly to the ceiling underside and zeroes vy (no tunneling up)', () => {
  const def = makeRoom({ width: 10, height: 10, spawn: { x: 5, y: 3 } });
  const w = stepPlayerPhysics(worldWith(def, { x: 0, y: -200 }));
  assert.equal(w.playerPosition.y, 1 + HALF.y); // bottom face of border row 0
  assert.equal(w.playerVelocity.y, 0);
  assert.equal(w.playerGrounded, false, 'a ceiling hit is not ground support');
});

test('walls: clamps exactly to the wall face and zeroes vx, in both directions', () => {
  const def = makeRoom({ width: 12, height: 8, spawn: { x: 6, y: 3 } });
  const right = stepPlayerPhysics(worldWith(def, { x: 500, y: 0 }));
  assert.equal(right.playerPosition.x, 11 - HALF.x); // left face of border col 11
  assert.equal(right.playerVelocity.x, 0);
  const left = stepPlayerPhysics(worldWith(def, { x: -500, y: 0 }));
  assert.equal(left.playerPosition.x, 1 + HALF.x); // right face of border col 0
  assert.equal(left.playerVelocity.x, 0);
});

/* ── No-tunneling property (dm-0017) ─────────────────────────────────── */

test('no-tunneling property: fuzzed launches at up to 1200 u/s never cross a one-tile wall or floor', () => {
  // Wall: col 20 solid for the full interior height of a 40×10 room.
  const wall = Array.from({ length: 8 }, (_, i) => ({ col: 20, row: i + 1 }));
  const def = makeRoom({ width: 40, height: 10, spawn: { x: 2, y: 2 }, extraSolid: wall });
  const wallFaceX = 20;
  const floorFaceY = 9;
  let rng = createRng(20260709);
  for (let caseIdx = 0; caseIdx < 300; caseIdx++) {
    const dx = nextFloat(rng);
    const dy = nextFloat(dx.next);
    const dvx = nextFloat(dy.next);
    const dvy = nextFloat(dvx.next);
    rng = dvy.next;
    const start = vec2(1 + HALF.x + dx.value * (wallFaceX - 2 - 2 * HALF.x), 1 + HALF.y + dy.value * 6);
    const vel = vec2(dvx.value * 1200, (dvy.value - 0.25) * 1200);
    let w: WorldState = { ...instantiateWorld(def), playerPosition: start, playerVelocity: vel };
    for (let s = 0; s < 30; s++) {
      w = stepPlayerPhysics(w);
      assert.ok(
        w.playerPosition.x + HALF.x <= wallFaceX,
        `case ${caseIdx} step ${s}: crossed the wall (x=${w.playerPosition.x}, vx=${vel.x})`,
      );
      assert.ok(
        w.playerPosition.y + HALF.y <= floorFaceY,
        `case ${caseIdx} step ${s}: sank through the floor (y=${w.playerPosition.y}, vy=${vel.y})`,
      );
    }
  }
});

/* ── Entity collision by CollisionClass ──────────────────────────────── */

test('a closed door blocks: clamps exactly to its face and zeroes vx', () => {
  const def = makeRoom({ width: 12, height: 8, spawn: { x: 2, y: 6.4 }, entities: [entityAt('door', 5, 6)] });
  const w = stepPlayerPhysicsUntilStopped(worldWith(def, { x: 200, y: 0 }));
  assert.equal(w.playerPosition.x, 4.5 - HALF.x); // door left face
  assert.equal(w.playerVelocity.x, 0);
});

test('an initially-open door does not block', () => {
  const openDoor = entityAt('door', 5, 6, { kind: 'door', initiallyOpen: true });
  const def = makeRoom({ width: 12, height: 8, spawn: { x: 2, y: 6.4 }, entities: [openDoor] });
  const w = stepPlayerPhysics(worldWith(def, { x: 200, y: 0 }));
  assert.ok(w.playerPosition.x > 5, 'player should pass through the open door');
});

test('a lethal entity (spike) never blocks movement — hazard response is S3.7, not collision', () => {
  const def = makeRoom({ width: 12, height: 8, spawn: { x: 2, y: 6.4 }, entities: [entityAt('spike', 5, 6)] });
  const w = stepPlayerPhysics(worldWith(def, { x: 200, y: 0 }));
  assert.ok(w.playerPosition.x > 5, 'player should sweep through the spike cell');
});

test('the player can stand ON a solid entity: exact top-face snap, grounded', () => {
  const def = makeRoom({ width: 12, height: 12, spawn: { x: 5, y: 3 }, entities: [entityAt('door', 5, 6)] });
  const w = stepN(instantiateWorld(def), 120);
  assert.equal(w.playerPosition.y, 5.5 - HALF.y); // door top face
  assert.equal(w.playerGrounded, true);
});

function stepPlayerPhysicsUntilStopped(world: WorldState): WorldState {
  let w = world;
  for (let i = 0; i < 60; i++) {
    w = stepPlayerPhysics(w);
    if (w.playerVelocity.x === 0) break;
  }
  return w;
}

/* ── Classification table stays total ────────────────────────────────── */

test('COLLISION_CLASS_BY_KIND is total over ENTITY_KINDS with only known classes', () => {
  for (const kind of ENTITY_KINDS) {
    const cls = COLLISION_CLASS_BY_KIND[kind];
    assert.ok(cls === 'solid' || cls === 'lethal' || cls === 'sensor', `unclassified kind: ${kind}`);
  }
  assert.equal(Object.keys(COLLISION_CLASS_BY_KIND).length, ENTITY_KINDS.length);
});

/* ── Determinism & purity ────────────────────────────────────────────── */

test('bit-identical trajectory: two runs from the same initial world agree at every step', () => {
  const def = makeRoom({ width: 20, height: 12, spawn: { x: 3, y: 2 }, entities: [entityAt('door', 8, 9)] });
  let a: WorldState = worldWith(def, { x: 7, y: -3 });
  let b: WorldState = worldWith(def, { x: 7, y: -3 });
  for (let i = 0; i < 240; i++) {
    a = stepPlayerPhysics(a);
    b = stepPlayerPhysics(b);
    assert.equal(JSON.stringify({ p: a.playerPosition, v: a.playerVelocity, g: a.playerGrounded }),
      JSON.stringify({ p: b.playerPosition, v: b.playerVelocity, g: b.playerGrounded }), `diverged at step ${i}`);
  }
});

test('the system is pure: a deep-frozen state is not mutated and a new state is returned', () => {
  const def = makeRoom({ width: 10, height: 8, spawn: { x: 5, y: 3 } });
  const state: JumpOnceState = deepFreeze({
    tick: 0,
    clock: createClock(),
    rng: createRng(1),
    input: NEUTRAL_INPUT,
    world: instantiateWorld(def),
  });
  const before = JSON.stringify(state);
  const next = playerPhysicsSystem.step(state);
  assert.notEqual(next, state);
  assert.notEqual(next.world, state.world);
  assert.equal(JSON.stringify(state), before, 'input state must be untouched');
  assert.equal(next.tick, state.tick, 'physics must not advance tick (Engine owns tick)');
  assert.equal(next.input, state.input, 'physics must not touch input (isolation rule)');
});
