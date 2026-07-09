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
 * Horizontal (S3.3 + S3.6 ice):
 *  - Off ice: vx is SET, not ramped — moveAxis × TUNING.runSpeed every step;
 *    instant stop and reversal. Horizontal control never locks — "locks to
 *    horizontal-only" (REQ-150) means the VERTICAL axis is spent, movement
 *    continues.
 *  - On frictionless ice (grounded on an iceSurface last tick, REQ-151):
 *    momentum-preserving — vx accelerates toward ±runSpeed by
 *    TUNING.iceAccel·dt and releasing input does NOT decelerate, so the
 *    player slides. Ice is the one surface that ramps instead of instant-set.
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

import { FIXED_STEP_SECONDS } from '../core/Clock';
import type { GameState } from '../core/State';
import { vec2 } from '../core/Vec2';
import { TUNING } from '../components/Tuning';
import type { JumpLockState, WorldState } from '../entities/World';
import type { System } from './System';

/** The behavior kind the player is grounded on this tick, or null (tile / airborne). */
function groundKind(world: WorldState): string | null {
  const ground = world.playerGroundEntity;
  return world.playerGrounded && ground >= 0 ? world.level.entities[ground].behavior.kind : null;
}

/**
 * Horizontal intent velocity for this step. Off ice: instant set (+ conveyor
 * surface velocity if riding one, S3.8). On ice: momentum-preserving ramp
 * toward the input target, capped at ±runSpeed.
 */
function horizontalVelocity(world: WorldState, moveAxis: -1 | 0 | 1, kind: string | null): number {
  const target = moveAxis * TUNING.runSpeed;

  if (kind === 'conveyor') {
    // Conveyor adds its surface velocity to normal walking (REQ-153).
    const ground = world.playerGroundEntity;
    const behavior = world.level.entities[ground].behavior;
    return behavior.kind === 'conveyor' ? target + behavior.surfaceVelocityX : target;
  }

  if (kind !== 'iceSurface') return target;

  const vx = world.playerVelocity.x;
  const step = TUNING.iceAccel * FIXED_STEP_SECONDS;
  if (moveAxis === 0) return vx; // frictionless: no input, no decel — slide on
  // Accelerate toward the target, never overshooting it or exceeding run speed.
  const next = vx + moveAxis * step;
  return moveAxis > 0 ? Math.min(next, target) : Math.max(next, target);
}

/** The player-control System. Horizontal intent + the single-jump lock machine. */
export const playerControlSystem: System<WorldState> = {
  id: 'playerControl',
  step(state: GameState<WorldState>): GameState<WorldState> {
    const world = state.world;
    if (world.runState !== 'playing') return state; // frozen outside a live run (S3.4)

    // Surface-based base velocity (S3.8 kinetic modifiers, none touch jumpLock).
    const kind = groundKind(world);
    let vx: number;
    let vy = world.playerVelocity.y;
    if (kind === 'spring') {
      // Directional launch spring: set both axes to the authored launch
      // velocity (a jump impulse this tick still overrides vy below — the
      // axiom takes precedence). REQ-153: never consumes the jump.
      const behavior = world.level.entities[world.playerGroundEntity].behavior;
      if (behavior.kind === 'spring') {
        vx = behavior.launchVelocity.x;
        vy = behavior.launchVelocity.y;
      } else {
        vx = horizontalVelocity(world, state.input.moveAxis, kind);
      }
    } else {
      vx = horizontalVelocity(world, state.input.moveAxis, kind);
    }

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
