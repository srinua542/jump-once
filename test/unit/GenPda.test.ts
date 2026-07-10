/**
 * S7.3 — the Procedural Design Assistant (REQ-060, dm-0058): deterministic
 * data-fusion over coverage pairs, campaign health, kinetic anchors, and
 * CDRE findings; lifecycle blocking and rejected prior art are mandatory
 * filters; the cap and the weak-chapter bar are GenProfile calibration;
 * everything dropped is counted.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { discoverOpportunities, type PdaInputs } from '../../src/gen/Pda';
import { DEFAULT_GEN_PROFILE } from '../../src/gen/GenProfile';
import { advanceStage, createEntry } from '../../src/gen/Lifecycle';
import { ZERO_CAMPAIGN_STATE, type CampaignReport, type ChapterHealthReport } from '../../src/eval/campaign/CampaignState';
import type { MechanicLifecycleEntry } from '../../src/eval/gdos/DesignMemory';
import type { LedgerDocument } from '../../src/eval/gdos/DesignMemory';
import type { CdreProposal } from '../../src/eval/gdos/Cdre';
import type { EmergentFunReport } from '../../src/eval/EmergentFun';
import { coverageMatrixFixture } from '../helpers/CampaignFixtures';
import { genProfileWith } from '../helpers/GenFixtures';

const P = DEFAULT_GEN_PROFILE;

function healthReport(score: number): ChapterHealthReport {
  const pass = { pass: true, findings: [] as string[] };
  return {
    score,
    cognitiveStructuralMapping: pass,
    crossChapterDegradation: pass,
    curiosityProgression: pass,
    graduationAssessment: pass,
    trend: 'flat',
    alerts: [],
  };
}

function campaignReport(overrides: Partial<CampaignReport>): CampaignReport {
  return {
    finalState: ZERO_CAMPAIGN_STATE,
    chapterHealthMap: {},
    alerts: [],
    retentionPrediction: 0.5,
    ...overrides,
  };
}

function exhaustedEntry(mechanic: MechanicLifecycleEntry['mechanic']): MechanicLifecycleEntry {
  let entry = createEntry(mechanic);
  for (const to of ['Isolation', 'Development', 'Combination', 'Subversion', 'Mastery', 'Saturation', 'Exhaustion'] as const) {
    const r = advanceStage(entry, to, '2026-07-10', 'fixture evidence');
    assert.ok(r.ok);
    if (r.ok) entry = r.value;
  }
  return entry;
}

function emptyLedger(decisions: LedgerDocument['decisions']): LedgerDocument {
  return { schemaVersion: '1.1', notes: 'n', decisions, mechanicLifecycleNotes: 'n', mechanics: [] };
}

const ANCHORED: EmergentFunReport = {
  anchors: [{ position: { x: 1, y: 2 }, velocity: { x: 9, y: 0 } } as EmergentFunReport['anchors'][number]],
  exhaustive: true,
  nodesExplored: 1,
} as EmergentFunReport;

test('an empty input set discovers nothing, gracefully', () => {
  const report = discoverOpportunities({}, P);
  assert.deepEqual(report.opportunities, []);
  assert.equal(report.consideredSignals, 0);
  assert.deepEqual(report.dropped, { blockedMechanic: 0, rejectedPriorArt: 0, overCap: 0 });
});

test('conceptual: covered values that never met surface as pair gaps (finer than CDRE axis mining)', () => {
  // spring covers curiosity; spike covers mastery — so spring|mastery and
  // spike|curiosity are covered-value pairs that never met.
  const matrix = coverageMatrixFixture([
    { mechanic: 'spring', emotion: 'curiosity' },
    { mechanic: 'spike', emotion: 'mastery' },
  ]);
  const report = discoverOpportunities({ coverageMatrix: matrix }, P);
  const rationales = report.opportunities.map((o) => o.rationale);
  assert.ok(rationales.some((r) => r.includes('"spring"') && r.includes('"mastery"')));
  assert.ok(rationales.some((r) => r.includes('"spike"') && r.includes('"curiosity"')));
  // Pairs that DID meet are not gaps.
  assert.ok(!rationales.some((r) => r.includes('"spring"') && r.includes('"curiosity"')));
  for (const o of report.opportunities) {
    assert.equal(o.kind, 'conceptual');
    assert.ok(o.suggestedArchetypes.length > 0);
    assert.ok(o.sourceSignals[0].startsWith('coverage-pair:'));
  }
});

test('a blocked mechanic never surfaces, and the drop is counted (REQ-082)', () => {
  const matrix = coverageMatrixFixture([
    { mechanic: 'spring', emotion: 'curiosity' },
    { mechanic: 'spike', emotion: 'mastery' },
  ]);
  const report = discoverOpportunities({ coverageMatrix: matrix, lifecycle: [exhaustedEntry('spring')] }, P);
  assert.ok(report.opportunities.every((o) => !o.mechanics.includes('spring')));
  assert.ok(report.dropped.blockedMechanic > 0);
});

test('a REJECTED prior decision covering both halves of a pair suppresses it (REQ-051)', () => {
  const matrix = coverageMatrixFixture([
    { mechanic: 'spring', emotion: 'curiosity' },
    { mechanic: 'spike', emotion: 'mastery' },
  ]);
  const rejected = {
    id: 'dm-0001', date: '2026-07-01', status: 'REJECTED' as const,
    title: 'spring mastery gauntlet',
    whyItExists: 'tried a spring level targeting mastery',
    problemItSolves: 'p', emotionTargeted: 'mastery', misconceptionCreated: 'm',
    whyAlternativesRejected: 'r',
  };
  const withMemory = discoverOpportunities({ coverageMatrix: matrix, designMemory: emptyLedger([rejected]) }, P);
  assert.ok(!withMemory.opportunities.some((o) => o.mechanics.includes('spring') && o.rationale.includes('"mastery"')));
  assert.ok(withMemory.dropped.rejectedPriorArt > 0);
  // An ACCEPTED decision with the same text suppresses nothing.
  const accepted = discoverOpportunities({
    coverageMatrix: matrix,
    designMemory: emptyLedger([{ ...rejected, status: 'ACCEPTED' as const }]),
  }, P);
  assert.equal(accepted.dropped.rejectedPriorArt, 0);
});

test('systemic: alerts rank first; weak chapters surface under the profiled bar (two-profile)', () => {
  const report = campaignReport({
    alerts: [{ kind: 'difficulty-spike', chapterId: 'ch2', reason: 'health fell 30 under baseline', findings: ['f1'] }],
    chapterHealthMap: { ch1: healthReport(80), ch2: healthReport(40), ch3: healthReport(55) },
  });
  const matrix = coverageMatrixFixture([{ mechanic: 'spring', emotion: 'curiosity' }, { mechanic: 'spring', emotion: 'mastery' }]);
  const out = discoverOpportunities({ campaignReport: report, coverageMatrix: matrix }, P);
  assert.equal(out.opportunities[0].kind, 'systemic');
  assert.ok(out.opportunities[0].sourceSignals.includes('alert:ch2'));
  // ch3 (55) sits below the default bar 60; ch1 (80) does not; ch2 is already alerted, not duplicated.
  assert.ok(out.opportunities.some((o) => o.sourceSignals.includes('chapter-health:ch3')));
  assert.ok(!out.opportunities.some((o) => o.sourceSignals.includes('chapter-health:ch1')));
  assert.equal(out.opportunities.filter((o) => o.sourceSignals.some((s) => s.includes('ch2'))).length, 1);
  // Two-profile: a lower bar silences ch3.
  const strict = genProfileWith({ profileId: 'low-bar', pda: { weakChapterHealthScore: 50 } });
  const out2 = discoverOpportunities({ campaignReport: report }, strict);
  assert.ok(!out2.opportunities.some((o) => o.sourceSignals.includes('chapter-health:ch3')));
});

test('structural: kinetic anchors surface per level with provenance (REQ-054 applied)', () => {
  const out = discoverOpportunities({
    emergentFun: [
      { levelId: 'lv-anchored', report: ANCHORED },
      { levelId: 'lv-plain', report: { anchors: [], exhaustive: true, nodesExplored: 1 } as EmergentFunReport },
    ],
  }, P);
  assert.equal(out.opportunities.length, 1);
  assert.equal(out.opportunities[0].kind, 'structural');
  assert.deepEqual(out.opportunities[0].sourceSignals, ['emergent-fun:lv-anchored']);
});

test('CDRE findings are echoed last and REJECTED proposals are ignored', () => {
  const proposal = (id: string, kind: CdreProposal['kind'], status: CdreProposal['status']): CdreProposal => ({
    id, kind, status, summary: `${kind} summary`, evidence: ['e1'],
    intent: {
      whyItExists: 'w', problemItSolves: 'p', emotionTargeted: 'e',
      misconceptionCreated: 'm', whyAlternativesRejected: 'r',
    } as CdreProposal['intent'],
  });
  const matrix = coverageMatrixFixture([
    { mechanic: 'spring', emotion: 'curiosity' },
    { mechanic: 'spring', emotion: 'mastery' },
    { mechanic: 'spring', optimizationStyle: 'discovery' },
  ]);
  const out = discoverOpportunities({
    coverageMatrix: matrix,
    cdreProposals: [
      proposal('cdre-0001', 'coverage-gap', 'PROPOSED'),
      proposal('cdre-0002', 'recurring-rejection', 'ACCEPTED'),
      proposal('cdre-0003', 'coverage-gap', 'REJECTED'),
      proposal('cdre-0004', 'threshold-adjustment', 'PROPOSED'),
    ],
  }, P);
  const echoes = out.opportunities.filter((o) => o.sourceSignals[0].startsWith('cdre:'));
  assert.equal(echoes.length, 2);
  // Echoes rank after everything else.
  const firstEcho = out.opportunities.findIndex((o) => o.sourceSignals[0].startsWith('cdre:'));
  assert.equal(out.opportunities.slice(firstEcho).every((o) => o.sourceSignals[0].startsWith('cdre:')), true);
});

test('the cap is profile calibration and overflow is counted, never silent (two-profile)', () => {
  // spring covered at one emotion of six-ish → several pair gaps.
  const matrix = coverageMatrixFixture([
    { mechanic: 'spring', emotion: 'curiosity' },
    { mechanic: 'spike', emotion: 'mastery' },
    { mechanic: 'door', emotion: 'realization' },
  ]);
  const wide = discoverOpportunities({ coverageMatrix: matrix }, P);
  const tight = discoverOpportunities({ coverageMatrix: matrix }, genProfileWith({ profileId: 'tight', pda: { maxOpportunities: 2 } }));
  assert.ok(wide.opportunities.length > 2);
  assert.equal(tight.opportunities.length, 2);
  assert.equal(tight.dropped.overCap, wide.opportunities.length - 2 + wide.dropped.overCap);
  assert.deepEqual(tight.opportunities, wide.opportunities.slice(0, 2));
});

test('discovery is deterministic: two identical passes, identical reports', () => {
  const inputs: PdaInputs = {
    coverageMatrix: coverageMatrixFixture([
      { mechanic: 'spring', emotion: 'curiosity' },
      { mechanic: 'spike', emotion: 'mastery' },
    ]),
    campaignReport: campaignReport({ chapterHealthMap: { ch1: healthReport(30) } }),
    emergentFun: [{ levelId: 'lv-1', report: ANCHORED }],
  };
  assert.deepEqual(discoverOpportunities(inputs, P), discoverOpportunities(inputs, P));
});
