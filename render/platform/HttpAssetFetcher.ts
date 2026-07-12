/**
 * HttpAssetFetcher — the real `fetch` binding for the `AssetFetcher`/
 * `WallClock` seams (render/assets/AssetFetcher.ts, S11.2). Construction
 * only: translates a `fetch` outcome into the seam's plain `FetchOutcome`
 * shape (never throws — a network failure is `{ ok: false, bytes: 0,
 * error }`, matching the seam's own documented contract) and binds
 * `performance.now()` for `WallClock.nowMs`.
 */

import type { AssetFetcher, FetchOutcome, WallClock } from '../assets/AssetFetcher';

export function createHttpAssetFetcher(): AssetFetcher {
  return {
    async fetch(url: string): Promise<FetchOutcome> {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          return { ok: false, bytes: 0, error: `HTTP ${response.status}` };
        }
        const body = await response.arrayBuffer();
        return { ok: true, bytes: body.byteLength };
      } catch (err) {
        return { ok: false, bytes: 0, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

export function createBrowserWallClock(): WallClock {
  return {
    nowMs(): number {
      return performance.now();
    },
  };
}
