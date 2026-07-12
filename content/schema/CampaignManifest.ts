/**
 * CampaignManifest — the campaign-level roster + REQ-084 distribution target
 * (P10/S10.1, dm-0108/dm-0109). Strict-parsed, same discipline as
 * ChapterFramework and the level/profile schemas (dm-0010/dm-0014).
 *
 * GDOS alignment: Section 9 — the campaign is an ordered list of chapters and
 * a calibrated difficulty distribution (REQ-084: Easy 20% / Medium 35% /
 * Hard 25% / Harder 15% / Very-Hard 5%). Those percentages are CALIBRATED
 * DATA here, not hardcoded in enforcement logic (REQ-084's own wording); the
 * campaign assembler (S10.5) checks the measured tier distribution against
 * `difficultyDistribution` within `distributionTolerance`.
 *
 * Lives in content/schema/ (dm-0108). Imports only the DifficultyTier
 * vocabulary and the SchemaError shape as types. Pure.
 */

import { DIFFICULTY_TIERS, type DifficultyTier } from './ChapterFramework';
import type { SchemaError } from '../../src/schema/Parse';

/** Bump only with a written migration decision (dm-0010 policy). */
export const MANIFEST_SCHEMA_VERSION = 1;

/** The REQ-084 target distribution as fractions of the campaign, one per tier (must sum to ~1). */
export type DifficultyDistribution = Readonly<Record<DifficultyTier, number>>;

export interface CampaignManifest {
  readonly manifestSchemaVersion: number;
  /** Stable campaign identity; non-empty. */
  readonly campaignId: string;
  /** Ordered chapter ids (curriculum order); ≥1, unique, each non-empty. */
  readonly chapters: readonly string[];
  /** REQ-084 target fractions per tier (sum to ~1 within a small epsilon). */
  readonly difficultyDistribution: DifficultyDistribution;
  /** Allowed absolute per-bucket deviation (fraction in [0,1]) of the measured distribution from the target. */
  readonly distributionTolerance: number;
}

export type ManifestParseResult =
  | { readonly ok: true; readonly value: CampaignManifest }
  | { readonly ok: false; readonly errors: readonly SchemaError[] };

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
    if (!allowed.includes(key)) fail(errors, `${path}/${key}`, `unknown key "${key}" (manifest v${MANIFEST_SCHEMA_VERSION} is strict)`);
  }
}

function str(v: unknown, path: string, errors: Errors): string | undefined {
  if (typeof v !== 'string') return fail(errors, path, `expected a string, got ${describe(v)}`);
  if (v.length === 0) return fail(errors, path, 'expected a non-empty string');
  return v;
}

function parseFraction(v: unknown, path: string, errors: Errors): number | undefined {
  if (typeof v !== 'number') return fail(errors, path, `expected a number, got ${describe(v)}`);
  if (!Number.isFinite(v)) return fail(errors, path, 'expected a finite number');
  if (v < 0 || v > 1) return fail(errors, path, `expected a fraction in [0,1], got ${v}`);
  return v === 0 ? 0 : v;
}

function parseChapters(v: unknown, path: string, errors: Errors): readonly string[] | undefined {
  if (!Array.isArray(v)) return fail(errors, path, `expected an array, got ${describe(v)}`);
  if (v.length === 0) return fail(errors, path, 'a campaign must have at least one chapter');
  const out: string[] = [];
  const seen = new Set<string>();
  let ok = true;
  for (let i = 0; i < v.length; i++) {
    const s = str(v[i], `${path}/${i}`, errors);
    if (s === undefined) { ok = false; continue; }
    if (seen.has(s)) { fail(errors, `${path}/${i}`, `duplicate chapterId "${s}"`); ok = false; continue; }
    seen.add(s);
    out.push(s);
  }
  return ok ? out : undefined;
}

function parseDistribution(v: unknown, path: string, errors: Errors): DifficultyDistribution | undefined {
  if (!isRecord(v)) return fail(errors, path, `expected an object, got ${describe(v)}`);
  checkKeys(v, path, DIFFICULTY_TIERS, errors);
  const out = {} as Record<DifficultyTier, number>;
  let ok = true;
  let sum = 0;
  for (const tier of DIFFICULTY_TIERS) {
    const f = parseFraction(v[tier], `${path}/${tier}`, errors);
    if (f === undefined) { ok = false; continue; }
    out[tier] = f;
    sum += f;
  }
  if (ok && Math.abs(sum - 1) > 1e-6) {
    fail(errors, path, `difficulty distribution fractions must sum to 1 (got ${sum})`);
    return undefined;
  }
  return ok ? out : undefined;
}

/** Parse an already-JSON-decoded value into a CampaignManifest. Never throws. */
export function parseCampaignManifest(raw: unknown): ManifestParseResult {
  const errors: Errors = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: [{ path: '', message: `expected a campaign-manifest object, got ${describe(raw)}` }] };
  }
  checkKeys(raw, '', ['manifestSchemaVersion', 'campaignId', 'chapters', 'difficultyDistribution', 'distributionTolerance'], errors);
  if (raw.manifestSchemaVersion !== MANIFEST_SCHEMA_VERSION) {
    fail(errors, '/manifestSchemaVersion', `unsupported manifest version ${JSON.stringify(raw.manifestSchemaVersion)}; this build reads exactly v${MANIFEST_SCHEMA_VERSION}`);
    return { ok: false, errors };
  }
  const campaignId = str(raw.campaignId, '/campaignId', errors);
  const chapters = parseChapters(raw.chapters, '/chapters', errors);
  const difficultyDistribution = parseDistribution(raw.difficultyDistribution, '/difficultyDistribution', errors);
  const distributionTolerance = parseFraction(raw.distributionTolerance, '/distributionTolerance', errors);
  if (errors.length > 0 || campaignId === undefined || chapters === undefined || difficultyDistribution === undefined || distributionTolerance === undefined) {
    return { ok: false, errors };
  }
  return { ok: true, value: { manifestSchemaVersion: MANIFEST_SCHEMA_VERSION, campaignId, chapters, difficultyDistribution, distributionTolerance } };
}

/** Parse manifest JSON text. Never throws. */
export function parseCampaignManifestText(text: string): ManifestParseResult {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ path: '', message: `invalid JSON: ${e instanceof Error ? e.message : String(e)}` }] };
  }
  return parseCampaignManifest(decoded);
}

/** Serialize a CampaignManifest to canonical JSON (round-trips through the parser). */
export function serializeCampaignManifest(manifest: CampaignManifest): string {
  const dist = {} as Record<DifficultyTier, number>;
  for (const tier of DIFFICULTY_TIERS) dist[tier] = manifest.difficultyDistribution[tier];
  return JSON.stringify(
    {
      manifestSchemaVersion: manifest.manifestSchemaVersion,
      campaignId: manifest.campaignId,
      chapters: manifest.chapters,
      difficultyDistribution: dist,
      distributionTolerance: manifest.distributionTolerance,
    },
    null,
    2,
  );
}
