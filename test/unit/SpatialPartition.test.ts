/**
 * S3.2 — deterministic quadtree spatial partition (REQ-162, P3 share).
 *
 *  - EQUIVALENCE (the acceptance property): under seeded fuzz over random
 *    entity sets and query boxes, queryQuadtree returns exactly the
 *    brute-force strict-overlap set, ascending;
 *  - determinism: same world → structurally identical tree and results;
 *  - neighborhood-only: far entities are not returned;
 *  - clustered inputs respect the depth bound (no runaway recursion);
 *  - purity: a frozen world builds without mutation attempts.
 *
 * Entities are built through instantiateWorld so entry AABBs come from the
 * same runtime-position + authored-collider path the physics uses.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createRng, nextFloat } from '../../src/core/Rng';
import { deepFreeze } from '../../src/core/StateManager';
import { vec2 } from '../../src/core/Vec2';
import type { EntityDef } from '../../src/components/Entity';
import { LEVEL_SCHEMA_VERSION, type LevelDefinition } from '../../src/components/Level';
import { instantiateWorld, type WorldState } from '../../src/entities/World';
import { buildEntityQuadtree, queryQuadtree } from '../../src/systems/SpatialPartition';
import { asEntityId } from '../helpers/Samples';

/** Open 64×64 world (borders only) carrying the given entities. */
function makeWorld(entities: readonly EntityDef[]): WorldState {
  const width = 64;
  const height = 64;
  const tiles: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const isBorder = row === 0 || row === height - 1 || col === 0 || col === width - 1;
      tiles.push(isBorder ? 1 : 0);
    }
  }
  const def: LevelDefinition = {
    schemaVersion: LEVEL_SCHEMA_VERSION,
    levelId: 'unit-quadtree',
    title: 'SpatialPartition unit world',
    gdos: {
      targetKgNode: 'kg:test/quadtree',
      difficultyVectors: { executionPrecision: 0, readingComplexity: 0, timingStrictness: 0, routeAmbiguity: 0 },
      emotionalBudgetCurve: [
        { at: 0, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
        { at: 1, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
      ],
      creatorMomentFrame: { tickWindow: [0, 1], description: 'n/a (unit fixture)' },
    },
    tilemap: { width, height, tileSize: 1, tiles },
    entities,
    triggers: [],
    constraints: {
      spawn: vec2(2, 2),
      goal: { position: vec2(width - 2, 2), halfExtents: vec2(0.5, 0.5) },
      parTimeTiersSeconds: [10, 5],
    },
  };
  return instantiateWorld(def);
}

function spikeAt(i: number, x: number, y: number, hx: number, hy: number): EntityDef {
  return {
    id: asEntityId(`e-${i}`),
    transform: { position: vec2(x, y), facing: 1 },
    collider: { halfExtents: vec2(hx, hy), offset: vec2(0, 0) },
    behavior: { kind: 'spike' },
  };
}

/** Brute-force strict-overlap reference (flush contact is NOT overlap). */
function bruteForce(world: WorldState, minX: number, minY: number, maxX: number, maxY: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < world.level.entities.length; i++) {
    const def = world.level.entities[i];
    const pos = world.entities[i].position;
    const cx = pos.x + def.collider.offset.x;
    const cy = pos.y + def.collider.offset.y;
    const hx = def.collider.halfExtents.x;
    const hy = def.collider.halfExtents.y;
    if (cx - hx < maxX && cx + hx > minX && cy - hy < maxY && cy + hy > minY) out.push(i);
  }
  return out;
}

test('EQUIVALENCE: fuzzed entity sets and query boxes match brute force exactly (seeded)', () => {
  let rng = createRng(20260709);
  const draw = (): number => {
    const d = nextFloat(rng);
    rng = d.next;
    return d.value;
  };
  for (let round = 0; round < 40; round++) {
    const count = 1 + Math.floor(draw() * 150);
    const entities: EntityDef[] = [];
    for (let i = 0; i < count; i++) {
      entities.push(spikeAt(i, 1 + draw() * 62, 1 + draw() * 62, 0.1 + draw() * 3, 0.1 + draw() * 3));
    }
    const world = makeWorld(entities);
    const tree = buildEntityQuadtree(world);
    for (let q = 0; q < 25; q++) {
      const x0 = draw() * 64;
      const y0 = draw() * 64;
      const x1 = x0 + draw() * 20;
      const y1 = y0 + draw() * 20;
      assert.deepEqual(
        queryQuadtree(tree, x0, y0, x1, y1),
        bruteForce(world, x0, y0, x1, y1),
        `round ${round} query ${q} (${x0},${y0})..(${x1},${y1})`,
      );
    }
  }
});

test('determinism: the same world yields a structurally identical tree and identical results', () => {
  const entities = Array.from({ length: 40 }, (_, i) => spikeAt(i, 2 + (i % 8) * 7, 2 + Math.floor(i / 8) * 11, 1, 1));
  const worldA = makeWorld(entities);
  const worldB = makeWorld(entities);
  const treeA = buildEntityQuadtree(worldA);
  const treeB = buildEntityQuadtree(worldB);
  assert.equal(JSON.stringify(treeA), JSON.stringify(treeB));
  assert.deepEqual(queryQuadtree(treeA, 10, 10, 30, 30), queryQuadtree(treeB, 10, 10, 30, 30));
});

test('neighborhood only: a far-away entity is not returned; results come back ascending', () => {
  const world = makeWorld([
    spikeAt(0, 60, 60, 1, 1), // far
    spikeAt(1, 5, 5, 1, 1),
    spikeAt(2, 6, 5, 1, 1),
  ]);
  const tree = buildEntityQuadtree(world);
  assert.deepEqual(queryQuadtree(tree, 3, 3, 8, 8), [1, 2]);
});

test('flush contact is not overlap (matches the physics sweep convention)', () => {
  const world = makeWorld([spikeAt(0, 10, 10, 1, 1)]); // AABB [9,11]×[9,11]
  const tree = buildEntityQuadtree(world);
  assert.deepEqual(queryQuadtree(tree, 11, 9, 13, 11), [], 'query starting flush at maxX must miss');
  assert.deepEqual(queryQuadtree(tree, 10.999, 9, 13, 11), [0], 'any penetration must hit');
});

test('heavily clustered entities (identical AABBs beyond capacity × depth) still answer correctly', () => {
  const entities = Array.from({ length: 300 }, (_, i) => spikeAt(i, 32, 32, 0.5, 0.5));
  const world = makeWorld(entities);
  const tree = buildEntityQuadtree(world);
  const all = Array.from({ length: 300 }, (_, i) => i);
  assert.deepEqual(queryQuadtree(tree, 31, 31, 33, 33), all);
  assert.deepEqual(queryQuadtree(tree, 40, 40, 45, 45), []);
});

test('purity: building and querying a deep-frozen world neither throws nor mutates', () => {
  const world = deepFreeze(makeWorld([spikeAt(0, 5, 5, 1, 1), spikeAt(1, 20, 20, 2, 2)]));
  const before = JSON.stringify(world);
  const tree = buildEntityQuadtree(world);
  queryQuadtree(tree, 0, 0, 64, 64);
  assert.equal(JSON.stringify(world), before);
});

test('empty entity list: empty tree, empty results', () => {
  const tree = buildEntityQuadtree(makeWorld([]));
  assert.deepEqual(queryQuadtree(tree, 0, 0, 64, 64), []);
});
