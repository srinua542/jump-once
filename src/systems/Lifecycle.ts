/**
 * Lifecycle — scene reload: the run lifecycle's entry system (S3.4).
 * FIRST in the canonical pipeline, so a defeat detected at the end of tick T
 * yields a fresh world before anything simulates at tick T+1 — REQ-003's
 * "instant gameplay iteration" is exactly this one-tick defeat→reload loop.
 *
 * GDOS alignment: Section 1 (instant iteration), Section 2 (the jump
 * refreshes ONLY via scene reload — reload is pure re-instantiation, so any
 * per-life state, including the S3.5 jump lock, resets by construction,
 * dm-0018).
 *
 * Semantics:
 *  - Reload happens when the world is 'defeated', or when the player newly
 *    pressed reset (edge-triggered input; works from any run state).
 *  - Reload = instantiateWorld(world.level) — the same pure, deterministic
 *    function that built the initial world; the frozen LevelDefinition is
 *    reference-shared through it (dm-0009). Only two fields survive the
 *    life boundary: attemptCount (+1) and spawnTick (= the current tick).
 *  - Input boundary (dm-0019, refined at S3.4): the split is by FIELD —
 *    Lifecycle consumes resetPressed; PlayerControl consumes moveAxis (and
 *    S3.5's lock machine consumes jumpPressed). No other system reads input.
 *
 * Pure: returns a new state on reload, the same snapshot otherwise.
 */

import type { GameState } from '../core/State';
import { instantiateWorld, type WorldState } from '../entities/World';
import type { System } from './System';

/** The lifecycle System. Consumes 'defeated' and resetPressed into a fresh life. */
export const lifecycleSystem: System<WorldState> = {
  id: 'lifecycle',
  step(state: GameState<WorldState>): GameState<WorldState> {
    const world = state.world;
    if (world.runState !== 'defeated' && !state.input.resetPressed) return state;
    return {
      ...state,
      world: {
        ...instantiateWorld(world.level),
        attemptCount: world.attemptCount + 1,
        spawnTick: state.tick,
      },
    };
  },
};
