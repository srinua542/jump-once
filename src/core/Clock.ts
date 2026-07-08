/**
 * Clock — fixed-timestep accumulator.
 *
 * GDOS alignment: Section 16 (deterministic physics engine), Section 17
 * (flawless performance across diverse hardware), Section 15 (pixel-perfect
 * trajectory solver used by validation agents).
 *
 * Rationale: render framerate varies wildly across web hardware, but simulation
 * MUST advance in constant-size steps or trajectories become hardware-dependent
 * and the level-validation agents stop being authoritative. The Clock decouples
 * variable real-frame delta from a fixed simulation delta by banking leftover
 * real time in an accumulator and emitting a whole number of fixed steps to run.
 *
 * The accumulator is a pure value (no hidden mutable state) so it can live in the
 * immutable state tree and so a replay is a deterministic function of its inputs.
 *
 * WARNING (carried to handoff): FIXED_STEP_SECONDS is a load-bearing constant for
 * the trajectory solver. Do not "scale delta-time" here to smooth motion — that
 * reintroduces hardware dependence and breaks deterministic validation.
 */

/** Simulation advances at exactly 60 discrete steps per second. */
export const FIXED_STEP_SECONDS = 1 / 60;

/**
 * Upper bound on real time consumed in a single tick. Prevents the "spiral of
 * death" where a long stall (tab backgrounded, GC pause) queues hundreds of
 * catch-up steps. Excess time beyond this ceiling is dropped, not banked.
 */
export const MAX_FRAME_SECONDS = 0.25;

export interface ClockState {
  /** Unconsumed real seconds banked toward the next fixed step. */
  readonly accumulator: number;
  /** Monotonic count of fixed steps simulated since boot. Determinism anchor. */
  readonly stepIndex: number;
}

export function createClock(): ClockState {
  return { accumulator: 0, stepIndex: 0 };
}

export interface ClockAdvance {
  /** Number of whole fixed steps to simulate this tick. */
  readonly steps: number;
  /** Clock state after banking leftover time. */
  readonly next: ClockState;
}

/**
 * Consume a variable real-time delta and report how many fixed steps to run.
 * `realDeltaSeconds` is clamped to MAX_FRAME_SECONDS to bound catch-up work.
 */
export function advance(state: ClockState, realDeltaSeconds: number): ClockAdvance {
  const clamped = Math.min(Math.max(realDeltaSeconds, 0), MAX_FRAME_SECONDS);
  let banked = state.accumulator + clamped;
  let steps = 0;
  while (banked >= FIXED_STEP_SECONDS) {
    banked -= FIXED_STEP_SECONDS;
    steps += 1;
  }
  return {
    steps,
    next: { accumulator: banked, stepIndex: state.stepIndex + steps },
  };
}

/**
 * Fractional progress toward the next fixed step, in [0, 1). The renderer uses
 * this to interpolate between the last two simulation snapshots so motion looks
 * smooth even though simulation is quantized. Rendering never feeds back into
 * simulation, preserving determinism.
 */
export function interpolationAlpha(state: ClockState): number {
  return state.accumulator / FIXED_STEP_SECONDS;
}
