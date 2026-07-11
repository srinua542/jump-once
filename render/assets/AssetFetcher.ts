/**
 * AssetFetcher — the injected async fetch-like seam (S9.7, dm-0086). Never
 * a real `fetch(...)` call outside render/platform/ (RenderIsolation
 * forbids naming `fetch(` anywhere else in render/). `WallClock` is the
 * equally-injected wall-time seam: real reads live in render/platform/
 * only (dm-0082's confinement extends here) — nothing in this module or
 * AssetLoader.ts calls `Date.now`/`performance.now` directly.
 */

export interface FetchOutcome {
  readonly ok: boolean;
  /** Bytes actually delivered; 0 on failure. */
  readonly bytes: number;
  /** Present only when `ok` is false. */
  readonly error?: string;
}

export interface AssetFetcher {
  fetch(url: string): Promise<FetchOutcome>;
}

export interface WallClock {
  /** Milliseconds, monotonic within a session. Never read directly in render/ outside render/platform/. */
  nowMs(): number;
}
