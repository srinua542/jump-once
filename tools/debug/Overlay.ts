/**
 * Overlay — REQ-131 P8 share (part 1): debug-overlay DESCRIPTORS.
 *
 * Design (docs/execution_plan.md §P8, design summary point 3): every export
 * here is a pure function returning plain data (points, rects, enums) — no
 * drawing, no canvas/DOM/WebGL (dm-0065: painting these is P9's presentation
 * share).
 *
 *  - hitboxDescriptors: the player's (TUNING.playerHalfExtents) and every
 *    entity's (def.collider) AABB, centered at their CURRENT runtime
 *    position + the collider's authored offset. Pure data lookup.
 *  - triggerDescriptors: each wiring record's source/target positions
 *    resolved from CURRENT entity positions, plus its action/once flags.
 *    Pure data lookup, no simulation.
 *  - pathDescriptors: a mover's world-space polyline is its OWN AUTHORED
 *    waypoints offset by its base transform position — this is static level
 *    data (encapsulated geometry), not a simulation result, so it needs no
 *    tick-sampling or replay to display. Zero duplication of
 *    EntityKinematics' closed-form math (dm-0016), which resolves WHERE a
 *    mover is on the path, not the path's shape.
 *  - jumpArcDescriptor: a genuine forward PREVIEW — folds the real, already-
 *    verified `playerControlSystem`/`stepPlayerPhysics` (P3) over a LOCAL
 *    copy of the state for `ticks` steps, collecting `playerPosition` each
 *    step. Never calls `StateManager.commit()` — the real session's
 *    authoritative state is never touched, proven by test.
 *  - normalDescriptor / physicsStateDescriptor: read the WorldState fields
 *    that already exist (dm-0009: "only what changes lives here" — WorldState
 *    tracks vertical grounding only). groundNormal is (0,-1) in this y-down
 *    convention iff grounded; otherwise honestly `null` (no wall-contact side
 *    is tracked, so none is invented).
 *
 * tools/ isolation (dm-0066): imports src/systems/PlayerControl and
 * src/systems/PlayerPhysics directly (tools/ — unlike gen/ — touches the live
 * simulation; only src/eval/ and src/gen/ internals are restricted) plus pure
 * src/components/src/entities/src/core types. No eval/, no gen/.
 */

import { add, type Vec2 } from '../../src/core/Vec2';
import { NEUTRAL_INPUT } from '../../src/core/State';
import { TUNING } from '../../src/components/Tuning';
import type { TriggerActionKind } from '../../src/components/Trigger';
import type { JumpOnceState, JumpPhase, RunState, WorldState } from '../../src/entities/World';
import { playerControlSystem } from '../../src/systems/PlayerControl';
import { stepPlayerPhysics } from '../../src/systems/PlayerPhysics';

export interface HitboxDescriptor {
  readonly id: string;
  readonly center: Vec2;
  readonly halfExtents: Vec2;
}

/** The player's and every entity's current AABB, as plain data. */
export function hitboxDescriptors(world: WorldState): readonly HitboxDescriptor[] {
  const out: HitboxDescriptor[] = [{ id: 'player', center: world.playerPosition, halfExtents: TUNING.playerHalfExtents }];
  for (let i = 0; i < world.entities.length; i++) {
    const runtime = world.entities[i];
    const def = world.level.entities[i];
    out.push({ id: runtime.id, center: add(runtime.position, def.collider.offset), halfExtents: def.collider.halfExtents });
  }
  return out;
}

export interface TriggerDescriptor {
  readonly id: string;
  readonly sourcePosition: Vec2 | null;
  readonly targetPositions: readonly Vec2[];
  readonly action: TriggerActionKind;
  readonly once: boolean;
}

/** Each wiring record's current source/target positions, resolved by entity id. */
export function triggerDescriptors(world: WorldState): readonly TriggerDescriptor[] {
  const positionById = new Map<string, Vec2>();
  for (const e of world.entities) positionById.set(e.id, e.position);
  return world.level.triggers.map((t) => ({
    id: t.id,
    sourcePosition: positionById.get(t.source) ?? null,
    targetPositions: t.targets.map((id) => positionById.get(id)).filter((p): p is Vec2 => p !== undefined),
    action: t.action,
    once: t.once,
  }));
}

export interface PathDescriptor {
  readonly id: string;
  /** World-space polyline: the mover's authored waypoints offset by its base transform position. */
  readonly points: readonly Vec2[];
}

/** Every mover's authored path, as world-space points. Static level data — no simulation. */
export function pathDescriptors(world: WorldState): readonly PathDescriptor[] {
  const out: PathDescriptor[] = [];
  for (const def of world.level.entities) {
    if (def.behavior.kind === 'movingPlatform' || def.behavior.kind === 'movingHazard') {
      out.push({ id: def.id, points: def.behavior.waypoints.map((wp) => add(def.transform.position, wp)) });
    }
  }
  return out;
}

export interface JumpArcDescriptor {
  /** playerPosition at each simulated step, starting with the current position. */
  readonly points: readonly Vec2[];
  /** Steps actually simulated (< `ticks` if the run left 'playing' mid-preview). */
  readonly ticksSimulated: number;
}

/**
 * Preview the player's trajectory for up to `ticks` steps with neutral
 * horizontal input (the jump itself is already committed in the jump-lock
 * state being previewed) by folding the real control+physics systems over a
 * LOCAL copy of `state`. Read-only: never commits, never mutates `state`.
 */
export function jumpArcDescriptor(state: JumpOnceState, ticks: number): JumpArcDescriptor {
  let working: JumpOnceState = { ...state, input: NEUTRAL_INPUT };
  const points: Vec2[] = [working.world.playerPosition];
  for (let i = 0; i < ticks; i++) {
    if (working.world.runState !== 'playing') break;
    const afterControl = playerControlSystem.step(working);
    const nextWorld = stepPlayerPhysics(afterControl.world);
    working = { ...afterControl, tick: working.tick + 1, world: nextWorld };
    points.push(working.world.playerPosition);
  }
  return { points, ticksSimulated: points.length - 1 };
}

/** The ground-contact normal in this y-down convention, or null (no contact tracked). */
export function normalDescriptor(world: WorldState): Vec2 | null {
  return world.playerGrounded ? { x: 0, y: -1 } : null;
}

export interface PhysicsStateDescriptor {
  readonly grounded: boolean;
  readonly jumpLockPhase: JumpPhase;
  readonly runState: RunState;
}

/** A snapshot of the physics/lifecycle fields a debug HUD would display. */
export function physicsStateDescriptor(world: WorldState): PhysicsStateDescriptor {
  return { grounded: world.playerGrounded, jumpLockPhase: world.jumpLock.phase, runState: world.runState };
}
