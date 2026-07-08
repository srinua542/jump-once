/**
 * State — the immutable root of the game's single source of truth.
 *
 * GDOS alignment: Section 13 (Data-Driven Architecture), the State Management
 * invariants (single source of truth, immutability baseline), Section 16
 * (deterministic state processor).
 *
 * The core framework owns four universal, domain-agnostic slots: the tick
 * counter, the fixed-step clock, the deterministic RNG, and the current input
 * frame. Everything specific to Jump Once gameplay (entities, tilemap, hazards)
 * lives in the domain `world` slot, whose shape is a type parameter. This keeps
 * `core/` completely decoupled from `systems/` and gameplay content — the engine
 * can be tested and reasoned about without any gameplay code present.
 *
 * The whole tree is `readonly`. Transformations return new trees; nothing is
 * mutated in place. That is what makes replay a pure function of (seed, inputs).
 */

import type { ClockState } from './Clock';
import type { RngState } from './Rng';

/** A single frame of decoupled player input. Systems read this; none write it. */
export interface InputFrame {
  /** Horizontal intent: -1 (left), 0 (none), +1 (right). */
  readonly moveAxis: -1 | 0 | 1;
  /** True only on the frame the jump was newly pressed (edge, not level). */
  readonly jumpPressed: boolean;
  /** True only on the frame a level reset was newly requested (edge). */
  readonly resetPressed: boolean;
}

export const NEUTRAL_INPUT: InputFrame = {
  moveAxis: 0,
  jumpPressed: false,
  resetPressed: false,
};

/**
 * The immutable root state. `TWorld` is the gameplay domain payload — kept
 * abstract so the core loop, clock, and RNG can be verified in isolation.
 */
export interface GameState<TWorld> {
  /** Monotonic simulation step index. Advanced by exactly 1 per fixed step. */
  readonly tick: number;
  readonly clock: ClockState;
  readonly rng: RngState;
  readonly input: InputFrame;
  readonly world: TWorld;
}
