/**
 * S2.1 — component data structures behave as pure immutable records:
 * every BehaviorDef kind and EntityDef is constructible, survives
 * deepFreeze intact, and the closed ENTITY_KINDS list stays in lockstep
 * with the BehaviorDef union (compile-time exhaustive, runtime unique).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deepFreeze } from '../../src/core/StateManager';
import { vec2 } from '../../src/core/Vec2';
import { RUNTIME_SPAWN_ID_PREFIX } from '../../src/components/EntityId';
import type { TransformDef } from '../../src/components/Transform';
import type { AabbDef } from '../../src/components/Collider';
import { ENTITY_KINDS } from '../../src/components/Behavior';
import type { EntityDef } from '../../src/components/Entity';
import { asEntityId as id, SAMPLE_BEHAVIORS } from '../helpers/Samples';

const TRANSFORM: TransformDef = { position: vec2(3, 4), facing: -1 };
const COLLIDER: AabbDef = { halfExtents: vec2(0.5, 0.5), offset: vec2(0, 0) };

test('ENTITY_KINDS is exhaustive over the BehaviorDef union and free of duplicates', () => {
  // Compile-time direction (union ⊆ list) is enforced by SAMPLE_BEHAVIORS'
  // Record<EntityKind, ...> type above; here we pin the runtime list to it.
  const fromUnion = Object.keys(SAMPLE_BEHAVIORS).sort();
  const fromList = [...ENTITY_KINDS].sort();
  assert.deepEqual(fromList, fromUnion);
  assert.equal(new Set(ENTITY_KINDS).size, ENTITY_KINDS.length, 'duplicate kind in ENTITY_KINDS');
});

test('every behavior kind constructs an EntityDef and survives deepFreeze intact', () => {
  for (const kind of ENTITY_KINDS) {
    const def: EntityDef = {
      id: id(`fixture-${kind}`),
      transform: TRANSFORM,
      collider: COLLIDER,
      behavior: SAMPLE_BEHAVIORS[kind],
    };
    const snapshot = JSON.stringify(def);
    const frozen = deepFreeze(def);
    assert.ok(Object.isFrozen(frozen), `${kind}: EntityDef not frozen`);
    assert.ok(Object.isFrozen(frozen.behavior), `${kind}: behavior payload not frozen`);
    assert.ok(Object.isFrozen(frozen.transform.position), `${kind}: nested Vec2 not frozen`);
    assert.equal(JSON.stringify(frozen), snapshot, `${kind}: deepFreeze altered the record's value`);
    assert.equal(frozen.behavior.kind, kind, `${kind}: discriminant mismatch`);
  }
});

test('frozen component records reject in-place mutation in strict mode', () => {
  const def: EntityDef = deepFreeze({
    id: id('mutation-probe'),
    transform: TRANSFORM,
    collider: COLLIDER,
    behavior: SAMPLE_BEHAVIORS.door,
  });
  assert.throws(() => {
    (def.transform.position as { x: number }).x = 99;
  }, TypeError);
});

test('RUNTIME_SPAWN_ID_PREFIX is a non-empty namespace marker distinct from typical authored ids', () => {
  assert.equal(typeof RUNTIME_SPAWN_ID_PREFIX, 'string');
  assert.ok(RUNTIME_SPAWN_ID_PREFIX.length > 0);
  assert.ok(RUNTIME_SPAWN_ID_PREFIX.endsWith(':'), 'prefix should be namespace-like to keep the id spaces visibly disjoint');
});
