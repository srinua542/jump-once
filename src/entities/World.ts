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
 *  - P3 extends EntityState/WorldState with physics fields as slices land
 *    (S3.1 added playerGrounded; jump-lock machine and entity activation
 *    follow in later P3 slices) — expected evolution, PKG-recorded per
 *    change; the level/entities/player/serial split is stable.
 *  - world.entities is INDEX-ALIGNED with level.entities: entities[i] is the
 *    runtime record of level.entities[i]. instantiateWorld establishes the
 *    alignment; runtime-spawned entities (rt: namespace) append after the
 *    authored range, so the alignment holds for indices < level.entities
 *    .length. Systems rely on this for def↔state pairing (asserted in tests).
 */

import { deepFreeze } from '../core/StateManager';
import { createClock } from '../core/Clock';
import { createRng } from '../core/Rng';
import { NEUTRAL_INPUT, type GameState } from '../core/State';
import { ZERO, type Vec2 } from '../core/Vec2';
import type { EntityId } from '../components/EntityId';
import type { LevelDefinition } from '../components/Level';

/**
 * The run lifecycle state (S3.4). 'defeated' lasts at most one tick: the
 * lifecycle system (first in the pipeline) consumes it and reloads.
 * 'completed' freezes the world (control/physics no-op) until reset.
 */
export type RunState = 'playing' | 'defeated' | 'completed';

/** Phases of the single-jump lock machine (S3.5 — the axiom, REQ-004/010/011). */
export type JumpPhase = 'available' | 'anticipating' | 'spent';

/**
 * The single-jump lock (S3.5). Lives in WorldState so a scene reload —
 * pure re-instantiation — refreshes it BY CONSTRUCTION (dm-0018): there is
 * no reset code to forget. The machine only ever moves forward within a
 * life: available → anticipating → spent.
 */
export interface JumpLockState {
  readonly phase: JumpPhase;
  /** Ticks until the impulse fires; meaningful only while 'anticipating', else 0. */
  readonly ticksUntilImpulse: number;
}

const JUMP_AVAILABLE: JumpLockState = { phase: 'available', ticksUntilImpulse: 0 };

/** Runtime state of one entity. Authored data stays in world.level; only what changes lives here. */
export interface EntityState {
  readonly id: EntityId;
  /** Current center position in world units. Spawns at the authored transform position. */
  readonly position: Vec2;
  /**
   * Current velocity in world units per second. Spawns at zero. For movers
   * this is the DERIVED per-tick delta / dt written by EntityKinematics
   * (dm-0016: derive, don't integrate) — used for platform carry, never an
   * integrated truth.
   */
  readonly velocity: Vec2;
  /**
   * Activation game-tick for a `triggered` mover (S3.6): `null` = dormant
   * (sits at waypoint[0]); a tick = the mover's path elapses from there.
   * Set by the S3.7 `activatePlatform` trigger. Unused by auto modes
   * (linear/looping derive elapsed from world.spawnTick).
   */
  readonly activationTick: number | null;
  /**
   * The game-tick a collapsing floor was first stood on (S3.6): `null` until
   * contact; then it collapses `collapseDelaySeconds` later. Non-collapsing
   * entities keep `null` forever.
   */
  readonly firstContactTick: number | null;
  /**
   * True once a collapsing floor has collapsed (derived each tick by
   * EntityKinematics from firstContactTick + delay). A collapsed floor is
   * non-solid and stays collapsed for the life. Always false for other kinds.
   */
  readonly collapsed: boolean;
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
  /**
   * True when the last physics step ended with the player resting on a
   * downward support (solid tile top or solid entity top). Spawns false;
   * becomes true on the first supported step (S3.1).
   */
  readonly playerGrounded: boolean;
  /**
   * Index into entities of the solid entity the player is currently grounded
   * on, or -1 for a tile / no support (S3.6). Drives platform carry, the ice
   * surface branch, and collapsing-floor contact. Meaningful only when
   * playerGrounded is true; -1 otherwise.
   */
  readonly playerGroundEntity: number;
  /** The single-jump lock (S3.5). Fresh worlds start 'available'. */
  readonly jumpLock: JumpLockState;
  /** Run lifecycle phase (S3.4). Fresh worlds start 'playing'. */
  readonly runState: RunState;
  /** Number of scene reloads performed for this level so far. Fresh worlds start 0. */
  readonly attemptCount: number;
  /**
   * The GameState tick at which this life began (0 for the initial world;
   * the reload tick afterwards). Elapsed life time is DERIVED as
   * tick - spawnTick (dm-0016: derive, don't duplicate).
   */
  readonly spawnTick: number;
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
    entities.push({
      id: e.id,
      position: e.transform.position,
      velocity: ZERO,
      activationTick: null,
      firstContactTick: null,
      collapsed: false,
    });
  }
  return {
    level,
    entities,
    playerPosition: level.constraints.spawn,
    playerVelocity: ZERO,
    playerGrounded: false,
    playerGroundEntity: -1,
    jumpLock: JUMP_AVAILABLE,
    runState: 'playing',
    attemptCount: 0,
    spawnTick: 0,
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
