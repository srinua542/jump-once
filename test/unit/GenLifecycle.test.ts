/**
 * S7.1 — the REQ-082 lifecycle tracker (dm-0055): advisory assessment climbs
 * the nine-stage ladder contiguously from observable evidence; advances are
 * explicit, forward-only, evidence-backed acts; Exhaustion/Retirement block
 * reuse; thresholds come from GenProfile, proven by a two-profile test.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_GEN_PROFILE } from '../../src/gen/GenProfile';
import {
  ZERO_LIFECYCLE_EVIDENCE,
  advanceStage,
  assessStage,
  createEntry,
  isBlocked,
  stageIndexOf,
  type LifecycleEvidence,
} from '../../src/gen/Lifecycle';
import { LIFECYCLE_STAGES, setMechanicEntry, type MechanicLifecycleEntry } from '../../src/eval/gdos/DesignMemory';
import { genProfileWith } from '../helpers/GenFixtures';

const P = DEFAULT_GEN_PROFILE;

function evidence(overrides: Partial<LifecycleEvidence>): LifecycleEvidence {
  return { ...ZERO_LIFECYCLE_EVIDENCE, ...overrides };
}

/* ── assessStage: the contiguous advisory ladder ─────────────────────────── */

test('zero evidence recommends Introduction (the entry stage)', () => {
  const a = assessStage(createEntry('spring'), ZERO_LIFECYCLE_EVIDENCE, P);
  assert.equal(a.recommendedStage, 'Introduction');
  assert.ok(a.reasons.length > 0);
});

test('the ladder climbs exactly as far as contiguous evidence supports', () => {
  const e = evidence({
    levelsUsed: P.lifecycle.developmentMinLevels,
    isolatedLevelExists: true,
    combinedLevelExists: true,
  });
  const a = assessStage(createEntry('spring'), e, P);
  assert.equal(a.recommendedStage, 'Combination');
  assert.ok(a.reasons.some((r) => r.startsWith('unmet for Subversion')));
});

test('a later-stage fact without the earlier rung does not skip the ladder', () => {
  // Combined exists but no isolation level: the climb stops before Isolation.
  const e = evidence({ combinedLevelExists: true, levelsUsed: 5 });
  const a = assessStage(createEntry('spring'), e, P);
  assert.equal(a.recommendedStage, 'Introduction');
  assert.ok(a.reasons[0].startsWith('unmet for Isolation'));
});

test('the recommendation never moves backward from the entry stage', () => {
  const entry = createEntry('spring');
  const advanced = advanceStage(entry, 'Mastery', '2026-07-10', 'designer advanced on playtest evidence');
  assert.ok(advanced.ok);
  if (!advanced.ok) return;
  const a = assessStage(advanced.value, ZERO_LIFECYCLE_EVIDENCE, P);
  assert.equal(a.recommendedStage, 'Mastery');
});

test('Retirement is never recommended, even under total evidence', () => {
  const e = evidence({
    levelsUsed: 99,
    isolatedLevelExists: true,
    combinedLevelExists: true,
    subversionLevelExists: true,
    masteredInCampaign: true,
    recentNoveltyDivergences: [0, 0, 0, 0],
  });
  const a = assessStage(createEntry('spring'), e, P);
  assert.equal(a.recommendedStage, 'Exhaustion');
});

test('saturation needs one low-novelty sample; exhaustion needs N consecutive', () => {
  const base = evidence({
    levelsUsed: 99,
    isolatedLevelExists: true,
    combinedLevelExists: true,
    subversionLevelExists: true,
    masteredInCampaign: true,
  });
  const low = P.lifecycle.saturationNoveltyThreshold / 2;
  const high = P.lifecycle.saturationNoveltyThreshold * 2;
  // One low sample → Saturation, not Exhaustion.
  const sat = assessStage(createEntry('spring'), { ...base, recentNoveltyDivergences: [high, high, low] }, P);
  assert.equal(sat.recommendedStage, 'Saturation');
  // N consecutive low samples → Exhaustion.
  const n = P.lifecycle.exhaustionConsecutiveLowNovelty;
  const ex = assessStage(createEntry('spring'), { ...base, recentNoveltyDivergences: [high, ...Array(n).fill(low) as number[]] }, P);
  assert.equal(ex.recommendedStage, 'Exhaustion');
  // A high sample inside the window breaks the streak.
  const broken = assessStage(createEntry('spring'), { ...base, recentNoveltyDivergences: [...Array(n).fill(low) as number[], high] }, P);
  assert.equal(broken.recommendedStage, 'Mastery');
});

test('two-profile test: lifecycle thresholds are calibration, not literals', () => {
  const e = evidence({ isolatedLevelExists: true, levelsUsed: 3 });
  const strict = genProfileWith({ profileId: 'strict', lifecycle: { developmentMinLevels: 10 } });
  const a = assessStage(createEntry('spring'), e, P);
  const b = assessStage(createEntry('spring'), e, strict);
  assert.equal(a.recommendedStage, 'Development');
  assert.equal(b.recommendedStage, 'Isolation');
  // Same divergences, different saturation bar → different reading.
  const full = evidence({
    levelsUsed: 3, isolatedLevelExists: true, combinedLevelExists: true,
    subversionLevelExists: true, masteredInCampaign: true, recentNoveltyDivergences: [0.2],
  });
  const loose = genProfileWith({ profileId: 'loose', lifecycle: { saturationNoveltyThreshold: 0.5 } });
  assert.equal(assessStage(createEntry('spring'), full, P).recommendedStage, 'Mastery');
  assert.equal(assessStage(createEntry('spring'), full, loose).recommendedStage, 'Saturation');
});

/* ── advanceStage: the explicit act ──────────────────────────────────────── */

test('advance is forward-only and evidence-backed', () => {
  const entry = createEntry('spring');
  const ok = advanceStage(entry, 'Isolation', '2026-07-10', 'isolation fixture landed');
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.value.stage, 'Isolation');
    assert.equal(ok.value.history.length, 1);
    assert.equal(ok.value.history[0].from, 'Introduction');
    assert.equal(entry.history.length, 0); // purity
  }
  const backward = advanceStage(ok.ok ? ok.value : entry, 'Introduction', '2026-07-10', 'x');
  assert.equal(backward.ok, false);
  const noEvidence = advanceStage(entry, 'Isolation', '2026-07-10', '');
  assert.equal(noEvidence.ok, false);
  const badDate = advanceStage(entry, 'Isolation', 'yesterday', 'x');
  assert.equal(badDate.ok, false);
});

test('retiring requires a disposition; non-retiring advances refuse one', () => {
  const entry = createEntry('spring');
  const noDisposition = advanceStage(entry, 'Retirement', '2026-07-10', 'exhausted across the campaign');
  assert.equal(noDisposition.ok, false);
  const withDisposition = advanceStage(entry, 'Retirement', '2026-07-10', 'exhausted across the campaign', 'prune');
  assert.ok(withDisposition.ok);
  if (withDisposition.ok) assert.equal(withDisposition.value.disposition, 'prune');
  const misplaced = advanceStage(entry, 'Isolation', '2026-07-10', 'x', 'convert');
  assert.equal(misplaced.ok, false);
});

test('an advanced entry persists through the store (setMechanicEntry accepts it)', () => {
  const doc = {
    schemaVersion: '1.1',
    notes: 'n',
    decisions: [],
    mechanicLifecycleNotes: 'n',
    mechanics: [] as readonly MechanicLifecycleEntry[],
  };
  let entry = createEntry('conveyor');
  for (const [to, why] of [['Isolation', 'a'], ['Development', 'b'], ['Combination', 'c']] as const) {
    const r = advanceStage(entry, to, '2026-07-10', why);
    assert.ok(r.ok);
    if (r.ok) entry = r.value;
  }
  const stored = setMechanicEntry(doc, entry);
  assert.ok(stored.ok, `store rejected a tracker-built entry: ${JSON.stringify(!stored.ok ? stored.errors : [])}`);
});

/* ── isBlocked: the REQ-082 reuse block ──────────────────────────────────── */

test('Exhaustion and Retirement block; everything else (and absence) is fresh', () => {
  const mechanics: MechanicLifecycleEntry[] = [];
  let spike = createEntry('spike');
  const toExhaustion = ['Isolation', 'Development', 'Combination', 'Subversion', 'Mastery', 'Saturation', 'Exhaustion'] as const;
  for (const to of toExhaustion) {
    const r = advanceStage(spike, to, '2026-07-10', 'evidence');
    assert.ok(r.ok);
    if (r.ok) spike = r.value;
  }
  mechanics.push(spike);
  const laser = advanceStage(createEntry('laser'), 'Retirement', '2026-07-10', 'converted', 'convert');
  assert.ok(laser.ok);
  if (laser.ok) mechanics.push(laser.value);
  mechanics.push(createEntry('spring'));

  assert.equal(isBlocked(mechanics, 'spike'), true, 'Exhaustion blocks');
  assert.equal(isBlocked(mechanics, 'laser'), true, 'Retirement blocks');
  assert.equal(isBlocked(mechanics, 'spring'), false, 'Introduction does not block');
  assert.equal(isBlocked(mechanics, 'door'), false, 'absent = fresh, not blocked');
});

/* ── shape locks ─────────────────────────────────────────────────────────── */

test('stageIndexOf follows the canonical nine-stage order', () => {
  assert.equal(stageIndexOf('Introduction'), 0);
  assert.equal(stageIndexOf('Retirement'), 8);
  for (let i = 1; i < LIFECYCLE_STAGES.length; i++) {
    assert.ok(stageIndexOf(LIFECYCLE_STAGES[i]) > stageIndexOf(LIFECYCLE_STAGES[i - 1]));
  }
});

test('ZERO_LIFECYCLE_EVIDENCE is frozen and vacuous', () => {
  assert.ok(Object.isFrozen(ZERO_LIFECYCLE_EVIDENCE));
  assert.equal(ZERO_LIFECYCLE_EVIDENCE.levelsUsed, 0);
  assert.equal(ZERO_LIFECYCLE_EVIDENCE.recentNoveltyDivergences.length, 0);
});

test('assessment is deterministic (two identical calls, identical readings)', () => {
  const e = evidence({ isolatedLevelExists: true, levelsUsed: 4, recentNoveltyDivergences: [0.3, 0.1] });
  const a = assessStage(createEntry('spring'), e, P);
  const b = assessStage(createEntry('spring'), e, P);
  assert.deepEqual(a, b);
});
