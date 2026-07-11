/**
 * Inspector — REQ-131 P8 share (part 2): the runtime inspection controller
 * (pause / frame-step / variable manipulation / instant reload).
 *
 * Design (docs/execution_plan.md §P8, design summary point 4; dm-0070): a
 * debug "variable manipulation" is NOT a live in-place edit of a running
 * WorldState snapshot — that would violate the immutability baseline
 * (dm-0004/dm-0043). `setVariable` instead builds an explicit next state
 * (`{ ...current, world: { ...current.world, ...patch } }`) and commits it
 * through the SAME `StateManager.commit()` every system's output already
 * goes through (exposed by S8.1's `PlaytestSession.commit`) — the one
 * sanctioned mutation point, held even under debug tooling.
 *
 * `paused` is ordinary local controller bookkeeping, not game state — the
 * same shape `StateManager` itself uses for its private current/previous
 * snapshots. Pausing gates `feedInput`; `stepFrame` always advances exactly
 * one tick (with neutral input) regardless of pause state, so "frame-step
 * while paused" is the normal debugging motion, not a special case.
 *
 * tools/ isolation (dm-0066): imports only S8.1's Playtest.ts and pure
 * src/core/src/entities types — no eval/, no gen/, no rendering.
 */

import { NEUTRAL_INPUT, type InputFrame } from '../../src/core/State';
import type { JumpOnceState, WorldState } from '../../src/entities/World';
import type { PlaytestSession } from '../level_editor/Playtest';

export interface Inspector {
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  /** Feed one input frame; a no-op (current state, unchanged) while paused. */
  feedInput(frame: InputFrame): JumpOnceState;
  /** Advance exactly one fixed step with neutral input, regardless of pause state. */
  stepFrame(): JumpOnceState;
  /** Commit a WorldState patch as the new authoritative state (dm-0070) — never an in-place mutation. */
  setVariable(patch: Partial<WorldState>): JumpOnceState;
  /** Re-instantiate the level from scratch, discarding all runtime progress. */
  reload(): JumpOnceState;
  currentState(): JumpOnceState;
}

/** Wrap a live-playtest session with pause/step/variable-edit/reload controls. */
export function createInspector(session: PlaytestSession): Inspector {
  let paused = false;

  return {
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
    },
    isPaused: () => paused,
    feedInput: (frame: InputFrame) => (paused ? session.currentState() : session.feedInput(frame)),
    stepFrame: () => session.feedInput(NEUTRAL_INPUT),
    setVariable: (patch: Partial<WorldState>) => {
      const current = session.currentState();
      return session.commit({ ...current, world: { ...current.world, ...patch } });
    },
    reload: () => session.reload(),
    currentState: () => session.currentState(),
  };
}
