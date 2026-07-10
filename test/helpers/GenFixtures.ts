/**
 * Shared P7 generation fixtures (S7.1+). Mirrors CampaignFixtures: a profile
 * builder that starts from DEFAULT_GEN_PROFILE and applies deep overrides —
 * every two-profile calibration-externalization test builds its pair here.
 */

import { DEFAULT_GEN_PROFILE, parseGenProfile, type GenProfile } from '../../src/gen/GenProfile';
import type { LevelConcept } from '../../src/gen/Concept';

/** Deep-merge overrides onto the default profile, re-validated through the strict parser. */
export function genProfileWith(overrides: {
  profileId?: string;
  lifecycle?: Partial<GenProfile['lifecycle']>;
  pda?: Partial<GenProfile['pda']>;
  generator?: Partial<Omit<GenProfile['generator'], 'entityTuning'>> & { entityTuning?: Partial<GenProfile['generator']['entityTuning']> };
  creativity?: Partial<Omit<GenProfile['creativity'], 'selectionWeights'>> & { selectionWeights?: Partial<GenProfile['creativity']['selectionWeights']> };
  intent?: Partial<GenProfile['intent']>;
  pipeline?: Partial<GenProfile['pipeline']>;
}): GenProfile {
  const { entityTuning: tuningOverrides, ...generatorOverrides } = overrides.generator ?? {};
  const { selectionWeights: weightOverrides, ...creativityOverrides } = overrides.creativity ?? {};
  const raw = {
    genProfileSchemaVersion: DEFAULT_GEN_PROFILE.genProfileSchemaVersion,
    profileId: overrides.profileId ?? DEFAULT_GEN_PROFILE.profileId,
    lifecycle: { ...DEFAULT_GEN_PROFILE.lifecycle, ...overrides.lifecycle },
    pda: { ...DEFAULT_GEN_PROFILE.pda, ...overrides.pda },
    generator: {
      ...DEFAULT_GEN_PROFILE.generator,
      ...generatorOverrides,
      entityTuning: { ...DEFAULT_GEN_PROFILE.generator.entityTuning, ...tuningOverrides },
    },
    creativity: {
      ...DEFAULT_GEN_PROFILE.creativity,
      ...creativityOverrides,
      selectionWeights: { ...DEFAULT_GEN_PROFILE.creativity.selectionWeights, ...weightOverrides },
    },
    intent: { ...DEFAULT_GEN_PROFILE.intent, ...overrides.intent },
    pipeline: { ...DEFAULT_GEN_PROFILE.pipeline, ...overrides.pipeline },
  };
  const result = parseGenProfile(raw);
  if (!result.ok) {
    throw new Error(`genProfileWith produced an invalid profile: ${JSON.stringify(result.errors)}`);
  }
  return result.value;
}

/** A valid baseline LevelConcept with overrides — the S7.4+ concept fixture. */
export function conceptWith(overrides: Partial<LevelConcept>): LevelConcept {
  return {
    archetype: 'execution',
    intentSentence: 'Commit the jump only after reading the full gap, because the pit punishes a habitual early press.',
    oneJumpDecision: 'where along the approach to spend the only jump',
    mechanics: [],
    difficultyTarget: { executionPrecision: 0.5, readingComplexity: 0.2, timingStrictness: 0.3, routeAmbiguity: 0.1 },
    emotionalPhase: 'confidence',
    targetKgNode: 'kg:test/gen-fixture',
    ...overrides,
  };
}
