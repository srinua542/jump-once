/**
 * StateManager — the single source of truth for all mutable game state.
 *
 * GDOS alignment: State Management invariants (single source of truth,
 * immutability baseline), Section 13 (deterministic state processor).
 *
 * Responsibilities:
 *  - Hold exactly one authoritative `current` snapshot plus the immediately
 *    `previous` snapshot (the renderer interpolates between them; simulation
 *    never reads `previous`).
 *  - Be the ONLY place a snapshot is swapped in. Systems produce candidate
 *    next-states as pure return values; nothing else assigns to `current`.
 *  - Optionally deep-freeze committed snapshots so accidental in-place mutation
 *    throws loudly in tests/dev. Freezing is off by default so the production
 *    runtime loop stays allocation- and CPU-light (Section 17).
 *
 * Idempotency: committing the identical snapshot object twice is a no-op beyond
 * shifting `previous`; there is no hidden accumulation, no duplicate registration.
 */

import type { GameState } from './State';

/** Recursively freeze a snapshot. Dev/test guard against accidental mutation. */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value as object)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

export interface StateManagerOptions {
  /** When true, every committed snapshot is deep-frozen. Default: false. */
  readonly freezeOnCommit?: boolean;
}

export class StateManager<TWorld> {
  private currentSnapshot: GameState<TWorld>;
  private previousSnapshot: GameState<TWorld>;
  private readonly freezeOnCommit: boolean;

  constructor(initial: GameState<TWorld>, options: StateManagerOptions = {}) {
    this.freezeOnCommit = options.freezeOnCommit ?? false;
    const seed = this.freezeOnCommit ? deepFreeze(initial) : initial;
    this.currentSnapshot = seed;
    this.previousSnapshot = seed;
  }

  /** The authoritative current snapshot. Simulation reads this. */
  getState(): GameState<TWorld> {
    return this.currentSnapshot;
  }

  /** The prior snapshot, for render interpolation only. */
  getPreviousState(): GameState<TWorld> {
    return this.previousSnapshot;
  }

  /**
   * Swap in a new authoritative snapshot, retaining the old one as `previous`.
   * This is the single mutation point for game state.
   */
  commit(next: GameState<TWorld>): GameState<TWorld> {
    this.previousSnapshot = this.currentSnapshot;
    this.currentSnapshot = this.freezeOnCommit ? deepFreeze(next) : next;
    return this.currentSnapshot;
  }
}
