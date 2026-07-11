/**
 * S9.7 — AssetManifest: the seventh versioned schema. Strict parse with the
 * full P2 discipline: unknown keys rejected, finite-number bounds, hard
 * version pin, path-qualified errors, never throws.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  parseAssetManifest,
  type AssetManifest,
} from '../../render/assets/AssetManifest';

function sample(): AssetManifest {
  return {
    assetManifestSchemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    manifestId: 'test-manifest',
    entries: [
      { id: 'level-1', url: '/levels/1.json', kind: 'level', priority: 'critical', bytes: 2048 },
      { id: 'grammar-1', url: '/grammar.json', kind: 'grammar', priority: 'critical', bytes: 512 },
      { id: 'calib-1', url: '/calibration.json', kind: 'pack-calibration', priority: 'deferred', bytes: 1024 },
    ],
  };
}

function raw(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(sample())) as Record<string, unknown>;
}

test('a well-formed manifest parses through its own strict parser (round-trip)', () => {
  const result = parseAssetManifest(raw());
  assert.ok(result.ok, `failed to parse: ${JSON.stringify(!result.ok ? result.errors : [])}`);
  if (result.ok) assert.deepEqual(result.value, sample());
});

test('version pin: any other assetManifestSchemaVersion is hard-rejected', () => {
  for (const bad of [0, 2, '1', null, undefined]) {
    const r = raw();
    if (bad === undefined) delete r.assetManifestSchemaVersion;
    else r.assetManifestSchemaVersion = bad;
    const result = parseAssetManifest(r);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/assetManifestSchemaVersion'));
  }
});

test('strict rejection suite: each defect is caught with its path', () => {
  const cases: { mutate: (r: Record<string, unknown>) => void; path: string }[] = [
    { mutate: (r) => { r.extra = 1; }, path: '/extra' },
    { mutate: (r) => { r.manifestId = ''; }, path: '/manifestId' },
    { mutate: (r) => { delete r.entries; }, path: '/entries' },
    { mutate: (r) => { (r.entries as unknown[])[0] = 'not-an-object'; }, path: '/entries/0' },
    { mutate: (r) => { (r.entries as Record<string, unknown>[])[0].extra = 1; }, path: '/entries/0/extra' },
    { mutate: (r) => { (r.entries as Record<string, unknown>[])[0].id = ''; }, path: '/entries/0/id' },
    { mutate: (r) => { (r.entries as Record<string, unknown>[])[0].url = ''; }, path: '/entries/0/url' },
    { mutate: (r) => { (r.entries as Record<string, unknown>[])[0].kind = 'bogus'; }, path: '/entries/0/kind' },
    { mutate: (r) => { (r.entries as Record<string, unknown>[])[0].priority = 'bogus'; }, path: '/entries/0/priority' },
    { mutate: (r) => { (r.entries as Record<string, unknown>[])[0].bytes = 0; }, path: '/entries/0/bytes' },
    { mutate: (r) => { (r.entries as Record<string, unknown>[])[0].bytes = -5; }, path: '/entries/0/bytes' },
    { mutate: (r) => { (r.entries as Record<string, unknown>[])[0].bytes = Number.NaN; }, path: '/entries/0/bytes' },
  ];
  for (const { mutate, path } of cases) {
    const r = raw();
    mutate(r);
    const result = parseAssetManifest(r);
    assert.equal(result.ok, false, `expected rejection for mutation targeting ${path}`);
    if (!result.ok) assert.ok(result.errors.some((e) => e.path === path), `expected an error at ${path}, got ${JSON.stringify(result.errors)}`);
  }
});

test('duplicate entry ids are rejected', () => {
  const r = raw();
  (r.entries as Record<string, unknown>[]).push({ ...(r.entries as Record<string, unknown>[])[0] });
  const result = parseAssetManifest(r);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/entries'));
});

test('an empty entries array is a valid (empty) manifest', () => {
  const r = raw();
  r.entries = [];
  const result = parseAssetManifest(r);
  assert.ok(result.ok);
});

test('non-object input is rejected without throwing', () => {
  for (const bad of [null, undefined, 'x', 42, []]) {
    const result = parseAssetManifest(bad);
    assert.equal(result.ok, false);
  }
});
