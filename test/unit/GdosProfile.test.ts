/**
 * S5.1 — ScoringProfile strict parse (dm-0031). The profile is the single
 * home of every calibration constant; it is parsed with the full level-schema
 * discipline (never throws, path-qualified errors, strict keys, finite
 * numbers, hard version reject). The DEFAULT profile carries the PRD's own
 * thresholds (REQ-055/056) as data.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_PROFILE, PROFILE_SCHEMA_VERSION, parseProfile, parseProfileText } from '../../src/eval/gdos/Profile';

function rawDefault(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(DEFAULT_PROFILE));
}

test('DEFAULT_PROFILE round-trips through parseProfile losslessly', () => {
  const result = parseProfile(rawDefault());
  assert.ok(result.ok, `expected ok, got ${JSON.stringify(result)}`);
  if (result.ok) assert.deepEqual(result.value, DEFAULT_PROFILE);
});

test('DEFAULT_PROFILE carries the PRD thresholds (REQ-055/056)', () => {
  assert.deepEqual(DEFAULT_PROFILE.emotional.thresholds, { curiosity: 90, confidence: 90, surprise: 95, mastery: 95 });
  assert.deepEqual(DEFAULT_PROFILE.streamability.thresholds, { shareability: 85, clipPotential: 90, reactionDensity: 95, replayValue: 90 });
});

test('parseProfile never throws and reports a root error on non-objects', () => {
  for (const bad of [null, 42, 'x', [], undefined]) {
    const result = parseProfile(bad);
    assert.equal(result.ok, false);
  }
});

test('hard-rejects any schemaVersion other than the current', () => {
  const raw = rawDefault();
  raw.schemaVersion = PROFILE_SCHEMA_VERSION + 1;
  const result = parseProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.errors[0].path, '/schemaVersion');
});

test('rejects an unknown top-level key with its path', () => {
  const raw = rawDefault();
  (raw as Record<string, unknown>).extra = 1;
  const result = parseProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/extra'));
});

test('rejects an unknown nested key', () => {
  const raw = rawDefault();
  (raw.emotional as Record<string, unknown>).bonus = 5;
  const result = parseProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/emotional/bonus'));
});

test('rejects an out-of-range threshold', () => {
  const raw = rawDefault();
  (raw.emotional as { thresholds: Record<string, number> }).thresholds.curiosity = 150;
  const result = parseProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/emotional/thresholds/curiosity'));
});

test('rejects a non-finite coefficient', () => {
  const raw = rawDefault();
  (raw.streamability as Record<string, unknown>).reactionEventReferencePerSecond = Number.POSITIVE_INFINITY;
  // JSON can't hold Infinity, so parse the object form directly.
  const result = parseProfile(raw);
  assert.equal(result.ok, false);
});

test('rejects a zero reference that would divide by zero', () => {
  const raw = rawDefault();
  (raw.emotional as Record<string, unknown>).masteryDeltaReferenceSeconds = 0;
  const result = parseProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/emotional/masteryDeltaReferenceSeconds'));
});

test('rejects info-density max below min', () => {
  const raw = rawDefault();
  const id = raw.infoDensity as Record<string, number>;
  id.minElementsPerScreen = 10;
  id.maxElementsPerScreen = 3;
  const result = parseProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/infoDensity/maxElementsPerScreen'));
});

test('rejects all-zero share weights', () => {
  const raw = rawDefault();
  (raw.streamability as { shareWeights: Record<string, number> }).shareWeights = { reaction: 0, clip: 0, replay: 0 };
  const result = parseProfile(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/streamability/shareWeights'));
});

test('parseProfileText surfaces JSON syntax errors as a root error', () => {
  const result = parseProfileText('{ not json ');
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.errors[0].path, '');
});

test('parseProfileText accepts the serialized default', () => {
  const result = parseProfileText(JSON.stringify(DEFAULT_PROFILE));
  assert.ok(result.ok);
});
