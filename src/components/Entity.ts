/**
 * EntityDef — one authored level entity as pure data: identity, placement,
 * collision volume, and its behavior payload.
 *
 * GDOS alignment: Section 13 (entities statically defined within the level
 * payload), Section 16 (modular decoupled components).
 *
 * Note there is deliberately NO separate `kind` field: the discriminant is
 * `behavior.kind`, single-sourced, so an id/kind/payload mismatch is
 * unrepresentable rather than a validator rule. (Refines the P2 plan's
 * design summary point 3, which sketched a redundant `kind` field.)
 *
 * This file is pure data declarations — no function bodies (directory
 * invariant: src/components/ is logic-free).
 */

import type { EntityId } from './EntityId';
import type { TransformDef } from './Transform';
import type { AabbDef } from './Collider';
import type { BehaviorDef } from './Behavior';

export interface EntityDef {
  readonly id: EntityId;
  readonly transform: TransformDef;
  readonly collider: AabbDef;
  readonly behavior: BehaviorDef;
}
