/**
 * S6.3 — MechanicTracker + KnowledgeModel (REQ-031 mechanics-introduced/
 * mastered; REQ-041 P6 share, dm-0045/dm-0050). MechanicTracker consumes a
 * caller-supplied CoverageMatrix by reference (never recomputes it);
 * KnowledgeModel is a pure per-mechanic confidence EMA.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { trackMechanics } from '../../src/eval/campaign/MechanicTracker';
import { updateKnowledge } from '../../src/eval/campaign/KnowledgeModel';
import { DEFAULT_CAMPAIGN_PROFILE } from '../../src/eval/campaign/CampaignProfile';
import { campaignProfileWith, coverageMatrixFixture } from '../helpers/CampaignFixtures';
import { TAPE_SCHEMA_VERSION } from '../../src/schema/TapeIO';
import { gateResult, gdosReport, metricScore } from '../../src/eval/gdos/Report';
import type { ArchetypeRun } from '../../src/eval/gdos/Evidence';
import type { LevelRecord } from '../../src/eval/campaign/CampaignState';
import type { CriterionResult, MacroVerdict } from '../../src/eval/macro/Curriculum';
import type { EntityKind } from '../../src/components/Behavior';

function passingCriterion(): CriterionResult {
  return { pass: true, findings: [] };
}

function fixtureMacroVerdict(): MacroVerdict {
  return {
    chapterHealthy: true,
    cognitiveStructuralMapping: passingCriterion(),
    crossChapterDegradation: passingCriterion(),
    curiosityProgression: passingCriterion(),
    graduationAssessment: passingCriterion(),
    overallPass: true,
  };
}

function fixtureRun(outcome: 'completed' | 'timeout' = 'completed', attempts = 0): ArchetypeRun {
  return {
    archetype: 'firstTime',
    outcome,
    attempts,
    ticksElapsed: 1,
    tape: { schemaVersion: TAPE_SCHEMA_VERSION, levelId: 'mechanic-fixture', seed: 1, frames: [{ moveAxis: 0, jumpPressed: false, resetPressed: false }] },
  };
}

function fixtureRecord(mechanics: readonly EntityKind[], opts: { pass?: boolean; outcome?: 'completed' | 'timeout' } = {}): LevelRecord {
  const pass = opts.pass ?? true;
  return {
    levelId: 'mechanic-fixture',
    chapterId: 'chapter-1',
    report: gdosReport('mechanic-fixture', 'test-profile', [
      gateResult('emotional-threshold', [metricScore('curiosity', pass ? 95 : 10, 90)], [], []),
    ]),
    run: fixtureRun(opts.outcome ?? 'completed'),
    macroCriteria: fixtureMacroVerdict(),
    mechanicsExercised: new Set(mechanics),
  };
}

test('mechanicsIntroduced is exactly the coverage matrix\'s mechanicsCovered', () => {
  const matrix = coverageMatrixFixture([{ mechanic: 'spring' }, { mechanic: 'spike' }]);
  const result = trackMechanics(matrix, {}, DEFAULT_CAMPAIGN_PROFILE);
  assert.deepEqual([...result.mechanicsIntroduced].sort(), ['spike', 'spring']);
});

test('a mechanic with high knowledge but a LOW top-tier ratio is introduced but NOT mastered', () => {
  const matrix = coverageMatrixFixture([
    { mechanic: 'spring', optimizationStyle: 'discovery' },
    { mechanic: 'spring', optimizationStyle: 'good', environment: 'iceSurface' },
  ]); // 0 of 2 cells at worldRecord tier
  const result = trackMechanics(matrix, { spring: 1 }, DEFAULT_CAMPAIGN_PROFILE);
  assert.ok(result.mechanicsIntroduced.has('spring'));
  assert.ok(!result.mechanicsMastered.has('spring'));
});

test('a mechanic with a HIGH top-tier ratio but LOW knowledge confidence is introduced but NOT mastered', () => {
  const matrix = coverageMatrixFixture([{ mechanic: 'spring', optimizationStyle: 'worldRecord' }]);
  const result = trackMechanics(matrix, { spring: 0.1 }, DEFAULT_CAMPAIGN_PROFILE);
  assert.ok(result.mechanicsIntroduced.has('spring'));
  assert.ok(!result.mechanicsMastered.has('spring'));
});

test('a mechanic clearing BOTH the knowledge and top-tier-ratio thresholds is mastered', () => {
  const matrix = coverageMatrixFixture([{ mechanic: 'spring', optimizationStyle: 'worldRecord' }]);
  const result = trackMechanics(matrix, { spring: 0.9 }, DEFAULT_CAMPAIGN_PROFILE);
  assert.ok(result.mechanicsMastered.has('spring'));
});

test('the top-tier ratio is computed per mechanic independently: a second mechanic with only low-tier cells stays unmastered even when the first is mastered', () => {
  const matrix = coverageMatrixFixture([
    { mechanic: 'spring', optimizationStyle: 'worldRecord' },
    { mechanic: 'spike', optimizationStyle: 'discovery' },
  ]);
  const result = trackMechanics(matrix, { spring: 0.9, spike: 0.9 }, DEFAULT_CAMPAIGN_PROFILE);
  assert.ok(result.mechanicsMastered.has('spring'));
  assert.ok(!result.mechanicsMastered.has('spike'));
});

test('two-profile fixture: a lower masteryRoutingConfidenceThreshold masters a mechanic the default profile would not (dm-0045 externalization proof)', () => {
  const matrix = coverageMatrixFixture([
    { mechanic: 'spring', optimizationStyle: 'discovery' },
    { mechanic: 'spring', optimizationStyle: 'worldRecord', environment: 'iceSurface' },
  ]); // 1 of 2 cells at top tier => ratio 0.5
  const strict = campaignProfileWith({ mastery: { masteryRoutingConfidenceThreshold: 0.8 } });
  const lenient = campaignProfileWith({ mastery: { masteryRoutingConfidenceThreshold: 0.4 } });
  const knowledge = { spring: 1 };
  assert.ok(!trackMechanics(matrix, knowledge, strict).mechanicsMastered.has('spring'));
  assert.ok(trackMechanics(matrix, knowledge, lenient).mechanicsMastered.has('spring'));
});

test('updateKnowledge moves confidence toward 1 on a passing, completed level', () => {
  const record = fixtureRecord(['spring'], { pass: true, outcome: 'completed' });
  const next = updateKnowledge({ spring: 0.2 }, record, DEFAULT_CAMPAIGN_PROFILE);
  assert.ok(next.spring > 0.2);
  assert.ok(next.spring < 1);
});

test('updateKnowledge moves confidence toward 0 on a failing level', () => {
  const record = fixtureRecord(['spring'], { pass: false, outcome: 'completed' });
  const next = updateKnowledge({ spring: 0.8 }, record, DEFAULT_CAMPAIGN_PROFILE);
  assert.ok(next.spring < 0.8);
});

test('updateKnowledge moves confidence toward 0 on a timed-out level even if the gate report passed', () => {
  const record = fixtureRecord(['spring'], { pass: true, outcome: 'timeout' });
  const next = updateKnowledge({ spring: 0.8 }, record, DEFAULT_CAMPAIGN_PROFILE);
  assert.ok(next.spring < 0.8);
});

test('updateKnowledge only touches mechanicsExercised keys; unrelated mechanics carry over unchanged', () => {
  const record = fixtureRecord(['spring'], { pass: true, outcome: 'completed' });
  const next = updateKnowledge({ spring: 0.2, spike: 0.5 }, record, DEFAULT_CAMPAIGN_PROFILE);
  assert.equal(next.spike, 0.5);
});

test('the exact EMA formula: next = current + rate * (target - current)', () => {
  const profile = campaignProfileWith({ mastery: { knowledgeLearningRate: 0.5 } });
  const record = fixtureRecord(['spring'], { pass: true, outcome: 'completed' });
  const next = updateKnowledge({ spring: 0.4 }, record, profile);
  assert.equal(next.spring, 0.4 + 0.5 * (1 - 0.4));
});

test('two-profile fixture: a higher knowledgeLearningRate moves confidence further in one step (dm-0045 externalization proof)', () => {
  const record = fixtureRecord(['spring'], { pass: true, outcome: 'completed' });
  const slow = campaignProfileWith({ mastery: { knowledgeLearningRate: 0.1 } });
  const fast = campaignProfileWith({ mastery: { knowledgeLearningRate: 0.9 } });
  const slowNext = updateKnowledge({ spring: 0 }, record, slow);
  const fastNext = updateKnowledge({ spring: 0 }, record, fast);
  assert.ok(fastNext.spring > slowNext.spring);
});
