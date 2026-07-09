/**
 * Profile — the ScoringProfile: the versioned data record holding EVERY
 * calibration constant the GDOS scoring engine uses (P5/S5.1, dm-0031).
 *
 * GDOS alignment: Section 6 (emotional thresholds REQ-055 + streamability
 * matrix REQ-056 as quality gates), Section 7 (Information Density regulator
 * REQ-061). This file makes those numbers DATA, not code constants.
 *
 * Why this exists (dm-0031 — the load-bearing P5 decision): the §6 gate
 * numbers have no physical measurement, so gate logic that hardcodes weights
 * produces pseudo-measurements the P7/P10 generators Goodhart against, and
 * every recalibration becomes a code change. Instead every weight, coefficient
 * and threshold lives here in a strict-parsed, versioned record. Gate logic
 * contains ZERO calibration literals; recalibration is a data change plus a
 * ledger entry (the channel CDRE — S5.8 — drives). A test scores one bundle
 * under two profiles and asserts different verdicts, proving externalization.
 *
 * Parse discipline mirrors the level parser (dm-0010/0014): parseProfile never
 * throws, returns a Result with path-qualified errors, rejects unknown keys at
 * every object, requires finite numbers, and hard-rejects any schemaVersion
 * other than PROFILE_SCHEMA_VERSION.
 *
 * Lives in src/eval/gdos/. Whitelist math only (no arithmetic here); imports
 * only the SchemaError shape (a type) from the schema layer.
 */

import type { SchemaError } from '../../schema/Parse';

/** Bump only with a written migration decision (dm-0010 policy). */
export const PROFILE_SCHEMA_VERSION = 1;

/** REQ-055 emotional-threshold gate cutoffs. */
export interface EmotionalThresholds {
  readonly curiosity: number;
  readonly confidence: number;
  readonly surprise: number;
  readonly mastery: number;
}

/** Emotional estimator calibration (dm-0031; estimator semantics dm-0036). */
export interface EmotionalProfile {
  readonly thresholds: EmotionalThresholds;
  /** Score deducted from 100 per First-Time reload — fewer deaths ⇒ more confidence. ≥0. */
  readonly confidenceAttemptPenalty: number;
  /** Maps the Curious-Explorer's fractional route overshoot to a curiosity score. ≥0. */
  readonly curiosityDivergenceGain: number;
  /** Score gained per pre-success reload (plan invalidation ⇒ surprise). ≥0. */
  readonly surpriseAttemptGain: number;
  /** Optimization delta (seconds) that yields full mastery. >0. */
  readonly masteryDeltaReferenceSeconds: number;
}

/** REQ-056 streamability-matrix gate cutoffs. */
export interface StreamabilityThresholds {
  readonly shareability: number;
  readonly clipPotential: number;
  readonly reactionDensity: number;
  readonly replayValue: number;
}

/** Relative weights for the Shareability composite. Not all zero. */
export interface ShareWeights {
  readonly reaction: number;
  readonly clip: number;
  readonly replay: number;
}

/** Streamability estimator calibration. */
export interface StreamabilityProfile {
  readonly thresholds: StreamabilityThresholds;
  /** Reaction events per second that yields full reaction density. >0. */
  readonly reactionEventReferencePerSecond: number;
  /** Clip-potential gain per unit of the surprise score (in [0,100]). ≥0. */
  readonly clipSurpriseGain: number;
  /** Clip-potential gain per kinetic entity present. ≥0. */
  readonly clipKineticGain: number;
  /** Replay-value gain per second of optimization delta. ≥0. */
  readonly replayDeltaGain: number;
  /** Replay-value gain per distinct archetype completion time (route multiplicity). ≥0. */
  readonly replayRouteGain: number;
  readonly shareWeights: ShareWeights;
}

/** REQ-061 Information Density regulator + REQ-016 fairness calibration. */
export interface InfoDensityProfile {
  /** Screen window width in tiles. Integer >0. */
  readonly viewportTilesX: number;
  /** Screen window height in tiles. Integer >0. */
  readonly viewportTilesY: number;
  /** Below this peak per-screen element count the level reads as boring. Integer ≥0. */
  readonly minElementsPerScreen: number;
  /** Above this per-screen element count any screen reads as overwhelming. Integer ≥ min. */
  readonly maxElementsPerScreen: number;
  /** Ticks before a death at which the killing hazard must have been on-screen (REQ-016). Integer ≥0. */
  readonly fairnessLookbackTicks: number;
  /** World-unit-per-tile multiples: a lethal entity within this many tiles of a death is its cause. ≥0. */
  readonly fairnessRadiusTiles: number;
}

/** The complete calibration record. Versioned; cross-version scores are not comparable. */
export interface ScoringProfile {
  readonly schemaVersion: number;
  /** Stable identity stamped onto every GdosReport for provenance. Non-empty. */
  readonly profileId: string;
  readonly emotional: EmotionalProfile;
  readonly streamability: StreamabilityProfile;
  readonly infoDensity: InfoDensityProfile;
}

export type ProfileParseResult =
  | { readonly ok: true; readonly value: ScoringProfile }
  | { readonly ok: false; readonly errors: readonly SchemaError[] };

/**
 * The default profile: the PRD's own numbers as data. Thresholds are REQ-055
 * (curiosity/confidence ≥90, surprise/mastery ≥95) and REQ-056
 * (shareability ≥85, clip ≥90, reaction ≥95, replay ≥90); coefficients are the
 * S5.1 calibration baseline CDRE (S5.8) may evolve.
 */
export const DEFAULT_PROFILE: ScoringProfile = Object.freeze({
  schemaVersion: PROFILE_SCHEMA_VERSION,
  profileId: 'gdos-default-v1',
  emotional: Object.freeze({
    thresholds: Object.freeze({ curiosity: 90, confidence: 90, surprise: 95, mastery: 95 }),
    confidenceAttemptPenalty: 5,
    curiosityDivergenceGain: 200,
    surpriseAttemptGain: 32,
    masteryDeltaReferenceSeconds: 4,
  }) as EmotionalProfile,
  streamability: Object.freeze({
    thresholds: Object.freeze({ shareability: 85, clipPotential: 90, reactionDensity: 95, replayValue: 90 }),
    reactionEventReferencePerSecond: 3,
    clipSurpriseGain: 0.6,
    clipKineticGain: 10,
    replayDeltaGain: 15,
    replayRouteGain: 10,
    shareWeights: Object.freeze({ reaction: 1, clip: 1, replay: 1 }),
  }) as StreamabilityProfile,
  infoDensity: Object.freeze({
    viewportTilesX: 16,
    viewportTilesY: 12,
    minElementsPerScreen: 1,
    maxElementsPerScreen: 8,
    fairnessLookbackTicks: 30,
    fairnessRadiusTiles: 2,
  }) as InfoDensityProfile,
}) as ScoringProfile;

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
    if (!allowed.includes(key)) fail(errors, `${path}/${key}`, `unknown key "${key}" (profile v${PROFILE_SCHEMA_VERSION} is strict)`);
  }
}

interface Bounds {
  readonly min?: number;
  readonly max?: number;
  readonly exclusiveMin?: number;
  readonly integer?: boolean;
}

function num(v: unknown, path: string, errors: Errors, bounds: Bounds): number | undefined {
  if (typeof v !== 'number') return fail(errors, path, `expected a number, got ${describe(v)}`);
  if (!Number.isFinite(v)) return fail(errors, path, 'expected a finite number');
  if (bounds.integer === true && !Number.isInteger(v)) return fail(errors, path, `expected an integer, got ${v}`);
  if (bounds.exclusiveMin !== undefined && v <= bounds.exclusiveMin) return fail(errors, path, `expected > ${bounds.exclusiveMin}, got ${v}`);
  if (bounds.min !== undefined && v < bounds.min) return fail(errors, path, `expected >= ${bounds.min}, got ${v}`);
  if (bounds.max !== undefined && v > bounds.max) return fail(errors, path, `expected <= ${bounds.max}, got ${v}`);
  return v === 0 ? 0 : v;
}

function str(v: unknown, path: string, errors: Errors): string | undefined {
  if (typeof v !== 'string') return fail(errors, path, `expected a string, got ${describe(v)}`);
  if (v.length === 0) return fail(errors, path, 'expected a non-empty string');
  return v;
}

function obj(v: unknown, path: string, allowed: readonly string[], errors: Errors): Record<string, unknown> | undefined {
  if (!isRecord(v)) return fail(errors, path, `expected an object, got ${describe(v)}`);
  checkKeys(v, path, allowed, errors);
  return v;
}

function parseThreshold(v: unknown, path: string, errors: Errors): number | undefined {
  return num(v, path, errors, { min: 0, max: 100 });
}

function parseEmotional(v: unknown, path: string, errors: Errors): EmotionalProfile | undefined {
  const o = obj(v, path, ['thresholds', 'confidenceAttemptPenalty', 'curiosityDivergenceGain', 'surpriseAttemptGain', 'masteryDeltaReferenceSeconds'], errors);
  if (o === undefined) return undefined;
  const to = obj(o.thresholds, `${path}/thresholds`, ['curiosity', 'confidence', 'surprise', 'mastery'], errors);
  let thresholds: EmotionalThresholds | undefined;
  if (to !== undefined) {
    const curiosity = parseThreshold(to.curiosity, `${path}/thresholds/curiosity`, errors);
    const confidence = parseThreshold(to.confidence, `${path}/thresholds/confidence`, errors);
    const surprise = parseThreshold(to.surprise, `${path}/thresholds/surprise`, errors);
    const mastery = parseThreshold(to.mastery, `${path}/thresholds/mastery`, errors);
    if (curiosity !== undefined && confidence !== undefined && surprise !== undefined && mastery !== undefined) {
      thresholds = { curiosity, confidence, surprise, mastery };
    }
  }
  const confidenceAttemptPenalty = num(o.confidenceAttemptPenalty, `${path}/confidenceAttemptPenalty`, errors, { min: 0 });
  const curiosityDivergenceGain = num(o.curiosityDivergenceGain, `${path}/curiosityDivergenceGain`, errors, { min: 0 });
  const surpriseAttemptGain = num(o.surpriseAttemptGain, `${path}/surpriseAttemptGain`, errors, { min: 0 });
  const masteryDeltaReferenceSeconds = num(o.masteryDeltaReferenceSeconds, `${path}/masteryDeltaReferenceSeconds`, errors, { exclusiveMin: 0 });
  if (thresholds === undefined || confidenceAttemptPenalty === undefined || curiosityDivergenceGain === undefined || surpriseAttemptGain === undefined || masteryDeltaReferenceSeconds === undefined) return undefined;
  return { thresholds, confidenceAttemptPenalty, curiosityDivergenceGain, surpriseAttemptGain, masteryDeltaReferenceSeconds };
}

function parseStreamability(v: unknown, path: string, errors: Errors): StreamabilityProfile | undefined {
  const o = obj(v, path, ['thresholds', 'reactionEventReferencePerSecond', 'clipSurpriseGain', 'clipKineticGain', 'replayDeltaGain', 'replayRouteGain', 'shareWeights'], errors);
  if (o === undefined) return undefined;
  const to = obj(o.thresholds, `${path}/thresholds`, ['shareability', 'clipPotential', 'reactionDensity', 'replayValue'], errors);
  let thresholds: StreamabilityThresholds | undefined;
  if (to !== undefined) {
    const shareability = parseThreshold(to.shareability, `${path}/thresholds/shareability`, errors);
    const clipPotential = parseThreshold(to.clipPotential, `${path}/thresholds/clipPotential`, errors);
    const reactionDensity = parseThreshold(to.reactionDensity, `${path}/thresholds/reactionDensity`, errors);
    const replayValue = parseThreshold(to.replayValue, `${path}/thresholds/replayValue`, errors);
    if (shareability !== undefined && clipPotential !== undefined && reactionDensity !== undefined && replayValue !== undefined) {
      thresholds = { shareability, clipPotential, reactionDensity, replayValue };
    }
  }
  const reactionEventReferencePerSecond = num(o.reactionEventReferencePerSecond, `${path}/reactionEventReferencePerSecond`, errors, { exclusiveMin: 0 });
  const clipSurpriseGain = num(o.clipSurpriseGain, `${path}/clipSurpriseGain`, errors, { min: 0 });
  const clipKineticGain = num(o.clipKineticGain, `${path}/clipKineticGain`, errors, { min: 0 });
  const replayDeltaGain = num(o.replayDeltaGain, `${path}/replayDeltaGain`, errors, { min: 0 });
  const replayRouteGain = num(o.replayRouteGain, `${path}/replayRouteGain`, errors, { min: 0 });
  const wo = obj(o.shareWeights, `${path}/shareWeights`, ['reaction', 'clip', 'replay'], errors);
  let shareWeights: ShareWeights | undefined;
  if (wo !== undefined) {
    const reaction = num(wo.reaction, `${path}/shareWeights/reaction`, errors, { min: 0 });
    const clip = num(wo.clip, `${path}/shareWeights/clip`, errors, { min: 0 });
    const replay = num(wo.replay, `${path}/shareWeights/replay`, errors, { min: 0 });
    if (reaction !== undefined && clip !== undefined && replay !== undefined) {
      if (reaction + clip + replay <= 0) fail(errors, `${path}/shareWeights`, 'share weights must not all be zero');
      else shareWeights = { reaction, clip, replay };
    }
  }
  if (thresholds === undefined || reactionEventReferencePerSecond === undefined || clipSurpriseGain === undefined || clipKineticGain === undefined || replayDeltaGain === undefined || replayRouteGain === undefined || shareWeights === undefined) return undefined;
  return { thresholds, reactionEventReferencePerSecond, clipSurpriseGain, clipKineticGain, replayDeltaGain, replayRouteGain, shareWeights };
}

function parseInfoDensity(v: unknown, path: string, errors: Errors): InfoDensityProfile | undefined {
  const o = obj(v, path, ['viewportTilesX', 'viewportTilesY', 'minElementsPerScreen', 'maxElementsPerScreen', 'fairnessLookbackTicks', 'fairnessRadiusTiles'], errors);
  if (o === undefined) return undefined;
  const viewportTilesX = num(o.viewportTilesX, `${path}/viewportTilesX`, errors, { integer: true, exclusiveMin: 0 });
  const viewportTilesY = num(o.viewportTilesY, `${path}/viewportTilesY`, errors, { integer: true, exclusiveMin: 0 });
  const minElementsPerScreen = num(o.minElementsPerScreen, `${path}/minElementsPerScreen`, errors, { integer: true, min: 0 });
  const maxElementsPerScreen = num(o.maxElementsPerScreen, `${path}/maxElementsPerScreen`, errors, { integer: true, min: 0 });
  const fairnessLookbackTicks = num(o.fairnessLookbackTicks, `${path}/fairnessLookbackTicks`, errors, { integer: true, min: 0 });
  const fairnessRadiusTiles = num(o.fairnessRadiusTiles, `${path}/fairnessRadiusTiles`, errors, { min: 0 });
  if (minElementsPerScreen !== undefined && maxElementsPerScreen !== undefined && maxElementsPerScreen < minElementsPerScreen) {
    fail(errors, `${path}/maxElementsPerScreen`, `max (${maxElementsPerScreen}) must be >= min (${minElementsPerScreen})`);
    return undefined;
  }
  if (viewportTilesX === undefined || viewportTilesY === undefined || minElementsPerScreen === undefined || maxElementsPerScreen === undefined || fairnessLookbackTicks === undefined || fairnessRadiusTiles === undefined) return undefined;
  return { viewportTilesX, viewportTilesY, minElementsPerScreen, maxElementsPerScreen, fairnessLookbackTicks, fairnessRadiusTiles };
}

/** Parse an already-JSON-decoded value into a ScoringProfile. Never throws. */
export function parseProfile(raw: unknown): ProfileParseResult {
  const errors: Errors = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: [{ path: '', message: `expected a profile object, got ${describe(raw)}` }] };
  }
  checkKeys(raw, '', ['schemaVersion', 'profileId', 'emotional', 'streamability', 'infoDensity'], errors);
  if (raw.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    fail(errors, '/schemaVersion', `unsupported profile version ${JSON.stringify(raw.schemaVersion)}; this build reads exactly v${PROFILE_SCHEMA_VERSION}`);
    return { ok: false, errors };
  }
  const profileId = str(raw.profileId, '/profileId', errors);
  const emotional = parseEmotional(raw.emotional, '/emotional', errors);
  const streamability = parseStreamability(raw.streamability, '/streamability', errors);
  const infoDensity = parseInfoDensity(raw.infoDensity, '/infoDensity', errors);
  if (errors.length > 0 || profileId === undefined || emotional === undefined || streamability === undefined || infoDensity === undefined) {
    return { ok: false, errors };
  }
  return { ok: true, value: { schemaVersion: PROFILE_SCHEMA_VERSION, profileId, emotional, streamability, infoDensity } };
}

/** Parse profile JSON text. JSON syntax errors surface as a root-path error; never throws. */
export function parseProfileText(text: string): ProfileParseResult {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ path: '', message: `invalid JSON: ${e instanceof Error ? e.message : String(e)}` }] };
  }
  return parseProfile(decoded);
}
