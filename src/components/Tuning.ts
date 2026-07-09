/**
 * Tuning — the campaign-global physics/feel tuning record.
 *
 * GDOS alignment: Section 13 (all mechanical values as structured data
 * payloads), Section 2 (identical physics on every level makes skill
 * transfer real).
 *
 * Invariants (dm-0018):
 *  - This record is the SINGLE normative source of game-feel values. Systems
 *    read it; no gameplay numeral may appear as a literal in src/systems/.
 *  - Values are campaign-global by design — per-level physics would fragment
 *    game feel. If GDOS ever demands per-level overrides, that is a level
 *    schema version bump (dm-0010 path), not an edit here.
 *  - Editing these values invalidates recorded replays and trajectory
 *    goldens; changes are ledgered decisions, not tweaks.
 *  - Units follow the normative coordinate convention (docs/level_schema.md):
 *    y-down, gravity acts +y, distances in world units, time in seconds.
 *    Systems convert seconds to fixed steps via FIXED_STEP_SECONDS (dm-0003).
 *  - Fields are added per slice as they gain a consumer (subtractive
 *    discipline): S3.1 owns gravity/fall-clamp/player extents.
 *
 * This file is pure data declarations — no function bodies (directory
 * invariant: src/components/ is logic-free).
 */

import type { Vec2 } from '../core/Vec2';

export interface TuningDef {
  /** Gravitational acceleration, world units per second², +y (downward). Strictly positive. */
  readonly gravityY: number;
  /** Terminal fall speed: +y velocity is clamped to this, world units per second. Strictly positive. */
  readonly maxFallSpeed: number;
  /**
   * Player AABB half-extents in world units, centered on playerPosition.
   * Narrower/shorter than one tile so the player fits through 1-tile gaps.
   */
  readonly playerHalfExtents: Vec2;
}

/** The one normative tuning record (dm-0018). Deep-frozen by consumers' instantiation path. */
export const TUNING: TuningDef = {
  gravityY: 60,
  maxFallSpeed: 30,
  playerHalfExtents: { x: 0.35, y: 0.45 },
};
