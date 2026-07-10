/**
 * S5.7 — the curation engines (REQ-020/021/022; REQ-012 curation share).
 * Kill Switch: kills gate-failing reports, jump-free completions (a level
 * that does not test the constraint), and unexhausted-economy mechanic
 * additions — and records a full Intent-Repository decision on every kill.
 * First-Party review: three attested criteria, rationales mandatory.
 * Subtractive engine: six pruning questions over a milestone inventory;
 * silence is not a keep.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TAPE_SCHEMA_VERSION } from '../../src/schema/TapeIO';
import type { ArchetypeRun } from '../../src/eval/gdos/Evidence';
import { gateResult, gdosReport, metricScore, type GdosReport } from '../../src/eval/gdos/Report';
import {
  SUBTRACTIVE_QUESTIONS,
  firstPartyReview,
  killSwitch,
  subtractivePass,
  type FirstPartyAttestations,
} from '../../src/eval/gdos/Curation';
import { makeBundle, makeLevel } from '../helpers/GdosFixtures';

/** A completed run whose tape does (or does not) press THE jump. */
function runFrames(jumps: boolean, ticks = 60): ArchetypeRun {
  const frames = [];
  for (let i = 0; i < ticks; i++) {
    frames.push({ moveAxis: 1 as const, jumpPressed: jumps && i === 30, resetPressed: false });
  }
  return {
    archetype: 'firstTime',
    outcome: 'completed',
    attempts: 0,
    ticksElapsed: ticks,
    tape: { schemaVersion: TAPE_SCHEMA_VERSION, levelId: 'gdos-fixture', seed: 1, frames },
  };
}

function passingReport(levelId: string): GdosReport {
  return gdosReport(levelId, 'test-profile', [gateResult('emotional-threshold', [metricScore('curiosity', 95, 90)], [], [])]);
}

function failingReport(levelId: string): GdosReport {
  return gdosReport(levelId, 'test-profile', [gateResult('emotional-threshold', [metricScore('curiosity', 10, 90)], ['curiosity 10 below threshold 90'], [])]);
}

const AFFIRM: FirstPartyAttestations = {
  selfExplanation: { affirmed: true, rationale: 'the layout itself teaches the interaction' },
  hoursOfInterest: { affirmed: true, rationale: 'five-tier routing spread sustains replay' },
  inevitablePolish: { affirmed: true, rationale: 'no state exists that can look unfinished' },
};

test('kill switch passes an elevating concept (gates pass, jump exercised)', () => {
  const bundle = makeBundle({ runs: [runFrames(true)] });
  const verdict = killSwitch(bundle, passingReport(bundle.def.levelId));
  assert.equal(verdict.kill, false);
  assert.deepEqual(verdict.reasons, []);
  assert.equal(verdict.decision.verdict, 'pass');
  assert.equal(verdict.decision.intent, undefined);
});

test('kill switch kills a gate-failing concept and records full intent (REQ-020)', () => {
  const bundle = makeBundle({ runs: [runFrames(true)] });
  const verdict = killSwitch(bundle, failingReport(bundle.def.levelId));
  assert.equal(verdict.kill, true);
  assert.ok(verdict.reasons[0].includes('fails GDOS gates'));
  assert.equal(verdict.decision.verdict, 'fail');
  assert.ok(verdict.decision.intent !== undefined, 'a kill is a design-intent commitment');
  assert.ok(verdict.decision.intent!.whyItExists.length > 0);
  assert.ok(verdict.decision.intent!.whyAlternativesRejected.length > 0);
});

test('kill switch kills a level completable without THE jump (REQ-012)', () => {
  const bundle = makeBundle({ runs: [runFrames(false)] });
  const verdict = killSwitch(bundle, passingReport(bundle.def.levelId));
  assert.equal(verdict.kill, true);
  assert.ok(verdict.reasons.some((r) => r.includes('REQ-012')));
});

test('kill switch kills a mechanic addition while variations are unexhausted (REQ-042)', () => {
  const bundle = makeBundle({ runs: [runFrames(true)] });
  const verdict = killSwitch(bundle, passingReport(bundle.def.levelId), {
    addsNewMechanic: true,
    economy: { winner: 'deepen', deepenEconomy: 12, addMechanicEconomy: 7 },
  });
  assert.equal(verdict.kill, true);
  assert.ok(verdict.reasons.some((r) => r.includes('REQ-042')));

  // The same addition passes once the economy favors it.
  const ok = killSwitch(bundle, passingReport(bundle.def.levelId), {
    addsNewMechanic: true,
    economy: { winner: 'addMechanic', deepenEconomy: 7, addMechanicEconomy: 12 },
  });
  assert.equal(ok.kill, false);
});

test('first-party review approves three affirmed criteria (REQ-021)', () => {
  const verdict = firstPartyReview('concept-x', AFFIRM, passingReport('concept-x'));
  assert.equal(verdict.approved, true);
  assert.equal(verdict.decision.verdict, 'pass');
});

test('first-party review rejects an unaffirmed criterion, with the rationale surfaced', () => {
  const verdict = firstPartyReview('concept-x', {
    ...AFFIRM,
    hoursOfInterest: { affirmed: false, rationale: 'exhausts itself in one clear' },
  });
  assert.equal(verdict.approved, false);
  assert.ok(verdict.findings.some((f) => f.includes('exhausts itself')));
});

test('first-party review rejects an empty rationale — an unexplained judgement is not a review', () => {
  const verdict = firstPartyReview('concept-x', {
    ...AFFIRM,
    inevitablePolish: { affirmed: true, rationale: '' },
  });
  assert.equal(verdict.approved, false);
  assert.ok(verdict.findings.some((f) => f.includes('no rationale')));
});

test('first-party review fails when the GDOS report fails, regardless of attestations', () => {
  const verdict = firstPartyReview('concept-x', AFFIRM, failingReport('concept-x'));
  assert.equal(verdict.approved, false);
});

test('there are exactly six pruning questions, as data (REQ-022)', () => {
  assert.equal(SUBTRACTIVE_QUESTIONS.length, 6);
  assert.equal(new Set(SUBTRACTIVE_QUESTIONS.map((q) => q.id)).size, 6);
});

test('subtractive pass: a NO answer makes a removal candidate; full YES keeps; silence flags', () => {
  const items = [
    { id: 'mech-a', kind: 'mechanic', description: 'justified mechanic' },
    { id: 'mech-b', kind: 'mechanic', description: 'duplicative mechanic' },
    { id: 'doc-c', kind: 'document', description: 'unreviewed doc' },
  ];
  const yes = Object.fromEntries(SUBTRACTIVE_QUESTIONS.map((q) => [q.id, true]));
  const report = subtractivePass(items, {
    'mech-a': yes,
    'mech-b': { ...yes, 'non-duplicative': false },
    // doc-c deliberately unanswered
  });
  assert.deepEqual(report.kept, ['mech-a']);
  assert.equal(report.removalCandidates.length, 1);
  assert.equal(report.removalCandidates[0].itemId, 'mech-b');
  assert.deepEqual(report.removalCandidates[0].failedQuestions, ['non-duplicative']);
  assert.equal(report.incomplete.length, 1);
  assert.equal(report.incomplete[0].itemId, 'doc-c');
  assert.equal(report.incomplete[0].unansweredQuestions.length, 6);
  assert.equal(report.clean, false);
  assert.equal(report.decisions.length, 2);
  assert.equal(report.decisions.find((d) => d.subject === 'doc-c')?.verdict, 'flag');
});

test('a fully-answered all-YES inventory is clean', () => {
  const yes = Object.fromEntries(SUBTRACTIVE_QUESTIONS.map((q) => [q.id, true]));
  const report = subtractivePass(
    [{ id: 'only', kind: 'system', description: 'earns its place' }],
    { only: yes },
  );
  assert.equal(report.clean, true);
  assert.deepEqual(report.kept, ['only']);
  assert.deepEqual(report.decisions, []);
});

test('curation is deterministic: identical verdicts across two runs', () => {
  const bundle = makeBundle({ def: makeLevel({ id: 'det' }), runs: [runFrames(false)] });
  const a = killSwitch(bundle, failingReport('det'));
  const b = killSwitch(bundle, failingReport('det'));
  assert.deepEqual(a, b);
});
