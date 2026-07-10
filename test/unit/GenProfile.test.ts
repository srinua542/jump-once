/**
 * S7.1 — GenProfile: the third versioned calibration schema (dm-0057),
 * separate from ScoringProfile and CampaignProfile. Strict parse with the
 * full P2 discipline: unknown keys rejected at every object, finite-number
 * bounds, hard version pin, path-qualified errors, never throws.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_GEN_PROFILE,
  GEN_PROFILE_SCHEMA_VERSION,
  parseGenProfile,
  parseGenProfileText,
} from '../../src/gen/GenProfile';
import { genProfileWith } from '../helpers/GenFixtures';

function defaultRaw(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(DEFAULT_GEN_PROFILE)) as Record<string, unknown>;
}

test('the default profile parses through its own strict parser (round-trip)', () => {
  const result = parseGenProfile(defaultRaw());
  assert.ok(result.ok, `default profile failed its own parse: ${JSON.stringify(!result.ok ? result.errors : [])}`);
  if (result.ok) assert.deepEqual(result.value, DEFAULT_GEN_PROFILE);
});

test('the default profile is deeply frozen', () => {
  assert.ok(Object.isFrozen(DEFAULT_GEN_PROFILE));
  assert.ok(Object.isFrozen(DEFAULT_GEN_PROFILE.lifecycle));
});

test('version pin: any other genProfileSchemaVersion is hard-rejected', () => {
  for (const bad of [0, 2, '1', null, undefined]) {
    const raw = defaultRaw();
    if (bad === undefined) delete raw.genProfileSchemaVersion;
    else raw.genProfileSchemaVersion = bad;
    const result = parseGenProfile(raw);
    assert.equal(result.ok, false, `expected rejection for version ${JSON.stringify(bad)}`);
    if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/genProfileSchemaVersion'));
  }
  assert.equal(GEN_PROFILE_SCHEMA_VERSION, 1);
});

test('strict rejection suite: each defect is caught with its path', () => {
  const cases: { mutate: (raw: Record<string, unknown>) => void; path: string }[] = [
    { mutate: (r) => { r.extra = 1; }, path: '/extra' },
    { mutate: (r) => { r.profileId = ''; }, path: '/profileId' },
    { mutate: (r) => { delete r.lifecycle; }, path: '/lifecycle' },
    { mutate: (r) => { (r.lifecycle as Record<string, unknown>).bonus = 1; }, path: '/lifecycle/bonus' },
    { mutate: (r) => { (r.lifecycle as Record<string, unknown>).developmentMinLevels = 0; }, path: '/lifecycle/developmentMinLevels' },
    { mutate: (r) => { (r.lifecycle as Record<string, unknown>).developmentMinLevels = 2.5; }, path: '/lifecycle/developmentMinLevels' },
    { mutate: (r) => { (r.lifecycle as Record<string, unknown>).saturationNoveltyThreshold = -0.1; }, path: '/lifecycle/saturationNoveltyThreshold' },
    { mutate: (r) => { (r.lifecycle as Record<string, unknown>).saturationNoveltyThreshold = Number.NaN; }, path: '/lifecycle/saturationNoveltyThreshold' },
    { mutate: (r) => { (r.lifecycle as Record<string, unknown>).exhaustionConsecutiveLowNovelty = 0; }, path: '/lifecycle/exhaustionConsecutiveLowNovelty' },
    { mutate: (r) => { delete r.pda; }, path: '/pda' },
    { mutate: (r) => { (r.pda as Record<string, unknown>).bonus = 1; }, path: '/pda/bonus' },
    { mutate: (r) => { (r.pda as Record<string, unknown>).maxOpportunities = 0; }, path: '/pda/maxOpportunities' },
    { mutate: (r) => { (r.pda as Record<string, unknown>).maxOpportunities = 1.5; }, path: '/pda/maxOpportunities' },
    { mutate: (r) => { (r.pda as Record<string, unknown>).weakChapterHealthScore = 101; }, path: '/pda/weakChapterHealthScore' },
    { mutate: (r) => { delete r.creativity; }, path: '/creativity' },
    { mutate: (r) => { (r.creativity as Record<string, unknown>).variationsPerGeneration = 0; }, path: '/creativity/variationsPerGeneration' },
    { mutate: (r) => { (r.creativity as Record<string, unknown>).hardCapGenerations = 2.5; }, path: '/creativity/hardCapGenerations' },
    { mutate: (r) => { (r.creativity as Record<string, unknown>).diminishingReturnsEpsilon = -0.1; }, path: '/creativity/diminishingReturnsEpsilon' },
    { mutate: (r) => { (r.creativity as Record<string, unknown>).combineProbability = 1.5; }, path: '/creativity/combineProbability' },
    { mutate: (r) => { ((r.creativity as Record<string, unknown>).selectionWeights as Record<string, unknown>).gatePass = 0; ((r.creativity as Record<string, unknown>).selectionWeights as Record<string, unknown>).gateScore = 0; ((r.creativity as Record<string, unknown>).selectionWeights as Record<string, unknown>).novelty = 0; }, path: '/creativity/selectionWeights' },
    { mutate: (r) => { ((r.creativity as Record<string, unknown>).selectionWeights as Record<string, unknown>).novelty = -1; }, path: '/creativity/selectionWeights/novelty' },
    { mutate: (r) => { delete r.intent; }, path: '/intent' },
    { mutate: (r) => { (r.intent as Record<string, unknown>).minWords = 0; }, path: '/intent/minWords' },
    { mutate: (r) => { (r.intent as Record<string, unknown>).minWords = 50; (r.intent as Record<string, unknown>).maxWords = 10; }, path: '/intent/maxWords' },
    { mutate: (r) => { delete r.pipeline; }, path: '/pipeline' },
    { mutate: (r) => { (r.pipeline as Record<string, unknown>).revisionBudget = -1; }, path: '/pipeline/revisionBudget' },
    { mutate: (r) => { (r.pipeline as Record<string, unknown>).revisionBudget = 1.5; }, path: '/pipeline/revisionBudget' },
  ];
  for (const c of cases) {
    const raw = defaultRaw();
    c.mutate(raw);
    const result = parseGenProfile(raw);
    assert.equal(result.ok, false, `expected rejection for ${c.path}`);
    if (!result.ok) assert.ok(result.errors.some((e) => e.path === c.path), `expected an error at ${c.path}, got ${JSON.stringify(result.errors.map((e) => e.path))}`);
  }
});

test('parse never throws on garbage', () => {
  for (const bad of ['not json', '42', '[]', 'null']) {
    assert.equal(parseGenProfileText(bad).ok, false);
  }
  assert.equal(parseGenProfile(null).ok, false);
  assert.equal(parseGenProfile([]).ok, false);
});

test('text parsing round-trips the default profile', () => {
  const result = parseGenProfileText(JSON.stringify(DEFAULT_GEN_PROFILE));
  assert.ok(result.ok);
  if (result.ok) assert.deepEqual(result.value, DEFAULT_GEN_PROFILE);
});

test('genProfileWith builds a distinct, valid second profile (the two-profile fixture)', () => {
  const b = genProfileWith({ profileId: 'gen-test-b', lifecycle: { developmentMinLevels: 10 } });
  assert.equal(b.profileId, 'gen-test-b');
  assert.equal(b.lifecycle.developmentMinLevels, 10);
  assert.equal(b.lifecycle.saturationNoveltyThreshold, DEFAULT_GEN_PROFILE.lifecycle.saturationNoveltyThreshold);
  assert.notDeepEqual(b, DEFAULT_GEN_PROFILE);
});
