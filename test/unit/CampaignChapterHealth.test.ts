/**
 * S6.4 — ChapterHealth aggregator (REQ-142 P6 share, dm-0046/dm-0051). The
 * four criteria come straight from MacroVerdict (P4 output, never re-derived);
 * score is a structural pass-count over its five booleans; trend compares
 * against the prior chapter's score under a profiled tolerance; alerts always
 * empty (spike detection is CampaignDirector's job, S6.5).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { aggregateChapterHealth } from '../../src/eval/campaign/ChapterHealth';
import { DEFAULT_CAMPAIGN_PROFILE } from '../../src/eval/campaign/CampaignProfile';
import { campaignProfileWith } from '../helpers/CampaignFixtures';
import type { CriterionResult, MacroVerdict } from '../../src/eval/macro/Curriculum';
import type { ChapterHealthReport } from '../../src/eval/campaign/CampaignState';

function criterion(pass: boolean): CriterionResult {
  return { pass, findings: pass ? [] : ['fixture failure'] };
}

function macroVerdict(overrides: Partial<MacroVerdict> = {}): MacroVerdict {
  return {
    chapterHealthy: true,
    cognitiveStructuralMapping: criterion(true),
    crossChapterDegradation: criterion(true),
    curiosityProgression: criterion(true),
    graduationAssessment: criterion(true),
    overallPass: true,
    ...overrides,
  };
}

test('a fully-passing chapter scores 100', () => {
  const report = aggregateChapterHealth(macroVerdict(), undefined, DEFAULT_CAMPAIGN_PROFILE);
  assert.equal(report.score, 100);
});

test('a chapter failing exactly one of the five components scores 80', () => {
  const report = aggregateChapterHealth(macroVerdict({ crossChapterDegradation: criterion(false) }), undefined, DEFAULT_CAMPAIGN_PROFILE);
  assert.equal(report.score, 80);
});

test('an unhealthy chapter (chapterHealthy false) with all four criteria passing scores 80, not 0', () => {
  const report = aggregateChapterHealth(macroVerdict({ chapterHealthy: false }), undefined, DEFAULT_CAMPAIGN_PROFILE);
  assert.equal(report.score, 80);
});

test('a chapter failing everything scores 0', () => {
  const report = aggregateChapterHealth(
    macroVerdict({ chapterHealthy: false, cognitiveStructuralMapping: criterion(false), crossChapterDegradation: criterion(false), curiosityProgression: criterion(false), graduationAssessment: criterion(false) }),
    undefined,
    DEFAULT_CAMPAIGN_PROFILE,
  );
  assert.equal(report.score, 0);
});

test('the four criteria are passed through from MacroVerdict verbatim, never re-derived', () => {
  const findings = ['a very specific P4 finding'];
  const verdict = macroVerdict({ crossChapterDegradation: { pass: false, findings } });
  const report = aggregateChapterHealth(verdict, undefined, DEFAULT_CAMPAIGN_PROFILE);
  assert.deepEqual(report.crossChapterDegradation, { pass: false, findings });
});

test('the first chapter in a campaign (no prior) always trends flat', () => {
  const report = aggregateChapterHealth(macroVerdict(), undefined, DEFAULT_CAMPAIGN_PROFILE);
  assert.equal(report.trend, 'flat');
});

test('a score improvement beyond the tolerance trends rising', () => {
  const prior: ChapterHealthReport = { score: 60, cognitiveStructuralMapping: criterion(true), crossChapterDegradation: criterion(true), curiosityProgression: criterion(true), graduationAssessment: criterion(true), trend: 'flat', alerts: [] };
  const report = aggregateChapterHealth(macroVerdict(), prior, DEFAULT_CAMPAIGN_PROFILE); // score 100, delta +40
  assert.equal(report.trend, 'rising');
});

test('a score drop beyond the tolerance trends falling', () => {
  const prior: ChapterHealthReport = { score: 100, cognitiveStructuralMapping: criterion(true), crossChapterDegradation: criterion(true), curiosityProgression: criterion(true), graduationAssessment: criterion(true), trend: 'flat', alerts: [] };
  const report = aggregateChapterHealth(macroVerdict({ crossChapterDegradation: criterion(false) }), prior, DEFAULT_CAMPAIGN_PROFILE); // score 80, delta -20
  assert.equal(report.trend, 'falling');
});

test('a score movement within the tolerance trends flat', () => {
  const prior: ChapterHealthReport = { score: 96, cognitiveStructuralMapping: criterion(true), crossChapterDegradation: criterion(true), curiosityProgression: criterion(true), graduationAssessment: criterion(true), trend: 'flat', alerts: [] };
  const report = aggregateChapterHealth(macroVerdict(), prior, DEFAULT_CAMPAIGN_PROFILE); // score 100, delta +4 <= default tolerance 5
  assert.equal(report.trend, 'flat');
});

test('ChapterHealth never emits alerts — spike detection belongs to CampaignDirector (dm-0051)', () => {
  const report = aggregateChapterHealth(macroVerdict({ chapterHealthy: false, cognitiveStructuralMapping: criterion(false) }), undefined, DEFAULT_CAMPAIGN_PROFILE);
  assert.deepEqual(report.alerts, []);
});

test('two-profile fixture: the SAME score delta trends differently under different trendFlatTolerance (dm-0045 externalization proof)', () => {
  const prior: ChapterHealthReport = { score: 90, cognitiveStructuralMapping: criterion(true), crossChapterDegradation: criterion(true), curiosityProgression: criterion(true), graduationAssessment: criterion(true), trend: 'flat', alerts: [] };
  const verdict = macroVerdict({ crossChapterDegradation: criterion(false) }); // score 80, delta -10
  const tight = campaignProfileWith({ chapterHealthCalibration: { trendFlatTolerance: 5 } });
  const loose = campaignProfileWith({ chapterHealthCalibration: { trendFlatTolerance: 15 } });
  assert.equal(aggregateChapterHealth(verdict, prior, tight).trend, 'falling');
  assert.equal(aggregateChapterHealth(verdict, prior, loose).trend, 'flat');
});
