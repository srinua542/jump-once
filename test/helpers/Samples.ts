/**
 * Shared test fixtures builders. Not a test file (no .test suffix) — the
 * runner treats it as a plain module.
 *
 * SAMPLE_BEHAVIORS is typed Record<EntityKind, BehaviorDef> so the compiler
 * fails any test importing it when a kind is added to the union but not here.
 * makeSampleLevel() covers every entity kind and every trigger action — the
 * S2.4 coverage test asserts that programmatically.
 */

import { vec2 } from '../../src/core/Vec2';
import type { EntityId } from '../../src/components/EntityId';
import type { BehaviorDef, EntityKind } from '../../src/components/Behavior';
import type { EntityDef } from '../../src/components/Entity';
import type { TriggerDef, TriggerId } from '../../src/components/Trigger';
import { LEVEL_SCHEMA_VERSION, type LevelDefinition } from '../../src/components/Level';

/** Test-local id promotion. Production ids are minted only by the validator / spawn counter. */
export function asEntityId(raw: string): EntityId {
  return raw as EntityId;
}

export function asTriggerId(raw: string): TriggerId {
  return raw as TriggerId;
}

export const SAMPLE_BEHAVIORS: Readonly<Record<EntityKind, BehaviorDef>> = {
  movingPlatform: { kind: 'movingPlatform', waypoints: [vec2(0, 0), vec2(4, 0)], speed: 2, mode: 'looping' },
  collapsingFloor: { kind: 'collapsingFloor', collapseDelaySeconds: 0.25 },
  iceSurface: { kind: 'iceSurface' },
  spike: { kind: 'spike' },
  laser: { kind: 'laser', periodSeconds: 2, onFractionOfPeriod: 0.5, phaseSeconds: 0.5 },
  movingHazard: { kind: 'movingHazard', waypoints: [vec2(0, 0), vec2(0, 3)], speed: 1.5, mode: 'linear' },
  pressurePlate: { kind: 'pressurePlate' },
  proximityZone: { kind: 'proximityZone' },
  door: { kind: 'door', initiallyOpen: false },
  spring: { kind: 'spring', launchVelocity: vec2(0, -12) },
  gravityZone: { kind: 'gravityZone', gravityScale: -1 },
  conveyor: { kind: 'conveyor', surfaceVelocityX: 3 },
};

function sampleEntity(kind: EntityKind, x: number, y: number): EntityDef {
  return {
    id: asEntityId(`e-${kind}`),
    transform: { position: vec2(x, y), facing: 1 },
    collider: { halfExtents: vec2(0.5, 0.5), offset: vec2(0, 0) },
    behavior: SAMPLE_BEHAVIORS[kind],
  };
}

/**
 * A structurally valid level exercising every entity kind and every trigger
 * action, on a 12×8 grid with a solid floor and walls. Positions sit inside
 * the tilemap's world bounds (tileSize 1 → x ∈ (0,12), y ∈ (0,8)).
 */
export function makeSampleLevel(): LevelDefinition {
  const width = 12;
  const height = 8;
  const tiles: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const isBorder = row === 0 || row === height - 1 || col === 0 || col === width - 1;
      tiles.push(isBorder ? 1 : 0);
    }
  }

  const entities: EntityDef[] = [
    sampleEntity('movingPlatform', 3, 5),
    sampleEntity('collapsingFloor', 5, 6),
    sampleEntity('iceSurface', 7, 6),
    sampleEntity('spike', 9, 6),
    sampleEntity('laser', 2, 3),
    sampleEntity('movingHazard', 4, 3),
    sampleEntity('pressurePlate', 6, 6),
    sampleEntity('proximityZone', 8, 3),
    sampleEntity('door', 10, 5),
    sampleEntity('spring', 3, 6),
    sampleEntity('gravityZone', 5, 2),
    sampleEntity('conveyor', 7, 2),
  ];

  const triggers: TriggerDef[] = [
    { id: asTriggerId('t-open'), source: asEntityId('e-pressurePlate'), targets: [asEntityId('e-door')], action: 'openDoor', once: false },
    { id: asTriggerId('t-close'), source: asEntityId('e-proximityZone'), targets: [asEntityId('e-door')], action: 'closeDoor', once: false },
    { id: asTriggerId('t-toggle'), source: asEntityId('e-pressurePlate'), targets: [asEntityId('e-door')], action: 'toggleDoor', once: true },
    { id: asTriggerId('t-collapse'), source: asEntityId('e-proximityZone'), targets: [asEntityId('e-collapsingFloor')], action: 'collapseFloor', once: true },
    { id: asTriggerId('t-activate'), source: asEntityId('e-pressurePlate'), targets: [asEntityId('e-movingPlatform')], action: 'activatePlatform', once: false },
  ];

  return {
    schemaVersion: LEVEL_SCHEMA_VERSION,
    levelId: 'fixture-all-kinds',
    title: 'Schema fixture: every kind and action',
    gdos: {
      targetKgNode: 'kg:test/fixture',
      difficultyVectors: {
        executionPrecision: 0.4,
        readingComplexity: 0.3,
        timingStrictness: 0.5,
        routeAmbiguity: 0.2,
      },
      emotionalBudgetCurve: [
        { at: 0, curiosity: 92, confidence: 95, surprise: 10, mastery: 20 },
        { at: 0.5, curiosity: 90, confidence: 70, surprise: 96, mastery: 50 },
        { at: 1, curiosity: 85, confidence: 90, surprise: 40, mastery: 96 },
      ],
      creatorMomentFrame: { tickWindow: [120, 180], description: 'The floor the obvious route depends on collapses.' },
    },
    tilemap: { width, height, tileSize: 1, tiles },
    entities,
    triggers,
    constraints: {
      spawn: vec2(1.5, 6),
      goal: { position: vec2(10.5, 2), halfExtents: vec2(0.5, 0.5) },
      parTimeTiersSeconds: [30, 20, 12, 8, 5],
    },
  };
}
