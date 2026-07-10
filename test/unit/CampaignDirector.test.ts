/**
 * S6.5 — CampaignDirector: the pure fold (updateState/processCampaign),
 * spike detection, retention prediction, skill curve, curiosity trend
 * (REQ-030 core, dm-0043/dm-0052). The IRD exit condition for P6: macro
 * state updates deterministically from a fixture campaign and flags a
 * synthetic difficulty spike.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { processCampaign, updateState, type ChapterRecord } from '../../src/eval/campaign/CampaignDirector';
import { ZERO_CAMPAIGN_STATE, type LevelRecord } from '../../src/eval/campaign/CampaignState';
import { DEFAULT_CAMPAIGN_PROFILE } from '../../src/eval/campaign/CampaignProfile';
import { campaignProfileWith, coverageMatrixFixture } from '../helpers/CampaignFixtures';
import { TAPE_SCHEMA_VERSION } from '../../src/schema/TapeIO';
import { gateResult, gdosReport, metricScore } from '../../src/eval/gdos/Report';
import type { ArchetypeRun } from '../../src/eval/gdos/Evidence';
import type { CoverageMatrix } from '../../src/eval/gdos/DesignSpace';
import type { CriterionResult, MacroVerdict } from '../../src/eval/macro/Curriculum';
import type { EntityKind } from '../../src/components/Behavior';

function passingCriterion(): CriterionResult {
  return { pass: true, findings: [] };
}
function failingCriterion(): CriterionResult {
  return { pass: false, findings: ['fixture failure'] };
}

function macroVerdict(healthy: boolean): MacroVerdict {
  const criterion = healthy ? passingCriterion : failingCriterion;
  return {
    chapterHealthy: healthy,
    cognitiveStructuralMapping: criterion(),
    crossChapterDegradation: criterion(),
    curiosityProgression: criterion(),
    graduationAssessment: criterion(),
    overallPass: healthy,
  };
}

function run(attempts: number, outcome: 'completed' | 'timeout' = 'completed', frames = [{ moveAxis: 0 as const, jumpPressed: false, resetPressed: false }]): ArchetypeRun {
  return { archetype: 'firstTime', outcome, attempts, ticksElapsed: frames.length, tape: { schemaVersion: TAPE_SCHEMA_VERSION, levelId: 'director-fixture', seed: 1, frames } };
}

function levelRecord(opts: {
  levelId: string;
  chapterId: string;
  mechanics?: readonly EntityKind[];
  attempts?: number;
  outcome?: 'completed' | 'timeout';
  curiosity?: number;
  confidence?: number;
  surprise?: number;
  mastery?: number;
}): LevelRecord {
  const scores = [
    metricScore('curiosity', opts.curiosity ?? 50, 90),
    metricScore('confidence', opts.confidence ?? 50, 90),
    metricScore('surprise', opts.surprise ?? 50, 95),
    metricScore('mastery', opts.mastery ?? 50, 95),
  ];
  return {
    levelId: opts.levelId,
    chapterId: opts.chapterId,
    report: gdosReport(opts.levelId, 'director-fixture-profile', [gateResult('emotional-threshold', scores, [], [])]),
    run: run(opts.attempts ?? 0, opts.outcome ?? 'completed'),
    macroCriteria: macroVerdict(true),
    mechanicsExercised: new Set(opts.mechanics ?? ['spring']),
  };
}

function matrixWith(styles: readonly ('discovery' | 'good' | 'fast' | 'expert' | 'worldRecord')[]): CoverageMatrix {
  return coverageMatrixFixture(styles.map((optimizationStyle) => ({ mechanic: 'spring', optimizationStyle })));
}

test('updateState is a pure fold: calling it twice with identical inputs produces deep-equal (not aliased) states', () => {
  const record = levelRecord({ levelId: 'l1', chapterId: 'c1' });
  const matrix = matrixWith(['discovery']);
  const a = updateState(ZERO_CAMPAIGN_STATE, record, matrix, DEFAULT_CAMPAIGN_PROFILE);
  const b = updateState(ZERO_CAMPAIGN_STATE, record, matrix, DEFAULT_CAMPAIGN_PROFILE);
  assert.deepEqual(a, b);
  assert.notEqual(a, ZERO_CAMPAIGN_STATE);
});

test('updateState never mutates the input state', () => {
  const record = levelRecord({ levelId: 'l1', chapterId: 'c1' });
  const matrix = matrixWith(['discovery']);
  const before = JSON.stringify(ZERO_CAMPAIGN_STATE, (_k, v) => (v instanceof Set ? [...v] : v));
  updateState(ZERO_CAMPAIGN_STATE, record, matrix, DEFAULT_CAMPAIGN_PROFILE);
  const after = JSON.stringify(ZERO_CAMPAIGN_STATE, (_k, v) => (v instanceof Set ? [...v] : v));
  assert.equal(before, after);
});

test('optimizationDepth reads the highest tier touched in the cumulative coverage matrix', () => {
  const record = levelRecord({ levelId: 'l1', chapterId: 'c1' });
  const zeroTier = updateState(ZERO_CAMPAIGN_STATE, record, coverageMatrixFixture([]), DEFAULT_CAMPAIGN_PROFILE);
  assert.equal(zeroTier.optimizationDepth, 0);

  const topTier = updateState(ZERO_CAMPAIGN_STATE, record, matrixWith(['worldRecord']), DEFAULT_CAMPAIGN_PROFILE);
  assert.equal(topTier.optimizationDepth, 1);

  const midTier = updateState(ZERO_CAMPAIGN_STATE, record, matrixWith(['fast']), DEFAULT_CAMPAIGN_PROFILE); // 3rd of 5 tiers
  assert.equal(midTier.optimizationDepth, 3 / 5);
});

test('emotionalState rolls from the GDOS emotional-threshold gate scores, not from behavioral signals', () => {
  const record = levelRecord({ levelId: 'l1', chapterId: 'c1', curiosity: 90, confidence: 80, surprise: 70, mastery: 60 });
  const state = updateState(ZERO_CAMPAIGN_STATE, record, matrixWith(['discovery']), DEFAULT_CAMPAIGN_PROFILE);
  assert.ok(state.emotionalState.curiosity > 0);
  assert.ok(state.emotionalState.curiosity < 1);
  // From ZERO (0), one EMA step toward 0.9 moves proportionally more for curiosity (target .9) than mastery (target .6).
  assert.ok(state.emotionalState.curiosity > state.emotionalState.mastery);
});

test('skillCurve rises when reload attempts fall across consecutive levels', () => {
  const matrix = matrixWith(['discovery']);
  let state = ZERO_CAMPAIGN_STATE;
  state = updateState(state, levelRecord({ levelId: 'l1', chapterId: 'c1', attempts: 10 }), matrix, DEFAULT_CAMPAIGN_PROFILE);
  const afterStruggle = state.skillCurve.magnitude;
  state = updateState(state, levelRecord({ levelId: 'l2', chapterId: 'c1', attempts: 0 }), matrix, DEFAULT_CAMPAIGN_PROFILE);
  assert.ok(state.skillCurve.magnitude > afterStruggle);
  assert.equal(state.skillCurve.direction, 'rising');
});

test('two-profile fixture: the SAME two-level sequence classifies skillCurve differently under different trendMagnitudeTolerance (dm-0045 externalization proof)', () => {
  const matrix = matrixWith(['discovery']);
  const tight = campaignProfileWith({ trendMagnitudeTolerance: 0.001 });
  const loose = campaignProfileWith({ trendMagnitudeTolerance: 0.9 });
  function finalDirection(profile: typeof DEFAULT_CAMPAIGN_PROFILE) {
    let state = ZERO_CAMPAIGN_STATE;
    state = updateState(state, levelRecord({ levelId: 'l1', chapterId: 'c1', attempts: 10 }), matrix, profile);
    state = updateState(state, levelRecord({ levelId: 'l2', chapterId: 'c1', attempts: 0 }), matrix, profile);
    return state.skillCurve.direction;
  }
  assert.equal(finalDirection(tight), 'rising');
  assert.equal(finalDirection(loose), 'flat');
});

test('processCampaign is deterministic: two runs over the same chapters produce a deep-equal report', () => {
  const chapters: ChapterRecord[] = [
    { chapterId: 'c1', levels: [levelRecord({ levelId: 'l1', chapterId: 'c1' })], macroVerdict: macroVerdict(true), coverageMatrix: matrixWith(['discovery']) },
    { chapterId: 'c2', levels: [levelRecord({ levelId: 'l2', chapterId: 'c2' })], macroVerdict: macroVerdict(true), coverageMatrix: matrixWith(['discovery', 'good']) },
  ];
  const a = processCampaign(chapters, DEFAULT_CAMPAIGN_PROFILE);
  const b = processCampaign(chapters, DEFAULT_CAMPAIGN_PROFILE);
  assert.deepEqual(a, b);
});

test('a synthetic 3-chapter campaign with a spike planted at chapter 2 flags exactly that chapter (IRD P6 exit condition)', () => {
  const chapters: ChapterRecord[] = [
    { chapterId: 'chapter-1', levels: [levelRecord({ levelId: 'l1', chapterId: 'chapter-1' })], macroVerdict: macroVerdict(true), coverageMatrix: matrixWith(['discovery']) },
    { chapterId: 'chapter-2', levels: [levelRecord({ levelId: 'l2', chapterId: 'chapter-2' })], macroVerdict: macroVerdict(false), coverageMatrix: matrixWith(['discovery']) },
    { chapterId: 'chapter-3', levels: [levelRecord({ levelId: 'l3', chapterId: 'chapter-3' })], macroVerdict: macroVerdict(true), coverageMatrix: matrixWith(['discovery']) },
  ];
  const report = processCampaign(chapters, DEFAULT_CAMPAIGN_PROFILE);

  assert.equal(report.chapterHealthMap['chapter-1'].alerts.length, 0);
  assert.equal(report.chapterHealthMap['chapter-2'].alerts.length, 1);
  assert.equal(report.chapterHealthMap['chapter-2'].alerts[0].kind, 'difficulty-spike');
  assert.equal(report.chapterHealthMap['chapter-3'].alerts.length, 0);
  assert.equal(report.alerts.length, 1);
  assert.equal(report.alerts[0].chapterId, 'chapter-2');
});

test('two-profile fixture: raising spikeDropThreshold suppresses the same planted spike (dm-0045 externalization proof)', () => {
  const chapters: ChapterRecord[] = [
    { chapterId: 'chapter-1', levels: [levelRecord({ levelId: 'l1', chapterId: 'chapter-1' })], macroVerdict: macroVerdict(true), coverageMatrix: matrixWith(['discovery']) },
    { chapterId: 'chapter-2', levels: [levelRecord({ levelId: 'l2', chapterId: 'chapter-2' })], macroVerdict: macroVerdict(false), coverageMatrix: matrixWith(['discovery']) },
  ];
  const lenient = campaignProfileWith({ chapterHealthCalibration: { spikeDropThreshold: 200 } });
  const report = processCampaign(chapters, lenient);
  assert.equal(report.alerts.length, 0);
});

test('retentionPrediction is higher for an "improving" fixture campaign than a "declining" one', () => {
  const improving: ChapterRecord[] = [
    { chapterId: 'c1', levels: [levelRecord({ levelId: 'l1', chapterId: 'c1', attempts: 0, outcome: 'completed', curiosity: 95 })], macroVerdict: macroVerdict(true), coverageMatrix: matrixWith(['worldRecord']) },
  ];
  const declining: ChapterRecord[] = [
    { chapterId: 'c1', levels: [levelRecord({ levelId: 'l1', chapterId: 'c1', attempts: 20, outcome: 'timeout', curiosity: 5 })], macroVerdict: macroVerdict(false), coverageMatrix: matrixWith(['discovery']) },
  ];
  const improvingReport = processCampaign(improving, DEFAULT_CAMPAIGN_PROFILE);
  const decliningReport = processCampaign(declining, DEFAULT_CAMPAIGN_PROFILE);
  assert.ok(improvingReport.retentionPrediction > decliningReport.retentionPrediction);
});

test('retentionPrediction stays within [0,1]', () => {
  const chapters: ChapterRecord[] = [
    { chapterId: 'c1', levels: [levelRecord({ levelId: 'l1', chapterId: 'c1', attempts: 0 })], macroVerdict: macroVerdict(true), coverageMatrix: matrixWith(['worldRecord']) },
  ];
  const report = processCampaign(chapters, DEFAULT_CAMPAIGN_PROFILE);
  assert.ok(report.retentionPrediction >= 0 && report.retentionPrediction <= 1);
});

test('two-profile fixture: reweighting retentionWeights toward chapterHealth changes the composite for the same campaign (dm-0045 externalization proof)', () => {
  const chapters: ChapterRecord[] = [
    { chapterId: 'c1', levels: [levelRecord({ levelId: 'l1', chapterId: 'c1', attempts: 20, outcome: 'timeout' })], macroVerdict: macroVerdict(true), coverageMatrix: matrixWith(['discovery']) },
  ];
  const behaviorHeavy = campaignProfileWith({ retentionWeights: { retryCadence: 10, optimizationDepth: 0, panicCycles: 0, curiosityTrend: 0, chapterHealth: 0 } });
  const healthHeavy = campaignProfileWith({ retentionWeights: { retryCadence: 0, optimizationDepth: 0, panicCycles: 0, curiosityTrend: 0, chapterHealth: 10 } });
  const a = processCampaign(chapters, behaviorHeavy).retentionPrediction;
  const b = processCampaign(chapters, healthHeavy).retentionPrediction;
  assert.notEqual(a, b);
});
