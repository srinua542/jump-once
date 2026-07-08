/**
 * Engine — the deterministic Read -> Process -> Emit runtime loop.
 *
 * GDOS alignment: Section 13 (core engine is a deterministic state processor),
 * Section 16 (deterministic physics engine), Section 17 (flawless performance
 * across diverse hardware / allocation-aware runtime loop).
 *
 * Each call to `tick` reads the authoritative snapshot from StateManager, asks
 * the Clock how many whole fixed steps that real-time delta represents, then
 * runs the ordered System pipeline once per step as pure state->state
 * transforms. Every resulting snapshot is committed through StateManager,
 * which is the only place `current` is swapped. `tick` on GameState advances
 * by exactly 1 per fixed step — never by a fraction, never by more than 1.
 *
 * The Clock's accumulator must survive frames where zero whole steps occurred
 * (e.g. real delta smaller than FIXED_STEP_SECONDS), otherwise banked time is
 * silently lost and the simulation stalls. Clock is threaded through the
 * GameState tree like tick/rng/input (see State.ts), so Engine persists the
 * advanced clock via a commit even on a zero-step tick.
 *
 * Engine is generic over TWorld and carries no gameplay assumptions: it knows
 * nothing about entities, physics, or content, only that Systems are pure
 * functions over an opaque world payload.
 */

import { advance, interpolationAlpha as clockInterpolationAlpha } from './Clock';
import type { GameState } from './State';
import type { StateManager } from './StateManager';
import type { System } from '../systems/System';

export interface EngineOptions<TWorld> {
  /** Ordered pipeline run once per fixed step. Order is stable and caller-defined. */
  readonly systems: ReadonlyArray<System<TWorld>>;
  /** The single source of truth this engine reads from and commits into. */
  readonly stateManager: StateManager<TWorld>;
}

export class Engine<TWorld> {
  private readonly systems: ReadonlyArray<System<TWorld>>;
  private readonly stateManager: StateManager<TWorld>;

  constructor(options: EngineOptions<TWorld>) {
    this.systems = options.systems;
    this.stateManager = options.stateManager;
  }

  /**
   * Consume a variable real-time delta, advance the simulation by the whole
   * number of fixed steps it banks, and return the resulting authoritative
   * state. Returns the current state unchanged (modulo the persisted clock)
   * when no whole step has accumulated yet.
   */
  tick(realDeltaSeconds: number): GameState<TWorld> {
    const state = this.stateManager.getState();
    const { steps, next: nextClock } = advance(state.clock, realDeltaSeconds);

    if (steps === 0) {
      return this.stateManager.commit({ ...state, clock: nextClock });
    }

    let working = state;
    for (let i = 0; i < steps; i++) {
      let stepped: GameState<TWorld> = {
        ...working,
        tick: working.tick + 1,
        clock: nextClock,
      };
      for (const system of this.systems) {
        stepped = system.step(stepped);
      }
      working = this.stateManager.commit(stepped);
    }
    return working;
  }

  /**
   * Fractional progress, in [0, 1), toward the next fixed step. The renderer
   * uses this to interpolate between StateManager's previous and current
   * snapshots so motion reads smoothly despite quantized simulation.
   */
  get interpolationAlpha(): number {
    return clockInterpolationAlpha(this.stateManager.getState().clock);
  }
}
