/**
 * AabbDef — axis-aligned bounding box collision volume, as pure data.
 *
 * GDOS alignment: Section 13 (encapsulated geometry), Section 16
 * (deterministic physics; hazards trigger defeat on boundary intersection).
 *
 * The box is described by half-extents around the entity's transform
 * position plus a local offset. Collision *logic* (overlap tests, resolution)
 * belongs to the P3 physics system in src/systems/ — this record only
 * carries the geometry.
 *
 * Structural constraints enforced by the schema validator (S2.3), not here:
 * half-extents must be strictly positive and finite.
 *
 * This file is pure data declarations — no function bodies (directory
 * invariant: src/components/ is logic-free).
 */

import type { Vec2 } from '../core/Vec2';

export interface AabbDef {
  /** Half-width (x) and half-height (y) in world units. Strictly positive. */
  readonly halfExtents: Vec2;
  /** Box center offset from the entity's transform position, in world units. */
  readonly offset: Vec2;
}
