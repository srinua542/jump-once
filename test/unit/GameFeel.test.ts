/**
 * S9.5 — Game feel + fairness visuals (REQ-150 visual sub-clauses; REQ-016).
 * SquashStretch (velocity-driven, identity at rest), ImpulseEvents
 * (jump-fired/landed edge detection + pool-backed bursts), DefeatMarker
 * (REQ-016, dm-0089's resolution), and an integration proof that
 * anticipation frames (REQ-150) already flow end-to-end through
 * SceneCompiler + PaperStylePack's existing pose machinery.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { LevelDefinition } from '../../src/components/Level';
import { createClock } from '../../src/core/Clock';
import { createRng } from '../../src/core/Rng';
import { NEUTRAL_INPUT } from '../../src/core/State';
import { instantiateWorld, type JumpOnceState, type WorldState } from '../../src/entities/World';
import { parseLevel } from '../../src/schema/Parse';
import { DEFAULT_GRAMMAR } from '../../render/grammar/Grammar';
import { DEFAULT_FEEL_PROFILE } from '../../render/feel/FeelProfile';
import { deriveSquashStretch, IDENTITY_SCALE } from '../../render/feel/SquashStretch';
import { jumpFired, landed, spawnBurst } from '../../render/feel/ImpulseEvents';
import { deriveDefeatMarker } from '../../render/feel/DefeatMarker';
import { createParticlePool } from '../../render/pool/ParticlePool';
import { createRng as createVisualRng } from '../../render/style/paper/PaperRng';
import { createCamera } from '../../render/scene/Camera';
import { compileScene, type Viewport } from '../../render/scene/SceneCompiler';
import { PAPER_STYLE_PACK } from '../../render/style/paper/PaperStylePack';

function gdosFixture(id: string): unknown {
  return {
    targetKgNode: `kg:test/${id}`,
    difficultyVectors: { executionPrecision: 0, readingComplexity: 0, timingStrictness: 0, routeAmbiguity: 0 },
    emotionalBudgetCurve: [
      { at: 0, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
      { at: 1, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
    ],
    creatorMomentFrame: { tickWindow: [0, 1], description: 'n/a (unit fixture)' },
  };
}

function buildTinyLevel(): LevelDefinition {
  const width = 6;
  const height = 6;
  const tiles: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const border = row === 0 || row === height - 1 || col === 0 || col === width - 1;
      tiles.push(border ? 1 : 0);
    }
  }
  const raw = {
    schemaVersion: 1,
    levelId: 'game-feel-fixture',
    title: 'S9.5 fixture',
    gdos: gdosFixture('game-feel-fixture'),
    tilemap: { width, height, tileSize: 1, tiles },
    entities: [],
    triggers: [],
    constraints: { spawn: { x: 2.5, y: 3.5 }, goal: { position: { x: 4.5, y: 3.5 }, halfExtents: { x: 0.5, y: 0.5 } }, parTimeTiersSeconds: [30, 10] },
  };
  const result = parseLevel(raw);
  if (!result.ok) throw new Error(`fixture failed schema gate: ${JSON.stringify(result.errors)}`);
  return result.value;
}

function makeState(world: WorldState, tick = 0): JumpOnceState {
  return { tick, clock: createClock(), rng: createRng(1), input: NEUTRAL_INPUT, world };
}

/* ── SquashStretch ─────────────────────────────────────────────────────── */

test('deriveSquashStretch is identity at zero velocity', () => {
  assert.deepEqual(deriveSquashStretch(0, DEFAULT_FEEL_PROFILE), IDENTITY_SCALE);
});

test('deriveSquashStretch stretches vertically and squashes horizontally as |velocity| grows, monotonically', () => {
  const low = deriveSquashStretch(2, DEFAULT_FEEL_PROFILE);
  const high = deriveSquashStretch(8, DEFAULT_FEEL_PROFILE);
  assert.ok(high.scaleY > low.scaleY && low.scaleY > 1, 'stretch must increase with speed');
  assert.ok(high.scaleX < low.scaleX && low.scaleX < 1, 'squash must increase (scaleX shrink) with speed');
});

test('deriveSquashStretch clamps at and beyond velocityForMaxEffect, and is sign-independent', () => {
  const atMax = deriveSquashStretch(DEFAULT_FEEL_PROFILE.squashStretch.velocityForMaxEffect, DEFAULT_FEEL_PROFILE);
  const beyond = deriveSquashStretch(DEFAULT_FEEL_PROFILE.squashStretch.velocityForMaxEffect * 5, DEFAULT_FEEL_PROFILE);
  assert.deepEqual(atMax, beyond);
  assert.equal(atMax.scaleY, DEFAULT_FEEL_PROFILE.squashStretch.maxStretch);
  const negative = deriveSquashStretch(-6, DEFAULT_FEEL_PROFILE);
  const positive = deriveSquashStretch(6, DEFAULT_FEEL_PROFILE);
  assert.deepEqual(negative, positive);
});

/* ── ImpulseEvents ─────────────────────────────────────────────────────── */

test('jumpFired detects exactly the anticipating -> spent transition, not any other', () => {
  const level = buildTinyLevel();
  const base = instantiateWorld(level);
  const available: WorldState = { ...base, jumpLock: { phase: 'available', ticksUntilImpulse: 0 } };
  const anticipating: WorldState = { ...base, jumpLock: { phase: 'anticipating', ticksUntilImpulse: 3 } };
  const anticipatingLater: WorldState = { ...base, jumpLock: { phase: 'anticipating', ticksUntilImpulse: 2 } };
  const spent: WorldState = { ...base, jumpLock: { phase: 'spent', ticksUntilImpulse: 0 } };

  assert.equal(jumpFired(available, anticipating), false, 'available -> anticipating is not the firing edge');
  assert.equal(jumpFired(anticipating, anticipatingLater), false, 'anticipating -> anticipating (still counting down) must not re-fire');
  assert.equal(jumpFired(anticipating, spent), true, 'anticipating -> spent IS the firing edge');
  assert.equal(jumpFired(spent, available), false, 'spent -> available (reload) is not a firing edge');
});

test('landed detects exactly the airborne -> grounded transition', () => {
  const level = buildTinyLevel();
  const base = instantiateWorld(level);
  const airborne: WorldState = { ...base, playerGrounded: false };
  const grounded: WorldState = { ...base, playerGrounded: true };
  assert.equal(landed(airborne, grounded), true);
  assert.equal(landed(grounded, grounded), false);
  assert.equal(landed(grounded, airborne), false);
  assert.equal(landed(airborne, airborne), false);
});

test('spawnBurst acquires exactly `count` particles from a sufficiently large pool, and is deterministic for a given rng seed', () => {
  const poolA = createParticlePool({ capacity: 32 });
  const poolB = createParticlePool({ capacity: 32 });
  const handlesA = spawnBurst(poolA, { x: 5, y: 5 }, DEFAULT_FEEL_PROFILE.jumpBurst, 'safe', createVisualRng(42));
  const handlesB = spawnBurst(poolB, { x: 5, y: 5 }, DEFAULT_FEEL_PROFILE.jumpBurst, 'safe', createVisualRng(42));
  assert.equal(handlesA.length, DEFAULT_FEEL_PROFILE.jumpBurst.count);
  const particlesA = handlesA.map((h) => poolA.get(h));
  const particlesB = handlesB.map((h) => poolB.get(h));
  assert.deepEqual(particlesA, particlesB, 'the same rng seed must produce an identical burst — no Math.random');
});

test('spawnBurst never over-acquires when the pool is nearly exhausted, and never throws', () => {
  const pool = createParticlePool({ capacity: 3 });
  assert.doesNotThrow(() => {
    const handles = spawnBurst(pool, { x: 0, y: 0 }, DEFAULT_FEEL_PROFILE.jumpBurst, 'danger', createVisualRng(7));
    assert.equal(handles.length, 3, 'only 3 slots exist; the burst must acquire at most that many');
  });
});

/* ── DefeatMarker ──────────────────────────────────────────────────────── */

test('deriveDefeatMarker is null while playing or completed', () => {
  const level = buildTinyLevel();
  const world = instantiateWorld(level);
  assert.equal(deriveDefeatMarker(world), null);
  assert.equal(deriveDefeatMarker({ ...world, runState: 'completed' }), null);
});

test('deriveDefeatMarker is present at the player position and critical when defeated (REQ-016)', () => {
  const level = buildTinyLevel();
  const world = { ...instantiateWorld(level), runState: 'defeated' as const };
  const marker = deriveDefeatMarker(world);
  assert.ok(marker !== null);
  assert.equal(marker!.worldX, world.playerPosition.x);
  assert.equal(marker!.worldY, world.playerPosition.y);
  assert.equal(marker!.critical, true);
});

/* ── Anticipation frames (REQ-150): integration proof over S9.2/S9.3 ────── */

test('anticipation frames: the player pose (and its cached bitmap) differ between idle and anticipating jumpLock phases', () => {
  const level = buildTinyLevel();
  /* instantiateWorld spawns with playerGrounded: false (the player has not
     taken its first supported step yet, S3.1) — force it true here so the
     baseline pose is genuinely 'idle', not 'air', isolating the ONE
     variable this test actually cares about: jumpLock.phase. */
  const idleWorld: WorldState = { ...instantiateWorld(level), playerGrounded: true };
  const anticipatingWorld: WorldState = { ...idleWorld, jumpLock: { phase: 'anticipating', ticksUntilImpulse: 4 } };

  const idleState = makeState(idleWorld);
  const anticipatingState = makeState(anticipatingWorld);
  const viewport: Viewport = { halfWidth: 6, halfHeight: 6 };
  const camera = createCamera(idleWorld.playerPosition.x, idleWorld.playerPosition.y);

  const idleItems = compileScene(idleState, idleState, 0, DEFAULT_GRAMMAR, PAPER_STYLE_PACK, camera, viewport, 1);
  const anticipatingItems = compileScene(anticipatingState, anticipatingState, 0, DEFAULT_GRAMMAR, PAPER_STYLE_PACK, camera, viewport, 1);

  const idlePlayer = idleItems.find((i) => i.category === null)!;
  const anticipatingPlayer = anticipatingItems.find((i) => i.category === null)!;

  assert.ok(idlePlayer.bitmap.id.includes(':idle:'), `expected an idle-state bitmap id, got ${idlePlayer.bitmap.id}`);
  assert.ok(anticipatingPlayer.bitmap.id.includes(':prejump:'), `expected a prejump-state bitmap id, got ${anticipatingPlayer.bitmap.id}`);
  assert.notEqual(idlePlayer.bitmap.id, anticipatingPlayer.bitmap.id, 'anticipation must be a visually distinct frame from idle');
});
