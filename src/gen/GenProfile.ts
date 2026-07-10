/**
 * GenProfile — the versioned data record holding EVERY calibration constant
 * the P7 generation layer uses (P7/S7.1, dm-0057).
 *
 * GDOS alignment: Section 7 (Procedural Design Assistant), Section 9
 * (creativity/iteration loop, mechanic lifecycle), Section 10 (level
 * manufacturing pipeline).
 *
 * Why this exists (dm-0057): GenProfile is deliberately a THIRD versioned
 * schema, separate from gdos/Profile.ts's ScoringProfile (per-level scoring
 * calibration) and campaign/CampaignProfile.ts's CampaignProfile
 * (campaign-trajectory calibration) — the dm-0045 separation logic extended.
 * Lifecycle exhaustion thresholds, creativity budgets, and intent-gate rigor
 * bounds are generation concerns; coupling them to a verified schema would
 * force version bumps on documents that did not change meaning. Following the
 * dm-0031 discipline: generation logic contains ZERO calibration literals;
 * every threshold/weight/budget lives here in a strict-parsed, versioned
 * record, and a two-profile test per calibrated field proves externalization.
 *
 * Parse discipline mirrors ScoringProfile/CampaignProfile (dm-0010/0014):
 * parseGenProfile never throws, returns a Result with path-qualified errors,
 * rejects unknown keys at every object, requires finite numbers, and
 * hard-rejects any genProfileSchemaVersion other than
 * GEN_PROFILE_SCHEMA_VERSION.
 *
 * Lives in src/gen/ (dm-0057 — design-time generation logic; nothing outside
 * gen/ imports gen/). Whitelist math only (no arithmetic here); imports only
 * the SchemaError shape (a type) from the schema layer.
 */

import type { SchemaError } from '../schema/Parse';

/** Bump only with a written migration decision (dm-0010 policy). */
export const GEN_PROFILE_SCHEMA_VERSION = 1;

/**
 * REQ-082 lifecycle-stage assessment calibration (S7.1 gen/Lifecycle.ts).
 * Novelty figures are noveltyDivergence distances (P5 S5.7/S5.9 scale, ≥0).
 */
export interface LifecycleCalibration {
  /** Levels that must have used a mechanic before Development is supportable. >0 integer. */
  readonly developmentMinLevels: number;
  /** Divergence below which a candidate configuration counts as low-novelty (Saturation signal). ≥0. */
  readonly saturationNoveltyThreshold: number;
  /** Consecutive low-novelty configurations that make Exhaustion supportable. >0 integer. */
  readonly exhaustionConsecutiveLowNovelty: number;
}

/**
 * Per-kind entity dynamics the generator writes into candidate definitions
 * (S7.4 gen/Generator.ts). Gameplay values are data, never literals in the
 * template code (the project's data-driven invariant).
 */
export interface EntityTuning {
  /** Spring launch, world units/s. The pair must not be the zero vector (SpringDef contract). */
  readonly springLaunchVelocityX: number;
  /** Upward spring component (positive = up; the generator negates for y-down). ≥0. */
  readonly springLaunchVelocityY: number;
  /** Conveyor surface velocity, world units/s. Non-zero. */
  readonly conveyorSurfaceVelocityX: number;
  /** Laser full on+off cycle, seconds. >0. */
  readonly laserPeriodSeconds: number;
  /** Fraction of the period the beam is lethal. (0,1]. */
  readonly laserOnFractionOfPeriod: number;
  /** Laser cycle offset, seconds. ≥0. */
  readonly laserPhaseSeconds: number;
  /** Waypoint traversal speed for moving platforms/hazards, world units/s. >0. */
  readonly moverSpeed: number;
  /** Collapsing-floor delay, seconds. ≥0. */
  readonly collapseDelaySeconds: number;
  /** Gravity-zone multiplier. Finite, non-zero. */
  readonly gravityZoneScale: number;
}

/** REQ-090 phases 1–2 template calibration (S7.4 gen/Generator.ts). */
export interface GeneratorCalibration {
  /** Corridor floor length range, tiles (borders excluded). >0 integers, min ≤ max. */
  readonly corridorMinLength: number;
  readonly corridorMaxLength: number;
  /** Air rows above the floor (jump clearance). >0 integer. */
  readonly corridorAirRows: number;
  /** Widest gap the template may cut, tiles — must stay jumpable. >0 integer. */
  readonly maxGapWidth: number;
  /** Completion-time tiers, seconds: generous > expert > 0 (ConstraintsDef wants strictly decreasing). */
  readonly parTimeGenerousSeconds: number;
  readonly parTimeExpertSeconds: number;
  readonly entityTuning: EntityTuning;
}

/**
 * REQ-081 creativity/iteration loop selection weights (S7.5 gen/Creativity.ts).
 * Each ≥0; not all zero. Combined as a normalized weighted mean over three
 * observable components: gate pass, mean gate score, and novelty divergence.
 */
export interface SelectionWeights {
  /** Weight of the GDOS pass component (full pass = 1, else passed-gate fraction). ≥0. */
  readonly gatePass: number;
  /** Weight of the mean-metric-score component (mean of all gate scores / 100). ≥0. */
  readonly gateScore: number;
  /** Weight of the novelty component (divergence vs the corpus, clamped to [0,1]; empty corpus = 1). ≥0. */
  readonly novelty: number;
}

/** REQ-081 creativity/iteration loop calibration (S7.5 gen/Creativity.ts). */
export interface CreativityCalibration {
  /** Variations bred per generation. >0 integer. */
  readonly variationsPerGeneration: number;
  /** Hard generation cap — the halting backstop regardless of convergence. >0 integer. */
  readonly hardCapGenerations: number;
  /**
   * Diminishing-returns epsilon (open Q3 resolved): the loop stops when a
   * generation improves the BEST selection score by less than this. The best
   * score is monotone non-decreasing (survivors carry forward), so
   * "improvement" is always ≥0; epsilon 0 means "never satisfied by
   * convergence — run the full hard cap". ≥0.
   */
  readonly diminishingReturnsEpsilon: number;
  /** Probability a variation is bred by combine (vs mutate) when ≥2 survivors exist. [0,1]. */
  readonly combineProbability: number;
  readonly selectionWeights: SelectionWeights;
}

/**
 * REQ-091 single-sentence intent-gate calibration (S7.6 gen/IntentGate.ts).
 * The length band a rigorous lesson sentence must sit in; the causal-connective
 * grammar that makes it a LESSON is a structural constant in the gate, not
 * calibration.
 */
export interface IntentCalibration {
  /** Fewest words a lesson sentence may have. >0 integer. */
  readonly minWords: number;
  /** Most words a lesson sentence may have. Integer ≥ minWords. */
  readonly maxWords: number;
}

/** REQ-090 manufacturing-pipeline calibration (S7.7 gen/Pipeline.ts). */
export interface PipelineCalibration {
  /** Bounded targeted-revision attempts when a gate fails before the pipeline rejects. ≥0 integer. */
  readonly revisionBudget: number;
}

/** REQ-060 PDA calibration (S7.3 gen/Pda.ts). */
export interface PdaCalibration {
  /** Hard cap on emitted opportunities per report; overflow is counted, never silent (dm-0058). >0 integer. */
  readonly maxOpportunities: number;
  /** Chapter-health score (0–100 scale) below which a chapter is a systemic opportunity. [0,100]. */
  readonly weakChapterHealthScore: number;
}

/** The complete generation calibration record. Versioned; grown per P7 slice like CampaignProfile was in P6. */
export interface GenProfile {
  readonly genProfileSchemaVersion: number;
  /** Stable identity stamped onto generation provenance records. Non-empty. */
  readonly profileId: string;
  readonly lifecycle: LifecycleCalibration;
  readonly pda: PdaCalibration;
  readonly generator: GeneratorCalibration;
  readonly creativity: CreativityCalibration;
  readonly intent: IntentCalibration;
  readonly pipeline: PipelineCalibration;
}

export type GenProfileParseResult =
  | { readonly ok: true; readonly value: GenProfile }
  | { readonly ok: false; readonly errors: readonly SchemaError[] };

/**
 * The default generation profile: the S7.1 calibration baseline. These
 * thresholds have no PRD numeric source, so this baseline is the
 * recalibration starting point a ledgered profile change may adjust
 * (dm-0057) — never a constant buried in gen logic.
 */
export const DEFAULT_GEN_PROFILE: GenProfile = Object.freeze({
  genProfileSchemaVersion: GEN_PROFILE_SCHEMA_VERSION,
  profileId: 'gen-default-v1',
  lifecycle: Object.freeze({
    developmentMinLevels: 3,
    saturationNoveltyThreshold: 0.15,
    exhaustionConsecutiveLowNovelty: 3,
  }) as LifecycleCalibration,
  pda: Object.freeze({
    maxOpportunities: 24,
    weakChapterHealthScore: 60,
  }) as PdaCalibration,
  creativity: Object.freeze({
    variationsPerGeneration: 4,
    hardCapGenerations: 6,
    diminishingReturnsEpsilon: 0.01,
    combineProbability: 0.5,
    selectionWeights: Object.freeze({
      gatePass: 2,
      gateScore: 1,
      novelty: 1,
    }) as SelectionWeights,
  }) as CreativityCalibration,
  intent: Object.freeze({
    minWords: 6,
    maxWords: 40,
  }) as IntentCalibration,
  pipeline: Object.freeze({
    revisionBudget: 3,
  }) as PipelineCalibration,
  generator: Object.freeze({
    corridorMinLength: 12,
    corridorMaxLength: 18,
    corridorAirRows: 4,
    maxGapWidth: 2,
    parTimeGenerousSeconds: 30,
    parTimeExpertSeconds: 10,
    entityTuning: Object.freeze({
      springLaunchVelocityX: 6,
      springLaunchVelocityY: 8,
      conveyorSurfaceVelocityX: 2,
      laserPeriodSeconds: 4,
      laserOnFractionOfPeriod: 0.25,
      laserPhaseSeconds: 0,
      moverSpeed: 2,
      collapseDelaySeconds: 0.5,
      gravityZoneScale: 0.5,
    }) as EntityTuning,
  }) as GeneratorCalibration,
}) as GenProfile;

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
      fail(errors, `${path}/${key}`, `unknown key "${key}" (gen profile v${GEN_PROFILE_SCHEMA_VERSION} is strict)`);
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

function parseLifecycle(v: unknown, path: string, errors: Errors): LifecycleCalibration | undefined {
  const o = obj(v, path, ['developmentMinLevels', 'saturationNoveltyThreshold', 'exhaustionConsecutiveLowNovelty'], errors);
  if (o === undefined) return undefined;
  const developmentMinLevels = num(o.developmentMinLevels, `${path}/developmentMinLevels`, errors, { exclusiveMin: 0, integer: true });
  const saturationNoveltyThreshold = num(o.saturationNoveltyThreshold, `${path}/saturationNoveltyThreshold`, errors, { min: 0 });
  const exhaustionConsecutiveLowNovelty = num(o.exhaustionConsecutiveLowNovelty, `${path}/exhaustionConsecutiveLowNovelty`, errors, { exclusiveMin: 0, integer: true });
  if (developmentMinLevels === undefined || saturationNoveltyThreshold === undefined || exhaustionConsecutiveLowNovelty === undefined) return undefined;
  return { developmentMinLevels, saturationNoveltyThreshold, exhaustionConsecutiveLowNovelty };
}

function parseEntityTuning(v: unknown, path: string, errors: Errors): EntityTuning | undefined {
  const o = obj(v, path, [
    'springLaunchVelocityX', 'springLaunchVelocityY', 'conveyorSurfaceVelocityX',
    'laserPeriodSeconds', 'laserOnFractionOfPeriod', 'laserPhaseSeconds',
    'moverSpeed', 'collapseDelaySeconds', 'gravityZoneScale',
  ], errors);
  if (o === undefined) return undefined;
  const springLaunchVelocityX = num(o.springLaunchVelocityX, `${path}/springLaunchVelocityX`, errors, {});
  const springLaunchVelocityY = num(o.springLaunchVelocityY, `${path}/springLaunchVelocityY`, errors, { min: 0 });
  const conveyorSurfaceVelocityX = num(o.conveyorSurfaceVelocityX, `${path}/conveyorSurfaceVelocityX`, errors, {});
  const laserPeriodSeconds = num(o.laserPeriodSeconds, `${path}/laserPeriodSeconds`, errors, { exclusiveMin: 0 });
  const laserOnFractionOfPeriod = num(o.laserOnFractionOfPeriod, `${path}/laserOnFractionOfPeriod`, errors, { exclusiveMin: 0, max: 1 });
  const laserPhaseSeconds = num(o.laserPhaseSeconds, `${path}/laserPhaseSeconds`, errors, { min: 0 });
  const moverSpeed = num(o.moverSpeed, `${path}/moverSpeed`, errors, { exclusiveMin: 0 });
  const collapseDelaySeconds = num(o.collapseDelaySeconds, `${path}/collapseDelaySeconds`, errors, { min: 0 });
  const gravityZoneScale = num(o.gravityZoneScale, `${path}/gravityZoneScale`, errors, {});
  if (
    springLaunchVelocityX === undefined || springLaunchVelocityY === undefined || conveyorSurfaceVelocityX === undefined ||
    laserPeriodSeconds === undefined || laserOnFractionOfPeriod === undefined || laserPhaseSeconds === undefined ||
    moverSpeed === undefined || collapseDelaySeconds === undefined || gravityZoneScale === undefined
  ) return undefined;
  if (springLaunchVelocityX === 0 && springLaunchVelocityY === 0) {
    fail(errors, `${path}/springLaunchVelocityX`, 'the spring launch vector must not be zero (SpringDef contract)');
    return undefined;
  }
  if (conveyorSurfaceVelocityX === 0) {
    fail(errors, `${path}/conveyorSurfaceVelocityX`, 'conveyor surface velocity must be non-zero (ConveyorDef contract)');
    return undefined;
  }
  if (gravityZoneScale === 0) {
    fail(errors, `${path}/gravityZoneScale`, 'gravity scale must be non-zero (GravityZoneDef contract)');
    return undefined;
  }
  return {
    springLaunchVelocityX, springLaunchVelocityY, conveyorSurfaceVelocityX,
    laserPeriodSeconds, laserOnFractionOfPeriod, laserPhaseSeconds,
    moverSpeed, collapseDelaySeconds, gravityZoneScale,
  };
}

function parseGenerator(v: unknown, path: string, errors: Errors): GeneratorCalibration | undefined {
  const o = obj(v, path, [
    'corridorMinLength', 'corridorMaxLength', 'corridorAirRows', 'maxGapWidth',
    'parTimeGenerousSeconds', 'parTimeExpertSeconds', 'entityTuning',
  ], errors);
  if (o === undefined) return undefined;
  const corridorMinLength = num(o.corridorMinLength, `${path}/corridorMinLength`, errors, { exclusiveMin: 0, integer: true });
  const corridorMaxLength = num(o.corridorMaxLength, `${path}/corridorMaxLength`, errors, { exclusiveMin: 0, integer: true });
  const corridorAirRows = num(o.corridorAirRows, `${path}/corridorAirRows`, errors, { exclusiveMin: 0, integer: true });
  const maxGapWidth = num(o.maxGapWidth, `${path}/maxGapWidth`, errors, { exclusiveMin: 0, integer: true });
  const parTimeGenerousSeconds = num(o.parTimeGenerousSeconds, `${path}/parTimeGenerousSeconds`, errors, { exclusiveMin: 0 });
  const parTimeExpertSeconds = num(o.parTimeExpertSeconds, `${path}/parTimeExpertSeconds`, errors, { exclusiveMin: 0 });
  const entityTuning = parseEntityTuning(o.entityTuning, `${path}/entityTuning`, errors);
  if (
    corridorMinLength === undefined || corridorMaxLength === undefined || corridorAirRows === undefined ||
    maxGapWidth === undefined || parTimeGenerousSeconds === undefined || parTimeExpertSeconds === undefined ||
    entityTuning === undefined
  ) return undefined;
  if (corridorMaxLength < corridorMinLength) {
    fail(errors, `${path}/corridorMaxLength`, `expected >= corridorMinLength (${corridorMinLength}), got ${corridorMaxLength}`);
    return undefined;
  }
  if (parTimeGenerousSeconds <= parTimeExpertSeconds) {
    fail(errors, `${path}/parTimeGenerousSeconds`, `par tiers must strictly decrease: generous (${parTimeGenerousSeconds}) must exceed expert (${parTimeExpertSeconds})`);
    return undefined;
  }
  return { corridorMinLength, corridorMaxLength, corridorAirRows, maxGapWidth, parTimeGenerousSeconds, parTimeExpertSeconds, entityTuning };
}

function parsePda(v: unknown, path: string, errors: Errors): PdaCalibration | undefined {
  const o = obj(v, path, ['maxOpportunities', 'weakChapterHealthScore'], errors);
  if (o === undefined) return undefined;
  const maxOpportunities = num(o.maxOpportunities, `${path}/maxOpportunities`, errors, { exclusiveMin: 0, integer: true });
  const weakChapterHealthScore = num(o.weakChapterHealthScore, `${path}/weakChapterHealthScore`, errors, { min: 0, max: 100 });
  if (maxOpportunities === undefined || weakChapterHealthScore === undefined) return undefined;
  return { maxOpportunities, weakChapterHealthScore };
}

function parsePipeline(v: unknown, path: string, errors: Errors): PipelineCalibration | undefined {
  const o = obj(v, path, ['revisionBudget'], errors);
  if (o === undefined) return undefined;
  const revisionBudget = num(o.revisionBudget, `${path}/revisionBudget`, errors, { min: 0, integer: true });
  if (revisionBudget === undefined) return undefined;
  return { revisionBudget };
}

function parseIntent(v: unknown, path: string, errors: Errors): IntentCalibration | undefined {
  const o = obj(v, path, ['minWords', 'maxWords'], errors);
  if (o === undefined) return undefined;
  const minWords = num(o.minWords, `${path}/minWords`, errors, { exclusiveMin: 0, integer: true });
  const maxWords = num(o.maxWords, `${path}/maxWords`, errors, { exclusiveMin: 0, integer: true });
  if (minWords === undefined || maxWords === undefined) return undefined;
  if (maxWords < minWords) {
    fail(errors, `${path}/maxWords`, `expected >= minWords (${minWords}), got ${maxWords}`);
    return undefined;
  }
  return { minWords, maxWords };
}

function parseSelectionWeights(v: unknown, path: string, errors: Errors): SelectionWeights | undefined {
  const o = obj(v, path, ['gatePass', 'gateScore', 'novelty'], errors);
  if (o === undefined) return undefined;
  const gatePass = num(o.gatePass, `${path}/gatePass`, errors, { min: 0 });
  const gateScore = num(o.gateScore, `${path}/gateScore`, errors, { min: 0 });
  const novelty = num(o.novelty, `${path}/novelty`, errors, { min: 0 });
  if (gatePass === undefined || gateScore === undefined || novelty === undefined) return undefined;
  if (gatePass === 0 && gateScore === 0 && novelty === 0) {
    fail(errors, path, 'selectionWeights must not be all zero — a vacuous composite selects nothing');
    return undefined;
  }
  return { gatePass, gateScore, novelty };
}

function parseCreativity(v: unknown, path: string, errors: Errors): CreativityCalibration | undefined {
  const o = obj(v, path, ['variationsPerGeneration', 'hardCapGenerations', 'diminishingReturnsEpsilon', 'combineProbability', 'selectionWeights'], errors);
  if (o === undefined) return undefined;
  const variationsPerGeneration = num(o.variationsPerGeneration, `${path}/variationsPerGeneration`, errors, { exclusiveMin: 0, integer: true });
  const hardCapGenerations = num(o.hardCapGenerations, `${path}/hardCapGenerations`, errors, { exclusiveMin: 0, integer: true });
  const diminishingReturnsEpsilon = num(o.diminishingReturnsEpsilon, `${path}/diminishingReturnsEpsilon`, errors, { min: 0 });
  const combineProbability = num(o.combineProbability, `${path}/combineProbability`, errors, { min: 0, max: 1 });
  const selectionWeights = parseSelectionWeights(o.selectionWeights, `${path}/selectionWeights`, errors);
  if (variationsPerGeneration === undefined || hardCapGenerations === undefined || diminishingReturnsEpsilon === undefined || combineProbability === undefined || selectionWeights === undefined) return undefined;
  return { variationsPerGeneration, hardCapGenerations, diminishingReturnsEpsilon, combineProbability, selectionWeights };
}

/** Parse an already-JSON-decoded value into a GenProfile. Never throws. */
export function parseGenProfile(raw: unknown): GenProfileParseResult {
  const errors: Errors = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: [{ path: '', message: `expected a gen profile object, got ${describe(raw)}` }] };
  }
  checkKeys(raw, '', ['genProfileSchemaVersion', 'profileId', 'lifecycle', 'pda', 'generator', 'creativity', 'intent', 'pipeline'], errors);
  if (raw.genProfileSchemaVersion !== GEN_PROFILE_SCHEMA_VERSION) {
    fail(errors, '/genProfileSchemaVersion', `unsupported gen profile version ${JSON.stringify(raw.genProfileSchemaVersion)}; this build reads exactly v${GEN_PROFILE_SCHEMA_VERSION}`);
    return { ok: false, errors };
  }
  const profileId = str(raw.profileId, '/profileId', errors);
  const lifecycle = parseLifecycle(raw.lifecycle, '/lifecycle', errors);
  const pda = parsePda(raw.pda, '/pda', errors);
  const generator = parseGenerator(raw.generator, '/generator', errors);
  const creativity = parseCreativity(raw.creativity, '/creativity', errors);
  const intent = parseIntent(raw.intent, '/intent', errors);
  const pipeline = parsePipeline(raw.pipeline, '/pipeline', errors);
  if (errors.length > 0 || profileId === undefined || lifecycle === undefined || pda === undefined || generator === undefined || creativity === undefined || intent === undefined || pipeline === undefined) {
    return { ok: false, errors };
  }
  return { ok: true, value: { genProfileSchemaVersion: GEN_PROFILE_SCHEMA_VERSION, profileId, lifecycle, pda, generator, creativity, intent, pipeline } };
}

/** Parse gen profile JSON text. JSON syntax errors surface as a root-path error; never throws. */
export function parseGenProfileText(text: string): GenProfileParseResult {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ path: '', message: `invalid JSON: ${e instanceof Error ? e.message : String(e)}` }] };
  }
  return parseGenProfile(decoded);
}
