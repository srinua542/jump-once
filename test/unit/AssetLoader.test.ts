/**
 * S9.7 — AssetLoader: critical tier gates readiness; deferred tier streams
 * after and degrades on failure without blocking readiness; progress
 * monotonically reaches 1 (all-success case); delivery-speed report correct
 * against a scripted fake fetcher+clock; critical failure surfaces a typed
 * error and never throws.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ASSET_MANIFEST_SCHEMA_VERSION, type AssetManifest } from '../../render/assets/AssetManifest';
import type { AssetFetcher, FetchOutcome, WallClock } from '../../render/assets/AssetFetcher';
import { loadCriticalTier, streamDeferredTier, totalManifestBytes } from '../../render/assets/AssetLoader';

function manifestWith(entries: AssetManifest['entries']): AssetManifest {
  return { assetManifestSchemaVersion: ASSET_MANIFEST_SCHEMA_VERSION, manifestId: 'loader-fixture', entries };
}

/** A scripted fetcher: fixed bytes per url, or a scripted failure. */
function makeFetcher(script: Readonly<Record<string, FetchOutcome>>): AssetFetcher {
  return {
    async fetch(url: string): Promise<FetchOutcome> {
      const outcome = script[url];
      if (outcome === undefined) throw new Error(`unscripted url in test fixture: ${url}`);
      return outcome;
    },
  };
}

/** A scripted clock: each call to nowMs() returns the next value in the sequence. */
function makeClock(sequence: readonly number[]): WallClock {
  let i = 0;
  return { nowMs: () => sequence[Math.min(i++, sequence.length - 1)] };
}

test('critical tier gates readiness: loadCriticalTier resolves ready=true once every critical asset delivers', async () => {
  const manifest = manifestWith([
    { id: 'a', url: '/a', kind: 'level', priority: 'critical', bytes: 100 },
    { id: 'b', url: '/b', kind: 'grammar', priority: 'critical', bytes: 200 },
    { id: 'c', url: '/c', kind: 'audio-sample', priority: 'deferred', bytes: 9999 },
  ]);
  const fetcher = makeFetcher({ '/a': { ok: true, bytes: 100 }, '/b': { ok: true, bytes: 200 }, '/c': { ok: true, bytes: 9999 } });
  const clock = makeClock([0, 10, 10, 30]);
  const result = await loadCriticalTier(manifest, fetcher, clock);
  assert.equal(result.ready, true);
  assert.equal(result.error, null);
  assert.equal(result.bytesDelivered, 300, 'only critical bytes should be counted — the deferred 9999-byte asset must not have been touched');
  assert.equal(result.records.length, 2, 'only the two critical entries are fetched by loadCriticalTier');
});

test('a critical failure surfaces a typed error, halts further critical fetches, and never throws', async () => {
  const manifest = manifestWith([
    { id: 'a', url: '/a', kind: 'level', priority: 'critical', bytes: 100 },
    { id: 'b', url: '/b', kind: 'grammar', priority: 'critical', bytes: 200 },
  ]);
  const fetcher = makeFetcher({ '/a': { ok: false, bytes: 0, error: 'network down' }, '/b': { ok: true, bytes: 200 } });
  const clock = makeClock([0, 5]);
  const result = await loadCriticalTier(manifest, fetcher, clock);
  assert.equal(result.ready, false);
  assert.deepEqual(result.error, { id: 'a', message: 'network down' });
  assert.equal(result.records.length, 1, 'must stop at the first critical failure, never fetch b');
});

test('deferred tier streams after critical, degrading a failed asset without blocking or throwing', async () => {
  const manifest = manifestWith([
    { id: 'd1', url: '/d1', kind: 'pack-calibration', priority: 'deferred', bytes: 100 },
    { id: 'd2', url: '/d2', kind: 'audio-sample', priority: 'deferred', bytes: 200 },
    { id: 'd3', url: '/d3', kind: 'audio-sample', priority: 'deferred', bytes: 300 },
  ]);
  const fetcher = makeFetcher({
    '/d1': { ok: true, bytes: 100 },
    '/d2': { ok: false, bytes: 0, error: 'timeout' },
    '/d3': { ok: true, bytes: 300 },
  });
  const clock = makeClock([0, 1, 1, 2, 2, 3]);
  const progressValues: number[] = [];
  const result = await streamDeferredTier(manifest, fetcher, clock, (bytes) => progressValues.push(bytes));
  assert.equal(result.bytesDelivered, 400, 'd2 failed and must not count toward delivered bytes');
  assert.equal(result.records.length, 3, 'a failed deferred asset is still RECORDED, just marked ok:false');
  assert.equal(result.records[1].ok, false);
  assert.deepEqual(progressValues, [100, 400], 'progress only advances on successful deliveries, and never decreases');
});

test('progress monotonically reaches full manifest bytes when every asset succeeds', async () => {
  const manifest = manifestWith([
    { id: 'c1', url: '/c1', kind: 'level', priority: 'critical', bytes: 50 },
    { id: 'd1', url: '/d1', kind: 'grammar', priority: 'deferred', bytes: 50 },
  ]);
  const fetcher = makeFetcher({ '/c1': { ok: true, bytes: 50 }, '/d1': { ok: true, bytes: 50 } });
  const clock = makeClock([0, 1, 1, 2]);
  const critical = await loadCriticalTier(manifest, fetcher, clock);
  const deferred = await streamDeferredTier(manifest, fetcher, clock);
  const total = totalManifestBytes(manifest);
  assert.equal(critical.bytesDelivered + deferred.bytesDelivered, total);
  assert.equal((critical.bytesDelivered + deferred.bytesDelivered) / total, 1);
});

test('delivery-speed report: elapsedMs matches the scripted clock deltas exactly (REQ-132 P9 share)', async () => {
  const manifest = manifestWith([{ id: 'slow', url: '/slow', kind: 'level', priority: 'critical', bytes: 1000 }]);
  const fetcher = makeFetcher({ '/slow': { ok: true, bytes: 1000 } });
  const clock = makeClock([100, 137]); // start=100, end=137 -> elapsed 37ms
  const result = await loadCriticalTier(manifest, fetcher, clock);
  assert.equal(result.records[0].elapsedMs, 37);
  assert.equal(result.records[0].bytes, 1000);
});

test('an empty manifest is trivially ready with zero bytes delivered', async () => {
  const manifest = manifestWith([]);
  const fetcher = makeFetcher({});
  const clock = makeClock([0]);
  const result = await loadCriticalTier(manifest, fetcher, clock);
  assert.equal(result.ready, true);
  assert.equal(result.bytesDelivered, 0);
  assert.equal(totalManifestBytes(manifest), 0);
});
