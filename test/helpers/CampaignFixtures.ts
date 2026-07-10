/**
 * CampaignFixtures — hand-built CampaignProfile variants for the P6 director
 * tests (S6.1+). Not a test file.
 *
 * Mirrors test/helpers/GdosFixtures.ts's profileWith: DEFAULT_CAMPAIGN_PROFILE
 * with overrides, giving every calibration-externalization test ("this
 * outcome flips under a different profile", dm-0045) a distinct, valid
 * profile without repeating the full record shape at each call site.
 */

import { DEFAULT_CAMPAIGN_PROFILE, type BehaviorProfile, type CampaignProfile, type ChapterHealthProfile, type MasteryProfile, type RetentionWeights } from '../../src/eval/campaign/CampaignProfile';
import { cellKey, type CoverageMatrix, type DesignCell, type EmotionPhase, type EnvironmentValue, type OptimizationStyle } from '../../src/eval/gdos/DesignSpace';
import type { EntityKind } from '../../src/components/Behavior';
import type { ArchetypeName } from '../../src/eval/Archetypes';

/** DEFAULT_CAMPAIGN_PROFILE with a new id and optional field-group overrides (for the calibration-external tests). */
export function campaignProfileWith(overrides: {
  readonly profileId?: string;
  readonly behavior?: Partial<BehaviorProfile>;
  readonly mastery?: Partial<MasteryProfile>;
  readonly chapterHealthCalibration?: Partial<ChapterHealthProfile>;
  readonly retentionWeights?: Partial<RetentionWeights>;
  readonly trendWindowLevels?: number;
  readonly trendMagnitudeTolerance?: number;
}): CampaignProfile {
  return {
    campaignProfileSchemaVersion: DEFAULT_CAMPAIGN_PROFILE.campaignProfileSchemaVersion,
    profileId: overrides.profileId ?? 'campaign-test-profile',
    behavior: { ...DEFAULT_CAMPAIGN_PROFILE.behavior, ...(overrides.behavior ?? {}) },
    mastery: { ...DEFAULT_CAMPAIGN_PROFILE.mastery, ...(overrides.mastery ?? {}) },
    chapterHealthCalibration: { ...DEFAULT_CAMPAIGN_PROFILE.chapterHealthCalibration, ...(overrides.chapterHealthCalibration ?? {}) },
    retentionWeights: { ...DEFAULT_CAMPAIGN_PROFILE.retentionWeights, ...(overrides.retentionWeights ?? {}) },
    trendWindowLevels: overrides.trendWindowLevels ?? DEFAULT_CAMPAIGN_PROFILE.trendWindowLevels,
    trendMagnitudeTolerance: overrides.trendMagnitudeTolerance ?? DEFAULT_CAMPAIGN_PROFILE.trendMagnitudeTolerance,
  };
}

const DEFAULT_CELL: DesignCell = {
  mechanic: 'spring',
  environment: 'baseline',
  emotion: 'curiosity',
  optimizationStyle: 'discovery',
  playerType: 'firstTime',
};

/**
 * A hand-built CoverageMatrix from explicit cells (each defaulted from
 * DEFAULT_CELL, override just what a test cares about — usually `mechanic`
 * and `optimizationStyle`). Mirrors DesignSpace.coverageMatrix's own
 * key-reconstruction algorithm so the fixture matches the real shape exactly,
 * without needing a full EvidenceBundle per cell (MechanicTracker tests only
 * care about the resulting cell-key set, per dm-0045).
 */
export function coverageMatrixFixture(cells: readonly Partial<DesignCell>[]): CoverageMatrix {
  const full = cells.map((c) => ({ ...DEFAULT_CELL, ...c }));
  const keys = new Set(full.map(cellKey));
  const mechanics = new Set<EntityKind>();
  const environments = new Set<EnvironmentValue>();
  const emotions = new Set<EmotionPhase>();
  const optStyles = new Set<OptimizationStyle>();
  const playerTypes = new Set<ArchetypeName>();
  for (const key of keys) {
    const [m, e, emo, opt, pt] = key.split('|');
    mechanics.add(m as EntityKind);
    environments.add(e as EnvironmentValue);
    emotions.add(emo as EmotionPhase);
    optStyles.add(opt as OptimizationStyle);
    playerTypes.add(pt as ArchetypeName);
  }
  return {
    cells: keys,
    totalCells: keys.size,
    mechanicsCovered: [...mechanics],
    environmentsCovered: [...environments],
    emotionsCovered: [...emotions],
    optimizationStylesCovered: [...optStyles],
    playerTypesCovered: [...playerTypes],
  };
}
