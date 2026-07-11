/**
 * Capture — REQ-133 (part 1): live telemetry capture.
 *
 * Design (docs/execution_plan.md §P8, design summary point 6; dm-0068): a
 * captured session is the MINIMAL replayable unit — `{ levelId, seed, tape,
 * outcome, attempts, ticksElapsed }`. Every field except the archetype label
 * an `ArchetypeRun` carries is present, so S8.6 adapts a record to an
 * `ArchetypeRun` (the input `analyzeTape` already consumes, dm-0044) by
 * supplying only a label — a live human capture genuinely has no archetype,
 * so the record does not invent one. Death coordinates and behavior signals
 * are RECOVERED from this record by deterministic replay (dm-0068), never
 * logged live — so there is no second, unverified capture path to diverge
 * from the P1 replay guarantee.
 *
 * The recorder REUSES the S8.1 `PlaytestSession` driver (no independent
 * capture loop): `capture(frame)` is `session.feedInput` with the frame
 * appended to the tape. The normalized uint32 seed is read straight from the
 * session's initial `rng.seed` (= `createRng(seed).seed`), which is exactly
 * the canonical tape seed and re-normalizes idempotently — so a replay of the
 * finalized tape reproduces the captured run bit-for-bit, with zero
 * duplication of AgentHarness's private seed normalization.
 *
 * tools/ isolation (dm-0066): imports S8.1's Playtest.ts, the public TapeIO
 * format, and pure core/entities types — no eval/ internals, no gen/, no
 * rendering, no wall clock.
 */

import type { InputFrame } from '../../src/core/State';
import type { LevelDefinition } from '../../src/components/Level';
import type { JumpOnceState } from '../../src/entities/World';
import { TAPE_SCHEMA_VERSION, type ReplayTape } from '../../src/schema/TapeIO';
import { startPlaytest, type PlaytestSession } from '../level_editor/Playtest';

/** The minimal replayable unit captured from one live session (dm-0068). */
export interface TelemetryRecord {
  readonly levelId: string;
  /** Normalized uint32 seed — identical to the tape's, re-normalizes idempotently. */
  readonly seed: number;
  readonly tape: ReplayTape;
  /** 'completed' iff the run reached the goal; 'timeout' otherwise (matching AgentHarness). */
  readonly outcome: 'completed' | 'timeout';
  /** Scene reloads (deaths) at finalize. ≥0. */
  readonly attempts: number;
  /** Simulation ticks captured (=== tape.frames.length). */
  readonly ticksElapsed: number;
}

export interface TelemetryRecorder {
  /** Feed one input frame, record it, and return the resulting state. */
  capture(frame: InputFrame): JumpOnceState;
  /** Frames captured so far. */
  frameCount(): number;
  /** Freeze the captured run into an immutable, replayable TelemetryRecord. */
  finalize(): TelemetryRecord;
}

/** Begin recording a live session of `def` seeded with `seed`. Reuses the S8.1 playtest driver. */
export function recordSession(def: LevelDefinition, seed: number): TelemetryRecorder {
  const session: PlaytestSession = startPlaytest(def, seed);
  const normalizedSeed = session.currentState().rng.seed;
  const frames: InputFrame[] = [];

  return {
    capture(frame: InputFrame): JumpOnceState {
      frames.push(frame);
      return session.feedInput(frame);
    },
    frameCount: () => frames.length,
    finalize(): TelemetryRecord {
      const state = session.currentState();
      const tape: ReplayTape = {
        schemaVersion: TAPE_SCHEMA_VERSION,
        levelId: def.levelId,
        seed: normalizedSeed,
        frames: frames.slice(),
      };
      return {
        levelId: def.levelId,
        seed: normalizedSeed,
        tape,
        outcome: state.world.runState === 'completed' ? 'completed' : 'timeout',
        attempts: state.world.attemptCount,
        ticksElapsed: frames.length,
      };
    },
  };
}
