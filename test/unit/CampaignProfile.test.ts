/**
 * S6.1 — CampaignProfile strict parse (dm-0045). The profile is the single
 * home of every campaign-level calibration constant, parsed with the same
 * strict-parse discipline as ScoringProfile: never throws, path-qualified
 * errors, strict keys, finite numbers, hard version reject. Deliberately a
 * SEPARATE versioned schema from ScoringProfile (dm-0045) — per-level GDOS
 * calibration and campaign-level calibration are distinct concerns.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CAMPAIGN_PROFILE_SCHEMA_VERSION,
  DEFAULT_CAMPAIGN_PROFILE,
  parseCampaignProfile,
  parseCampaignProfileText,
} from '../../src/eval/campaign/CampaignProfile';
import { campaignProfileWith } from '../helpers/CampaignFixtures';

function rawDefault(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(DEFAULT_CAMPAIGN_PROFILE));
}

test('DEFAULT_CAMPAIGN_PROFILE round-trips through parseCampaignProfile losslessly', () => {
  const result = parseCampaignProfile(rawDefault());
  assert.ok(result.ok, `expected ok, got ${JSON.stringify(result)}`);
  if (result.ok) assert.deepEqual(result.value, DEFAULT_CAMPAIGN_PROFILE);
});

test('parseCampaignProfile never throws and reports a root error on non-objects', () => {
  for (const bad of [null, 42, 'x', [], undefined]) {
    const result = parseCampaignProfile(bad);
    assert.equal(result.ok, false);
  }
});

test('hard-rejects any campaignProfileSchemaVersion other than the current', () => {
  const raw = rawDefault();
  raw.campaignProfileSchemaVersion = CAMPAIGN_PROFILE_SCHEMA_VERSION + 1;
  const result = parseCampaignProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.errors[0].path, '/campaignProfileSchemaVersion');
});

test('rejects an unknown top-level key with its path', () => {
  const raw = rawDefault();
  (raw as Record<string, unknown>).extra = 1;
  const result = parseCampaignProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/extra'));
});

test('rejects an unknown nested key', () => {
  const raw = rawDefault();
  (raw.behavior as Record<string, unknown>).bonus = 5;
  const result = parseCampaignProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/behavior/bonus'));
});

test('rejects an empty profileId', () => {
  const raw = rawDefault();
  raw.profileId = '';
  const result = parseCampaignProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/profileId'));
});

test('rejects a non-positive hesitationFrameThreshold', () => {
  const raw = rawDefault();
  (raw.behavior as Record<string, number>).hesitationFrameThreshold = 0;
  const result = parseCampaignProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/behavior/hesitationFrameThreshold'));
});

test('rejects a non-integer panicBurstInputCount', () => {
  const raw = rawDefault();
  (raw.behavior as Record<string, number>).panicBurstInputCount = 2.5;
  const result = parseCampaignProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/behavior/panicBurstInputCount'));
});

test('rejects a mastery confidence threshold outside [0,1]', () => {
  const raw = rawDefault();
  (raw.mastery as Record<string, number>).masteryConfidenceThreshold = 1.5;
  const result = parseCampaignProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/mastery/masteryConfidenceThreshold'));
});

test('rejects a knowledgeLearningRate of 0 (must be strictly positive)', () => {
  const raw = rawDefault();
  (raw.mastery as Record<string, number>).knowledgeLearningRate = 0;
  const result = parseCampaignProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/mastery/knowledgeLearningRate'));
});

test('rejects a knowledgeLearningRate above 1', () => {
  const raw = rawDefault();
  (raw.mastery as Record<string, number>).knowledgeLearningRate = 1.1;
  const result = parseCampaignProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/mastery/knowledgeLearningRate'));
});

test('rejects a baselineDecay outside the open interval (0,1)', () => {
  const raw = rawDefault();
  (raw.chapterHealthCalibration as Record<string, number>).baselineDecay = 1;
  const result = parseCampaignProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/chapterHealthCalibration/baselineDecay'));
});

test('rejects a negative spikeDropThreshold', () => {
  const raw = rawDefault();
  (raw.chapterHealthCalibration as Record<string, number>).spikeDropThreshold = -1;
  const result = parseCampaignProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/chapterHealthCalibration/spikeDropThreshold'));
});

test('rejects a negative trendFlatTolerance', () => {
  const raw = rawDefault();
  (raw.chapterHealthCalibration as Record<string, number>).trendFlatTolerance = -1;
  const result = parseCampaignProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/chapterHealthCalibration/trendFlatTolerance'));
});

test('rejects all-zero retentionWeights (vacuous composite)', () => {
  const raw = rawDefault();
  (raw.retentionWeights as Record<string, number>) = { retryCadence: 0, optimizationDepth: 0, panicCycles: 0, curiosityTrend: 0, chapterHealth: 0 };
  const result = parseCampaignProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/retentionWeights'));
});

test('rejects a non-positive integer trendWindowLevels', () => {
  const raw = rawDefault();
  raw.trendWindowLevels = 0;
  const result = parseCampaignProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/trendWindowLevels'));
});

test('rejects a negative trendMagnitudeTolerance', () => {
  const raw = rawDefault();
  raw.trendMagnitudeTolerance = -0.1;
  const result = parseCampaignProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/trendMagnitudeTolerance'));
});

test('rejects a non-finite coefficient', () => {
  const raw = rawDefault();
  (raw.behavior as Record<string, unknown>).hesitationFrameThreshold = Number.POSITIVE_INFINITY;
  const result = parseCampaignProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/behavior/hesitationFrameThreshold'));
});

test('parseCampaignProfileText surfaces JSON syntax errors as a root error', () => {
  const result = parseCampaignProfileText('{ not json ');
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.errors[0].path, '');
});

test('parseCampaignProfileText accepts the serialized default', () => {
  const result = parseCampaignProfileText(JSON.stringify(DEFAULT_CAMPAIGN_PROFILE));
  assert.ok(result.ok);
});

test('two-profile fixture: a nudged profile parses to a distinct, valid CampaignProfile (calibration externalized, dm-0045)', () => {
  const alt = campaignProfileWith({
    chapterHealthCalibration: { spikeDropThreshold: 5 },
    mastery: { masteryConfidenceThreshold: 0.5 },
  });
  const result = parseCampaignProfile(JSON.parse(JSON.stringify(alt)));
  assert.ok(result.ok);
  if (result.ok) {
    assert.notEqual(result.value.chapterHealthCalibration.spikeDropThreshold, DEFAULT_CAMPAIGN_PROFILE.chapterHealthCalibration.spikeDropThreshold);
    assert.notEqual(result.value.mastery.masteryConfidenceThreshold, DEFAULT_CAMPAIGN_PROFILE.mastery.masteryConfidenceThreshold);
  }
});
