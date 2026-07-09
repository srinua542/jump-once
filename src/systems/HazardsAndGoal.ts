/**
 * HazardsAndGoal — run-outcome detection: the run lifecycle's exit system.
 * LAST in the canonical pipeline, so it judges the player's POST-physics
 * position each tick.
 *
 * GDOS alignment: Section 16 (hazards defeat on intersection, REQ-152),
 * Section 13 (goal region is level data, constraints.goal).
 *
 * Scope:
 *  - LETHAL HAZARDS (S3.7): spike (static) and movingHazard (moved by
 *    EntityKinematics) are always lethal; a laser is lethal only while its
 *    beam is ON — a pure function of the tick (dm-0016). Intersection is a
 *    SWEPT test: the player's centre segment (playerPrevPosition →
 *    playerPosition) against the Minkowski-enlarged hazard AABB (also grown
 *    by the hazard's own per-tick motion), so a fast player cannot skip a
 *    thin hazard (dm-0017 spirit). Any lethal hit → 'defeated'.
 *  - GOAL (S3.4): strict AABB overlap (flush is NOT overlap) between the
 *    player and constraints.goal → 'completed' (freezes the world).
 *  - FALL-OUT (S3.4): player entirely below the tilemap's bottom world edge
 *    → 'defeated'. Lifecycle reloads next tick.
 *
 * Outcome precedence: an already-decided world is never re-judged; within a
 * tick, defeat (hazard or fall-out) is checked before the goal — dying on
 * the goal line counts as death (conservative until GDOS rules otherwise).
 * Pure; returns the same snapshot when nothing changes.
 */

import { FIXED_STEP_SECONDS } from '../core/Clock';
import type { GameState } from '../core/State';
import { vec2, type Vec2 } from '../core/Vec2';
import { TUNING } from '../components/Tuning';
import { COLLISION_CLASS_BY_KIND } from '../components/CollisionClass';
import type { LaserDef } from '../components/Behavior';
import type { WorldState } from '../entities/World';
import type { System } from './System';

/** Whether a laser's beam is lethal at the given elapsed seconds (pure fn of tick). */
function laserOn(def: LaserDef, elapsedSeconds: number): boolean {
  const phase = (((elapsedSeconds + def.phaseSeconds) % def.periodSeconds) + def.periodSeconds) % def.periodSeconds;
  return phase < def.onFractionOfPeriod * def.periodSeconds;
}

/**
 * Whether the segment a→b (the player centre's sweep) intersects an
 * axis-aligned box centred at `c` with half-extents `h`. Slab method,
 * arithmetic only (dm-0017). Endpoints inside count as intersecting.
 */
function segmentIntersectsAabb(a: Vec2, b: Vec2, c: Vec2, h: Vec2): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let tMin = 0;
  let tMax = 1;
  // X slab.
  if (dx === 0) {
    if (a.x < c.x - h.x || a.x > c.x + h.x) return false;
  } else {
    let t1 = (c.x - h.x - a.x) / dx;
    let t2 = (c.x + h.x - a.x) / dx;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  // Y slab.
  if (dy === 0) {
    if (a.y < c.y - h.y || a.y > c.y + h.y) return false;
  } else {
    let t1 = (c.y - h.y - a.y) / dy;
    let t2 = (c.y + h.y - a.y) / dy;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
}

/** True if the player's swept segment hits any currently-lethal hazard. */
function hitsLethalHazard(world: WorldState, tick: number): boolean {
  const a = world.playerPrevPosition;
  const b = world.playerPosition;
  const playerHalf = TUNING.playerHalfExtents;
  const dt = FIXED_STEP_SECONDS;
  const elapsedSeconds = (tick - world.spawnTick) * dt;

  for (let i = 0; i < world.level.entities.length; i++) {
    const def = world.level.entities[i];
    if (COLLISION_CLASS_BY_KIND[def.behavior.kind] !== 'lethal') continue;
    if (def.behavior.kind === 'laser' && !laserOn(def.behavior, elapsedSeconds)) continue;

    const st = world.entities[i];
    const c = vec2(st.position.x + def.collider.offset.x, st.position.y + def.collider.offset.y);
    // Minkowski sum (hazard + player), grown by the hazard's own per-tick motion.
    const h = vec2(
      def.collider.halfExtents.x + playerHalf.x + Math.abs(st.velocity.x) * dt,
      def.collider.halfExtents.y + playerHalf.y + Math.abs(st.velocity.y) * dt,
    );
    if (segmentIntersectsAabb(a, b, c, h)) return true;
  }
  return false;
}

/** The run-outcome System (lethal hazards, goal, fall-out). */
export const hazardsAndGoalSystem: System<WorldState> = {
  id: 'hazardsAndGoal',
  step(state: GameState<WorldState>): GameState<WorldState> {
    const world = state.world;
    if (world.runState !== 'playing') return state;

    const p = world.playerPosition;
    const half = TUNING.playerHalfExtents;

    // Lethal hazard (swept) → defeat.
    if (hitsLethalHazard(world, state.tick)) {
      return { ...state, world: { ...world, runState: 'defeated' } };
    }

    // Fall-out defeat: player entirely below the world's bottom edge.
    const worldBottom = world.level.tilemap.height * world.level.tilemap.tileSize;
    if (p.y - half.y > worldBottom) {
      return { ...state, world: { ...world, runState: 'defeated' } };
    }

    // Goal: strict AABB overlap with constraints.goal.
    const goal = world.level.constraints.goal;
    const overlapX = Math.abs(p.x - goal.position.x) < half.x + goal.halfExtents.x;
    const overlapY = Math.abs(p.y - goal.position.y) < half.y + goal.halfExtents.y;
    if (overlapX && overlapY) {
      return { ...state, world: { ...world, runState: 'completed' } };
    }

    return state;
  },
};
