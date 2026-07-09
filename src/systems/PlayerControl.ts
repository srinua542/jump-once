/**
 * PlayerControl — translates the frame's input intent into player velocity
 * (S3.3). THE sole consumer of state.input in the simulation (dm-0019 input
 * boundary: live device capture is P9's, replay tapes are P4's; every other
 * system is input-blind by the isolation rule).
 *
 * GDOS alignment: Section 16 (Player Character Controller — instant
 * horizontal acceleration/deceleration, REQ-150; continuous kinetic
 * momentum, REQ-003).
 *
 * Semantics:
 *  - Horizontal velocity is SET, not ramped: vx = moveAxis × TUNING.runSpeed
 *    every step. Releasing input stops instantly; reversing flips instantly.
 *    Frictionless ice (S3.6) will be the only surface that ramps instead.
 *  - Vertical velocity is untouched here — gravity belongs to PlayerPhysics,
 *    the jump impulse to the S3.5 single-jump lock machine.
 *  - Runs BEFORE playerPhysicsSystem in the canonical pipeline (P3 execution
 *    plan design summary point 2): intent first, then integration.
 *
 * Pure: returns a new state, mutates nothing, holds nothing between frames.
 */

import type { GameState } from '../core/State';
import { vec2 } from '../core/Vec2';
import { TUNING } from '../components/Tuning';
import type { WorldState } from '../entities/World';
import type { System } from './System';

/** The player-control System. Sets horizontal intent velocity from input. */
export const playerControlSystem: System<WorldState> = {
  id: 'playerControl',
  step(state: GameState<WorldState>): GameState<WorldState> {
    if (state.world.runState !== 'playing') return state; // frozen outside a live run (S3.4)
    const vx = state.input.moveAxis * TUNING.runSpeed;
    if (vx === state.world.playerVelocity.x) return state;
    return {
      ...state,
      world: {
        ...state.world,
        playerVelocity: vec2(vx, state.world.playerVelocity.y),
      },
    };
  },
};
