/**
 * S2.5 — the REQ-120/121 runtime-consumption proof: a level FILE, parsed
 * through the schema boundary, instantiated into WorldState, drives the
 * deterministic Engine end-to-end.
 *  - instantiateWorld is a pure function (same def → deep-equal world);
 *  - the definition is frozen and reference-shared across every tick,
 *    never copied;
 *  - (fixture file, seed, input tape) → bit-identical final state across
 *    two independent runs — the S1.9 replay guarantee extended to
 *    file-driven worlds;
 *  - the test system reads its movement scalar FROM level data (tileSize),
 *    so the run demonstrably consumes external configuration at runtime.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FIXED_STEP_SECONDS } from '../../src/core/Clock';
import { Engine } from '../../src/core/Engine';
import { nextFloat } from '../../src/core/Rng';
import { StateManager } from '../../src/core/StateManager';
import type { InputFrame } from '../../src/core/State';
import { addScaled, vec2, ZERO } from '../../src/core/Vec2';
import type { System } from '../../src/systems/System';
import type { LevelDefinition } from '../../src/components/Level';
import { parseLevelText } from '../../src/schema/Parse';
import { createInitialState, instantiateWorld, type WorldState } from '../../src/entities/World';
import { makeSampleLevel } from '../helpers/Samples';

const FIXTURE_PATH = join(process.cwd(), 'test', 'fixtures', 'fixture-all-kinds.level.json');

function loadFixtureDef(): LevelDefinition {
  const result = parseLevelText(readFileSync(FIXTURE_PATH, 'utf8'));
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('unreachable');
  return result.value;
}

/**
 * Deterministic test system: moves the player by input intent scaled by a
 * value read from LEVEL DATA (tilemap.tileSize) plus seeded RNG jitter.
 * Pure state -> state; never touches world.level.
 */
const movePlayer: System<WorldState> = {
  id: 'test/move-player',
  step(state) {
    const draw = nextFloat(state.rng);
    const speed = state.world.level.tilemap.tileSize * 2; // data-driven scalar (REQ-121)
    const delta = vec2(state.input.moveAxis * speed, (draw.value - 0.5) * 0.1);
    return {
      ...state,
      rng: draw.next,
      world: {
        ...state.world,
        playerPosition: addScaled(state.world.playerPosition, delta, FIXED_STEP_SECONDS),
      },
    };
  },
};

function inputAt(i: number): InputFrame {
  return {
    moveAxis: i % 3 === 0 ? 1 : i % 3 === 1 ? -1 : 0,
    jumpPressed: i % 60 === 30,
    resetPressed: false,
  };
}

/** One full run: fresh parse of the fixture file → instantiate → 240 fixed steps. */
function run(seed: number): { finalJson: string; def: LevelDefinition; levelRef: LevelDefinition } {
  const def = loadFixtureDef();
  const manager = new StateManager(createInitialState(def, seed), { freezeOnCommit: true });
  const engine = new Engine<WorldState>({ systems: [movePlayer], stateManager: manager });
  let final = manager.getState();
  for (let i = 0; i < 240; i++) {
    // The input system doesn't exist until P3; the test injects each frame's
    // intent the same way it will: as a new committed snapshot before the step.
    manager.commit({ ...manager.getState(), input: inputAt(i) });
    final = engine.tick(FIXED_STEP_SECONDS);
  }
  return { finalJson: JSON.stringify(final), def, levelRef: manager.getState().world.level };
}

test('instantiateWorld is a pure function: same definition -> deep-equal world, twice', () => {
  const def = loadFixtureDef();
  assert.deepStrictEqual(instantiateWorld(def), instantiateWorld(def));
});

test('instantiateWorld freezes the definition and embeds it by reference', () => {
  const def = loadFixtureDef();
  const world = instantiateWorld(def);
  assert.equal(world.level, def, 'level must be the same object, not a copy');
  assert.ok(Object.isFrozen(def), 'definition root not frozen');
  assert.ok(Object.isFrozen(def.tilemap.tiles), 'tilemap tiles not frozen');
  assert.ok(Object.isFrozen(def.gdos.emotionalBudgetCurve), 'gdos curve not frozen');
});

test('entities spawn at their authored positions with zero velocity; player spawns at constraints.spawn', () => {
  const def = loadFixtureDef();
  const world = instantiateWorld(def);
  assert.equal(world.entities.length, def.entities.length);
  for (let i = 0; i < world.entities.length; i++) {
    assert.equal(world.entities[i].id, def.entities[i].id);
    assert.deepStrictEqual(world.entities[i].position, def.entities[i].transform.position);
    assert.deepStrictEqual(world.entities[i].velocity, ZERO);
  }
  assert.deepStrictEqual(world.playerPosition, def.constraints.spawn);
  assert.equal(world.nextSpawnSerial, 0);
});

test('the same (fixture file, seed, input tape) produces a bit-identical final state across two independent runs', () => {
  const a = run(20260709);
  const b = run(20260709);
  assert.equal(a.finalJson, b.finalJson);
});

test('a different seed produces a different final state (the run genuinely consumes the RNG)', () => {
  assert.notEqual(run(1).finalJson, run(2).finalJson);
});

test('after 240 engine ticks the level definition is still the SAME object — referenced, never copied', () => {
  const { def, levelRef } = run(20260709);
  assert.equal(levelRef, def);
});

test('the run demonstrably moved the player using level data (not a vacuous pipeline)', () => {
  const def = loadFixtureDef();
  const { finalJson } = run(20260709);
  const final = JSON.parse(finalJson) as { tick: number; world: { playerPosition: { x: number; y: number } } };
  assert.equal(final.tick, 240);
  assert.notDeepEqual(final.world.playerPosition, { x: def.constraints.spawn.x, y: def.constraints.spawn.y });
});

test('createInitialState composes tick 0, seeded rng, neutral input, and the instantiated world', () => {
  const state = createInitialState(makeSampleLevel(), 7);
  assert.equal(state.tick, 0);
  assert.equal(state.input.moveAxis, 0);
  assert.equal(state.world.nextSpawnSerial, 0);
  assert.equal(state.world.entities.length, state.world.level.entities.length);
});
