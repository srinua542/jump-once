/**
 * Serialize — the canonical JSON serializer for LevelDefinition.
 *
 * GDOS alignment: Section 13 (every stage fully serialized).
 *
 * Canonical form (dm-0010, dm-0014; normative doc: docs/level_schema.md):
 *  - Fixed key order at every level of the tree, established by the explicit
 *    per-record canonicalizers below (JSON.stringify preserves insertion
 *    order). Changing any order is a canonical-form change and must fail the
 *    committed golden-hash test (S2.4) and be ledgered.
 *  - Two-space indentation, no trailing newline.
 *  - Numbers use the engine's shortest round-trip representation; finite IEEE
 *    doubles therefore round-trip exactly. `-0` is normalized to `0` here
 *    defensively (the validator also normalizes at parse), so the canonical
 *    form never contains a negative zero.
 *  - serialize(parse(serialize(v))) === serialize(v) byte-identically; byte
 *    identity with a hand-authored source file is deliberately NOT promised.
 *
 * This lives in src/schema/ (dm-0013): definition-time I/O, never called from
 * the engine loop, never imports from src/systems/.
 */

import type { Vec2 } from '../core/Vec2';
import type { BehaviorDef } from '../components/Behavior';
import type { EntityDef } from '../components/Entity';
import type { EmotionalKeyframe, GdosMetadata } from '../components/Gdos';
import { DIFFICULTY_AXES } from '../components/Gdos';
import type { ConstraintsDef, GoalDef, LevelDefinition } from '../components/Level';
import type { TilemapDef } from '../components/Tilemap';
import type { TriggerDef } from '../components/Trigger';

/** Normalize -0 to 0 so the canonical form never carries a sign JSON would drop anyway. */
function num(n: number): number {
  return n === 0 ? 0 : n;
}

function xy(v: Vec2): Record<string, number> {
  return { x: num(v.x), y: num(v.y) };
}

function canonicalBehavior(b: BehaviorDef): Record<string, unknown> {
  switch (b.kind) {
    case 'movingPlatform':
      return { kind: b.kind, waypoints: b.waypoints.map(xy), speed: num(b.speed), mode: b.mode };
    case 'collapsingFloor':
      return { kind: b.kind, collapseDelaySeconds: num(b.collapseDelaySeconds) };
    case 'iceSurface':
      return { kind: b.kind };
    case 'spike':
      return { kind: b.kind };
    case 'laser':
      return {
        kind: b.kind,
        periodSeconds: num(b.periodSeconds),
        onFractionOfPeriod: num(b.onFractionOfPeriod),
        phaseSeconds: num(b.phaseSeconds),
      };
    case 'movingHazard':
      return { kind: b.kind, waypoints: b.waypoints.map(xy), speed: num(b.speed), mode: b.mode };
    case 'pressurePlate':
      return { kind: b.kind };
    case 'proximityZone':
      return { kind: b.kind };
    case 'door':
      return { kind: b.kind, initiallyOpen: b.initiallyOpen };
    case 'spring':
      return { kind: b.kind, launchVelocity: xy(b.launchVelocity) };
    case 'gravityZone':
      return { kind: b.kind, gravityScale: num(b.gravityScale) };
    case 'conveyor':
      return { kind: b.kind, surfaceVelocityX: num(b.surfaceVelocityX) };
    default: {
      const exhaustive: never = b;
      throw new Error(`unreachable behavior kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function canonicalEntity(e: EntityDef): Record<string, unknown> {
  return {
    id: e.id,
    transform: { position: xy(e.transform.position), facing: e.transform.facing },
    collider: { halfExtents: xy(e.collider.halfExtents), offset: xy(e.collider.offset) },
    behavior: canonicalBehavior(e.behavior),
  };
}

function canonicalKeyframe(k: EmotionalKeyframe): Record<string, number> {
  return {
    at: num(k.at),
    curiosity: num(k.curiosity),
    confidence: num(k.confidence),
    surprise: num(k.surprise),
    mastery: num(k.mastery),
  };
}

function canonicalGdos(g: GdosMetadata): Record<string, unknown> {
  const vectors: Record<string, number> = {};
  for (const axis of DIFFICULTY_AXES) vectors[axis] = num(g.difficultyVectors[axis]);
  return {
    targetKgNode: g.targetKgNode,
    difficultyVectors: vectors,
    emotionalBudgetCurve: g.emotionalBudgetCurve.map(canonicalKeyframe),
    creatorMomentFrame: {
      tickWindow: [num(g.creatorMomentFrame.tickWindow[0]), num(g.creatorMomentFrame.tickWindow[1])],
      description: g.creatorMomentFrame.description,
    },
  };
}

function canonicalTilemap(t: TilemapDef): Record<string, unknown> {
  return { width: num(t.width), height: num(t.height), tileSize: num(t.tileSize), tiles: t.tiles.map(num) };
}

function canonicalTrigger(t: TriggerDef): Record<string, unknown> {
  return { id: t.id, source: t.source, targets: [...t.targets], action: t.action, once: t.once };
}

function canonicalGoal(g: GoalDef): Record<string, unknown> {
  return { position: xy(g.position), halfExtents: xy(g.halfExtents) };
}

function canonicalConstraints(c: ConstraintsDef): Record<string, unknown> {
  return { spawn: xy(c.spawn), goal: canonicalGoal(c.goal), parTimeTiersSeconds: c.parTimeTiersSeconds.map(num) };
}

/** Serialize a LevelDefinition to its canonical JSON text. */
export function serializeLevel(def: LevelDefinition): string {
  const canonical = {
    schemaVersion: def.schemaVersion,
    levelId: def.levelId,
    title: def.title,
    gdos: canonicalGdos(def.gdos),
    tilemap: canonicalTilemap(def.tilemap),
    entities: def.entities.map(canonicalEntity),
    triggers: def.triggers.map(canonicalTrigger),
    constraints: canonicalConstraints(def.constraints),
  };
  return JSON.stringify(canonical, null, 2);
}
