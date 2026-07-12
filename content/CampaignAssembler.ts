/**
 * CampaignAssembler — campaign-scope assembly, REQ-084 distribution
 * enforcement, and the REQ-015 arc-completeness re-check (P10/S10.5).
 *
 * GDOS alignment: Section 9/15. Three pure functions:
 *   1. assembleCampaignReport — a thin wrapper over the P6 CampaignDirector fold
 *      (processCampaign), turning a list of ChapterRecords into a CampaignReport
 *      (macro health map, alerts, retention). No new campaign logic — P6 owns it.
 *   2. assessDifficultyDistribution — REQ-084: counts the MEASURED difficulty
 *      tiers across the campaign and checks each bucket against the manifest's
 *      declared bands within its calibrated tolerance. Reports the per-bucket gap
 *      whether or not it passes (honest measurement, never gamed to the target).
 *   3. assessArcCompleteness — REQ-015 at campaign scope: every chapter's slot
 *      sequence must cover the six EMOTION_ARC phases (already a parse invariant
 *      per chapter; re-checked here so a campaign-level audit does not assume it).
 *
 * Pure over its inputs. Consumes P6 through its public seam only. Whitelist math
 * (abs). Lives in content/.
 */

import { processCampaign, type ChapterRecord } from '../src/eval/campaign/CampaignDirector';
import type { CampaignReport } from '../src/eval/campaign/CampaignState';
import type { CampaignProfile } from '../src/eval/campaign/CampaignProfile';
import { EMOTION_ARC, type EmotionPhase } from '../src/eval/gdos/DesignSpace';
import { DIFFICULTY_TIERS, type DifficultyTier, type ChapterFramework } from './schema/ChapterFramework';
import type { CampaignManifest } from './schema/CampaignManifest';

/** Fold chapter records into a campaign report via the P6 director (no new logic). */
export function assembleCampaignReport(chapterRecords: readonly ChapterRecord[], profile: CampaignProfile): CampaignReport {
  return processCampaign(chapterRecords, profile);
}

export interface TierBucketAssessment {
  readonly tier: DifficultyTier;
  readonly count: number;
  readonly fraction: number;
  readonly targetFraction: number;
  readonly deviation: number;
  readonly withinTolerance: boolean;
}

export interface DistributionVerdict {
  /** True iff every tier bucket sits within tolerance of its declared band (REQ-084). */
  readonly pass: boolean;
  readonly total: number;
  readonly buckets: readonly TierBucketAssessment[];
}

/**
 * REQ-084: assess the measured difficulty-tier distribution across the whole
 * campaign against the manifest's declared bands. `measuredTiers` is one entry
 * per shipped level (from the DifficultyEstimator). Never gamed — the target
 * stays the manifest's design intent; the deviation is reported as-is.
 */
export function assessDifficultyDistribution(measuredTiers: readonly DifficultyTier[], manifest: CampaignManifest): DistributionVerdict {
  const total = measuredTiers.length;
  const counts: Record<DifficultyTier, number> = { easy: 0, medium: 0, hard: 0, harder: 0, 'very-hard': 0 };
  for (const t of measuredTiers) counts[t]++;
  const buckets: TierBucketAssessment[] = DIFFICULTY_TIERS.map((tier) => {
    const count = counts[tier];
    const fraction = total === 0 ? 0 : count / total;
    const targetFraction = manifest.difficultyDistribution[tier];
    const deviation = Math.abs(fraction - targetFraction);
    return { tier, count, fraction, targetFraction, deviation, withinTolerance: deviation <= manifest.distributionTolerance };
  });
  return { pass: total > 0 && buckets.every((b) => b.withinTolerance), total, buckets };
}

export interface ArcChapterAssessment {
  readonly chapterId: string;
  readonly pass: boolean;
  readonly phaseSequence: readonly EmotionPhase[];
}

export interface ArcVerdict {
  readonly pass: boolean;
  readonly chapters: readonly ArcChapterAssessment[];
}

/** REQ-015 at campaign scope: every chapter covers the six-phase arc contiguously and in order. */
export function assessArcCompleteness(frameworks: readonly ChapterFramework[]): ArcVerdict {
  const arc = EMOTION_ARC as readonly EmotionPhase[];
  const chapters: ArcChapterAssessment[] = frameworks.map((fw) => {
    const collapsed: EmotionPhase[] = [];
    for (const s of fw.levelSlots) {
      if (collapsed.length === 0 || collapsed[collapsed.length - 1] !== s.emotionalPhase) collapsed.push(s.emotionalPhase);
    }
    const pass = collapsed.length === arc.length && collapsed.every((p, i) => p === arc[i]);
    return { chapterId: fw.chapterId, pass, phaseSequence: collapsed };
  });
  return { pass: chapters.length > 0 && chapters.every((c) => c.pass), chapters };
}
