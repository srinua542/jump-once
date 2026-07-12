/**
 * RafScheduler — the real `requestAnimationFrame`/`cancelAnimationFrame`
 * binding for the `FrameScheduler` seam (render/shell/FrameLoop.ts, S11.2).
 * Construction only: no branching, no derived state, no clamping — all
 * delta math and clamping live in `FrameLoop.deriveFrameDelta` and
 * `Clock.advance` respectively (dm-0124: one source of truth per
 * invariant). This is the ONLY file in the repo permitted to name
 * `requestAnimationFrame` (RenderIsolation.test.ts's browser-global scan
 * exempts render/platform/ by design, dm-0082/dm-0086).
 */

import type { FrameScheduler } from '../shell/FrameLoop';

export function createRafScheduler(): FrameScheduler {
  return {
    requestFrame(callback) {
      return window.requestAnimationFrame(callback);
    },
    cancelFrame(handle) {
      window.cancelAnimationFrame(handle);
    },
  };
}
