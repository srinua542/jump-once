/**
 * PlayerControl — translates the frame's input intent into player velocity
 * and drives the SINGLE-JUMP LOCK machine (S3.3 + S3.5). Consumer of
 * moveAxis and jumpPressed under the by-field input split (dm-0019;
 * Lifecycle owns resetPressed; live device capture is P9's, replay tapes
 * are P4's).
 *
 * GDOS alignment: Section 16 (Player Character Controller — instant
 * horizontal accel/decel + anticipation frames, REQ-150), Sections 1–2
 * (THE AXIOM: exactly one jump per level, REQ-004/010/011).
 *
 * Horizontal (S3.3):
 *  - vx is SET, not ramped: moveAxis × TUNING.runSpeed every step; instant
 *    stop and reversal. Frictionless ice (S3.6) will be the only ramping
 *    surface. Horizontal control never locks — "locks to horizontal-only"
 *    (REQ-150) means the VERTICAL axis is spent, movement continues.
 *
 * The jump machine (S3.5, dm-0020) — forward-only within a life:
 *  - available --(jumpPressed edge AND grounded)--> anticipating(N)
 *    (N = TUNING.anticipationTicks; presses in the air are IGNORED and NOT
 *    consumed — no coyote time, no input buffering; those are GDOS feel
 *    decisions deliberately absent until demanded);
 *  - anticipating: counts down each step; the press is COMMITTED — the
 *    impulse fires when the countdown ends even if support was lost;
 *    further presses are ignored;
 *  - countdown end: vy = -TUNING.jumpSpeed applied EXACTLY ONCE --> spent;
 *  - spent: jumpPressed is ignored forever. There is no transition out of
 *    'spent' — refresh happens ONLY because scene reload re-instantiates
 *    WorldState (dm-0018: correct by construction, no reset code to forget).
 *
 * Pure: returns a new state, mutates nothing, holds nothing between frames.
 */

import type { GameState } from '../core/State';
import { vec2 } from '../core/Vec2';
import { TUNING } from '../components/Tuning';
import type { JumpLockState, WorldState } from '../entities/World';
import type { System } from './System';

/** The player-control System. Horizontal intent + the single-jump lock machine. */
export const playerControlSystem: System<WorldState> = {
  id: 'playerControl',
  step(state: GameState<WorldState>): GameState<WorldState> {
    const world = state.world;
    if (world.runState !== 'playing') return state; // frozen outside a live run (S3.4)

    const vx = state.input.moveAxis * TUNING.runSpeed;
    let vy = world.playerVelocity.y;

    // The single-jump lock machine (forward-only: available → anticipating → spent).
    let lock: JumpLockState = world.jumpLock;
    if (lock.phase === 'available') {
      if (state.input.jumpPressed && world.playerGrounded) {
        lock = { phase: 'anticipating', ticksUntilImpulse: TUNING.anticipationTicks };
      }
    }
    if (lock.phase === 'anticipating') {
      if (lock.ticksUntilImpulse <= 0) {
        vy = -TUNING.jumpSpeed; // THE jump — fires exactly once per life
        lock = { phase: 'spent', ticksUntilImpulse: 0 };
      } else {
        lock = { phase: 'anticipating', ticksUntilImpulse: lock.ticksUntilImpulse - 1 };
      }
    }

    if (vx === world.playerVelocity.x && vy === world.playerVelocity.y && lock === world.jumpLock) {
      return state;
    }
    return {
      ...state,
      world: {
        ...world,
        playerVelocity: vec2(vx, vy),
        jumpLock: lock,
      },
    };
  },
};
