/**
 * TransformDef — spatial placement of an entity.
 *
 * GDOS alignment: Section 13 (encapsulated geometry — spatial layout is raw
 * data injection, never hardcoded), Section 16 (entities as pure data).
 *
 * Position is in world units. The coordinate convention (axis directions,
 * origin, tile-to-world scale) is fixed once at the schema layer and
 * documented in docs/level_schema.md (S2.2) — this record deliberately does
 * not re-state it, so there is exactly one place the convention lives.
 *
 * This file is pure data declarations — no function bodies (directory
 * invariant: src/components/ is logic-free).
 */

import type { Vec2 } from '../core/Vec2';

export interface TransformDef {
  /** Center position in world units. */
  readonly position: Vec2;
  /** Horizontal facing: +1 (right) or -1 (left). Render/behavior hint; no physics meaning. */
  readonly facing: 1 | -1;
}
