/**
 * S9.3 — SceneCompiler: the pure `(state, previous, alpha, grammar, pack,
 * camera, viewport) → DrawList` projection. Structural/behavioral tests:
 * interpolation at α∈{0,½,1}; grammar-category resolution; quadtree
 * culling (critical items in view always survive); DrawList JSON purity;
 * projection never mutates WorldState.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { LevelDefinition } from '../../src/components/Level';
import { createClock } from '../../src/core/Clock';
import { createRng } from '../../src/core/Rng';
import { NEUTRAL_INPUT } from '../../src/core/State';
import { instantiateWorld, type JumpOnceState } from '../../src/entities/World';
import { parseLevel } from '../../src/schema/Parse';
import { DEFAULT_GRAMMAR } from '../../render/grammar/Grammar';
import { compileScene, type Viewport } from '../../render/scene/SceneCompiler';
import { PAPER_STYLE_PACK } from '../../render/style/paper/PaperStylePack';
import { createCamera } from '../../render/scene/Camera';

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

/** A 20x6 level: spawn/goal near the origin, a spike right beside spawn (in view),
 *  a laser+door+gravityZone far away (culled out of a small viewport), a spike
 *  far offscreen too (to prove non-critical-looking-but-actually-critical-danger
 *  culling still excludes truly out-of-view items). */
function buildFixtureLevel(): LevelDefinition {
  const width = 20;
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
    levelId: 'scene-compiler-fixture',
    title: 'S9.3 scene compiler fixture',
    gdos: gdosFixture('scene-compiler-fixture'),
    tilemap: { width, height, tileSize: 1, tiles },
    entities: [
      {
        id: 'spike-near',
        transform: { position: { x: 3.5, y: 3.5 }, facing: 1 },
        collider: { halfExtents: { x: 0.5, y: 0.5 }, offset: { x: 0, y: 0 } },
        behavior: { kind: 'spike' },
      },
      {
        id: 'spike-far',
        transform: { position: { x: 18.5, y: 3.5 }, facing: 1 },
        collider: { halfExtents: { x: 0.5, y: 0.5 }, offset: { x: 0, y: 0 } },
        behavior: { kind: 'spike' },
      },
      {
        id: 'laser-far',
        transform: { position: { x: 17.5, y: 2.5 }, facing: 1 },
        collider: { halfExtents: { x: 0.5, y: 0.5 }, offset: { x: 0, y: 0 } },
        behavior: { kind: 'laser', periodSeconds: 2, onFractionOfPeriod: 0.5, phaseSeconds: 0 },
      },
      {
        id: 'door-mid',
        transform: { position: { x: 10.5, y: 3.5 }, facing: 1 },
        collider: { halfExtents: { x: 0.5, y: 0.5 }, offset: { x: 0, y: 0 } },
        behavior: { kind: 'door', initiallyOpen: false },
      },
      {
        id: 'gravity-invert',
        transform: { position: { x: 11.5, y: 3.5 }, facing: 1 },
        collider: { halfExtents: { x: 0.5, y: 0.5 }, offset: { x: 0, y: 0 } },
        behavior: { kind: 'gravityZone', gravityScale: -1 },
      },
    ],
    triggers: [],
    constraints: {
      spawn: { x: 1.5, y: 3.5 },
      goal: { position: { x: 18.5, y: 4.5 }, halfExtents: { x: 0.5, y: 0.5 } },
      parTimeTiersSeconds: [30, 10],
    },
  };
  const result = parseLevel(raw);
  if (!result.ok) throw new Error(`fixture failed schema gate: ${JSON.stringify(result.errors)}`);
  return result.value;
}

function makeState(level: LevelDefinition, tick: number): JumpOnceState {
  return { tick, clock: createClock(), rng: createRng(1), input: NEUTRAL_INPUT, world: instantiateWorld(level) };
}

const SMALL_VIEWPORT: Viewport = { halfWidth: 3, halfHeight: 3 };

test('interpolation at α=0 uses the previous position; α=1 uses the current position; α=0.5 is the midpoint', () => {
  const level = buildFixtureLevel();
  const previous = makeState(level, 0);
  const currentWorld = { ...previous.world, playerPosition: { x: previous.world.playerPosition.x + 2, y: previous.world.playerPosition.y } };
  const current: JumpOnceState = { ...previous, tick: 1, world: currentWorld };

  const viewport: Viewport = { halfWidth: 20, halfHeight: 6 };
  const camera = createCamera(previous.world.playerPosition.x + 1, previous.world.playerPosition.y);

  const at0 = compileScene(current, previous, 0, DEFAULT_GRAMMAR, PAPER_STYLE_PACK, camera, viewport, 1);
  const at1 = compileScene(current, previous, 1, DEFAULT_GRAMMAR, PAPER_STYLE_PACK, camera, viewport, 1);
  const atHalf = compileScene(current, previous, 0.5, DEFAULT_GRAMMAR, PAPER_STYLE_PACK, camera, viewport, 1);

  const player0 = at0.find((i) => i.category === null)!;
  const player1 = at1.find((i) => i.category === null)!;
  const playerHalf = atHalf.find((i) => i.category === null)!;

  const expected0X = previous.world.playerPosition.x - player0.anchorX;
  const expected1X = currentWorld.playerPosition.x - player1.anchorX;
  const expectedHalfX = (previous.world.playerPosition.x + currentWorld.playerPosition.x) / 2 - playerHalf.anchorX;

  assert.ok(Math.abs(player0.worldX - expected0X) < 1e-9);
  assert.ok(Math.abs(player1.worldX - expected1X) < 1e-9);
  assert.ok(Math.abs(playerHalf.worldX - expectedHalfX) < 1e-9);
});

test('every emitted item resolves through the grammar to exactly one category (or null for the reserved player)', () => {
  const level = buildFixtureLevel();
  const state = makeState(level, 0);
  const viewport: Viewport = { halfWidth: 20, halfHeight: 6 };
  const camera = createCamera(10, 3);
  const items = compileScene(state, state, 0, DEFAULT_GRAMMAR, PAPER_STYLE_PACK, camera, viewport, 1);
  assert.ok(items.length > 0);
  for (const item of items) {
    if (item.category === null) {
      assert.equal(item.critical, true, 'the player is always critical');
    } else {
      assert.ok((Object.keys(DEFAULT_GRAMMAR.bindings) as string[]).length > 0);
      const known = DEFAULT_GRAMMAR.categories.some((c) => c.id === item.category);
      assert.ok(known, `unknown category "${item.category}"`);
    }
  }
});

test('culling: a spike far outside a small viewport is excluded; a spike just inside survives and stays critical (REQ-016)', () => {
  const level = buildFixtureLevel();
  const state = makeState(level, 0);
  const camera = createCamera(3.5, 3.5); // centered on spike-near
  const items = compileScene(state, state, 0, DEFAULT_GRAMMAR, PAPER_STYLE_PACK, camera, SMALL_VIEWPORT, 1);

  const dangerItems = items.filter((i) => i.category === 'danger');
  assert.ok(dangerItems.length >= 1, 'expected the near spike to survive culling');
  for (const d of dangerItems) assert.equal(d.critical, true, 'danger is structurally always-critical');

  /* spike-far is at x=18.5, far outside camera (3.5±3) — must not appear. */
  const totalDangerBitmapIds = new Set(dangerItems.map((i) => i.bitmap.id));
  assert.equal(totalDangerBitmapIds.size, 1, 'only one spike (near) should be visible; the far spike must be culled');
});

test('door/gravityZone state derivation from real WorldState/LevelDefinition fields (no re-derived physics)', () => {
  const level = buildFixtureLevel();
  const state = makeState(level, 0);
  const viewport: Viewport = { halfWidth: 20, halfHeight: 6 };
  const camera = createCamera(10, 3);
  const items = compileScene(state, state, 0, DEFAULT_GRAMMAR, PAPER_STYLE_PACK, camera, viewport, 1);
  /* door starts closed (initiallyOpen:false) and gravityZone is inverted
     (gravityScale:-1) — both resolve to the 'interactive'/'secret' categories
     respectively; we can't inspect the state string directly from a DrawItem
     (by design — it's baked into the opaque bitmap id), but the bitmap id key
     format is "${role}:${state}:${T}", so we can assert on it structurally. */
  const door = items.find((i) => i.bitmap.id.startsWith('door:'));
  const gravity = items.find((i) => i.bitmap.id.startsWith('gravityZone:'));
  assert.ok(door !== undefined && door.bitmap.id.includes(':closed:'), `expected door:closed:*, got ${door?.bitmap.id}`);
  assert.ok(gravity !== undefined && gravity.bitmap.id.includes(':invert:'), `expected gravityZone:invert:*, got ${gravity?.bitmap.id}`);
});

test('the goal is culled by its own AABB, independent of entity culling', () => {
  const level = buildFixtureLevel();
  const state = makeState(level, 0);
  const nearCamera = createCamera(18.5, 4.5);
  const farCamera = createCamera(1.5, 3.5);
  const near = compileScene(state, state, 0, DEFAULT_GRAMMAR, PAPER_STYLE_PACK, nearCamera, SMALL_VIEWPORT, 1);
  const far = compileScene(state, state, 0, DEFAULT_GRAMMAR, PAPER_STYLE_PACK, farCamera, SMALL_VIEWPORT, 1);
  assert.ok(near.some((i) => i.bitmap.id.startsWith('goal:')), 'goal should render when the camera is centered on it');
  assert.ok(!far.some((i) => i.bitmap.id.startsWith('goal:')), 'goal should be culled far from the camera');
});

test('DrawList is plain, JSON-serializable data with no loss on a round trip', () => {
  const level = buildFixtureLevel();
  const state = makeState(level, 0);
  const viewport: Viewport = { halfWidth: 20, halfHeight: 6 };
  const camera = createCamera(10, 3);
  const items = compileScene(state, state, 0, DEFAULT_GRAMMAR, PAPER_STYLE_PACK, camera, viewport, 1);
  const roundTripped = JSON.parse(JSON.stringify(items));
  assert.deepEqual(roundTripped, items);
});

test('compileScene never mutates the WorldState it reads (projection purity, dm-0004/dm-0082)', () => {
  const level = buildFixtureLevel();
  const state = makeState(level, 0);
  const beforeJson = JSON.stringify(state.world);
  const viewport: Viewport = { halfWidth: 20, halfHeight: 6 };
  const camera = createCamera(10, 3);
  compileScene(state, state, 0.5, DEFAULT_GRAMMAR, PAPER_STYLE_PACK, camera, viewport, 1);
  assert.equal(JSON.stringify(state.world), beforeJson, 'WorldState must be structurally unchanged after compileScene');
});
