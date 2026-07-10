/**
 * S5.8 — the CDRE profile-evolution loop (REQ-052; dm-0033). Mining is a pure
 * observation over reports/coverage/history; an applied ACCEPTED threshold
 * proposal yields a NEW, valid profile version; nothing else may be applied,
 * and a rejected proposal never mutates anything.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_PROFILE, parseProfile } from '../../src/eval/gdos/Profile';
import { coverageMatrix } from '../../src/eval/gdos/DesignSpace';
import { gateResult, gdosReport, type DesignDecision, type GdosReport, type MetricScore } from '../../src/eval/gdos/Report';
import { DEFAULT_CDRE_OPTIONS, apply, mine, type CdreProposal } from '../../src/eval/gdos/Cdre';
import { makeBundle, run, optWindow } from '../helpers/GdosFixtures';

/** A report whose emotional gate carries the given metric scores. */
function reportWith(levelId: string, scores: readonly MetricScore[]): GdosReport {
  return gdosReport(levelId, DEFAULT_PROFILE.profileId, [gateResult('emotional-threshold', scores, [], [])]);
}

function score(metric: string, value: number, threshold: number): MetricScore {
  return { metric, score: value, threshold, pass: value >= threshold };
}

/** Four reports where curiosity always fails badly (bar far above the content). */
function failingCuriosityReports(): GdosReport[] {
  return [40, 50, 60, 70].map((v, i) => reportWith(`lvl-${i}`, [score('curiosity', v, 90)]));
}

/** Four reports where confidence passes everywhere with a wide margin. */
function overshootConfidenceReports(): GdosReport[] {
  return [98, 99, 100, 100].map((v, i) => reportWith(`lvl-${i}`, [score('confidence', v, 60)]));
}

test('a metric failing nearly every report proposes a LOWER bar, at the configured percentile', () => {
  const proposals = mine({ reports: failingCuriosityReports() });
  const p = proposals.find((x) => x.kind === 'threshold-adjustment');
  assert.ok(p !== undefined, JSON.stringify(proposals.map((x) => x.kind)));
  assert.equal(p.target?.metric, 'curiosity');
  assert.equal(p.target?.gate, 'emotional');
  assert.equal(p.currentThreshold, 90);
  // sorted [40,50,60,70], p0.5 → index floor(0.5*3)=1 → 50
  assert.equal(p.proposedThreshold, 50);
  assert.equal(p.status, 'PROPOSED', 'mining never accepts its own work');
  assert.ok(p.intent.whyAlternativesRejected.length > 0, 'proposals carry Intent Repository fields');
});

test('a metric passing everywhere by a wide margin proposes a RAISED bar (no Goodhart ratchet)', () => {
  const proposals = mine({ reports: overshootConfidenceReports() });
  const p = proposals.find((x) => x.kind === 'threshold-adjustment');
  assert.ok(p !== undefined);
  assert.equal(p.target?.metric, 'confidence');
  assert.equal(p.currentThreshold, 60);
  assert.equal(p.proposedThreshold, 98, 'raise to the weakest observed score');
  assert.ok(p.summary.startsWith('raise'));
});

test('a sample below minReports mines no threshold proposals', () => {
  const reports = failingCuriosityReports().slice(0, DEFAULT_CDRE_OPTIONS.minReports - 1);
  const proposals = mine({ reports });
  assert.equal(proposals.filter((p) => p.kind === 'threshold-adjustment').length, 0);
});

test('an always-zero metric is an estimator problem, not a threshold problem', () => {
  const reports = [0, 0, 0, 0].map((v, i) => reportWith(`lvl-${i}`, [score('mastery', v, 95)]));
  const proposals = mine({ reports });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].kind, 'estimator-unmeasurable');
  assert.equal(proposals[0].target, undefined, 'no threshold change is proposed for a dead estimator');
});

test('scores gathered under different thresholds are not comparable and are skipped (dm-0031)', () => {
  const reports = [
    reportWith('a', [score('curiosity', 10, 90)]),
    reportWith('b', [score('curiosity', 10, 80)]), // different bar → different profile
    reportWith('c', [score('curiosity', 10, 90)]),
  ];
  assert.equal(mine({ reports }).filter((p) => p.kind === 'threshold-adjustment').length, 0);
});

test('info-density metrics are never threshold-mined (band/limit tests, not ≥-cutoffs)', () => {
  const reports = [0, 1, 2].map((i) => gdosReport(`l${i}`, 'p', [
    gateResult('info-density', [
      { metric: 'peakScreenDensity', score: 20, threshold: 8, pass: false },
      { metric: 'failureVisibility', score: 3, threshold: 0, pass: false },
    ], [], []),
  ]));
  assert.deepEqual(mine({ reports }), []);
});

test('coverage gaps surface dead design-space regions (REQ-041)', () => {
  const bundle = makeBundle({
    runs: [run('firstTime', 'completed', 1, 100)],
    optimization: optWindow(4),
  });
  const proposals = mine({ reports: [], coverage: coverageMatrix([bundle]) });
  const gaps = proposals.filter((p) => p.kind === 'coverage-gap');
  assert.ok(gaps.length > 0);
  const playerGap = gaps.find((g) => g.summary.includes('playerType'));
  assert.ok(playerGap !== undefined, 'only firstTime completed → four player types unexercised');
  assert.ok(playerGap.summary.includes('expertSpeedrunner'));
});

test('a recurring rejection reason is reported as systemic, not as calibration', () => {
  const reason = 'completable without THE jump — the level does not isolate/test the one-jump constraint (REQ-012)';
  const history: DesignDecision[] = [0, 1, 2].map((i) => ({
    source: 'kill-switch', subject: `lvl-${i}`, verdict: 'fail', summary: 'KILLED', findings: [reason],
  }));
  const proposals = mine({ reports: [], history });
  const p = proposals.find((x) => x.kind === 'recurring-rejection');
  assert.ok(p !== undefined);
  assert.ok(p.summary.includes('3×'));
  assert.equal(p.target, undefined);
  const rare: DesignDecision[] = [history[0]];
  assert.equal(mine({ reports: [], history: rare }).length, 0);
});

test('mining is deterministic and ids are sequential', () => {
  const inputs = { reports: failingCuriosityReports(), history: [], coverage: undefined };
  const a = mine(inputs);
  const b = mine(inputs);
  assert.deepEqual(a, b);
  a.forEach((p, i) => assert.equal(p.id, `cdre-${String(i + 1).padStart(4, '0')}`));
});

test('applying an ACCEPTED threshold proposal yields a NEW, valid profile version', () => {
  const proposal = mine({ reports: failingCuriosityReports() }).find((p) => p.kind === 'threshold-adjustment');
  assert.ok(proposal !== undefined);
  const accepted: CdreProposal = { ...proposal, status: 'ACCEPTED' };

  const result = apply(DEFAULT_PROFILE, accepted);
  assert.ok(result.ok, JSON.stringify(!result.ok ? result.errors : []));
  if (result.ok) {
    assert.equal(result.value.emotional.thresholds.curiosity, 50);
    assert.equal(result.value.profileId, `${DEFAULT_PROFILE.profileId}+${accepted.id}`);
    // Other calibration is carried through untouched.
    assert.equal(result.value.emotional.thresholds.surprise, DEFAULT_PROFILE.emotional.thresholds.surprise);
    assert.deepEqual(result.value.novelty, DEFAULT_PROFILE.novelty);
    // The evolved profile survives its own parser.
    assert.ok(parseProfile(JSON.parse(JSON.stringify(result.value))).ok);
    // Purity: the base profile is untouched.
    assert.equal(DEFAULT_PROFILE.emotional.thresholds.curiosity, 90);
  }
});

test('a PROPOSED or REJECTED proposal is never applied (dm-0033)', () => {
  const base = mine({ reports: failingCuriosityReports() }).find((p) => p.kind === 'threshold-adjustment');
  assert.ok(base !== undefined);
  for (const status of ['PROPOSED', 'REJECTED'] as const) {
    const result = apply(DEFAULT_PROFILE, { ...base, status });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/status'));
  }
  assert.equal(DEFAULT_PROFILE.emotional.thresholds.curiosity, 90);
});

test('non-threshold proposals are not applicable to a profile', () => {
  const gap = mine({ reports: [], coverage: coverageMatrix([]) })[0];
  assert.ok(gap !== undefined && gap.kind === 'coverage-gap');
  const result = apply(DEFAULT_PROFILE, { ...gap, status: 'ACCEPTED' });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/kind'));
});

test('an evolved profile re-gates identically except on the changed metric', () => {
  const proposal = mine({ reports: failingCuriosityReports() }).find((p) => p.kind === 'threshold-adjustment');
  const result = apply(DEFAULT_PROFILE, { ...proposal!, status: 'ACCEPTED' });
  assert.ok(result.ok);
  if (result.ok) {
    const evolved = result.value;
    // A curiosity of 60 fails the base bar (90) and passes the evolved bar (50).
    assert.ok(60 < DEFAULT_PROFILE.emotional.thresholds.curiosity);
    assert.ok(60 >= evolved.emotional.thresholds.curiosity);
    assert.deepEqual(evolved.streamability.thresholds, DEFAULT_PROFILE.streamability.thresholds);
    assert.deepEqual(evolved.infoDensity, DEFAULT_PROFILE.infoDensity);
  }
});
