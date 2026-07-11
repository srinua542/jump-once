/**
 * TelemetryProfile — the versioned data record holding every calibration
 * constant the P8 telemetry-analysis layer uses (S8.6, dm-0073).
 *
 * Why a FOURTH versioned schema (dm-0073, resolving P8 plan open question 1):
 * following the exact reasoning dm-0057 used for GenProfile — telemetry
 * calibration (heatmap bin size now; P9/P11 may add asset-timing or
 * spike-sensitivity constants later) is a P8-owned concern, not a P6
 * campaign-trajectory concern. Coupling it to the verified CampaignProfile
 * would force a version bump on a document that did not change meaning. Zero
 * numeric literals in telemetry logic; every constant lives here in a
 * strict-parsed, versioned record.
 *
 * Parse discipline mirrors GenProfile/ScoringProfile/CampaignProfile
 * (dm-0010/0014): parseTelemetryProfile never throws, returns a Result with
 * path-qualified errors, rejects unknown keys at every object, requires finite
 * numbers, and hard-rejects any telemetryProfileSchemaVersion other than
 * TELEMETRY_PROFILE_SCHEMA_VERSION.
 *
 * tools/ isolation (dm-0066): imports only the SchemaError shape (a type) from
 * the schema layer, exactly as GenProfile does. No rendering, no wall clock.
 */

import type { SchemaError } from '../../src/schema/Parse';

/** Bump only with a written migration decision (dm-0010 policy). */
export const TELEMETRY_PROFILE_SCHEMA_VERSION = 1;

/** Death-coordinate heatmap calibration (S8.6 DeathHeatmap.ts). */
export interface HeatmapCalibration {
  /** Square heatmap-cell edge length in world units. Deaths bin by floor(pos / binWorldSize). >0. */
  readonly binWorldSize: number;
}

/** The complete telemetry calibration record. Versioned; grown per P8/P9 slice like the other profiles. */
export interface TelemetryProfile {
  readonly telemetryProfileSchemaVersion: number;
  /** Stable identity stamped onto telemetry-analysis provenance. Non-empty. */
  readonly profileId: string;
  readonly heatmap: HeatmapCalibration;
}

export type TelemetryProfileParseResult =
  | { readonly ok: true; readonly value: TelemetryProfile }
  | { readonly ok: false; readonly errors: readonly SchemaError[] };

/**
 * The default telemetry profile: one world unit per heatmap cell (one tile at
 * the project's tileSize-1 fixtures). No PRD numeric source, so this baseline
 * is the recalibration starting point a ledgered profile change may adjust —
 * never a constant buried in telemetry logic.
 */
export const DEFAULT_TELEMETRY_PROFILE: TelemetryProfile = Object.freeze({
  telemetryProfileSchemaVersion: TELEMETRY_PROFILE_SCHEMA_VERSION,
  profileId: 'telemetry-default-v1',
  heatmap: Object.freeze({ binWorldSize: 1 }) as HeatmapCalibration,
}) as TelemetryProfile;

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
    if (!allowed.includes(key)) {
      fail(errors, `${path}/${key}`, `unknown key "${key}" (telemetry profile v${TELEMETRY_PROFILE_SCHEMA_VERSION} is strict)`);
    }
  }
}

function posNum(v: unknown, path: string, errors: Errors): number | undefined {
  if (typeof v !== 'number') return fail(errors, path, `expected a number, got ${describe(v)}`);
  if (!Number.isFinite(v)) return fail(errors, path, 'expected a finite number');
  if (v <= 0) return fail(errors, path, `expected > 0, got ${v}`);
  return v;
}

function str(v: unknown, path: string, errors: Errors): string | undefined {
  if (typeof v !== 'string') return fail(errors, path, `expected a string, got ${describe(v)}`);
  if (v.length === 0) return fail(errors, path, 'expected a non-empty string');
  return v;
}

function parseHeatmap(v: unknown, path: string, errors: Errors): HeatmapCalibration | undefined {
  if (!isRecord(v)) return fail(errors, path, `expected an object, got ${describe(v)}`);
  checkKeys(v, path, ['binWorldSize'], errors);
  const binWorldSize = posNum(v.binWorldSize, `${path}/binWorldSize`, errors);
  if (binWorldSize === undefined) return undefined;
  return { binWorldSize };
}

/** The only construction path from untrusted input to a typed TelemetryProfile. */
export function parseTelemetryProfile(raw: unknown): TelemetryProfileParseResult {
  const errors: Errors = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: [{ path: '', message: `expected a telemetry profile object, got ${describe(raw)}` }] };
  }
  checkKeys(raw, '', ['telemetryProfileSchemaVersion', 'profileId', 'heatmap'], errors);

  if (raw.telemetryProfileSchemaVersion !== TELEMETRY_PROFILE_SCHEMA_VERSION) {
    fail(errors, '/telemetryProfileSchemaVersion', `unsupported version ${JSON.stringify(raw.telemetryProfileSchemaVersion)}; this build reads exactly v${TELEMETRY_PROFILE_SCHEMA_VERSION}`);
    return { ok: false, errors };
  }

  const profileId = str(raw.profileId, '/profileId', errors);
  const heatmap = parseHeatmap(raw.heatmap, '/heatmap', errors);

  if (errors.length > 0 || profileId === undefined || heatmap === undefined) {
    return { ok: false, errors };
  }
  return { ok: true, value: { telemetryProfileSchemaVersion: TELEMETRY_PROFILE_SCHEMA_VERSION, profileId, heatmap } };
}
