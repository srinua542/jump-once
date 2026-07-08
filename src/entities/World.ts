/**
 * World — Jump Once's concrete TWorld: the runtime world state and the
 * deterministic instantiation of a validated LevelDefinition into it.
 *
 * GDOS alignment: Section 13 (core engine reads external configuration —
 * this is where parsed level data becomes engine-consumable state; the
 * runtime-consumption evidence for REQ-120/121, dm-0012).
 *
 * Invariants:
 *  - The LevelDefinition inside WorldState is deep-frozen and REFERENCE-
 *    SHARED by every snapshot — never copied per frame (dm-0009). Systems
 *    read it; nothing may replace or mutate it for the level's lifetime.
 *    instantiateWorld() freezes the definition it embeds; deep-freezing is
 *    idempotent, so re-instantiating the same definition is safe.
 *  - instantiateWorld() is a pure function of its input: same definition →
 *    deep-equal WorldState, every time. Entity runtime records spawn at
 *    their authored transform positions with zero velocity.
 *  - Runtime-spawned entities (P3+) mint ids as
 *    `${RUNTIME_SPAWN_ID_PREFIX}${nextSpawnSerial}` and increment the
 *    counter IN state, so spawning is a pure, replayable transition
 *    (P2 plan point 2). The validator guarantees authored ids never
 *    collide with that namespace.
 *  - P3 will extend EntityState/WorldState with physics fields (grounded,
 *    jump-lock machine, etc.) — that is expected evolution, recorded in the
 *    PKG when it happens; the level/entities/player/serial split is stable.
 */

import { deepFreeze } from '../core/StateManager';
import { createClock } from '../core/Clock';
import { createRng } from '../core/Rng';
import { NEUTRAL_INPUT, type GameState } from '../core/State';
import { ZERO, type Vec2 } from '../core/Vec2';
import type { EntityId } from '../components/EntityId';
import type { LevelDefinition } from '../components/Level';

/** Runtime state of one entity. Authored data stays in world.level; only what changes lives here. */
export interface EntityState {
  readonly id: EntityId;
  /** Current center position in world units. Spawns at the authored transform position. */
  readonly position: Vec2;
  /** Current velocity in world units per second. Spawns at zero. */
  readonly velocity: Vec2;
}

/** Jump Once's concrete world payload for GameState<TWorld>. */
export interface WorldState {
  /** The validated, deep-frozen level definition — reference-shared, never copied (dm-0009). */
  readonly level: LevelDefinition;
  readonly entities: readonly EntityState[];
  /** Player center position in world units. Spawns at constraints.spawn. */
  readonly playerPosition: Vec2;
  /** Player velocity in world units per second. Spawns at zero. */
  readonly playerVelocity: Vec2;
  /** Deterministic counter for runtime-spawned entity ids (`rt:<serial>`). */
  readonly nextSpawnSerial: number;
}

/** Jump Once's concrete GameState. */
export type JumpOnceState = GameState<WorldState>;

/**
 * Deterministically instantiate a validated level into its initial runtime
 * world. Freezes the definition it embeds (idempotent) so the
 * reference-shared invariant is self-enforcing from the first snapshot.
 */
export function instantiateWorld(def: LevelDefinition): WorldState {
  const level = deepFreeze(def);
  const entities: EntityState[] = [];
  for (const e of level.entities) {
    entities.push({ id: e.id, position: e.transform.position, velocity: ZERO });
  }
  return {
    level,
    entities,
    playerPosition: level.constraints.spawn,
    playerVelocity: ZERO,
    nextSpawnSerial: 0,
  };
}

/**
 * Compose the full initial GameState for a level run: tick 0, fresh clock,
 * seeded RNG, neutral input, instantiated world. The (seed, input-tape) →
 * state replay guarantee starts here.
 */
export function createInitialState(def: LevelDefinition, seed: number): JumpOnceState {
  return {
    tick: 0,
    clock: createClock(),
    rng: createRng(seed),
    input: NEUTRAL_INPUT,
    world: instantiateWorld(def),
  };
}
