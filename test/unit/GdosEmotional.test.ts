/**
 * S5.2 — emotional-threshold gate (REQ-055). Estimators are honest proxies
 * over the evidence (delivered, not absolute); the gate passes a bundle above
 * every threshold and rejects one below any. The calibration-external test
 * (dm-0031) scores ONE bundle under two profiles and asserts the verdict flips
 * with the threshold — proving no magic numbers live in the gate.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_PROFILE } from '../../src/eval/gdos/Profile';
import { scoreEmotional, computeEmotionalScores } from '../../src/eval/gdos/Emotional';
import { makeBundle, run, optWindow, profileWith } from '../helpers/GdosFixtures';

/** A bundle whose delivered emotions all clear the REQ-055 thresholds. */
function strongRuns(firstTimeAttempts: number) {
  return [
    run('firstTime', 'completed', firstTimeAttempts, 120),
    run('cautious', 'completed', 3, 140),
    run('experienced', 'completed', 0, 100),
    run('expertSpeedrunner', 'completed', 0, 90),
    run('curiousExplorer', 'completed', 0, 170),
  ];
}

test('a strong level clears all four emotional thresholds', () => {
  const bundle = makeBundle({ runs: strongRuns(1), optimization: optWindow(4) });
  const scores = computeEmotionalScores(bundle, DEFAULT_PROFILE);
  assert.ok(scores.confidence >= 90, `confidence ${scores.confidence}`);
  assert.ok(scores.curiosity >= 90, `curiosity ${scores.curiosity}`);
  assert.ok(scores.surprise >= 95, `surprise ${scores.surprise}`);
  assert.ok(scores.mastery >= 95, `mastery ${scores.mastery}`);
  assert.ok(scoreEmotional(bundle, DEFAULT_PROFILE).pass);
});

test('a first-timer who dies repeatedly fails the confidence threshold', () => {
  const bundle = makeBundle({ runs: strongRuns(6), optimization: optWindow(4) });
  const result = scoreEmotional(bundle, DEFAULT_PROFILE);
  assert.equal(result.pass, false);
  assert.ok(result.scores.find((s) => s.metric === 'confidence')?.pass === false);
});

test('a flat level (no optimization window) fails mastery', () => {
  const bundle = makeBundle({ runs: strongRuns(1), optimization: optWindow(0.1) });
  const result = scoreEmotional(bundle, DEFAULT_PROFILE);
  assert.equal(result.pass, false);
  assert.ok(result.scores.find((s) => s.metric === 'mastery')?.pass === false);
});

test('a level nobody adapts to (no reloads) fails surprise', () => {
  const runs = [
    run('firstTime', 'completed', 0, 120),
    run('experienced', 'completed', 0, 100),
    run('expertSpeedrunner', 'completed', 0, 90),
    run('curiousExplorer', 'completed', 0, 170),
  ];
  const result = scoreEmotional(makeBundle({ runs, optimization: optWindow(4) }), DEFAULT_PROFILE);
  assert.ok(result.scores.find((s) => s.metric === 'surprise')?.pass === false);
});

test('calibration is external: the same bundle flips verdict under a lower threshold (dm-0031)', () => {
  // firstTime dies 4×: confidence = 100 − 4·5 = 80. All other metrics strong.
  const bundle = makeBundle({ runs: strongRuns(4), optimization: optWindow(4) });

  const strict = scoreEmotional(bundle, DEFAULT_PROFILE); // confidence threshold 90 → fail
  assert.equal(strict.pass, false);
  assert.equal(strict.scores.find((s) => s.metric === 'confidence')?.pass, false);

  const lenient = scoreEmotional(bundle, profileWith({ emotional: { confidence: 70 } })); // threshold 70 → pass
  assert.equal(lenient.pass, true);
  assert.equal(lenient.scores.find((s) => s.metric === 'confidence')?.pass, true);

  // The confidence SCORE is identical under both profiles — only the threshold moved.
  assert.equal(
    strict.scores.find((s) => s.metric === 'confidence')?.score,
    lenient.scores.find((s) => s.metric === 'confidence')?.score,
  );
});

test('the gate reports delivered-vs-intended against the authored curve', () => {
  const bundle = makeBundle({ runs: strongRuns(1), optimization: optWindow(4) });
  const result = scoreEmotional(bundle, DEFAULT_PROFILE);
  assert.ok(result.findings.some((f) => f.includes('vs intended peak')));
});

test('the gate emits exactly one decision carrying its verdict', () => {
  const bundle = makeBundle({ runs: strongRuns(1), optimization: optWindow(4) });
  const result = scoreEmotional(bundle, DEFAULT_PROFILE);
  assert.equal(result.decisions.length, 1);
  assert.equal(result.decisions[0].source, 'emotional-threshold');
  assert.equal(result.decisions[0].verdict, 'pass');
});
