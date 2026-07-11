/**
 * Profiler — REQ-132 P8 share: automated profiling instrumentation (frame
 * timing, allocation counting, scene-load timing).
 *
 * Design (docs/execution_plan.md §P8, design summary point 5; dm-0067): this
 * is DIAGNOSTIC instrumentation, not gameplay logic. It is the ONE place in
 * the repo permitted to read a wall clock — the determinism axiom
 * (dm-0003/dm-0004, "never delta-time scaling") governs simulation/gameplay
 * state, and a profiler's output is read-only metadata that never feeds
 * WorldState, is never part of a replay-determinism-checked value, and is
 * never imported by any src/ module (enforced by ToolsIsolation's wall-clock
 * confinement scan). `performance.now()` is the default clock; an injectable
 * `now` keeps the accumulation logic itself deterministically testable
 * without stubbing globals.
 *
 * Allocation "counting" is a manual, deterministic tally (a counter the
 * caller bumps around object-creating work) — NOT `process.memoryUsage()`,
 * which is non-deterministic and platform-dependent. This matches the
 * project's culture: measure what you can reproduce.
 *
 * tools/ isolation (dm-0066): imports nothing from src/ — timing wraps
 * caller-supplied thunks. `sceneLoadTiming` takes the loader as a callback so
 * the profiler need not import `instantiateWorld` and stays a pure timing
 * utility. No rendering (dm-0065).
 */

/** Monotonic millisecond clock. Defaults to performance.now (the dm-0067 wall-clock exception). */
export type Clock = () => number;

const wallClock: Clock = () => performance.now();

/** Accumulated timing stats for one labeled section. Durations in milliseconds. */
export interface SectionStats {
  readonly label: string;
  readonly count: number;
  readonly totalMs: number;
  readonly meanMs: number;
  readonly maxMs: number;
}

export interface ProfileReport {
  readonly sections: readonly SectionStats[];
  /** Total counted allocations across every counter. */
  readonly allocations: number;
}

export class Profiler {
  private readonly now: Clock;
  private readonly totals = new Map<string, { count: number; totalMs: number; maxMs: number }>();
  private allocations = 0;

  constructor(now: Clock = wallClock) {
    this.now = now;
  }

  /** Time a synchronous section, accumulate its duration under `label`, and return the callee's value. */
  timeSection<T>(label: string, fn: () => T): T {
    const start = this.now();
    const result = fn();
    const elapsed = this.now() - start;
    const prior = this.totals.get(label);
    if (prior === undefined) {
      this.totals.set(label, { count: 1, totalMs: elapsed, maxMs: elapsed });
    } else {
      prior.count += 1;
      prior.totalMs += elapsed;
      if (elapsed > prior.maxMs) prior.maxMs = elapsed;
    }
    return result;
  }

  /** Time a scene load (or any loader) and return exactly what the loader returned, unaltered. */
  sceneLoadTiming<T>(loader: () => T): T {
    return this.timeSection('sceneLoad', loader);
  }

  /** Tally `n` allocations (default 1) against the running total. Deterministic, caller-driven. */
  countAllocations(n = 1): void {
    this.allocations += n;
  }

  /** A read-only snapshot of accumulated stats. Sections are sorted by label for stable output. */
  report(): ProfileReport {
    const sections: SectionStats[] = [];
    for (const [label, s] of this.totals) {
      sections.push({ label, count: s.count, totalMs: s.totalMs, meanMs: s.totalMs / s.count, maxMs: s.maxMs });
    }
    sections.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
    return { sections, allocations: this.allocations };
  }
}
