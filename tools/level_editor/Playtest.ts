/**
 * Playtest — REQ-130 P8 share: the live in-editor playtest driver.
 *
 * Design (docs/execution_plan.md §P8, design summary point 2): this is NOT a
 * new simulation — it is an interactive wrapper over the already-proven
 * `Engine`/`StateManager` (P1) and the normative `CANONICAL_PIPELINE` (P4,
 * `src/eval/AgentHarness.ts` — "the only sanctioned engine assembly order").
 * `feedInput` reproduces exactly the per-tick drive pattern
 * `AgentHarness.runAgent`/`replayTape` already use: commit the frame as
 * `state.input`, then advance exactly one fixed step via
 * `engine.tick(FIXED_STEP_SECONDS)`. Same `(def, seed, frames)` therefore
 * replays bit-identically whether driven by an agent, a recorded tape, or a
 * human at this session's `feedInput` — one drive contract, three callers.
 *
 * tools/ isolation (dm-0066): this file's one `src/eval/` import is
 * `CANONICAL_PIPELINE` from `AgentHarness` — the single public assembly
 * constant every P4+ engine-assembling caller is required to use, not a
 * gate/search internal. No canvas/DOM/WebGL — this is the P8 (data/logic)
 * share of REQ-130; P9 supplies the presentation share (dm-0065).
 */

import { Engine } from '../../src/core/Engine';
import { StateManager } from '../../src/core/StateManager';
import { FIXED_STEP_SECONDS } from '../../src/core/Clock';
import { NEUTRAL_INPUT, type InputFrame } from '../../src/core/State';
import type { LevelDefinition } from '../../src/components/Level';
import { createInitialState, type JumpOnceState, type WorldState } from '../../src/entities/World';
import { CANONICAL_PIPELINE } from '../../src/eval/AgentHarness';

export interface PlaytestSession {
  /** Commit one input frame and advance the simulation by exactly one fixed step. */
  feedInput(frame: InputFrame): JumpOnceState;
  /** The current authoritative snapshot. */
  currentState(): JumpOnceState;
  /**
   * Commit a full replacement snapshot as the new authoritative state — the
   * one sanctioned mutation point (dm-0070). Runs no system and advances no
   * tick; callers (e.g. the S8.3 Inspector) are responsible for producing a
   * structurally valid next state.
   */
  commit(next: JumpOnceState): JumpOnceState;
  /** Advance exactly one fixed step with neutral input (no new frame) — frame-stepping. */
  stepFrame(): JumpOnceState;
  /** Re-instantiate the level from scratch (`createInitialState`), discarding all runtime progress. */
  reload(): JumpOnceState;
}

/** Start an interactive playtest of `def` seeded with `seed`. Deterministic: identical to a tape replay of the same frames. */
export function startPlaytest(def: LevelDefinition, seed: number): PlaytestSession {
  const manager = new StateManager<WorldState>(createInitialState(def, seed), { freezeOnCommit: true });
  const engine = new Engine<WorldState>({ systems: CANONICAL_PIPELINE, stateManager: manager });

  function feedInput(frame: InputFrame): JumpOnceState {
    manager.commit({ ...manager.getState(), input: frame });
    return engine.tick(FIXED_STEP_SECONDS);
  }

  return {
    feedInput,
    currentState: () => manager.getState(),
    commit: (next) => manager.commit(next),
    stepFrame: () => feedInput(NEUTRAL_INPUT),
    reload: () => manager.commit(createInitialState(def, seed)),
  };
}
