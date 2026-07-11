/**
 * AssetManifest — the seventh versioned schema (S9.7), after the level
 * schema, ScoringProfile, CampaignProfile, GenProfile, TelemetryProfile, and
 * VisualGrammar. Strict-parsed, versioned, dm-0010/0014 discipline: never
 * throws, unknown keys rejected everywhere, finite-number bounds, hard
 * version pin, path-qualified errors.
 *
 * Two priority tiers realize REQ-163's async delivery + REQ-002's "no long
 * loads": `critical` assets gate first render (`AssetLoader.loadCriticalTier`
 * blocks on them); `deferred` assets stream in afterward
 * (`AssetLoader.streamDeferredTier`), degrading (skipping) individually on
 * failure without blocking readiness.
 */

import type { SchemaError } from '../../src/schema/Parse';

export const ASSET_MANIFEST_SCHEMA_VERSION = 1;

export type AssetKind = 'level' | 'grammar' | 'pack-calibration' | 'audio-sample';
export type AssetPriority = 'critical' | 'deferred';

const ASSET_KINDS: readonly AssetKind[] = ['level', 'grammar', 'pack-calibration', 'audio-sample'];
const ASSET_PRIORITIES: readonly AssetPriority[] = ['critical', 'deferred'];

export interface AssetManifestEntry {
  /** Stable identity, unique within the manifest. Non-empty. */
  readonly id: string;
  readonly url: string;
  readonly kind: AssetKind;
  readonly priority: AssetPriority;
  /** Expected payload size, bytes. Strictly positive (delivery-speed profiling divides by this). */
  readonly bytes: number;
}

export interface AssetManifest {
  readonly assetManifestSchemaVersion: number;
  readonly manifestId: string;
  readonly entries: readonly AssetManifestEntry[];
}

export type AssetManifestParseResult =
  | { readonly ok: true; readonly value: AssetManifest }
  | { readonly ok: false; readonly errors: readonly SchemaError[] };

export const DEFAULT_ASSET_MANIFEST: AssetManifest = Object.freeze({
  assetManifestSchemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
  manifestId: 'asset-manifest-default-v1',
  entries: Object.freeze([]),
}) as AssetManifest;

/* ── strict parser (dm-0010/0014 discipline, self-contained) ─────────────── */

type Errors = SchemaError[];

function fail(errors: Errors, path: string, message: string): undefined {
  errors.push({ path, message });
  return undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'an array';
  return typeof v;
}

function checkKeys(v: Record<string, unknown>, path: string, allowed: readonly string[], errors: Errors): void {
  for (const key of Object.keys(v)) {
    if (!allowed.includes(key)) fail(errors, `${path}/${key}`, `unknown key "${key}"`);
  }
}

function parseEntry(v: unknown, path: string, errors: Errors): AssetManifestEntry | undefined {
  if (!isRecord(v)) return fail(errors, path, `expected an object (got ${describe(v)})`);
  checkKeys(v, path, ['id', 'url', 'kind', 'priority', 'bytes'], errors);

  const id = v['id'];
  if (typeof id !== 'string' || id.length === 0) fail(errors, `${path}/id`, 'expected a non-empty string');

  const url = v['url'];
  if (typeof url !== 'string' || url.length === 0) fail(errors, `${path}/url`, 'expected a non-empty string');

  const kind = v['kind'];
  if (typeof kind !== 'string' || !ASSET_KINDS.includes(kind as AssetKind)) {
    fail(errors, `${path}/kind`, `expected one of [${ASSET_KINDS.join(', ')}] (got ${JSON.stringify(kind)})`);
  }

  const priority = v['priority'];
  if (typeof priority !== 'string' || !ASSET_PRIORITIES.includes(priority as AssetPriority)) {
    fail(errors, `${path}/priority`, `expected one of [${ASSET_PRIORITIES.join(', ')}] (got ${JSON.stringify(priority)})`);
  }

  const bytes = v['bytes'];
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
    fail(errors, `${path}/bytes`, 'expected a finite number > 0');
  }

  if (
    typeof id !== 'string' || id.length === 0 ||
    typeof url !== 'string' || url.length === 0 ||
    typeof kind !== 'string' || !ASSET_KINDS.includes(kind as AssetKind) ||
    typeof priority !== 'string' || !ASSET_PRIORITIES.includes(priority as AssetPriority) ||
    typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0
  ) {
    return undefined;
  }
  return { id, url, kind: kind as AssetKind, priority: priority as AssetPriority, bytes };
}

export function parseAssetManifest(input: unknown): AssetManifestParseResult {
  const errors: Errors = [];
  if (!isRecord(input)) {
    return { ok: false, errors: [{ path: '', message: `expected an object (got ${describe(input)})` }] };
  }
  checkKeys(input, '', ['assetManifestSchemaVersion', 'manifestId', 'entries'], errors);

  const version = input['assetManifestSchemaVersion'];
  if (version !== ASSET_MANIFEST_SCHEMA_VERSION) {
    fail(errors, '/assetManifestSchemaVersion', `expected ${ASSET_MANIFEST_SCHEMA_VERSION} (got ${JSON.stringify(version)})`);
  }

  const manifestId = input['manifestId'];
  if (typeof manifestId !== 'string' || manifestId.length === 0) {
    fail(errors, '/manifestId', 'expected a non-empty string');
  }

  const entries: AssetManifestEntry[] = [];
  const rawEntries = input['entries'];
  if (!Array.isArray(rawEntries)) {
    fail(errors, '/entries', `expected an array (got ${describe(rawEntries)})`);
  } else {
    rawEntries.forEach((e, i) => {
      const parsed = parseEntry(e, `/entries/${i}`, errors);
      if (parsed !== undefined) entries.push(parsed);
    });
    const seen = new Set<string>();
    for (const e of entries) {
      if (seen.has(e.id)) fail(errors, '/entries', `duplicate entry id "${e.id}"`);
      seen.add(e.id);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { assetManifestSchemaVersion: ASSET_MANIFEST_SCHEMA_VERSION, manifestId: manifestId as string, entries },
  };
}
