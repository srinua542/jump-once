/**
 * System — the contract every runtime system implements.
 *
 * GDOS alignment: State Management invariants (systems stay stateless between
 * frames), Section 16 (modular decoupled components), directory isolation rules
 * (systems never read each other's internals).
 *
 * A System is a PURE function of (previousState) => nextState for one fixed
 * simulation step. It carries no state of its own between frames — all mutable
 * state lives in the GameState tree. It must not mutate its input; it returns a
 * new state. It must not reach into another system's internals; it communicates
 * only through the decoupled GameState it is handed.
 *
 * `id` is a stable identifier used for ordering, PKG mapping, and telemetry.
 */

import type { GameState } from '../core/State';

export interface System<TWorld> {
  readonly id: string;
  /** Transform state by exactly one fixed step. Must be pure and total. */
  step(state: GameState<TWorld>): GameState<TWorld>;
}
