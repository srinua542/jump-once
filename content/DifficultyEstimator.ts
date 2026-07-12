/**
 * DifficultyEstimator — REQ-084's measured difficulty tier, derived from
 * evidence (P10/S10.2, dm-0111).
 *
 * GDOS alignment: Section 9 — a level's campaign difficulty bucket
 * (Easy/Medium/Hard/Harder/Very-Hard) is CALIBRATED DATA computed from what the
 * play evidence actually shows, NOT read from the authored difficulty-target
 * intent vector (which is only the generator's aim point). Three pre-existing
 * "tier/difficulty" concepts are deliberately NOT conflated here (dm-0111):
 * TierTimes routing tiers (per-level skill anchors), difficultyVectors (authored
 * [0,1] intent), and CurriculumLevel.difficulty (a scalar proxy). This module's
 * DifficultyTier is a FOURTH, distinct thing: the REQ-084 five-bucket placement,
 * derived from measured signals only.
 *
 * The estimate is a convex combination (weights + normalizers from a calibrated
 * DifficultyProfile, zero literals in the scoring) of four measured signals:
 *   - discovery completion time (longer ⇒ harder),
 *   - the fraction of archetypes that could not solve it within budget (harder),
 *   - the most deaths any archetype needed before a clear (execution demand),
 *   - the optimization delta (mastery headroom, REQ-102).
 * The resulting [0,1] score is bucketed by the profile's four boundaries.
 *
 * Pure over (evidence, optimization verdict, profile). Consumes only the
 * EvidenceBundle + OptimizationVerdict as data — never re-runs a sim, never
 * reads the authored difficulty-target vector. Whitelist math (min/max/floor).
 * Lives in content/.
 */

import { FIXED_STEP_SECONDS } from '../src/core/Clock';
import type { EvidenceBundle } from '../src/eval/gdos/Evidence';
import type { OptimizationVerdict } from '../src/eval/local/Optimization';
import { DIFFICULTY_TIERS, type DifficultyTier } from './schema/ChapterFramework';

/** Bump with a written calibration decision (CDRE-style). */
export const DIFFICULTY_PROFILE_VERSION = 1;

export interface DifficultyProfile {
  readonly version: number;
  /** Relative weights for the four measured signals; not all zero. */
  readonly weights: {
    readonly time: number;
    readonly unsolved: number;
    readonly deaths: number;
    readonly delta: number;
  };
  /** Normalizers mapping a raw signal to [0,1] by saturation. All > 0. */
  readonly references: {
    readonly discoverySeconds: number;
    readonly deaths: number;
    readonly deltaSeconds: number;
  };
  /** Four ascending cut points in (0,1) splitting the score into the five tiers. */
  readonly boundaries: readonly [number, number, number, number];
}

/**
 * The S10.2 baseline calibration. Boundaries evenly split [0,1]; weights favour
 * "could not solve" and "deaths" (execution demand) over raw time; references
 * saturate at values typical of the gap-corridor template. Recalibrated with a
 * ledger entry if S10.3's pilot shows drift (dm-0113/CDRE).
 */
export const DEFAULT_DIFFICULTY_PROFILE: DifficultyProfile = Object.freeze({
  version: DIFFICULTY_PROFILE_VERSION,
  weights: Object.freeze({ time: 1, unsolved: 2, deaths: 1.5, delta: 0.5 }),
  references: Object.freeze({ discoverySeconds: 10, deaths: 5, deltaSeconds: 2 }),
  boundaries: Object.freeze([0.2, 0.4, 0.6, 0.8]) as readonly [number, number, number, number],
}) as DifficultyProfile;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Least completing (non-explorer) discovery time in seconds, or null when nothing completed. */
function discoverySeconds(evidence: EvidenceBundle, verdict: OptimizationVerdict): number | null {
  if (verdict.applicable && verdict.tiers !== undefined) return verdict.tiers.discovery;
  let bestTicks: number | null = null;
  for (const r of evidence.runs) {
    if (r.outcome !== 'completed') continue;
    if (bestTicks === null || r.ticksElapsed < bestTicks) bestTicks = r.ticksElapsed;
  }
  return bestTicks === null ? null : bestTicks * FIXED_STEP_SECONDS;
}

export interface DifficultyEstimate {
  readonly tier: DifficultyTier;
  /** The [0,1] blended difficulty score the tier was bucketed from. */
  readonly score: number;
  /** Discovery completion time in seconds (a monotone difficulty proxy for macro degradation); 0 when nothing completed. */
  readonly discoverySeconds: number;
  /** Fraction of archetype runs that timed out (could not solve within budget). */
  readonly unsolvedFraction: number;
  /** Most deaths any single archetype run recorded. */
  readonly maxDeaths: number;
}

/** Full estimate: tier + the measured signals it was derived from. */
export function estimateDifficulty(
  evidence: EvidenceBundle,
  verdict: OptimizationVerdict,
  profile: DifficultyProfile = DEFAULT_DIFFICULTY_PROFILE,
): DifficultyEstimate {
  const disc = discoverySeconds(evidence, verdict);
  const discSecs = disc ?? 0;

  let timeouts = 0;
  let maxDeaths = 0;
  for (const r of evidence.runs) {
    if (r.outcome === 'timeout') timeouts++;
    if (r.attempts > maxDeaths) maxDeaths = r.attempts;
  }
  const unsolvedFraction = evidence.runs.length === 0 ? 0 : timeouts / evidence.runs.length;
  const deltaSeconds = verdict.applicable && verdict.deltaSeconds !== undefined ? verdict.deltaSeconds : 0;

  // A level that nothing solved is maximally hard on the time axis (saturate),
  // not zero (which the 0-second fallback would otherwise imply).
  const timeSignal = disc === null ? 1 : clamp01(discSecs / profile.references.discoverySeconds);
  const deathSignal = clamp01(maxDeaths / profile.references.deaths);
  const deltaSignal = clamp01(deltaSeconds / profile.references.deltaSeconds);

  const w = profile.weights;
  const weightSum = w.time + w.unsolved + w.deaths + w.delta;
  const score = weightSum <= 0
    ? 0
    : clamp01((w.time * timeSignal + w.unsolved * unsolvedFraction + w.deaths * deathSignal + w.delta * deltaSignal) / weightSum);

  return { tier: bucketize(score, profile), score, discoverySeconds: discSecs, unsolvedFraction, maxDeaths };
}

/** The REQ-084 tier from measured evidence (dm-0111). Thin wrapper over estimateDifficulty. */
export function estimateDifficultyTier(
  evidence: EvidenceBundle,
  verdict: OptimizationVerdict,
  profile: DifficultyProfile = DEFAULT_DIFFICULTY_PROFILE,
): DifficultyTier {
  return estimateDifficulty(evidence, verdict, profile).tier;
}

/** Map a [0,1] score to a tier via the profile's four ascending boundaries. */
export function bucketize(score: number, profile: DifficultyProfile = DEFAULT_DIFFICULTY_PROFILE): DifficultyTier {
  const [b1, b2, b3, b4] = profile.boundaries;
  if (score < b1) return DIFFICULTY_TIERS[0];
  if (score < b2) return DIFFICULTY_TIERS[1];
  if (score < b3) return DIFFICULTY_TIERS[2];
  if (score < b4) return DIFFICULTY_TIERS[3];
  return DIFFICULTY_TIERS[4];
}
