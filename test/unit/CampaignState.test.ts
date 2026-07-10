/**
 * S6.1 — CampaignState kernel (REQ-030/031). ZERO_CAMPAIGN_STATE is the
 * additive identity: every one of the ten REQ-031 macro variables sits at its
 * neutral/vacuous value when no level has been processed. The fold that
 * proves `updateState(ZERO_CAMPAIGN_STATE, record) === ZERO_CAMPAIGN_STATE`
 * for a no-op record lands with CampaignDirector at S6.5, once updateState
 * exists — this slice locks the record SHAPE (dm-0043's signature-anchoring
 * step) so every later slice builds against a frozen boundary.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ZERO_BEHAVIOR_SIGNALS,
  ZERO_CAMPAIGN_STATE,
  ZERO_EMOTIONAL_STATE,
  ZERO_TREND,
  type CampaignAlert,
  type CampaignReport,
  type ChapterHealthReport,
  type LevelRecord,
} from '../../src/eval/campaign/CampaignState';
import { TAPE_SCHEMA_VERSION, type ReplayTape } from '../../src/schema/TapeIO';
import { gateResult, gdosReport, metricScore } from '../../src/eval/gdos/Report';
import type { ArchetypeRun } from '../../src/eval/gdos/Evidence';
import type { CriterionResult, MacroVerdict } from '../../src/eval/macro/Curriculum';

test('ZERO_CAMPAIGN_STATE holds every REQ-031 macro variable at its neutral value', () => {
  assert.deepEqual(ZERO_CAMPAIGN_STATE.knowledgeState, {});
  assert.deepEqual(ZERO_CAMPAIGN_STATE.behaviorState, ZERO_BEHAVIOR_SIGNALS);
  assert.deepEqual(ZERO_CAMPAIGN_STATE.emotionalState, ZERO_EMOTIONAL_STATE);
  assert.deepEqual(ZERO_CAMPAIGN_STATE.skillCurve, ZERO_TREND);
  assert.equal(ZERO_CAMPAIGN_STATE.mechanicsIntroduced.size, 0);
  assert.equal(ZERO_CAMPAIGN_STATE.mechanicsMastered.size, 0);
  assert.equal(ZERO_CAMPAIGN_STATE.optimizationDepth, 0);
  assert.deepEqual(ZERO_CAMPAIGN_STATE.curiosityTrend, ZERO_TREND);
  assert.deepEqual(ZERO_CAMPAIGN_STATE.chapterHealth, {});
  assert.equal(ZERO_CAMPAIGN_STATE.retentionPrediction, 0);
});

test('ZERO_BEHAVIOR_SIGNALS reports no behavior observed: zero counts, undefined commitment speed, zero drop-off', () => {
  assert.equal(ZERO_BEHAVIOR_SIGNALS.hesitationFrames, 0);
  assert.equal(ZERO_BEHAVIOR_SIGNALS.retryCount, 0);
  assert.equal(ZERO_BEHAVIOR_SIGNALS.panicBurstCount, 0);
  assert.equal(ZERO_BEHAVIOR_SIGNALS.commitmentSpeed, undefined);
  assert.equal(ZERO_BEHAVIOR_SIGNALS.platformCheckCount, 0);
  assert.equal(ZERO_BEHAVIOR_SIGNALS.dropOffRate, 0);
});

test('ZERO_EMOTIONAL_STATE and ZERO_TREND are the flat/zero readings', () => {
  assert.deepEqual(ZERO_EMOTIONAL_STATE, { curiosity: 0, confidence: 0, surprise: 0, mastery: 0 });
  assert.deepEqual(ZERO_TREND, { direction: 'flat', magnitude: 0 });
});

test('immutability baseline: ZERO_CAMPAIGN_STATE and its nested constants are frozen', () => {
  assert.ok(Object.isFrozen(ZERO_CAMPAIGN_STATE));
  assert.ok(Object.isFrozen(ZERO_CAMPAIGN_STATE.behaviorState));
  assert.ok(Object.isFrozen(ZERO_CAMPAIGN_STATE.emotionalState));
  assert.ok(Object.isFrozen(ZERO_CAMPAIGN_STATE.skillCurve));
  assert.ok(Object.isFrozen(ZERO_CAMPAIGN_STATE.mechanicsIntroduced));
  assert.ok(Object.isFrozen(ZERO_CAMPAIGN_STATE.mechanicsMastered));
  assert.ok(Object.isFrozen(ZERO_CAMPAIGN_STATE.knowledgeState));
  assert.ok(Object.isFrozen(ZERO_CAMPAIGN_STATE.chapterHealth));
});

function fixtureTape(): ReplayTape {
  return {
    schemaVersion: TAPE_SCHEMA_VERSION,
    levelId: 'campaign-fixture-level',
    seed: 1,
    frames: [
      { moveAxis: 1, jumpPressed: false, resetPressed: false },
      { moveAxis: 1, jumpPressed: true, resetPressed: false },
      { moveAxis: 0, jumpPressed: false, resetPressed: false },
    ],
  };
}

function fixtureRun(): ArchetypeRun {
  return { archetype: 'firstTime', outcome: 'completed', attempts: 0, ticksElapsed: 3, tape: fixtureTape() };
}

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

function fixtureLevelRecord(levelId: string, chapterId: string): LevelRecord {
  return {
    levelId,
    chapterId,
    report: gdosReport(levelId, 'campaign-fixture-profile', [gateResult('emotional-threshold', [metricScore('curiosity', 95, 90)], [], [])]),
    run: fixtureRun(),
    macroCriteria: fixtureMacroVerdict(),
    mechanicsExercised: new Set(['spring']),
  };
}

test('LevelRecord assembles cleanly from P4/P5 output types (GdosReport, ArchetypeRun, MacroVerdict) — the frozen S6.1 input boundary (dm-0049)', () => {
  const record = fixtureLevelRecord('level-1', 'chapter-1');
  assert.equal(record.levelId, 'level-1');
  assert.equal(record.chapterId, 'chapter-1');
  assert.equal(record.report.pass, true);
  assert.equal(record.run.tape.frames.length, 3);
  assert.equal(record.run.outcome, 'completed');
  assert.equal(record.macroCriteria.overallPass, true);
});

test('CampaignAlert carries a non-empty reason and its evidence findings — never a bare boolean (dm-0048)', () => {
  const alert: CampaignAlert = {
    kind: 'difficulty-spike',
    chapterId: 'chapter-2',
    reason: 'chapter-2 health 40 fell more than the profiled spikeDropThreshold below the rolling baseline 70',
    findings: ['baseline=70', 'current=40', 'spikeDropThreshold=20'],
  };
  assert.equal(alert.kind, 'difficulty-spike');
  assert.ok(alert.reason.length > 0);
  assert.equal(alert.findings.length, 3);
});

test('ChapterHealthReport mirrors MacroVerdict\'s four REQ-142 criteria field-for-field', () => {
  const report: ChapterHealthReport = {
    score: 85,
    cognitiveStructuralMapping: passingCriterion(),
    crossChapterDegradation: passingCriterion(),
    curiosityProgression: passingCriterion(),
    graduationAssessment: passingCriterion(),
    trend: 'rising',
    alerts: [],
  };
  assert.equal(report.score, 85);
  assert.equal(report.trend, 'rising');
  assert.equal(report.cognitiveStructuralMapping.pass, true);
});

test('CampaignReport aggregates a final state, per-chapter health, alerts, and retention into one record', () => {
  const chapterHealth: ChapterHealthReport = {
    score: 90,
    cognitiveStructuralMapping: passingCriterion(),
    crossChapterDegradation: passingCriterion(),
    curiosityProgression: passingCriterion(),
    graduationAssessment: passingCriterion(),
    trend: 'flat',
    alerts: [],
  };
  const report: CampaignReport = {
    finalState: ZERO_CAMPAIGN_STATE,
    chapterHealthMap: { 'chapter-1': chapterHealth },
    alerts: [],
    retentionPrediction: 0,
  };
  assert.equal(report.finalState, ZERO_CAMPAIGN_STATE);
  assert.equal(report.chapterHealthMap['chapter-1'].score, 90);
  assert.equal(report.alerts.length, 0);
});

test('two independently built CampaignState-shaped records with different values are not aliased to ZERO_CAMPAIGN_STATE', () => {
  const populated = {
    ...ZERO_CAMPAIGN_STATE,
    knowledgeState: { spring: 0.7 },
    mechanicsIntroduced: new Set(['spring']),
    optimizationDepth: 2.5,
    retentionPrediction: 0.6,
  };
  assert.notDeepEqual(populated, ZERO_CAMPAIGN_STATE);
  assert.deepEqual(ZERO_CAMPAIGN_STATE.knowledgeState, {});
  assert.equal(ZERO_CAMPAIGN_STATE.mechanicsIntroduced.size, 0);
});
