/**
 * FrameLoop — the `FrameScheduler` seam (S11.2, REQ-170/171 release,
 * dm-0086/dm-0121/dm-0124) plus the pure per-frame delta/orchestration logic
 * that drives it. `render/platform/RafScheduler.ts` binds the real
 * `requestAnimationFrame`/`cancelAnimationFrame`; every other render/ module
 * — including this one — reaches it only through the enumerated
 * `FrameScheduler` interface, exactly like `Raster2D`/`Gl2Device`/
 * `AudioDevice`/`AssetFetcher`/`PortalSdk`.
 *
 * Spiral-of-death (dm-0124): `Clock.advance` already clamps
 * `realDeltaSeconds` to `MAX_FRAME_SECONDS` — this module does NOT
 * re-clamp. `deriveFrameDelta` computes an HONEST raw delta from two
 * successive scheduler timestamps (the first frame yields 0 — there is no
 * prior reference to subtract from) and lets `Clock.advance` be the single
 * source of truth for bounding it. Duplicating the clamp here would be two
 * sources of truth for one invariant.
 */

export type FrameCallback = (timestampMs: number) => void;

export interface FrameScheduler {
  /** Schedule `callback` to run on the next display frame, receiving a monotonic timestamp in ms. Returns a handle for `cancelFrame`. */
  requestFrame(callback: FrameCallback): number;
  cancelFrame(handle: number): void;
}

export interface FrameDelta {
  /** Raw, unclamped seconds since the previous frame. 0 on the very first frame (no prior reference). */
  readonly realDeltaSeconds: number;
  readonly timestampMs: number;
}

/**
 * Pure: derive this frame's real delta from the previous scheduler
 * timestamp (`null` on the first frame) and the current one. Never clamps —
 * `Clock.advance` (src/core/Clock.ts) owns `MAX_FRAME_SECONDS` bounding.
 */
export function deriveFrameDelta(previousTimestampMs: number | null, currentTimestampMs: number): FrameDelta {
  const realDeltaSeconds = previousTimestampMs === null ? 0 : (currentTimestampMs - previousTimestampMs) / 1000;
  return { realDeltaSeconds, timestampMs: currentTimestampMs };
}

export interface FrameLoopHandle {
  /** Stop scheduling further frames. Safe to call more than once. */
  stop(): void;
}

/**
 * Drive `onFrame(realDeltaSeconds, timestampMs)` once per scheduled frame,
 * forever, until `stop()`. `scheduler` is the only door to real time this
 * module opens — everything else is pure. Matches `startFrameLoop`'s own
 * contract: one `requestFrame` call outstanding at a time, re-armed from
 * inside the callback (never double-scheduled).
 */
export function startFrameLoop(scheduler: FrameScheduler, onFrame: (realDeltaSeconds: number, timestampMs: number) => void): FrameLoopHandle {
  let previousTimestampMs: number | null = null;
  let handle: number | null = null;
  let stopped = false;

  function tick(timestampMs: number): void {
    if (stopped) return;
    const delta = deriveFrameDelta(previousTimestampMs, timestampMs);
    previousTimestampMs = timestampMs;
    onFrame(delta.realDeltaSeconds, timestampMs);
    if (!stopped) {
      handle = scheduler.requestFrame(tick);
    }
  }

  handle = scheduler.requestFrame(tick);

  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      if (handle !== null) scheduler.cancelFrame(handle);
    },
  };
}

/**
 * A manually-steppable fake `FrameScheduler` for tests — never touches real
 * `requestAnimationFrame`. `step(timestampMs)` fires exactly the callback
 * that is currently pending (if any) and clears it; the loop then re-arms a
 * new pending callback via its own `requestFrame` call, ready for the next
 * `step`. Mirrors the project's `createTrace*` fake convention.
 */
export function createFakeFrameScheduler(): { readonly scheduler: FrameScheduler; step(timestampMs: number): void; pendingCount(): number } {
  let nextHandle = 1;
  const pending = new Map<number, FrameCallback>();
  const scheduler: FrameScheduler = {
    requestFrame(callback) {
      const handle = nextHandle++;
      pending.set(handle, callback);
      return handle;
    },
    cancelFrame(handle) {
      pending.delete(handle);
    },
  };
  return {
    scheduler,
    step(timestampMs: number): void {
      const entries = [...pending.entries()];
      pending.clear();
      for (const [, callback] of entries) callback(timestampMs);
    },
    pendingCount(): number {
      return pending.size;
    },
  };
}
