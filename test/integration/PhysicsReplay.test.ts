/**
 * S3.1 — the physics core rides the real pipeline: fixture FILE → parse →
 * instantiate → Engine ticks with playerPhysicsSystem under freezeOnCommit.
 *
 *  - (fixture file, seed) → bit-identical final state across two independent
 *    runs (the S1.9/S2.5 replay guarantee now covers real physics);
 *  - the spawned player falls under data-authored gravity and comes to rest
 *    exactly on the fixture's floor face, grounded;
 *  - the level definition stays reference-shared after 240 physics ticks.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FIXED_STEP_SECONDS } from '../../src/core/Clock';
import { Engine } from '../../src/core/Engine';
import { StateManager } from '../../src/core/StateManager';
import { TUNING } from '../../src/components/Tuning';
import type { LevelDefinition } from '../../src/components/Level';
import { parseLevelText } from '../../src/schema/Parse';
import { createInitialState, type WorldState } from '../../src/entities/World';
import { playerPhysicsSystem } from '../../src/systems/PlayerPhysics';

const FIXTURE_PATH = join(process.cwd(), 'test', 'fixtures', 'fixture-all-kinds.level.json');

function loadFixtureDef(): LevelDefinition {
  const result = parseLevelText(readFileSync(FIXTURE_PATH, 'utf8'));
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('unreachable');
  return result.value;
}

function run(seed: number): { finalJson: string; final: ReturnType<StateManager<WorldState>['getState']>; def: LevelDefinition } {
  const def = loadFixtureDef();
  const manager = new StateManager(createInitialState(def, seed), { freezeOnCommit: true });
  const engine = new Engine<WorldState>({ systems: [playerPhysicsSystem], stateManager: manager });
  let final = manager.getState();
  for (let i = 0; i < 240; i++) final = engine.tick(FIXED_STEP_SECONDS);
  return { finalJson: JSON.stringify(final), final, def };
}

test('physics replay: the same (fixture file, seed) is bit-identical across two independent runs', () => {
  assert.equal(run(20260709).finalJson, run(20260709).finalJson);
});

test('the player falls from spawn and rests EXACTLY on the fixture floor face, grounded, at rest', () => {
  const { final, def } = run(1);
  const floorFaceY = (def.tilemap.height - 1) * def.tilemap.tileSize; // top of the bottom border row
  assert.equal(final.world.playerPosition.y, floorFaceY - TUNING.playerHalfExtents.y);
  assert.equal(final.world.playerPosition.x, def.constraints.spawn.x, 'no horizontal drift without input');
  assert.equal(final.world.playerVelocity.y, 0);
  assert.equal(final.world.playerGrounded, true);
  assert.equal(final.tick, 240);
});

test('after 240 physics ticks the level definition is still the SAME object — referenced, never copied', () => {
  const { final, def } = run(7);
  assert.equal(final.world.level, def);
});
