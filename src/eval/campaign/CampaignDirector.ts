/**
 * CampaignDirector — the macro-level Game Director's fold, spike detection,
 * and retention prediction (P6/S6.5, REQ-030 core, dm-0043/dm-0052).
 *
 * GDOS alignment: Section 4 (the Game Director modeling global campaign
 * state; the ten macro variables tracked continuously).
 *
 * Design (dm-0043): `updateState` is a PURE fold step — same inputs always
 * produce the same new `CampaignState`; nothing is mutated in place.
 * `processCampaign` folds a chapter-grouped campaign (`ChapterRecord[]`, since
 * ChapterHealth is chapter-scoped while TapeAnalyzer/MechanicTracker/
 * KnowledgeModel are level-scoped, dm-0052) into a `CampaignReport`.
 *
 * Design (dm-0052):
 *  - `optimizationDepth` reads the CUMULATIVE `CoverageMatrix.optimizationStylesCovered`
 *    already threaded through for `MechanicTracker` (dm-0045: one source of
 *    truth) — the highest tier reached, normalized by `OPTIMIZATION_STYLE_AXIS`'s
 *    length. `OPTIMIZATION_STYLE_AXIS` is imported as a VALUE (a frozen
 *    zero-behavior registry array), the same "read the registry as data"
 *    allowance dm-0034 already grants — not a gate-internal import.
 *  - `emotionalState` is EMA-rolled from GDOS's OWN per-level
 *    `'emotional-threshold'` gate scores (never re-derived from behavioral
 *    signals, which would be a second, less-grounded proxy for something
 *    already honestly estimated per dm-0031/dm-0036).
 *  - `trendWindowLevels` (shipped at S6.1, unused through S6.4) is finally
 *    consumed here via the standard N-period EMA conversion
 *    `rate = 2 / (trendWindowLevels + 1)` — no dead field.
 *  - `skillCurve`/`curiosityTrend` are rolled step-over-step (no history
 *    buffer added to `CampaignState`, dm-0043's ten-variable design stays
 *    frozen): each `TrendReading.magnitude` IS the current EMA-rolled value
 *    of its underlying signal (ease = 1/(1+attempts) for skillCurve, the raw
 *    per-level curiosity score for curiosityTrend); `direction` compares the
 *    new magnitude against the previous one under `trendMagnitudeTolerance`.
 *  - `retentionPrediction` is `profile.retentionWeights`' weighted average of
 *    five [0,1]-normalized components, recomputed at every chapter close
 *    (chapterHealth only exists at chapter granularity).
 *  - Spike detection implements dm-0048's design: a rolling EMA baseline over
 *    `ChapterHealthReport.score`, compared against the BASELINE BEFORE this
 *    chapter's score folds in (never against a baseline already pulled down
 *    by the same low score being tested, which would self-mask the spike).
 *
 * Whitelist math only (`Math.abs`, comparisons, +, ÷). Imports only
 * `import type` from gdos/campaign OUTPUT types plus the one registry value
 * noted above — no sim, no harness, no search (dm-0047).
 */

import type { CoverageMatrix } from '../gdos/DesignSpace';
import { OPTIMIZATION_STYLE_AXIS } from '../gdos/DesignSpace';
import type { MacroVerdict } from '../macro/Curriculum';
import type { CampaignProfile } from './CampaignProfile';
import { analyzeTape } from './TapeAnalyzer';
import { updateKnowledge } from './KnowledgeModel';
import { trackMechanics } from './MechanicTracker';
import { aggregateChapterHealth } from './ChapterHealth';
import {
  ZERO_CAMPAIGN_STATE,
  type BehaviorSignals,
  type CampaignAlert,
  type CampaignReport,
  type CampaignState,
  type ChapterHealthReport,
  type EmotionalState,
  type LevelRecord,
  type TrendDirection,
  type TrendReading,
} from './CampaignState';

/** One chapter's worth of fold input: its levels plus the P4 macro verdict and cumulative coverage, both consumed by reference (dm-0045/dm-0046). */
export interface ChapterRecord {
  readonly chapterId: string;
  readonly levels: readonly LevelRecord[];
  readonly macroVerdict: MacroVerdict;
  readonly coverageMatrix: CoverageMatrix;
}

/** Standard N-period EMA conversion: a window of N levels becomes a decay rate. */
function emaRate(windowLevels: number): number {
  return 2 / (windowLevels + 1);
}

function ema(previous: number, sample: number, rate: number): number {
  return previous + rate * (sample - previous);
}

/** Roll `sample` into `previous`'s EMA; direction compares the new rolled value against the old one under `tolerance`. */
function rollTrend(previous: TrendReading, sample: number, rate: number, tolerance: number): TrendReading {
  const magnitude = ema(previous.magnitude, sample, rate);
  const delta = magnitude - previous.magnitude;
  const direction: TrendDirection = Math.abs(delta) <= tolerance ? 'flat' : delta > 0 ? 'rising' : 'falling';
  return { direction, magnitude };
}

/** This level's delivered-emotion scores, read straight from GDOS's own 'emotional-threshold' gate (dm-0052) — never re-derived. */
function levelEmotionalScores(record: LevelRecord): EmotionalState {
  const gate = record.report.gates.find((g) => g.gate === 'emotional-threshold');
  const scores = gate?.scores ?? [];
  const metric = (name: string): number => (scores.find((s) => s.metric === name)?.score ?? 0) / 100;
  return { curiosity: metric('curiosity'), confidence: metric('confidence'), surprise: metric('surprise'), mastery: metric('mastery') };
}

function rollEmotionalState(previous: EmotionalState, sample: EmotionalState, rate: number): EmotionalState {
  return {
    curiosity: ema(previous.curiosity, sample.curiosity, rate),
    confidence: ema(previous.confidence, sample.confidence, rate),
    surprise: ema(previous.surprise, sample.surprise, rate),
    mastery: ema(previous.mastery, sample.mastery, rate),
  };
}

/** Highest optimization tier the CUMULATIVE coverage matrix has reached, normalized to [0,1]. 0 if no tier has been touched. */
function optimizationDepthOf(coverageMatrix: CoverageMatrix): number {
  let maxIndex = -1;
  for (const style of coverageMatrix.optimizationStylesCovered) {
    const index = OPTIMIZATION_STYLE_AXIS.indexOf(style);
    if (index > maxIndex) maxIndex = index;
  }
  return maxIndex === -1 ? 0 : (maxIndex + 1) / OPTIMIZATION_STYLE_AXIS.length;
}

/** A level's "ease" proxy for skillCurve: fewer reload attempts ⇒ higher ease. In (0,1]. */
function easeOf(record: LevelRecord): number {
  return 1 / (1 + record.run.attempts);
}

/**
 * The per-LEVEL fold step. Updates behaviorState, knowledgeState,
 * mechanicsIntroduced/mechanicsMastered, optimizationDepth, emotionalState,
 * skillCurve, curiosityTrend. Never touches chapterHealth/retentionPrediction
 * — those are chapter-boundary concerns, updated by `processCampaign`.
 */
export function updateState(state: CampaignState, record: LevelRecord, coverageMatrix: CoverageMatrix, profile: CampaignProfile): CampaignState {
  const rate = emaRate(profile.trendWindowLevels);

  const behaviorSample = analyzeTape(record.run, profile);
  const behaviorState: BehaviorSignals = {
    hesitationFrames: ema(state.behaviorState.hesitationFrames, behaviorSample.hesitationFrames, rate),
    retryCount: state.behaviorState.retryCount + behaviorSample.retryCount,
    panicBurstCount: state.behaviorState.panicBurstCount + behaviorSample.panicBurstCount,
    commitmentSpeed: behaviorSample.commitmentSpeed ?? state.behaviorState.commitmentSpeed,
    platformCheckCount: state.behaviorState.platformCheckCount + behaviorSample.platformCheckCount,
    dropOffRate: ema(state.behaviorState.dropOffRate, behaviorSample.dropOffRate, rate),
  };

  const knowledgeState = updateKnowledge(state.knowledgeState, record, profile);
  const { mechanicsIntroduced, mechanicsMastered } = trackMechanics(coverageMatrix, knowledgeState, profile);
  const optimizationDepth = optimizationDepthOf(coverageMatrix);

  const emotionalSample = levelEmotionalScores(record);
  const emotionalState = rollEmotionalState(state.emotionalState, emotionalSample, rate);
  const curiosityTrend = rollTrend(state.curiosityTrend, emotionalSample.curiosity, rate, profile.trendMagnitudeTolerance);
  const skillCurve = rollTrend(state.skillCurve, easeOf(record), rate, profile.trendMagnitudeTolerance);

  return {
    knowledgeState,
    behaviorState,
    emotionalState,
    skillCurve,
    mechanicsIntroduced,
    mechanicsMastered,
    optimizationDepth,
    curiosityTrend,
    chapterHealth: state.chapterHealth,
    retentionPrediction: state.retentionPrediction,
  };
}

/** Mean of every recorded chapter's score, normalized to [0,1]. 0 if no chapter has closed yet. */
function meanChapterHealth(chapterHealth: Readonly<Record<string, ChapterHealthReport>>): number {
  const scores = Object.values(chapterHealth).map((c) => c.score);
  if (scores.length === 0) return 0;
  let sum = 0;
  for (const s of scores) sum += s;
  return sum / scores.length / 100;
}

/** `profile.retentionWeights`-weighted average of five [0,1]-normalized components (dm-0052). */
function computeRetention(state: CampaignState, profile: CampaignProfile): number {
  const w = profile.retentionWeights;
  const retryCadence = 1 - state.behaviorState.dropOffRate;
  const panicCycles = 1 / (1 + state.behaviorState.panicBurstCount);
  const curiosityComponent = state.curiosityTrend.direction === 'rising' ? 1 : state.curiosityTrend.direction === 'flat' ? 0.5 : 0;
  const chapterHealthComponent = meanChapterHealth(state.chapterHealth);

  const totalWeight = w.retryCadence + w.optimizationDepth + w.panicCycles + w.curiosityTrend + w.chapterHealth;
  const weightedSum =
    w.retryCadence * retryCadence +
    w.optimizationDepth * state.optimizationDepth +
    w.panicCycles * panicCycles +
    w.curiosityTrend * curiosityComponent +
    w.chapterHealth * chapterHealthComponent;
  return totalWeight === 0 ? 0 : weightedSum / totalWeight;
}

/**
 * Fold a chapter-grouped campaign into a `CampaignReport`. Each chapter's
 * levels fold via `updateState`, then its `MacroVerdict` elevates to a
 * `ChapterHealthReport` (dm-0046), a difficulty spike is flagged against the
 * rolling EMA baseline computed BEFORE this chapter's own score joins it
 * (dm-0048/dm-0052 — comparing against a baseline already pulled down by the
 * same low score would self-mask the spike), and `retentionPrediction` is
 * recomputed. Deterministic: identical `chapters`/`profile` ⇒ identical report.
 */
export function processCampaign(chapters: readonly ChapterRecord[], profile: CampaignProfile): CampaignReport {
  let state = ZERO_CAMPAIGN_STATE;
  let baseline: number | undefined;
  let priorChapterHealth: ChapterHealthReport | undefined;
  const chapterHealthMap: Record<string, ChapterHealthReport> = {};
  const alerts: CampaignAlert[] = [];

  for (const chapter of chapters) {
    for (const record of chapter.levels) {
      state = updateState(state, record, chapter.coverageMatrix, profile);
    }

    const health = aggregateChapterHealth(chapter.macroVerdict, priorChapterHealth, profile);
    const baselineBeforeThisChapter = baseline;
    baseline = baseline === undefined ? health.score : ema(baseline, health.score, profile.chapterHealthCalibration.baselineDecay);

    let finalHealth = health;
    if (baselineBeforeThisChapter !== undefined && baselineBeforeThisChapter - health.score > profile.chapterHealthCalibration.spikeDropThreshold) {
      const alert: CampaignAlert = {
        kind: 'difficulty-spike',
        chapterId: chapter.chapterId,
        reason: `chapter "${chapter.chapterId}" health ${health.score} fell more than spikeDropThreshold (${profile.chapterHealthCalibration.spikeDropThreshold}) below the rolling baseline ${baselineBeforeThisChapter}`,
        findings: [`baseline=${baselineBeforeThisChapter}`, `score=${health.score}`, `spikeDropThreshold=${profile.chapterHealthCalibration.spikeDropThreshold}`],
      };
      alerts.push(alert);
      finalHealth = { ...health, alerts: [alert] };
    }

    chapterHealthMap[chapter.chapterId] = finalHealth;
    state = { ...state, chapterHealth: { ...state.chapterHealth, [chapter.chapterId]: finalHealth } };
    priorChapterHealth = finalHealth;
    state = { ...state, retentionPrediction: computeRetention(state, profile) };
  }

  return {
    finalState: state,
    chapterHealthMap: Object.freeze(chapterHealthMap),
    alerts,
    retentionPrediction: state.retentionPrediction,
  };
}
