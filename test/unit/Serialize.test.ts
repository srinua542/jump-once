/**
 * S2.2 — canonical serializer: byte-stable across calls and across
 * structurally equal values, fixed key order at every level, -0 never
 * escapes, and the closed kind/axis lists are fully represented.
 * (Byte-level idempotence through parseLevel is S2.4's round-trip test.)
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { vec2 } from '../../src/core/Vec2';
import { ENTITY_KINDS } from '../../src/components/Behavior';
import { DIFFICULTY_AXES } from '../../src/components/Gdos';
import { TRIGGER_ACTIONS } from '../../src/components/Trigger';
import type { LevelDefinition } from '../../src/components/Level';
import { serializeLevel } from '../../src/schema/Serialize';
import { makeSampleLevel } from '../helpers/Samples';

test('serializeLevel is byte-identical across repeated calls on the same value', () => {
  const def = makeSampleLevel();
  assert.equal(serializeLevel(def), serializeLevel(def));
});

test('serializeLevel is byte-identical across two independently constructed equal values', () => {
  assert.equal(serializeLevel(makeSampleLevel()), serializeLevel(makeSampleLevel()));
});

test('output is valid JSON with the documented fixed top-level key order', () => {
  const parsed = JSON.parse(serializeLevel(makeSampleLevel())) as Record<string, unknown>;
  assert.deepEqual(Object.keys(parsed), [
    'schemaVersion',
    'levelId',
    'title',
    'gdos',
    'tilemap',
    'entities',
    'triggers',
    'constraints',
  ]);
});

test('nested records keep their documented key order (entity, behavior, gdos, trigger, constraints)', () => {
  const parsed = JSON.parse(serializeLevel(makeSampleLevel())) as {
    gdos: Record<string, unknown>;
    entities: Array<Record<string, unknown> & { behavior: Record<string, unknown> }>;
    triggers: Array<Record<string, unknown>>;
    constraints: Record<string, unknown>;
    tilemap: Record<string, unknown>;
  };
  assert.deepEqual(Object.keys(parsed.gdos), ['targetKgNode', 'difficultyVectors', 'emotionalBudgetCurve', 'creatorMomentFrame']);
  assert.deepEqual(Object.keys(parsed.gdos.difficultyVectors as object), [...DIFFICULTY_AXES]);
  assert.deepEqual(Object.keys(parsed.tilemap), ['width', 'height', 'tileSize', 'tiles']);
  assert.deepEqual(Object.keys(parsed.entities[0]), ['id', 'transform', 'collider', 'behavior']);
  assert.equal(Object.keys(parsed.entities[0].behavior)[0], 'kind', 'behavior.kind must serialize first');
  assert.deepEqual(Object.keys(parsed.triggers[0]), ['id', 'source', 'targets', 'action', 'once']);
  assert.deepEqual(Object.keys(parsed.constraints), ['spawn', 'goal', 'parTimeTiersSeconds']);
});

test('-0 is normalized: the canonical text never contains a negative zero', () => {
  const base = makeSampleLevel();
  const withNegZero: LevelDefinition = {
    ...base,
    constraints: { ...base.constraints, spawn: vec2(-0, 6) },
  };
  const text = serializeLevel(withNegZero);
  assert.ok(!/-0[,\s}\]]/.test(text), 'canonical output contains -0');
  const parsed = JSON.parse(text) as { constraints: { spawn: { x: number } } };
  assert.ok(Object.is(parsed.constraints.spawn.x, 0), 'spawn.x should round-trip as +0');
});

test('the sample level serialization carries every entity kind and every trigger action', () => {
  const parsed = JSON.parse(serializeLevel(makeSampleLevel())) as {
    entities: Array<{ behavior: { kind: string } }>;
    triggers: Array<{ action: string }>;
  };
  const kinds = new Set(parsed.entities.map((e) => e.behavior.kind));
  for (const kind of ENTITY_KINDS) assert.ok(kinds.has(kind), `entity kind missing from sample: ${kind}`);
  const actions = new Set(parsed.triggers.map((t) => t.action));
  for (const action of TRIGGER_ACTIONS) assert.ok(actions.has(action), `trigger action missing from sample: ${action}`);
});
