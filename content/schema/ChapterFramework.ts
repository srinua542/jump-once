/**
 * ChapterFramework — the REQ-083 seven-step chapter architecture schema
 * (P10/S10.1, dm-0109). The eighth versioned, strict-parsed schema in the
 * project, following the level/profile parse discipline verbatim
 * (dm-0010/dm-0014): parse-don't-validate, all-errors (not fail-fast),
 * JSON-pointer paths, strict unknown-key rejection, finite numbers, a hard
 * schemaVersion gate.
 *
 * GDOS alignment: Section 9 — a chapter's seven framework items (Theme,
 * Learning Goal, Mental Model, Misconceptions, Subversion, Optimization,
 * Final Exam) are DEFINED BEFORE any level is generated. That ordering is
 * enforced structurally, not by convention: `content/Assembler.ts`'s
 * buildConceptFromSlot is the ONLY path that constructs a LevelConcept for the
 * generation pipeline, and it consumes an already-parsed ChapterFramework slot
 * — there is no code path to generate a level without a validated framework
 * upstream (dm-0109).
 *
 * The REQ-015 six-phase emotional arc is a STRUCTURAL parse invariant here:
 * a chapter's level slots, read in order, must cover all six EMOTION_ARC
 * phases contiguously and in order (a phase may span consecutive slots, but
 * none may be skipped or reordered). A chapter whose slots jump Curiosity →
 * Surprise, or run Mastery before Realization, is rejected at parse — the arc
 * cannot be violated by authored data.
 *
 * The difficulty-tier VOCABULARY (DIFFICULTY_TIERS) lives here, at the
 * content-schema layer, because a slot authors its *target* tier (REQ-084's
 * five buckets) as data; the MEASURED tier a shipped level actually lands in
 * is derived from evidence by `content/DifficultyEstimator.ts` (S10.2, dm-0111)
 * — never conflated with this authored aim.
 *
 * Lives in content/schema/ (dm-0108): the content subtree is one-way isolated,
 * nothing under src/ imports it. This module imports only closed vocabularies
 * (EntityKind, LevelArchetype, EmotionPhase, DifficultyAxis) and the
 * SchemaError shape as types. Pure; no clock, no random, whitelist math (none).
 */

import { ENTITY_KINDS, type EntityKind } from '../../src/components/Behavior';
import { DIFFICULTY_AXES, type DifficultyAxis } from '../../src/components/Gdos';
import { LEVEL_ARCHETYPES, type LevelArchetype } from '../../src/gen/Concept';
import { EMOTION_ARC, type EmotionPhase } from '../../src/eval/gdos/DesignSpace';
import type { SchemaError } from '../../src/schema/Parse';

/** Bump only with a written migration decision (dm-0010 policy). */
export const FRAMEWORK_SCHEMA_VERSION = 1;

/**
 * The five REQ-084 campaign difficulty buckets, in ascending order. Closed:
 * a slot's authored `targetDifficultyTier` and the estimator's measured tier
 * both draw from exactly this vocabulary.
 */
export const DIFFICULTY_TIERS = Object.freeze([
  'easy',
  'medium',
  'hard',
  'harder',
  'very-hard',
] as const);

export type DifficultyTier = (typeof DIFFICULTY_TIERS)[number];

/**
 * REQ-174 (P10 share): per-level non-IAP rewarded-skip/alt-route data. `available`
 * gates whether the Poki `rewardedBreak` skip flow (P9's PortalLifecycle) is
 * offered for this level; `altRouteHint`, when present, is the hint the
 * rewarded break reveals. No paid currency, no IAP — data only.
 */
export interface RewardedSkip {
  readonly available: boolean;
  /** Optional non-empty hint revealed by the rewarded break; absent when there is no hint. */
  readonly altRouteHint?: string;
}

/**
 * One authored level slot: everything `buildConceptFromSlot` needs to mint a
 * LevelConcept for the manufacturing pipeline, plus the campaign-curriculum
 * metadata (target tier, arc phase, rewarded-skip). `targetKgNode` is derived
 * (`kg:<chapterId>/<slotId>`), not stored.
 */
export interface ChapterLevelSlot {
  /** Unique within the chapter; non-empty. */
  readonly slotId: string;
  /** The one-jump decision shape (closed archetype vocabulary). */
  readonly archetype: LevelArchetype;
  /** The single rigorous lesson sentence — the REQ-091 subject (full rigor is the generation-time gate; parse requires only non-empty). */
  readonly intentSentence: string;
  /** What exact decision the one jump makes meaningful here (workflow Q3); non-empty. */
  readonly oneJumpDecision: string;
  /** Mechanics exercised; each a closed EntityKind, unique; may be empty (pure-geometry slots are legitimate). */
  readonly mechanics: readonly EntityKind[];
  /** The generator's [0,1] per-axis difficulty AIM (becomes GdosMetadata.difficultyVectors). */
  readonly difficultyTarget: Readonly<Record<DifficultyAxis, number>>;
  /** The REQ-015 arc phase this slot covers. */
  readonly emotionalPhase: EmotionPhase;
  /** The REQ-084 bucket this slot AIMS for; the measured tier is derived from evidence (dm-0111). */
  readonly targetDifficultyTier: DifficultyTier;
  /** Generation seed (finite integer ≥0) — persisted so the campaign regenerates byte-identically (idempotency). */
  readonly seed: number;
  /** REQ-174 rewarded-skip data (available:false is valid; the field must be present). */
  readonly rewardedSkip: RewardedSkip;
}

/** The REQ-083 seven-step chapter framework plus its ordered level slots. */
export interface ChapterFramework {
  readonly frameworkSchemaVersion: number;
  /** Stable chapter identity; non-empty. */
  readonly chapterId: string;
  /** Human-readable chapter title; non-empty. */
  readonly title: string;
  /** Step 1 — the chapter's unifying theme; non-empty. */
  readonly theme: string;
  /** Step 2 — what the player should learn; non-empty. */
  readonly learningGoal: string;
  /** Step 3 — the mental model the chapter builds; non-empty. */
  readonly mentalModel: string;
  /** Step 4 — the misconceptions the chapter deliberately creates then corrects; ≥1, each non-empty. */
  readonly misconceptions: readonly string[];
  /** Step 5 — how the chapter subverts the expectation it built; non-empty. */
  readonly subversion: string;
  /** Step 6 — the optimization axis skilled players exploit; non-empty. */
  readonly optimizationFocus: string;
  /** Step 7 — the concise mastery test that closes the chapter; non-empty. */
  readonly finalExam: string;
  /** Ordered level slots; must cover the six EMOTION_ARC phases contiguously and in order (REQ-015). */
  readonly levelSlots: readonly ChapterLevelSlot[];
}

export type FrameworkParseResult =
  | { readonly ok: true; readonly value: ChapterFramework }
  | { readonly ok: false; readonly errors: readonly SchemaError[] };

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
    if (!allowed.includes(key)) fail(errors, `${path}/${key}`, `unknown key "${key}" (framework v${FRAMEWORK_SCHEMA_VERSION} is strict)`);
  }
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

function parseUnitInterval(v: unknown, path: string, errors: Errors): number | undefined {
  if (typeof v !== 'number') return fail(errors, path, `expected a number, got ${describe(v)}`);
  if (!Number.isFinite(v)) return fail(errors, path, 'expected a finite number');
  if (v < 0 || v > 1) return fail(errors, path, `expected a value in [0,1], got ${v}`);
  return v === 0 ? 0 : v;
}

function parseDifficultyTarget(v: unknown, path: string, errors: Errors): Readonly<Record<DifficultyAxis, number>> | undefined {
  const o = obj(v, path, DIFFICULTY_AXES, errors);
  if (o === undefined) return undefined;
  const out = {} as Record<DifficultyAxis, number>;
  let ok = true;
  for (const axis of DIFFICULTY_AXES) {
    const n = parseUnitInterval(o[axis], `${path}/${axis}`, errors);
    if (n === undefined) ok = false;
    else out[axis] = n;
  }
  return ok ? out : undefined;
}

function parseMechanics(v: unknown, path: string, errors: Errors): readonly EntityKind[] | undefined {
  if (!Array.isArray(v)) return fail(errors, path, `expected an array, got ${describe(v)}`);
  const out: EntityKind[] = [];
  const seen = new Set<string>();
  let ok = true;
  for (let i = 0; i < v.length; i++) {
    const m = v[i];
    if (typeof m !== 'string' || !(ENTITY_KINDS as readonly string[]).includes(m)) {
      fail(errors, `${path}/${i}`, `expected a closed EntityKind, got ${JSON.stringify(m)}`);
      ok = false;
      continue;
    }
    if (seen.has(m)) {
      fail(errors, `${path}/${i}`, `duplicate mechanic "${m}"`);
      ok = false;
      continue;
    }
    seen.add(m);
    out.push(m as EntityKind);
  }
  return ok ? out : undefined;
}

function parseRewardedSkip(v: unknown, path: string, errors: Errors): RewardedSkip | undefined {
  const o = obj(v, path, ['available', 'altRouteHint'], errors);
  if (o === undefined) return undefined;
  if (typeof o.available !== 'boolean') {
    fail(errors, `${path}/available`, `expected a boolean, got ${describe(o.available)}`);
    return undefined;
  }
  if (o.altRouteHint === undefined) return { available: o.available };
  const hint = str(o.altRouteHint, `${path}/altRouteHint`, errors);
  if (hint === undefined) return undefined;
  return { available: o.available, altRouteHint: hint };
}

function parseSlot(v: unknown, path: string, errors: Errors): ChapterLevelSlot | undefined {
  const o = obj(v, path, ['slotId', 'archetype', 'intentSentence', 'oneJumpDecision', 'mechanics', 'difficultyTarget', 'emotionalPhase', 'targetDifficultyTier', 'seed', 'rewardedSkip'], errors);
  if (o === undefined) return undefined;
  const slotId = str(o.slotId, `${path}/slotId`, errors);
  let archetype: LevelArchetype | undefined;
  if (typeof o.archetype !== 'string' || !(LEVEL_ARCHETYPES as readonly string[]).includes(o.archetype)) {
    fail(errors, `${path}/archetype`, `expected one of [${LEVEL_ARCHETYPES.join(', ')}], got ${JSON.stringify(o.archetype)}`);
  } else {
    archetype = o.archetype as LevelArchetype;
  }
  const intentSentence = str(o.intentSentence, `${path}/intentSentence`, errors);
  const oneJumpDecision = str(o.oneJumpDecision, `${path}/oneJumpDecision`, errors);
  const mechanics = parseMechanics(o.mechanics, `${path}/mechanics`, errors);
  const difficultyTarget = parseDifficultyTarget(o.difficultyTarget, `${path}/difficultyTarget`, errors);
  let emotionalPhase: EmotionPhase | undefined;
  if (typeof o.emotionalPhase !== 'string' || !(EMOTION_ARC as readonly string[]).includes(o.emotionalPhase)) {
    fail(errors, `${path}/emotionalPhase`, `expected one of [${EMOTION_ARC.join(', ')}], got ${JSON.stringify(o.emotionalPhase)}`);
  } else {
    emotionalPhase = o.emotionalPhase as EmotionPhase;
  }
  let targetDifficultyTier: DifficultyTier | undefined;
  if (typeof o.targetDifficultyTier !== 'string' || !(DIFFICULTY_TIERS as readonly string[]).includes(o.targetDifficultyTier)) {
    fail(errors, `${path}/targetDifficultyTier`, `expected one of [${DIFFICULTY_TIERS.join(', ')}], got ${JSON.stringify(o.targetDifficultyTier)}`);
  } else {
    targetDifficultyTier = o.targetDifficultyTier as DifficultyTier;
  }
  let seed: number | undefined;
  if (typeof o.seed !== 'number' || !Number.isInteger(o.seed) || o.seed < 0) {
    fail(errors, `${path}/seed`, `expected a non-negative integer, got ${JSON.stringify(o.seed)}`);
  } else {
    seed = o.seed;
  }
  const rewardedSkip = parseRewardedSkip(o.rewardedSkip, `${path}/rewardedSkip`, errors);
  if (
    slotId === undefined || archetype === undefined || intentSentence === undefined || oneJumpDecision === undefined ||
    mechanics === undefined || difficultyTarget === undefined || emotionalPhase === undefined ||
    targetDifficultyTier === undefined || seed === undefined || rewardedSkip === undefined
  ) return undefined;
  return { slotId, archetype, intentSentence, oneJumpDecision, mechanics, difficultyTarget, emotionalPhase, targetDifficultyTier, seed, rewardedSkip };
}

function parseMisconceptions(v: unknown, path: string, errors: Errors): readonly string[] | undefined {
  if (!Array.isArray(v)) return fail(errors, path, `expected an array, got ${describe(v)}`);
  if (v.length === 0) return fail(errors, path, 'a chapter must name at least one misconception it creates then corrects (REQ-083)');
  const out: string[] = [];
  let ok = true;
  for (let i = 0; i < v.length; i++) {
    const s = str(v[i], `${path}/${i}`, errors);
    if (s === undefined) ok = false;
    else out.push(s);
  }
  return ok ? out : undefined;
}

/**
 * Validate the level slots cover the six EMOTION_ARC phases contiguously and
 * in order (REQ-015): collapsing consecutive duplicate phases must yield
 * EMOTION_ARC exactly. Also rejects duplicate slotIds.
 */
function validateArcAndIds(slots: readonly ChapterLevelSlot[], path: string, errors: Errors): void {
  const seen = new Set<string>();
  for (let i = 0; i < slots.length; i++) {
    if (seen.has(slots[i].slotId)) fail(errors, `${path}/${i}/slotId`, `duplicate slotId "${slots[i].slotId}"`);
    seen.add(slots[i].slotId);
  }
  // Collapse consecutive equal phases, then compare to EMOTION_ARC.
  const collapsed: EmotionPhase[] = [];
  for (const s of slots) {
    if (collapsed.length === 0 || collapsed[collapsed.length - 1] !== s.emotionalPhase) collapsed.push(s.emotionalPhase);
  }
  const arc = EMOTION_ARC as readonly EmotionPhase[];
  const matches = collapsed.length === arc.length && collapsed.every((p, i) => p === arc[i]);
  if (!matches) {
    fail(
      errors,
      path,
      `level slots must cover the six-phase emotional arc [${arc.join(' → ')}] contiguously and in order (REQ-015); got phase sequence [${collapsed.join(' → ')}]`,
    );
  }
}

/** Parse an already-JSON-decoded value into a ChapterFramework. Never throws. */
export function parseChapterFramework(raw: unknown): FrameworkParseResult {
  const errors: Errors = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: [{ path: '', message: `expected a chapter-framework object, got ${describe(raw)}` }] };
  }
  checkKeys(raw, '', ['frameworkSchemaVersion', 'chapterId', 'title', 'theme', 'learningGoal', 'mentalModel', 'misconceptions', 'subversion', 'optimizationFocus', 'finalExam', 'levelSlots'], errors);
  if (raw.frameworkSchemaVersion !== FRAMEWORK_SCHEMA_VERSION) {
    fail(errors, '/frameworkSchemaVersion', `unsupported framework version ${JSON.stringify(raw.frameworkSchemaVersion)}; this build reads exactly v${FRAMEWORK_SCHEMA_VERSION}`);
    return { ok: false, errors };
  }
  const chapterId = str(raw.chapterId, '/chapterId', errors);
  const title = str(raw.title, '/title', errors);
  const theme = str(raw.theme, '/theme', errors);
  const learningGoal = str(raw.learningGoal, '/learningGoal', errors);
  const mentalModel = str(raw.mentalModel, '/mentalModel', errors);
  const misconceptions = parseMisconceptions(raw.misconceptions, '/misconceptions', errors);
  const subversion = str(raw.subversion, '/subversion', errors);
  const optimizationFocus = str(raw.optimizationFocus, '/optimizationFocus', errors);
  const finalExam = str(raw.finalExam, '/finalExam', errors);

  let levelSlots: ChapterLevelSlot[] | undefined;
  if (!Array.isArray(raw.levelSlots)) {
    fail(errors, '/levelSlots', `expected an array, got ${describe(raw.levelSlots)}`);
  } else if (raw.levelSlots.length === 0) {
    fail(errors, '/levelSlots', 'a chapter must have at least one level slot');
  } else {
    const slots: ChapterLevelSlot[] = [];
    let ok = true;
    for (let i = 0; i < raw.levelSlots.length; i++) {
      const s = parseSlot(raw.levelSlots[i], `/levelSlots/${i}`, errors);
      if (s === undefined) ok = false;
      else slots.push(s);
    }
    if (ok) {
      validateArcAndIds(slots, '/levelSlots', errors);
      levelSlots = slots;
    }
  }

  if (
    errors.length > 0 || chapterId === undefined || title === undefined || theme === undefined ||
    learningGoal === undefined || mentalModel === undefined || misconceptions === undefined ||
    subversion === undefined || optimizationFocus === undefined || finalExam === undefined || levelSlots === undefined
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: { frameworkSchemaVersion: FRAMEWORK_SCHEMA_VERSION, chapterId, title, theme, learningGoal, mentalModel, misconceptions, subversion, optimizationFocus, finalExam, levelSlots },
  };
}

/** Parse chapter-framework JSON text. JSON syntax errors surface as a root-path error; never throws. */
export function parseChapterFrameworkText(text: string): FrameworkParseResult {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ path: '', message: `invalid JSON: ${e instanceof Error ? e.message : String(e)}` }] };
  }
  return parseChapterFramework(decoded);
}

/** Serialize a ChapterFramework to a canonical, stable-key-order JSON string (round-trips through the parser). */
export function serializeChapterFramework(framework: ChapterFramework): string {
  return JSON.stringify(
    {
      frameworkSchemaVersion: framework.frameworkSchemaVersion,
      chapterId: framework.chapterId,
      title: framework.title,
      theme: framework.theme,
      learningGoal: framework.learningGoal,
      mentalModel: framework.mentalModel,
      misconceptions: framework.misconceptions,
      subversion: framework.subversion,
      optimizationFocus: framework.optimizationFocus,
      finalExam: framework.finalExam,
      levelSlots: framework.levelSlots.map((s) => ({
        slotId: s.slotId,
        archetype: s.archetype,
        intentSentence: s.intentSentence,
        oneJumpDecision: s.oneJumpDecision,
        mechanics: s.mechanics,
        difficultyTarget: s.difficultyTarget,
        emotionalPhase: s.emotionalPhase,
        targetDifficultyTier: s.targetDifficultyTier,
        seed: s.seed,
        rewardedSkip: s.rewardedSkip.altRouteHint === undefined
          ? { available: s.rewardedSkip.available }
          : { available: s.rewardedSkip.available, altRouteHint: s.rewardedSkip.altRouteHint },
      })),
    },
    null,
    2,
  );
}
