/**
 * Emotional — the emotional-threshold quality gate (P5/S5.2, REQ-055; the
 * REQ-015 arc gives the metric names their meaning).
 *
 * GDOS alignment: Section 6 (mathematically enforced emotional thresholds:
 * Curiosity ≥90, Confidence ≥90, Surprise ≥95, Mastery ≥95).
 *
 * Estimators are honest proxies over the EvidenceBundle measuring what the
 * play evidence shows was DELIVERED (dm-0031/dm-0036), never floating
 * absolutes; every coefficient comes from the profile (zero calibration
 * literals here):
 *   - Confidence ≈ how forgiving the level is to a first-timer: a First-Time
 *     clear with few reloads scores high (100 − reloads × penalty); a level a
 *     first-timer cannot clear builds no confidence (0).
 *   - Curiosity ≈ how much the Curious-Explorer's route diverges from the
 *     direct one: fractional overshoot × gain. No divergence, no curiosity.
 *   - Surprise ≈ plan invalidation: the most reloads any archetype needed
 *     before adapting to a clear (failure-then-success) × gain.
 *   - Mastery ≈ the optimization window: the P4 delta (Discovery−WorldRecord)
 *     over the profile's reference span.
 * The authored emotional-budget curve (GdosMetadata) is the INTENT cross-check
 * (the role parTimeTiersSeconds played in P4): delivered-vs-intended peaks are
 * reported as findings, not silently conflated with the delivered score.
 *
 * Whitelist math only; deterministic; pure over the bundle. src/eval/gdos/.
 */

import type { EvidenceBundle } from './Evidence';
import type { ScoringProfile } from './Profile';
import { clamp100 } from './Score';
import { gateResult, metricScore, type DesignDecision, type GateResult, type MetricScore } from './Report';

const GATE = 'emotional-threshold';

/** Least ticks among completing non-explorer archetypes (the "direct" route), or null. */
function directBaselineTicks(bundle: EvidenceBundle): number | null {
  let best: number | null = null;
  for (const r of bundle.runs) {
    if (r.outcome !== 'completed' || r.archetype === 'curiousExplorer') continue;
    if (best === null || r.ticksElapsed < best) best = r.ticksElapsed;
  }
  return best;
}

function confidenceScore(bundle: EvidenceBundle, profile: ScoringProfile): number {
  for (const r of bundle.runs) {
    if (r.archetype !== 'firstTime') continue;
    if (r.outcome !== 'completed') return 0;
    return clamp100(100 - r.attempts * profile.emotional.confidenceAttemptPenalty);
  }
  return 0;
}

function curiosityScore(bundle: EvidenceBundle, profile: ScoringProfile): number {
  const direct = directBaselineTicks(bundle);
  let explorerTicks: number | null = null;
  for (const r of bundle.runs) {
    if (r.archetype === 'curiousExplorer' && r.outcome === 'completed') explorerTicks = r.ticksElapsed;
  }
  if (direct === null || direct === 0 || explorerTicks === null) return 0;
  const overshoot = explorerTicks / direct - 1;
  return clamp100(profile.emotional.curiosityDivergenceGain * Math.max(0, overshoot));
}

function surpriseScore(bundle: EvidenceBundle, profile: ScoringProfile): number {
  let maxAttempts = 0;
  let anyCompleted = false;
  for (const r of bundle.runs) {
    if (r.outcome !== 'completed') continue;
    anyCompleted = true;
    if (r.attempts > maxAttempts) maxAttempts = r.attempts;
  }
  if (!anyCompleted) return 0;
  return clamp100(profile.emotional.surpriseAttemptGain * maxAttempts);
}

function masteryScore(bundle: EvidenceBundle, profile: ScoringProfile): number {
  const opt = bundle.optimization;
  if (!opt.applicable || opt.deltaSeconds === undefined) return 0;
  return clamp100((opt.deltaSeconds / profile.emotional.masteryDeltaReferenceSeconds) * 100);
}

/** Intended peak for one curve field across the authored budget curve. */
function intendedPeak(bundle: EvidenceBundle, field: 'curiosity' | 'confidence' | 'surprise' | 'mastery'): number {
  let peak = 0;
  for (const kf of bundle.def.gdos.emotionalBudgetCurve) if (kf[field] > peak) peak = kf[field];
  return peak;
}

/** The four delivered emotional scores in [0,100]. Reused by the streamability gate. */
export interface EmotionalScores {
  readonly curiosity: number;
  readonly confidence: number;
  readonly surprise: number;
  readonly mastery: number;
}

export function computeEmotionalScores(bundle: EvidenceBundle, profile: ScoringProfile): EmotionalScores {
  return {
    curiosity: curiosityScore(bundle, profile),
    confidence: confidenceScore(bundle, profile),
    surprise: surpriseScore(bundle, profile),
    mastery: masteryScore(bundle, profile),
  };
}

/** Score a level against the four emotional thresholds (REQ-055). */
export function scoreEmotional(bundle: EvidenceBundle, profile: ScoringProfile): GateResult {
  const t = profile.emotional.thresholds;
  const delivered = computeEmotionalScores(bundle, profile);
  const scores: MetricScore[] = [
    metricScore('curiosity', delivered.curiosity, t.curiosity),
    metricScore('confidence', delivered.confidence, t.confidence),
    metricScore('surprise', delivered.surprise, t.surprise),
    metricScore('mastery', delivered.mastery, t.mastery),
  ];

  const findings: string[] = [];
  const fieldByMetric: Readonly<Record<string, 'curiosity' | 'confidence' | 'surprise' | 'mastery'>> = {
    curiosity: 'curiosity', confidence: 'confidence', surprise: 'surprise', mastery: 'mastery',
  };
  for (const s of scores) {
    if (!s.pass) findings.push(`${s.metric} ${s.score.toFixed(1)} below threshold ${s.threshold}`);
    const intended = intendedPeak(bundle, fieldByMetric[s.metric]);
    if (intended > 0) findings.push(`${s.metric} delivered ${s.score.toFixed(1)} vs intended peak ${intended}`);
  }

  const pass = scores.every((s) => s.pass);
  const decision: DesignDecision = {
    source: GATE,
    subject: bundle.def.levelId,
    verdict: pass ? 'pass' : 'fail',
    summary: pass
      ? `emotional thresholds met (curiosity/confidence ≥ ${t.curiosity}, surprise ≥ ${t.surprise}, mastery ≥ ${t.mastery})`
      : `emotional thresholds unmet: ${scores.filter((s) => !s.pass).map((s) => s.metric).join(', ')}`,
    findings,
  };
  return gateResult(GATE, scores, findings, [decision]);
}
