/**
 * HazardsAndGoal — run-outcome detection: the run lifecycle's exit system
 * (S3.4 share). LAST in the canonical pipeline, so it judges the player's
 * POST-physics position each tick.
 *
 * GDOS alignment: Section 16 (hazards defeat on intersection — the lethal
 * share of this system lands with S3.7), Section 13 (goal region is level
 * data, constraints.goal).
 *
 * S3.4 scope (complete logic for both):
 *  - GOAL: strict AABB overlap (flush contact is NOT overlap, the project
 *    convention) between the player and constraints.goal → 'completed'.
 *    Completion freezes the world: control/physics no-op on a non-'playing'
 *    world; only a reset (Lifecycle) leaves it.
 *  - FALL-OUT: the player's top edge passing below the tilemap's bottom
 *    world edge (the only open escape under +y gravity; levels author their
 *    own borders elsewhere) → 'defeated'. Lifecycle reloads next tick.
 *
 * S3.7 adds the hazard lethality checks (spike/laser/movingHazard swept
 * overlap) to this same system — new capability, same outcome contract.
 *
 * Outcome precedence: an already-decided world ('defeated'/'completed') is
 * never re-judged; within a tick, defeat is checked before the goal (dying
 * on the goal line counts as death — conservative until GDOS rules
 * otherwise). Pure; returns the same snapshot when nothing changes.
 */

import type { GameState } from '../core/State';
import { TUNING } from '../components/Tuning';
import type { WorldState } from '../entities/World';
import type { System } from './System';

/** The run-outcome System (goal + fall-out now; hazard lethality at S3.7). */
export const hazardsAndGoalSystem: System<WorldState> = {
  id: 'hazardsAndGoal',
  step(state: GameState<WorldState>): GameState<WorldState> {
    const world = state.world;
    if (world.runState !== 'playing') return state;

    const p = world.playerPosition;
    const half = TUNING.playerHalfExtents;

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
