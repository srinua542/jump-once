/**
 * S10.1 — ChapterFramework + CampaignManifest strict-parse/reject suites
 * (REQ-083, REQ-015 applied, REQ-174 P10 share; dm-0109). Proves the eighth
 * versioned schema enforces: the seven framework fields present, ≥1
 * misconception, unique slotIds, the six-phase emotional arc contiguous and in
 * order (REQ-015 as a parse invariant), closed archetype/phase/tier
 * vocabularies, the rewardedSkip field present (REQ-174), and round-trip
 * stability. The real authored campaign frameworks under content/data/ are
 * proven to parse in ContentCampaign.test.ts.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  parseChapterFramework,
  parseChapterFrameworkText,
  serializeChapterFramework,
  type ChapterLevelSlot,
} from '../../content/schema/ChapterFramework';
import {
  parseCampaignManifest,
  serializeCampaignManifest,
} from '../../content/schema/CampaignManifest';

const ARC = ['curiosity', 'confidence', 'surpriseBetrayal', 'realization', 'mastery', 'renewedUncertainty'] as const;

function slot(over: Partial<ChapterLevelSlot> & { emotionalPhase: (typeof ARC)[number]; slotId: string }): ChapterLevelSlot {
  return {
    archetype: 'execution',
    intentSentence: 'Commit the jump only after reading the full gap, because a habitual early press falls short.',
    oneJumpDecision: 'where along the approach to spend the only jump',
    mechanics: [],
    difficultyTarget: { executionPrecision: 0.5, readingComplexity: 0.2, timingStrictness: 0.3, routeAmbiguity: 0.1 },
    targetDifficultyTier: 'medium',
    seed: 1,
    rewardedSkip: { available: false },
    ...over,
  };
}

function framework(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    frameworkSchemaVersion: 1,
    chapterId: 'ch-test',
    title: 'Test Chapter',
    theme: 'reading before committing',
    learningGoal: 'read the whole gap before the jump',
    mentalModel: 'the jump is a single irreversible commitment',
    misconceptions: ['jump early is always safe'],
    subversion: 'the safe-looking early jump falls short',
    optimizationFocus: 'the latest possible commit point',
    finalExam: 'clear the widest gap on the first read',
    levelSlots: ARC.map((phase, i) => slot({ slotId: `s${i}`, emotionalPhase: phase })),
    ...over,
  };
}

test('a complete, arc-ordered framework parses', () => {
  const r = parseChapterFramework(framework());
  assert.ok(r.ok, `expected ok, got ${JSON.stringify(r.ok ? {} : r.errors)}`);
  if (r.ok) assert.equal(r.value.levelSlots.length, 6);
});

test('a phase spanning consecutive slots is accepted (contiguous, in order)', () => {
  const slots = [
    slot({ slotId: 'a', emotionalPhase: 'curiosity' }),
    slot({ slotId: 'b', emotionalPhase: 'curiosity' }),
    slot({ slotId: 'c', emotionalPhase: 'confidence' }),
    slot({ slotId: 'd', emotionalPhase: 'surpriseBetrayal' }),
    slot({ slotId: 'e', emotionalPhase: 'realization' }),
    slot({ slotId: 'f', emotionalPhase: 'mastery' }),
    slot({ slotId: 'g', emotionalPhase: 'renewedUncertainty' }),
  ];
  assert.ok(parseChapterFramework(framework({ levelSlots: slots })).ok);
});

test('REQ-015: a skipped arc phase is rejected', () => {
  const slots = [
    slot({ slotId: 'a', emotionalPhase: 'curiosity' }),
    slot({ slotId: 'b', emotionalPhase: 'surpriseBetrayal' }), // skipped confidence
    slot({ slotId: 'c', emotionalPhase: 'realization' }),
    slot({ slotId: 'd', emotionalPhase: 'mastery' }),
    slot({ slotId: 'e', emotionalPhase: 'renewedUncertainty' }),
  ];
  const r = parseChapterFramework(framework({ levelSlots: slots }));
  assert.ok(!r.ok);
  if (!r.ok) assert.ok(r.errors.some((e) => e.path === '/levelSlots' && e.message.includes('emotional arc')));
});

test('REQ-015: an out-of-order arc (mastery before realization) is rejected', () => {
  const slots = [
    slot({ slotId: 'a', emotionalPhase: 'curiosity' }),
    slot({ slotId: 'b', emotionalPhase: 'confidence' }),
    slot({ slotId: 'c', emotionalPhase: 'surpriseBetrayal' }),
    slot({ slotId: 'd', emotionalPhase: 'mastery' }),
    slot({ slotId: 'e', emotionalPhase: 'realization' }),
    slot({ slotId: 'f', emotionalPhase: 'renewedUncertainty' }),
  ];
  assert.ok(!parseChapterFramework(framework({ levelSlots: slots })).ok);
});

test('duplicate slotIds are rejected', () => {
  const slots = ARC.map((phase) => slot({ slotId: 'dup', emotionalPhase: phase }));
  const r = parseChapterFramework(framework({ levelSlots: slots }));
  assert.ok(!r.ok);
  if (!r.ok) assert.ok(r.errors.some((e) => e.message.includes('duplicate slotId')));
});

test('an empty misconceptions array is rejected (REQ-083)', () => {
  assert.ok(!parseChapterFramework(framework({ misconceptions: [] })).ok);
});

test('a missing seven-step field is rejected', () => {
  const f = framework();
  delete (f as Record<string, unknown>).subversion;
  assert.ok(!parseChapterFramework(f).ok);
});

test('an unknown key is strictly rejected', () => {
  assert.ok(!parseChapterFramework(framework({ extra: 1 })).ok);
});

test('an unknown archetype is rejected', () => {
  const slots = ARC.map((phase, i) => slot({ slotId: `s${i}`, emotionalPhase: phase }));
  const bad = { ...slots[0], archetype: 'nonsense' } as unknown;
  const r = parseChapterFramework(framework({ levelSlots: [bad, ...slots.slice(1)] }));
  assert.ok(!r.ok);
});

test('an out-of-range difficultyTarget axis is rejected', () => {
  const slots = ARC.map((phase, i) => slot({ slotId: `s${i}`, emotionalPhase: phase }));
  const bad = { ...slots[0], difficultyTarget: { executionPrecision: 1.5, readingComplexity: 0.2, timingStrictness: 0.3, routeAmbiguity: 0.1 } } as unknown;
  assert.ok(!parseChapterFramework(framework({ levelSlots: [bad, ...slots.slice(1)] })).ok);
});

test('REQ-174: a missing rewardedSkip field is rejected; available:false is valid', () => {
  const slots = ARC.map((phase, i) => slot({ slotId: `s${i}`, emotionalPhase: phase }));
  const noSkip = { ...slots[0] } as Record<string, unknown>;
  delete noSkip.rewardedSkip;
  assert.ok(!parseChapterFramework(framework({ levelSlots: [noSkip, ...slots.slice(1)] })).ok);
  // available:false present is valid (already the default fixture).
  assert.ok(parseChapterFramework(framework()).ok);
});

test('REQ-174: an altRouteHint round-trips', () => {
  const slots = ARC.map((phase, i) => slot({ slotId: `s${i}`, emotionalPhase: phase }));
  const withHint = { ...slots[0], rewardedSkip: { available: true, altRouteHint: 'the spring launches over the second pit' } };
  const r = parseChapterFramework(framework({ levelSlots: [withHint, ...slots.slice(1)] }));
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value.levelSlots[0].rewardedSkip.altRouteHint, 'the spring launches over the second pit');
});

test('a duplicate mechanic in a slot is rejected', () => {
  const slots = ARC.map((phase, i) => slot({ slotId: `s${i}`, emotionalPhase: phase }));
  const bad = { ...slots[0], mechanics: ['laser', 'laser'] } as unknown;
  assert.ok(!parseChapterFramework(framework({ levelSlots: [bad, ...slots.slice(1)] })).ok);
});

test('framework round-trips through serialize → parseText byte-stably', () => {
  const r = parseChapterFramework(framework());
  assert.ok(r.ok);
  if (!r.ok) return;
  const text = serializeChapterFramework(r.value);
  const r2 = parseChapterFrameworkText(text);
  assert.ok(r2.ok);
  if (r2.ok) assert.equal(serializeChapterFramework(r2.value), text);
});

test('parseChapterFrameworkText surfaces JSON syntax errors at the root, never throws', () => {
  const r = parseChapterFrameworkText('{ not json');
  assert.ok(!r.ok);
  if (!r.ok) assert.equal(r.errors[0].path, '');
});

/* ── CampaignManifest ─────────────────────────────────────────────────────── */

function manifest(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    manifestSchemaVersion: 1,
    campaignId: 'jump-once-campaign',
    chapters: ['ch-a', 'ch-b'],
    difficultyDistribution: { easy: 0.2, medium: 0.35, hard: 0.25, harder: 0.15, 'very-hard': 0.05 },
    distributionTolerance: 0.08,
    ...over,
  };
}

test('a valid manifest parses; its distribution sums to 1', () => {
  const r = parseCampaignManifest(manifest());
  assert.ok(r.ok, `expected ok, got ${JSON.stringify(r.ok ? {} : r.errors)}`);
});

test('a distribution that does not sum to 1 is rejected', () => {
  assert.ok(!parseCampaignManifest(manifest({ difficultyDistribution: { easy: 0.5, medium: 0.35, hard: 0.25, harder: 0.15, 'very-hard': 0.05 } })).ok);
});

test('duplicate chapter ids are rejected', () => {
  assert.ok(!parseCampaignManifest(manifest({ chapters: ['ch-a', 'ch-a'] })).ok);
});

test('an empty chapters array is rejected', () => {
  assert.ok(!parseCampaignManifest(manifest({ chapters: [] })).ok);
});

test('a missing difficulty tier key is rejected', () => {
  assert.ok(!parseCampaignManifest(manifest({ difficultyDistribution: { easy: 0.2, medium: 0.35, hard: 0.25, harder: 0.2 } })).ok);
});

test('manifest round-trips through serialize', () => {
  const r = parseCampaignManifest(manifest());
  assert.ok(r.ok);
  if (!r.ok) return;
  const text = serializeCampaignManifest(r.value);
  const r2 = parseCampaignManifest(JSON.parse(text));
  assert.ok(r2.ok);
  if (r2.ok) assert.equal(serializeCampaignManifest(r2.value), text);
});
