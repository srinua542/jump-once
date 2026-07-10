/**
 * CampaignState — the macro-level Game Director's state kernel (P6/S6.1,
 * REQ-030/031/032/041/142, dm-0043–dm-0050).
 *
 * GDOS alignment: Section 4 — macro-level Game Director tracking global
 * campaign state (REQ-030), the ten continuously-tracked macro variables
 * (REQ-031), and the Player Behavior Model (REQ-032).
 *
 * Design (dm-0043): CampaignState is updated by a PURE fold — updateState in
 * CampaignDirector.ts (S6.5) returns a new record every call; nothing here
 * mutates in place. ZERO_CAMPAIGN_STATE is the additive identity, the same
 * pattern Vec2.ZERO plays in the engine core.
 *
 * This file imports P4/P5 output types (`GdosReport`, `ArchetypeRun`,
 * `MacroVerdict`) with `import type` ONLY — they compile away, so campaign/
 * gains no runtime dependency on the sim, the harness, or the scoring gates
 * (dm-0047: campaign/ consumes verdicts as data, one abstraction level above
 * per-level GDOS scoring; it never re-runs an audit or re-scores a level).
 * `LevelRecord` carries `ArchetypeRun` rather than a bare `ReplayTape`
 * (dm-0049 — an S6.2 correction): outcome/attempts live only on ArchetypeRun,
 * and TapeAnalyzer's dropOffRate/retryCount need them. `LevelRecord` also
 * carries `mechanicsExercised: ReadonlySet<EntityKind>` (dm-0050 — an S6.3
 * addition): no other LevelRecord field names which mechanics a level
 * touches, and MechanicTracker needs that per-level to update knowledge
 * incrementally; the caller derives it from DesignSpace.extractCoverage, so
 * campaign/ still never imports LevelDefinition/EvidenceBundle itself.
 * `mechanicsIntroduced`/`mechanicsMastered` are typed `ReadonlySet<EntityKind>`
 * (widened from `string` at S6.3, dm-0050) to match
 * `CoverageMatrix.mechanicsCovered` exactly, avoiding a lossy cast.
 *
 * Whitelist math elsewhere; this file only constructs frozen records.
 */

import type { GdosReport } from '../gdos/Report';
import type { ArchetypeRun } from '../gdos/Evidence';
import type { EntityKind } from '../../components/Behavior';
import type { CriterionResult, MacroVerdict } from '../macro/Curriculum';

/**
 * REQ-032 Player Behavior Model: hesitation, platform-checking, commitment
 * speed, panic cycles, drop-off, retry cadence — every field derived from
 * frame-indexed tape data only (dm-0043), never wall-clock. The same shape
 * serves both a single tape's raw reading (S6.2 TapeAnalyzer.analyzeTape) and
 * CampaignState's rolling campaign-wide aggregate (S6.5 CampaignDirector) —
 * per-tape a count/frame-index, aggregate a rolling mean or cumulative total
 * of the same unit. P6 depends only on this record shape, never on its
 * source, so P8's live telemetry can supply an alternative implementation of
 * the identical shape later without a structural change (dm-0044).
 */
export interface BehaviorSignals {
  /** Longest gap of no-input frames immediately before a jump input. ≥0. Aggregate: rolling mean. */
  readonly hesitationFrames: number;
  /** Scene reloads. ≥0. Aggregate: cumulative across the campaign. */
  readonly retryCount: number;
  /** Clusters of rapid jump/move inputs signaling panic. ≥0. Aggregate: cumulative. */
  readonly panicBurstCount: number;
  /** Frame index of the first jump input; undefined if the tape never jumped. Aggregate: rolling mean over tapes that jumped. */
  readonly commitmentSpeed?: number;
  /** Lateral moves near a ledge without a following jump. ≥0. Aggregate: cumulative. */
  readonly platformCheckCount: number;
  /** Fraction, in [0,1], of tapes ending without the goal-reached event. Per-tape: 0 or 1. Aggregate: rolling fraction. */
  readonly dropOffRate: number;
}

/** The zero-signal reading: no tapes observed yet. */
export const ZERO_BEHAVIOR_SIGNALS: BehaviorSignals = Object.freeze({
  hesitationFrames: 0,
  retryCount: 0,
  panicBurstCount: 0,
  commitmentSpeed: undefined,
  platformCheckCount: 0,
  dropOffRate: 0,
});

/**
 * A macro-level read of the four GDOS emotion categories the campaign has
 * DELIVERED so far, normalized to [0,1] intensity. Distinct from the
 * per-level GDOS 0–100 EmotionalThresholds scale (dm-0031/REQ-055) — this is
 * a campaign-wide rolling read, not a per-level gate score.
 */
export interface EmotionalState {
  readonly curiosity: number;
  readonly confidence: number;
  readonly surprise: number;
  readonly mastery: number;
}

export const ZERO_EMOTIONAL_STATE: EmotionalState = Object.freeze({ curiosity: 0, confidence: 0, surprise: 0, mastery: 0 });

export type TrendDirection = 'rising' | 'falling' | 'flat';

/**
 * A rolled signal plus the direction it's moving. `magnitude` is the CURRENT
 * EMA-rolled value of the underlying signal (not a raw step delta) —
 * `direction` reports whether that rolled value rose, fell, or stayed flat
 * (within `CampaignProfile.trendMagnitudeTolerance`) since the previous
 * update (dm-0052; computed in `CampaignDirector.rollTrend`).
 */
export interface TrendReading {
  readonly direction: TrendDirection;
  readonly magnitude: number;
}

export const ZERO_TREND: TrendReading = Object.freeze({ direction: 'flat', magnitude: 0 });

/** What kind of campaign-level event a CampaignAlert reports. */
export type CampaignAlertKind = 'difficulty-spike';

/**
 * One pure alert record the CampaignDirector emits about the running
 * campaign — the same evidentiary pattern as DesignDecision in P5 (dm-0031):
 * never a bare boolean, always a reason plus the contributing metrics.
 */
export interface CampaignAlert {
  readonly kind: CampaignAlertKind;
  readonly chapterId: string;
  /** One-line human-readable rationale. Non-empty by construction. */
  readonly reason: string;
  /** Machine-readable evidence findings backing the alert (may be empty). */
  readonly findings: readonly string[];
}

/**
 * One chapter's REQ-142 macro criteria elevated from a single MacroVerdict
 * (P4 output, consumed as data) to a running campaign trajectory (dm-0046).
 * Field names mirror MacroVerdict's four criteria exactly for traceability.
 */
export interface ChapterHealthReport {
  /** Composite health score, [0,100] — the same scale convention as GDOS gate scores. */
  readonly score: number;
  readonly cognitiveStructuralMapping: CriterionResult;
  readonly crossChapterDegradation: CriterionResult;
  readonly curiosityProgression: CriterionResult;
  readonly graduationAssessment: CriterionResult;
  /** This chapter's health trend relative to the rolling baseline. */
  readonly trend: TrendDirection;
  /** Alerts raised for this chapter (e.g. a flagged difficulty spike). May be empty. */
  readonly alerts: readonly CampaignAlert[];
}

/**
 * The ten REQ-031 macro state variables tracked continuously across a
 * campaign, plus the campaign's mechanic-knowledge and mastery sets:
 *  1. knowledgeState      — per-mechanic confidence, [0,1] each
 *  2. behaviorState       — REQ-032 Player Behavior Model (rolling aggregate)
 *  3. emotionalState      — delivered-emotion read, [0,1] each
 *  4. skillCurve          — rolling performance-trend direction + magnitude
 *  5. mechanicsIntroduced — mechanics that have appeared in ≥1 coverage cell
 *  6. mechanicsMastered   — mechanics meeting the mastery threshold (dm-0045)
 *  7. optimizationDepth   — mean optimization tier reached across levels
 *  8. curiosityTrend      — rolling curiosity-divergence trend
 *  9. chapterHealth       — per-chapter REQ-142 trajectory (dm-0046)
 * 10. retentionPrediction — [0,1] design-proxy composite (dm-0046)
 *
 * Every field is immutable; CampaignDirector.updateState (S6.5) returns a new
 * CampaignState rather than mutating this one (dm-0043).
 */
export interface CampaignState {
  readonly knowledgeState: Readonly<Record<string, number>>;
  readonly behaviorState: BehaviorSignals;
  readonly emotionalState: EmotionalState;
  readonly skillCurve: TrendReading;
  readonly mechanicsIntroduced: ReadonlySet<EntityKind>;
  readonly mechanicsMastered: ReadonlySet<EntityKind>;
  readonly optimizationDepth: number;
  readonly curiosityTrend: TrendReading;
  readonly chapterHealth: Readonly<Record<string, ChapterHealthReport>>;
  readonly retentionPrediction: number;
}

/** The additive identity: no levels processed yet. */
export const ZERO_CAMPAIGN_STATE: CampaignState = Object.freeze({
  knowledgeState: Object.freeze({}),
  behaviorState: ZERO_BEHAVIOR_SIGNALS,
  emotionalState: ZERO_EMOTIONAL_STATE,
  skillCurve: ZERO_TREND,
  mechanicsIntroduced: Object.freeze(new Set<EntityKind>()),
  mechanicsMastered: Object.freeze(new Set<EntityKind>()),
  optimizationDepth: 0,
  curiosityTrend: ZERO_TREND,
  chapterHealth: Object.freeze({}),
  retentionPrediction: 0,
});

/**
 * The P6 input unit: one already-judged level's evidence, assembled by the
 * caller from P4 + P5 outputs. `run` is an `ArchetypeRun` (dm-0049 — outcome
 * + attempts + frame-indexed tape, exactly what TapeAnalyzer needs for
 * dropOffRate/retryCount/hesitation/panic/commitment/platform-check) — never
 * the full `AgentRunResult`, which would couple campaign/ to AgentHarness.ts
 * (the module that drives the engine; dm-0047 forbids that coupling,
 * mirroring gdos/'s own no-re-auditing rule). `mechanicsExercised` is the
 * caller-supplied set of mechanics this level touches (dm-0050 — derived
 * upstream via DesignSpace.extractCoverage, outside campaign/), since no
 * other field names a level's mechanics.
 */
export interface LevelRecord {
  readonly levelId: string;
  readonly chapterId: string;
  readonly report: GdosReport;
  readonly run: ArchetypeRun;
  readonly macroCriteria: MacroVerdict;
  readonly mechanicsExercised: ReadonlySet<EntityKind>;
}

/** The CampaignDirector's aggregate output over a processed campaign (S6.5). */
export interface CampaignReport {
  readonly finalState: CampaignState;
  readonly chapterHealthMap: Readonly<Record<string, ChapterHealthReport>>;
  readonly alerts: readonly CampaignAlert[];
  readonly retentionPrediction: number;
}
