/**
 * LevelDefinition — the serialized level payload root (PRD §13 Level
 * Definition Schema): tilemap, entities, constraints, interconnected
 * triggers, and the GDOS metadata block.
 *
 * GDOS alignment: Section 13 (every stage fully serialized), Section 2
 * (REQ-014: the structural puzzle IS the level layout itself — this record
 * is that layout, as data).
 *
 * Invariants:
 *  - schemaVersion is hard-checked by the loader; any value other than
 *    LEVEL_SCHEMA_VERSION is rejected outright (dm-0010).
 *  - The parsed definition is deep-frozen once and reference-shared by every
 *    snapshot — never copied per frame (dm-0009).
 *  - The AXIOM BOUNDARY (dm-0011): constraints carry per-level values
 *    (spawn, goal, par tiers). There is deliberately NO maxJumps field and
 *    never will be — the single-jump rule is an engine invariant (REQ-004),
 *    not data.
 *  - Field semantics, coordinate convention, and canonical serialization
 *    order are documented normatively in docs/level_schema.md.
 *
 * This file is pure data declarations — no function bodies (directory
 * invariant: src/components/ is logic-free).
 */

import type { Vec2 } from '../core/Vec2';
import type { EntityDef } from './Entity';
import type { GdosMetadata } from './Gdos';
import type { TilemapDef } from './Tilemap';
import type { TriggerDef } from './Trigger';

/** The one schema version this codebase reads and writes. Bumps are deliberate, ledgered events (dm-0010). */
export const LEVEL_SCHEMA_VERSION = 1;

/** The goal region: reaching it completes the level. */
export interface GoalDef {
  /** Region center in world units. */
  readonly position: Vec2;
  /** Region half-extents in world units. Strictly positive. */
  readonly halfExtents: Vec2;
}

/**
 * Per-level constraint values. Values only — never axioms (dm-0011):
 * the single-jump rule is engine-invariant and has no field here.
 */
export interface ConstraintsDef {
  /** Player spawn position in world units; must lie inside the tilemap bounds. */
  readonly spawn: Vec2;
  readonly goal: GoalDef;
  /**
   * Completion-time tiers in seconds, strictly decreasing (casual → optimal).
   * Feeds P4's optimization-window routing (REQ-101); non-empty.
   */
  readonly parTimeTiersSeconds: readonly number[];
}

export interface LevelDefinition {
  /** Must equal LEVEL_SCHEMA_VERSION; anything else is rejected at parse (dm-0010). */
  readonly schemaVersion: number;
  /** Stable level identity, unique across the campaign. Non-empty. */
  readonly levelId: string;
  /** Human-readable title for the editor, KG, and diagnostics. Non-empty. */
  readonly title: string;
  /** GDOS design-intelligence block (structural in P2, semantic in P5 — dm-0012). */
  readonly gdos: GdosMetadata;
  /** Permanently-static geometry (dm-0009). */
  readonly tilemap: TilemapDef;
  /** Authored entities; ids unique. Array order is preserved by serialization but carries no gameplay meaning. */
  readonly entities: readonly EntityDef[];
  /** Interconnection wiring; ids unique, references validated (dm-0015). */
  readonly triggers: readonly TriggerDef[];
  readonly constraints: ConstraintsDef;
}
