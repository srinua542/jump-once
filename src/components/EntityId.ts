/**
 * EntityId — branded stable identity for level entities.
 *
 * GDOS alignment: Section 13 (Level Definition Schema — interconnected
 * triggers reference entities), Section 16 (modular decoupled components).
 *
 * Invariants (P2 execution plan, design summary point 2):
 *  - Authored ids are human-readable strings unique within a level; the
 *    schema validator (src/schema/, S2.3) is the only place a raw string is
 *    promoted to an EntityId, and it enforces uniqueness and referential
 *    integrity. Array indices are never used as identity — editor inserts
 *    must not silently retarget triggers.
 *  - Runtime-spawned instances draw ids from a deterministic counter inside
 *    WorldState, in the disjoint RUNTIME_SPAWN_ID_PREFIX namespace, so
 *    spawning is a pure, replayable state transition. Authored ids using
 *    this prefix are rejected at validation.
 *
 * This file is pure data declarations — no function bodies (directory
 * invariant: src/components/ is logic-free).
 */

declare const ENTITY_ID_BRAND: unique symbol;

/** Stable entity identity. Constructed only by the schema validator (authored) or the spawn counter (runtime). */
export type EntityId = string & { readonly [ENTITY_ID_BRAND]: true };

/** Namespace prefix reserved for runtime-spawned entity ids (`rt:<serial>`). Forbidden in authored data. */
export const RUNTIME_SPAWN_ID_PREFIX = 'rt:';
