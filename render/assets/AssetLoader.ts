/**
 * AssetLoader — orchestrates manifest delivery across the two priority
 * tiers (S9.7, REQ-163's async share + REQ-132's P9 asset-delivery-speed
 * share, dm-0072). Split into two explicit, independently-awaitable
 * functions rather than one combined loop, so "critical gates readiness"
 * and "deferred streams after, degrading on failure" are each a distinct,
 * directly testable property rather than an implementation detail buried
 * inside a single opaque call:
 *
 *  - `loadCriticalTier` resolves ONLY once every critical asset has been
 *    fetched, or the FIRST critical failure is hit (a typed error, `ready`
 *    stays false, and the caller must not proceed to first render).
 *  - `streamDeferredTier` is meant to be started AFTER `loadCriticalTier`
 *    resolves and, in production, is not awaited by the render path at all
 *    (truly "streams in the background") — a failed deferred asset is
 *    skipped (recorded, `ok: false`) and NEVER throws or blocks its
 *    siblings.
 *
 * Per-asset timing (`DeliveryRecord.elapsedMs`, via the injected
 * `WallClock`) is diagnostic-only data — REQ-132's P9 share, the same
 * confinement contract dm-0067/dm-0082 already established for the P8
 * profiler and the render layer generally.
 */

import type { AssetFetcher, WallClock } from './AssetFetcher';
import type { AssetManifest, AssetManifestEntry } from './AssetManifest';

export interface DeliveryRecord {
  readonly id: string;
  readonly bytes: number;
  readonly elapsedMs: number;
  readonly ok: boolean;
}

export interface CriticalTierResult {
  readonly ready: boolean;
  readonly bytesDelivered: number;
  readonly records: readonly DeliveryRecord[];
  /** The first critical failure, or null if every critical asset delivered. */
  readonly error: { readonly id: string; readonly message: string } | null;
}

export interface DeferredTierResult {
  readonly bytesDelivered: number;
  readonly records: readonly DeliveryRecord[];
}

async function fetchOne(entry: AssetManifestEntry, fetcher: AssetFetcher, clock: WallClock): Promise<DeliveryRecord & { readonly errorMessage?: string }> {
  const start = clock.nowMs();
  const outcome = await fetcher.fetch(entry.url);
  const elapsedMs = clock.nowMs() - start;
  if (!outcome.ok) {
    return { id: entry.id, bytes: 0, elapsedMs, ok: false, errorMessage: outcome.error ?? 'fetch failed' };
  }
  return { id: entry.id, bytes: entry.bytes, elapsedMs, ok: true };
}

/** Fetch every `critical` entry in order; stop and report at the first failure. */
export async function loadCriticalTier(manifest: AssetManifest, fetcher: AssetFetcher, clock: WallClock): Promise<CriticalTierResult> {
  const records: DeliveryRecord[] = [];
  let bytesDelivered = 0;
  for (const entry of manifest.entries) {
    if (entry.priority !== 'critical') continue;
    const result = await fetchOne(entry, fetcher, clock);
    records.push({ id: result.id, bytes: result.bytes, elapsedMs: result.elapsedMs, ok: result.ok });
    if (!result.ok) {
      return { ready: false, bytesDelivered, records, error: { id: entry.id, message: result.errorMessage ?? 'fetch failed' } };
    }
    bytesDelivered += result.bytes;
  }
  return { ready: true, bytesDelivered, records, error: null };
}

/** Fetch every `deferred` entry; a failure is skipped (recorded, not thrown) and never blocks its siblings. */
export async function streamDeferredTier(
  manifest: AssetManifest,
  fetcher: AssetFetcher,
  clock: WallClock,
  onProgress?: (bytesDelivered: number) => void,
): Promise<DeferredTierResult> {
  const records: DeliveryRecord[] = [];
  let bytesDelivered = 0;
  for (const entry of manifest.entries) {
    if (entry.priority !== 'deferred') continue;
    const result = await fetchOne(entry, fetcher, clock);
    records.push({ id: result.id, bytes: result.bytes, elapsedMs: result.elapsedMs, ok: result.ok });
    if (result.ok) {
      bytesDelivered += result.bytes;
      onProgress?.(bytesDelivered);
    }
  }
  return { bytesDelivered, records };
}

/** Total manifest bytes across both tiers — the denominator for a unified 0..1 progress readout. */
export function totalManifestBytes(manifest: AssetManifest): number {
  return manifest.entries.reduce((sum, e) => sum + e.bytes, 0);
}
