/**
 * EntityKinematics — resolves every tick-DERIVED entity runtime value once
 * per step (S3.6). SECOND in the canonical pipeline (after lifecycle, before
 * playerControl), so downstream systems read plain resolved state, never a
 * clock.
 *
 * GDOS alignment: Section 16 (environmental elements — moving platforms,
 * collapsing floors), Section 13 (all motion authored as data: waypoints,
 * speeds, delays).
 *
 * Technique (dm-0016 — closed-form, never incremental):
 *  - A mover's position is a pure function of elapsed ticks: walk the
 *    entity's local-space waypoint polyline by arc length. Zero accumulation
 *    error, exact reconstruction at any tick, reload-trivial.
 *  - Modes: `looping` wraps the closed circuit; `linear` and (activated)
 *    `triggered` ping-pong. A `triggered` mover with no activationTick is
 *    dormant at waypoint[0]. Auto modes elapse from world.spawnTick (so a
 *    scene reload restarts them for free); triggered movers elapse from
 *    their activationTick (set by the S3.7 trigger).
 *  - velocity is the DERIVED per-tick delta (pos(t) − pos(t−1)) / dt — used
 *    by platform carry, not an integrated truth.
 *  - Collapsing floors: firstContactTick is latched from the PREVIOUS tick's
 *    grounding (playerGroundEntity), then `collapsed` is derived as
 *    elapsed ≥ collapseDelaySeconds. Collapse is one-way within a life.
 *
 * Math whitelist (dm-0017): arc-length arithmetic only — no trig, no pow.
 *
 * Pure: returns a new state (or the same snapshot when nothing is dynamic),
 * mutates nothing.
 */

import { FIXED_STEP_SECONDS } from '../core/Clock';
import type { GameState } from '../core/State';
import { add, sub, scale, ZERO, type Vec2 } from '../core/Vec2';
import type { MovingPlatformDef, MovingHazardDef } from '../components/Behavior';
import type { EntityState, WorldState } from '../entities/World';
import type { System } from './System';

type MoverDef = MovingPlatformDef | MovingHazardDef;

/** Cumulative segment lengths of the open polyline, plus the total. */
interface PathMetrics {
  /** Per-segment lengths, index i = waypoints[i]→waypoints[i+1]. */
  readonly segments: readonly number[];
  /** Sum of open segments (waypoints[0]→…→waypoints[n-1]). */
  readonly openLength: number;
  /** Length of the closing segment waypoints[n-1]→waypoints[0]. */
  readonly closeLength: number;
}

function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function pathMetrics(waypoints: readonly Vec2[]): PathMetrics {
  const segments: number[] = [];
  let openLength = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const len = dist(waypoints[i], waypoints[i + 1]);
    segments.push(len);
    openLength += len;
  }
  const closeLength = dist(waypoints[waypoints.length - 1], waypoints[0]);
  return { segments, openLength, closeLength };
}

/**
 * Point at arc length `d` (clamped to [0, total]) along the polyline. When
 * `closed`, the wrap segment waypoints[n-1]→waypoints[0] is included.
 */
function pointAtArcLength(waypoints: readonly Vec2[], metrics: PathMetrics, closed: boolean, d: number): Vec2 {
  let remaining = d;
  const lastIndex = waypoints.length - 1;
  for (let i = 0; i < metrics.segments.length; i++) {
    const len = metrics.segments[i];
    if (remaining <= len || (i === metrics.segments.length - 1 && !closed)) {
      const t = len === 0 ? 0 : remaining / len;
      return add(waypoints[i], scale(sub(waypoints[i + 1], waypoints[i]), t));
    }
    remaining -= len;
  }
  if (closed) {
    const len = metrics.closeLength;
    const t = len === 0 ? 0 : Math.min(remaining / len, 1);
    return add(waypoints[lastIndex], scale(sub(waypoints[0], waypoints[lastIndex]), t));
  }
  return waypoints[lastIndex];
}

/**
 * Local-space offset of a mover at elapsed tick count `elapsedTicks`
 * (≥ 0). Returns waypoints[0] for a degenerate (zero-length) path.
 */
function moverOffset(def: MoverDef, metrics: PathMetrics, elapsedTicks: number): Vec2 {
  const waypoints = def.waypoints;
  const traveled = def.speed * elapsedTicks * FIXED_STEP_SECONDS;
  const looping = def.mode === 'looping';

  if (looping) {
    const total = metrics.openLength + metrics.closeLength;
    if (total === 0) return waypoints[0];
    const d = traveled % total;
    return pointAtArcLength(waypoints, metrics, true, d);
  }

  // linear / triggered → ping-pong over 2 × openLength.
  const openLength = metrics.openLength;
  if (openLength === 0) return waypoints[0];
  const period = 2 * openLength;
  const phase = traveled % period;
  const d = phase <= openLength ? phase : period - phase;
  return pointAtArcLength(waypoints, metrics, false, d);
}

function isMover(kind: string): kind is 'movingPlatform' | 'movingHazard' {
  return kind === 'movingPlatform' || kind === 'movingHazard';
}

/**
 * Elapsed tick count for a mover, or null if dormant (a triggered mover that
 * has not been activated). Auto modes elapse from world spawn.
 */
function moverElapsed(def: MoverDef, prior: EntityState, tick: number, spawnTick: number): number | null {
  if (def.mode === 'triggered') {
    return prior.activationTick === null ? null : tick - prior.activationTick;
  }
  return tick - spawnTick;
}

/** Resolve one entity's runtime state for the current tick. Returns the prior record if nothing changed. */
function resolveEntity(base: Vec2, def: MoverDef | null, world: WorldState, index: number, tick: number): EntityState {
  const prior = world.entities[index];
  const behavior = world.level.entities[index].behavior;

  // ── Movers: closed-form position + derived carry velocity ──
  if (def !== null) {
    const metrics = pathMetrics(def.waypoints);
    const elapsed = moverElapsed(def, prior, tick, world.spawnTick);
    if (elapsed === null) {
      // Dormant: pinned at waypoint[0], zero velocity.
      const rest = add(base, def.waypoints[0]);
      if (rest.x === prior.position.x && rest.y === prior.position.y && prior.velocity === ZERO) return prior;
      return { ...prior, position: rest, velocity: ZERO };
    }
    const position = add(base, moverOffset(def, metrics, elapsed));
    const prevElapsed = elapsed - 1;
    const prevPos = prevElapsed < 0 ? position : add(base, moverOffset(def, metrics, prevElapsed));
    const velocity = scale(sub(position, prevPos), 1 / FIXED_STEP_SECONDS);
    return { ...prior, position, velocity };
  }

  // ── Collapsing floors: latch first contact, derive collapsed ──
  if (behavior.kind === 'collapsingFloor') {
    let firstContactTick = prior.firstContactTick;
    if (firstContactTick === null && world.playerGrounded && world.playerGroundEntity === index) {
      firstContactTick = tick;
    }
    const collapsed =
      firstContactTick !== null && (tick - firstContactTick) * FIXED_STEP_SECONDS >= behavior.collapseDelaySeconds;
    if (firstContactTick === prior.firstContactTick && collapsed === prior.collapsed) return prior;
    return { ...prior, firstContactTick, collapsed };
  }

  return prior;
}

/** The entity-kinematics System. Resolves movers + collapsing floors for the tick. */
export const entityKinematicsSystem: System<WorldState> = {
  id: 'entityKinematics',
  step(state: GameState<WorldState>): GameState<WorldState> {
    const world = state.world;
    if (world.runState !== 'playing') return state; // frozen outside a live run (S3.4)

    let changed = false;
    const next: EntityState[] = new Array(world.entities.length);
    for (let i = 0; i < world.entities.length; i++) {
      const def = world.level.entities[i];
      const moverDef = isMover(def.behavior.kind) ? (def.behavior as MoverDef) : null;
      const base = def.transform.position;
      const resolved = resolveEntity(base, moverDef, world, i, state.tick);
      next[i] = resolved;
      if (resolved !== world.entities[i]) changed = true;
    }
    if (!changed) return state;
    return { ...state, world: { ...world, entities: next } };
  },
};
