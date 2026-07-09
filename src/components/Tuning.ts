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
  /**
   * Horizontal run speed, world units per second. Applied INSTANTLY by the
   * player controller (REQ-150: instant accel/decel — velocity is set, not
   * ramped); frictionless-ice ramping (S3.6) is the only exception.
   */
  readonly runSpeed: number;
  /**
   * Upward speed imparted by THE jump, world units per second (applied as
   * -y). The impulse fires exactly once per life (REQ-004/010 — the axiom;
   * the lock machine is engine logic, never data, dm-0011).
   */
  readonly jumpSpeed: number;
  /**
   * Ticks between the grounded jump press and the impulse (REQ-150
   * anticipation frames). 0 = instant. The press commits: the impulse fires
   * after the countdown even if support is lost meanwhile (dm-0020).
   */
  readonly anticipationTicks: number;
  /**
   * Horizontal acceleration while standing on frictionless ice, world units
   * per second². Ice is momentum-preserving: input accelerates toward
   * ±runSpeed at this rate and releasing input does NOT decelerate (the one
   * surface that ramps instead of instant-set — REQ-151, S3.6). Positive.
   */
  readonly iceAccel: number;
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
  runSpeed: 8,
  jumpSpeed: 18,
  anticipationTicks: 4,
  iceAccel: 24,
  maxFallSpeed: 30,
  playerHalfExtents: { x: 0.35, y: 0.45 },
};
