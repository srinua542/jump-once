/**
 * CampaignProfile — the versioned data record holding EVERY calibration
 * constant the Campaign Intelligence director uses (P6/S6.1, dm-0045).
 *
 * GDOS alignment: Section 4 — macro-level Game Director state (REQ-030/031)
 * and the Player Behavior Model (REQ-032).
 *
 * Why this exists (dm-0045): CampaignProfile is deliberately a SEPARATE
 * versioned schema from src/eval/gdos/Profile.ts's ScoringProfile, not an
 * extension of it. Per-level GDOS scoring calibration and campaign-level
 * behavioral/spike/retention calibration are distinct concerns; coupling them
 * would make an unrelated GDOS threshold-adjustment and a campaign
 * spike-sensitivity retune compete for the same versioned document, and the
 * ScoringProfile in-place-extension grace is already spent (dm-0039).
 * Following the same dm-0031 discipline: gate/director logic contains ZERO
 * calibration literals; every weight/threshold lives here in a strict-parsed,
 * versioned record. A test scores one campaign fixture under two profiles and
 * asserts different outcomes, proving externalization.
 *
 * Parse discipline mirrors ScoringProfile (dm-0010/0014): parseCampaignProfile
 * never throws, returns a Result with path-qualified errors, rejects unknown
 * keys at every object, requires finite numbers, and hard-rejects any
 * campaignProfileSchemaVersion other than CAMPAIGN_PROFILE_SCHEMA_VERSION.
 *
 * Lives in src/eval/campaign/ (dm-0047 — a top-level sibling of gdos/, never
 * inside it: campaign/ consumes P5 output as data, one abstraction level
 * above per-level scoring). Whitelist math only (no arithmetic here); imports
 * only the SchemaError shape (a type) from the schema layer.
 */

import type { SchemaError } from '../../schema/Parse';

/** Bump only with a written migration decision (dm-0010 policy). */
export const CAMPAIGN_PROFILE_SCHEMA_VERSION = 1;

/**
 * REQ-032 behavioral-signal sensitivity (S6.2 TapeAnalyzer calibration).
 * Every signal is derived from ReplayTape.frames only — frame counts, never
 * wall-clock (dm-0043).
 */
export interface BehaviorProfile {
  /** Consecutive no-input frames immediately before a jump input that counts as hesitation. >0. */
  readonly hesitationFrameThreshold: number;
  /** Window, in frames, a panic burst is measured over. >0. */
  readonly panicBurstWindowFrames: number;
  /** Inputs within the window that counts as a panic burst. >0 integer. */
  readonly panicBurstInputCount: number;
  /** Frames after a moveAxis direction reversal within which an absent jump input counts as a platform check (dm-0049 — an input-pattern proxy, not level geometry). >0 integer. */
  readonly platformCheckWindowFrames: number;
}

/** REQ-031 mechanic-mastery calibration (S6.3 MechanicTracker, KnowledgeModel). */
export interface MasteryProfile {
  /** Per-mechanic knowledge confidence, in [0,1], that counts as "mastered". */
  readonly masteryConfidenceThreshold: number;
  /** Minimum fraction, in [0,1], of a mechanic's exercised coverage-matrix cells that must sit at the top optimization tier for mastery (dm-0050). */
  readonly masteryRoutingConfidenceThreshold: number;
  /** EMA rate, in (0,1], KnowledgeModel moves per-mechanic confidence toward its pass/fail target each level (dm-0050). */
  readonly knowledgeLearningRate: number;
}

/** REQ-142 chapter-health trajectory calibration (S6.4 ChapterHealth, S6.5 CampaignDirector). */
export interface ChapterHealthProfile {
  /** EMA decay factor for the rolling chapterHealthBaseline. In (0,1) — closer to 1 weights recent chapters more. */
  readonly baselineDecay: number;
  /** Health drop below the rolling baseline that flags a difficulty spike. ≥0. */
  readonly spikeDropThreshold: number;
  /** Score-point band (≥0) within which two adjacent chapters' scores count as "flat" rather than rising/falling (dm-0051). */
  readonly trendFlatTolerance: number;
}

/** REQ-031 retentionPrediction composite weights (S6.5 CampaignDirector). Not all zero. */
export interface RetentionWeights {
  /** Weight of retry-cadence pressure (higher retry cadence with falling performance lowers retention). ≥0. */
  readonly retryCadence: number;
  /** Weight of optimization-depth trend (rising depth raises retention). ≥0. */
  readonly optimizationDepth: number;
  /** Weight of panic-cycle frequency (more panic lowers retention). ≥0. */
  readonly panicCycles: number;
  /** Weight of curiosity trend (rising curiosity raises retention). ≥0. */
  readonly curiosityTrend: number;
  /** Weight of chapter health (higher health raises retention). ≥0. */
  readonly chapterHealth: number;
}

/** The complete campaign calibration record. Versioned; cross-version reports are not comparable. */
export interface CampaignProfile {
  readonly campaignProfileSchemaVersion: number;
  /** Stable identity stamped onto every CampaignReport for provenance. Non-empty. */
  readonly profileId: string;
  readonly behavior: BehaviorProfile;
  readonly mastery: MasteryProfile;
  readonly chapterHealthCalibration: ChapterHealthProfile;
  readonly retentionWeights: RetentionWeights;
  /** Rolling window, in levels, converted to an EMA decay rate via 2/(N+1) for emotionalState/skillCurve/curiosityTrend rollups (dm-0052). >0 integer. */
  readonly trendWindowLevels: number;
  /** [0,1]-scale movement that counts as a genuine skillCurve/curiosityTrend trend, as opposed to chapterHealthCalibration.trendFlatTolerance which is chapter-SCORE-scaled (dm-0052). ≥0. */
  readonly trendMagnitudeTolerance: number;
}

export type CampaignProfileParseResult =
  | { readonly ok: true; readonly value: CampaignProfile }
  | { readonly ok: false; readonly errors: readonly SchemaError[] };

/**
 * The default campaign profile: an S6.1 calibration baseline. Behavioral
 * thresholds are chosen as reasonable frame counts at the project's fixed
 * step (dm-0003); campaign-trajectory weights and thresholds have no PRD
 * numeric source (unlike REQ-055/056's own thresholds) so this baseline is
 * the recalibration starting point future CDRE-equivalent evolution or a
 * ledgered profile change may adjust (dm-0045).
 */
export const DEFAULT_CAMPAIGN_PROFILE: CampaignProfile = Object.freeze({
  campaignProfileSchemaVersion: CAMPAIGN_PROFILE_SCHEMA_VERSION,
  profileId: 'campaign-default-v1',
  behavior: Object.freeze({
    hesitationFrameThreshold: 30,
    panicBurstWindowFrames: 20,
    panicBurstInputCount: 6,
    platformCheckWindowFrames: 15,
  }) as BehaviorProfile,
  mastery: Object.freeze({
    masteryConfidenceThreshold: 0.8,
    masteryRoutingConfidenceThreshold: 0.8,
    knowledgeLearningRate: 0.3,
  }) as MasteryProfile,
  chapterHealthCalibration: Object.freeze({
    baselineDecay: 0.3,
    spikeDropThreshold: 20,
    trendFlatTolerance: 5,
  }) as ChapterHealthProfile,
  retentionWeights: Object.freeze({
    retryCadence: 1,
    optimizationDepth: 1,
    panicCycles: 1,
    curiosityTrend: 1,
    chapterHealth: 1,
  }) as RetentionWeights,
  trendWindowLevels: 3,
  trendMagnitudeTolerance: 0.05,
}) as CampaignProfile;

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
      fail(errors, `${path}/${key}`, `unknown key "${key}" (campaign profile v${CAMPAIGN_PROFILE_SCHEMA_VERSION} is strict)`);
    }
  }
}

interface Bounds {
  readonly min?: number;
  readonly max?: number;
  readonly exclusiveMin?: number;
  readonly exclusiveMax?: number;
  readonly integer?: boolean;
}

function num(v: unknown, path: string, errors: Errors, bounds: Bounds): number | undefined {
  if (typeof v !== 'number') return fail(errors, path, `expected a number, got ${describe(v)}`);
  if (!Number.isFinite(v)) return fail(errors, path, 'expected a finite number');
  if (bounds.integer === true && !Number.isInteger(v)) return fail(errors, path, `expected an integer, got ${v}`);
  if (bounds.exclusiveMin !== undefined && v <= bounds.exclusiveMin) return fail(errors, path, `expected > ${bounds.exclusiveMin}, got ${v}`);
  if (bounds.exclusiveMax !== undefined && v >= bounds.exclusiveMax) return fail(errors, path, `expected < ${bounds.exclusiveMax}, got ${v}`);
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

function parseBehavior(v: unknown, path: string, errors: Errors): BehaviorProfile | undefined {
  const o = obj(v, path, ['hesitationFrameThreshold', 'panicBurstWindowFrames', 'panicBurstInputCount', 'platformCheckWindowFrames'], errors);
  if (o === undefined) return undefined;
  const hesitationFrameThreshold = num(o.hesitationFrameThreshold, `${path}/hesitationFrameThreshold`, errors, { exclusiveMin: 0 });
  const panicBurstWindowFrames = num(o.panicBurstWindowFrames, `${path}/panicBurstWindowFrames`, errors, { exclusiveMin: 0 });
  const panicBurstInputCount = num(o.panicBurstInputCount, `${path}/panicBurstInputCount`, errors, { exclusiveMin: 0, integer: true });
  const platformCheckWindowFrames = num(o.platformCheckWindowFrames, `${path}/platformCheckWindowFrames`, errors, { exclusiveMin: 0, integer: true });
  if (hesitationFrameThreshold === undefined || panicBurstWindowFrames === undefined || panicBurstInputCount === undefined || platformCheckWindowFrames === undefined) return undefined;
  return { hesitationFrameThreshold, panicBurstWindowFrames, panicBurstInputCount, platformCheckWindowFrames };
}

function parseMastery(v: unknown, path: string, errors: Errors): MasteryProfile | undefined {
  const o = obj(v, path, ['masteryConfidenceThreshold', 'masteryRoutingConfidenceThreshold', 'knowledgeLearningRate'], errors);
  if (o === undefined) return undefined;
  const masteryConfidenceThreshold = num(o.masteryConfidenceThreshold, `${path}/masteryConfidenceThreshold`, errors, { min: 0, max: 1 });
  const masteryRoutingConfidenceThreshold = num(o.masteryRoutingConfidenceThreshold, `${path}/masteryRoutingConfidenceThreshold`, errors, { min: 0, max: 1 });
  const knowledgeLearningRate = num(o.knowledgeLearningRate, `${path}/knowledgeLearningRate`, errors, { exclusiveMin: 0, max: 1 });
  if (masteryConfidenceThreshold === undefined || masteryRoutingConfidenceThreshold === undefined || knowledgeLearningRate === undefined) return undefined;
  return { masteryConfidenceThreshold, masteryRoutingConfidenceThreshold, knowledgeLearningRate };
}

function parseChapterHealthCalibration(v: unknown, path: string, errors: Errors): ChapterHealthProfile | undefined {
  const o = obj(v, path, ['baselineDecay', 'spikeDropThreshold', 'trendFlatTolerance'], errors);
  if (o === undefined) return undefined;
  const baselineDecay = num(o.baselineDecay, `${path}/baselineDecay`, errors, { exclusiveMin: 0, exclusiveMax: 1 });
  const spikeDropThreshold = num(o.spikeDropThreshold, `${path}/spikeDropThreshold`, errors, { min: 0 });
  const trendFlatTolerance = num(o.trendFlatTolerance, `${path}/trendFlatTolerance`, errors, { min: 0 });
  if (baselineDecay === undefined || spikeDropThreshold === undefined || trendFlatTolerance === undefined) return undefined;
  return { baselineDecay, spikeDropThreshold, trendFlatTolerance };
}

function parseRetentionWeights(v: unknown, path: string, errors: Errors): RetentionWeights | undefined {
  const o = obj(v, path, ['retryCadence', 'optimizationDepth', 'panicCycles', 'curiosityTrend', 'chapterHealth'], errors);
  if (o === undefined) return undefined;
  const retryCadence = num(o.retryCadence, `${path}/retryCadence`, errors, { min: 0 });
  const optimizationDepth = num(o.optimizationDepth, `${path}/optimizationDepth`, errors, { min: 0 });
  const panicCycles = num(o.panicCycles, `${path}/panicCycles`, errors, { min: 0 });
  const curiosityTrend = num(o.curiosityTrend, `${path}/curiosityTrend`, errors, { min: 0 });
  const chapterHealth = num(o.chapterHealth, `${path}/chapterHealth`, errors, { min: 0 });
  if (retryCadence === undefined || optimizationDepth === undefined || panicCycles === undefined || curiosityTrend === undefined || chapterHealth === undefined) return undefined;
  if (retryCadence === 0 && optimizationDepth === 0 && panicCycles === 0 && curiosityTrend === 0 && chapterHealth === 0) {
    fail(errors, path, 'retentionWeights must not be all zero — a vacuous composite gates nothing');
    return undefined;
  }
  return { retryCadence, optimizationDepth, panicCycles, curiosityTrend, chapterHealth };
}

/** Parse an already-JSON-decoded value into a CampaignProfile. Never throws. */
export function parseCampaignProfile(raw: unknown): CampaignProfileParseResult {
  const errors: Errors = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: [{ path: '', message: `expected a campaign profile object, got ${describe(raw)}` }] };
  }
  checkKeys(raw, '', ['campaignProfileSchemaVersion', 'profileId', 'behavior', 'mastery', 'chapterHealthCalibration', 'retentionWeights', 'trendWindowLevels', 'trendMagnitudeTolerance'], errors);
  if (raw.campaignProfileSchemaVersion !== CAMPAIGN_PROFILE_SCHEMA_VERSION) {
    fail(errors, '/campaignProfileSchemaVersion', `unsupported campaign profile version ${JSON.stringify(raw.campaignProfileSchemaVersion)}; this build reads exactly v${CAMPAIGN_PROFILE_SCHEMA_VERSION}`);
    return { ok: false, errors };
  }
  const profileId = str(raw.profileId, '/profileId', errors);
  const behavior = parseBehavior(raw.behavior, '/behavior', errors);
  const mastery = parseMastery(raw.mastery, '/mastery', errors);
  const chapterHealthCalibration = parseChapterHealthCalibration(raw.chapterHealthCalibration, '/chapterHealthCalibration', errors);
  const retentionWeights = parseRetentionWeights(raw.retentionWeights, '/retentionWeights', errors);
  const trendWindowLevels = num(raw.trendWindowLevels, '/trendWindowLevels', errors, { exclusiveMin: 0, integer: true });
  const trendMagnitudeTolerance = num(raw.trendMagnitudeTolerance, '/trendMagnitudeTolerance', errors, { min: 0 });
  if (
    errors.length > 0 ||
    profileId === undefined ||
    behavior === undefined ||
    mastery === undefined ||
    chapterHealthCalibration === undefined ||
    retentionWeights === undefined ||
    trendWindowLevels === undefined ||
    trendMagnitudeTolerance === undefined
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: { campaignProfileSchemaVersion: CAMPAIGN_PROFILE_SCHEMA_VERSION, profileId, behavior, mastery, chapterHealthCalibration, retentionWeights, trendWindowLevels, trendMagnitudeTolerance },
  };
}

/** Parse campaign profile JSON text. JSON syntax errors surface as a root-path error; never throws. */
export function parseCampaignProfileText(text: string): CampaignProfileParseResult {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ path: '', message: `invalid JSON: ${e instanceof Error ? e.message : String(e)}` }] };
  }
  return parseCampaignProfile(decoded);
}
