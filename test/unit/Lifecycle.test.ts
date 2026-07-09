/**
 * S3.4 — run lifecycle: goal, defeat, instant scene reload (REQ-003).
 *
 *  - goal strict-overlap → 'completed'; completion freezes the world
 *    (control/physics no-op) until reset;
 *  - falling below the world → 'defeated'; the NEXT tick's lifecycle pass
 *    yields a fresh world (instant iteration: exactly one tick of latency);
 *  - reload is pure re-instantiation: deep-equal to a fresh world except
 *    attemptCount+1 and spawnTick, level reference-shared through it —
 *    per-life state resets BY CONSTRUCTION (dm-0018);
 *  - resetPressed reloads from any run state;
 *  - full-pipeline replay determinism across a defeat→reload boundary.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createClock } from '../../src/core/Clock';
import { createRng } from '../../src/core/Rng';
import { deepFreeze } from '../../src/core/StateManager';
import { type InputFrame } from '../../src/core/State';
import { vec2 } from '../../src/core/Vec2';
import { LEVEL_SCHEMA_VERSION, type LevelDefinition } from '../../src/components/Level';
import { instantiateWorld, type JumpOnceState } from '../../src/entities/World';
import { lifecycleSystem } from '../../src/systems/Lifecycle';
import { hazardsAndGoalSystem } from '../../src/systems/HazardsAndGoal';
import { playerControlSystem } from '../../src/systems/PlayerControl';
import { playerPhysicsSystem } from '../../src/systems/PlayerPhysics';

/**
 * 16×8 bordered room EXCEPT the floor is open at cols 8..11 (a pit to fall
 * through, out of the world). Goal sits on the floor at x=14.
 */
function makePitRoomDef(): LevelDefinition {
  const width = 16;
  const height = 8;
  const tiles: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const isPit = row === height - 1 && col >= 8 && col <= 11;
      const isBorder = row === 0 || row === height - 1 || col === 0 || col === width - 1;
      tiles.push(isBorder && !isPit ? 1 : 0);
    }
  }
  return {
    schemaVersion: LEVEL_SCHEMA_VERSION,
    levelId: 'unit-pit-room',
    title: 'Lifecycle unit room (pit at cols 8-11)',
    gdos: {
      targetKgNode: 'kg:test/pit-room',
      difficultyVectors: { executionPrecision: 0, readingComplexity: 0, timingStrictness: 0, routeAmbiguity: 0 },
      emotionalBudgetCurve: [
        { at: 0, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
        { at: 1, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
      ],
      creatorMomentFrame: { tickWindow: [0, 1], description: 'n/a (unit fixture)' },
    },
    tilemap: { width, height, tileSize: 1, tiles },
    entities: [],
    triggers: [],
    constraints: {
      spawn: vec2(3, 6),
      goal: { position: vec2(14, 6), halfExtents: vec2(0.5, 0.5) },
      parTimeTiersSeconds: [10, 5],
    },
  };
}

const NEUTRAL: InputFrame = { moveAxis: 0, jumpPressed: false, resetPressed: false };

function makeState(def: LevelDefinition): JumpOnceState {
  return { tick: 0, clock: createClock(), rng: createRng(1), input: NEUTRAL, world: instantiateWorld(def) };
}

/** One full canonical-pipeline tick: lifecycle → control → physics → outcome. */
function pipelineTick(state: JumpOnceState, input: InputFrame): JumpOnceState {
  let s: JumpOnceState = { ...state, tick: state.tick + 1, input };
  s = lifecycleSystem.step(s);
  s = playerControlSystem.step(s);
  s = playerPhysicsSystem.step(s);
  s = hazardsAndGoalSystem.step(s);
  return s;
}

test('reaching the goal region sets runState completed; standing clear of it does not', () => {
  const state = makeState(makePitRoomDef());
  // Separated by a full unit (exactly representable): no overlap, still playing.
  const outside: JumpOnceState = { ...state, world: { ...state.world, playerPosition: vec2(13, 6) } };
  assert.equal(hazardsAndGoalSystem.step(outside).world.runState, 'playing');
  // Overlapping the region completes.
  const inside: JumpOnceState = { ...state, world: { ...state.world, playerPosition: vec2(14, 6) } };
  assert.equal(hazardsAndGoalSystem.step(inside).world.runState, 'completed');
});

test('completion freezes the world: control and physics no-op until reset reloads', () => {
  const def = makePitRoomDef();
  const state = makeState(def);
  let s: JumpOnceState = { ...state, world: { ...state.world, playerPosition: vec2(14, 6), runState: 'completed' as const } };
  const frozen = JSON.stringify(s.world);
  for (let i = 0; i < 30; i++) s = pipelineTick(s, { ...NEUTRAL, moveAxis: 1 });
  assert.equal(JSON.stringify(s.world), frozen, 'a completed world must not simulate');
  // The lifecycle pass alone lands exactly on spawn (physics then resumes from there).
  const reset = lifecycleSystem.step({ ...s, tick: s.tick + 1, input: { ...NEUTRAL, resetPressed: true } });
  assert.equal(reset.world.runState, 'playing');
  assert.deepEqual(reset.world.playerPosition, def.constraints.spawn);
  assert.equal(reset.world.attemptCount, 1);
});

test('walking into the pit: fall-out defeats, and the very next tick simulates a FRESH world (instant iteration)', () => {
  const def = makePitRoomDef();
  let s = makeState(def);
  let defeatTick = -1;
  for (let i = 0; i < 600; i++) {
    s = pipelineTick(s, { ...NEUTRAL, moveAxis: 1 });
    if (s.world.runState === 'defeated') {
      defeatTick = s.tick;
      break;
    }
    assert.notEqual(s.world.runState, 'completed', 'must fall into the pit before reaching the goal');
  }
  assert.ok(defeatTick > 0, 'the player must eventually fall out through the pit');

  // Next tick: lifecycle reloads BEFORE control/physics — the world is fresh and already simulating.
  const reborn = pipelineTick(s, NEUTRAL);
  assert.equal(reborn.world.runState, 'playing');
  assert.equal(reborn.world.attemptCount, 1);
  assert.equal(reborn.world.spawnTick, defeatTick + 1);
  assert.equal(reborn.world.level, s.world.level, 'level reference-shared across the life boundary');

  // Reload must be pure re-instantiation: rebuilding the same tick from a
  // fresh instantiateWorld (+ the two life-boundary fields) matches exactly —
  // per-life state resets by construction (dm-0018).
  const freshState: JumpOnceState = {
    ...s,
    tick: defeatTick + 1,
    input: NEUTRAL,
    world: { ...instantiateWorld(s.world.level), attemptCount: 1, spawnTick: defeatTick + 1 },
  };
  const freshAfter = hazardsAndGoalSystem.step(playerPhysicsSystem.step(playerControlSystem.step(freshState)));
  assert.deepEqual(reborn.world, freshAfter.world);
});

test('resetPressed reloads instantly from a live run and increments attemptCount', () => {
  const def = makePitRoomDef();
  let s = makeState(def);
  for (let i = 0; i < 30; i++) s = pipelineTick(s, { ...NEUTRAL, moveAxis: 1 });
  const before = s.world;
  assert.equal(before.runState, 'playing');
  const reset = pipelineTick(s, { ...NEUTRAL, resetPressed: true });
  assert.equal(reset.world.attemptCount, before.attemptCount + 1);
  assert.equal(reset.world.spawnTick, s.tick + 1);
  assert.notDeepEqual(before.playerPosition, def.constraints.spawn, 'the run had moved before reset');
});

test('replay determinism across a defeat→reload boundary: two runs agree bit-for-bit', () => {
  const runOnce = (): string => {
    let s = makeState(makePitRoomDef());
    for (let i = 0; i < 400; i++) s = pipelineTick(s, { ...NEUTRAL, moveAxis: 1 });
    return JSON.stringify(s.world);
  };
  const a = runOnce();
  assert.equal(a, runOnce());
  assert.ok(JSON.parse(a).attemptCount >= 1, 'the tape must actually cross at least one reload');
});

test('lifecycle and outcome systems are pure on frozen state; no-op paths return the same snapshot', () => {
  const state = deepFreeze(makeState(makePitRoomDef()));
  const before = JSON.stringify(state);
  assert.equal(lifecycleSystem.step(state), state, 'playing + no reset = no-op');
  assert.equal(hazardsAndGoalSystem.step(state), state, 'no outcome = no-op');
  assert.equal(JSON.stringify(state), before);
});
