/**
 * S5.3 — streamability-matrix gate (REQ-056). Proxies over the evidence:
 * reaction density (events/sec), clip potential (surprise × kinetic moments),
 * replay value (delta + route multiplicity), and their weighted composite,
 * Shareability. A rich level clears the matrix; a bare corridor does not.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_PROFILE } from '../../src/eval/gdos/Profile';
import { scoreStreamability } from '../../src/eval/gdos/Streamability';
import { makeLevel, makeBundle, run, optWindow, optInapplicable, profileWith } from '../helpers/GdosFixtures';

/** A clippable level: four springs (kinetic) + two spikes (hazard). */
function richLevel() {
  return makeLevel({
    id: 'streamy',
    entities: [
      { kind: 'spring', x: 1, y: 4 },
      { kind: 'spring', x: 3, y: 4 },
      { kind: 'spring', x: 5, y: 4 },
      { kind: 'spring', x: 7, y: 4 },
      { kind: 'spike', x: 2, y: 4 },
      { kind: 'spike', x: 6, y: 4 },
    ],
  });
}

function richRuns(id: string) {
  return [
    run('firstTime', 'completed', 3, 120, id),
    run('cautious', 'completed', 3, 100, id),
    run('experienced', 'completed', 0, 80, id),
    run('expertSpeedrunner', 'completed', 0, 60, id),
    run('curiousExplorer', 'completed', 0, 150, id),
  ];
}

test('a rich, deadly, replayable level clears the streamability matrix', () => {
  const def = richLevel();
  const bundle = makeBundle({ def, runs: richRuns(def.levelId), optimization: optWindow(4) });
  const result = scoreStreamability(bundle, DEFAULT_PROFILE);
  for (const s of result.scores) assert.ok(s.pass, `${s.metric} ${s.score} < ${s.threshold}`);
  assert.ok(result.pass);
});

test('a bare corridor fails every streamability metric', () => {
  const def = makeLevel({ id: 'bare', entities: [] });
  const bundle = makeBundle({
    def,
    runs: [run('firstTime', 'completed', 0, 600, def.levelId)],
    optimization: optInapplicable(),
  });
  const result = scoreStreamability(bundle, DEFAULT_PROFILE);
  assert.equal(result.pass, false);
  assert.ok(result.scores.find((s) => s.metric === 'reactionDensity')?.pass === false);
  assert.ok(result.scores.find((s) => s.metric === 'clipPotential')?.pass === false);
});

test('calibration is external: lowering the thresholds passes a modest level (dm-0031)', () => {
  const def = makeLevel({ id: 'modest', entities: [{ kind: 'spring', x: 3, y: 4 }, { kind: 'spike', x: 5, y: 4 }] });
  const bundle = makeBundle({
    def,
    runs: [run('firstTime', 'completed', 1, 120, def.levelId), run('expertSpeedrunner', 'completed', 0, 90, def.levelId)],
    optimization: optWindow(2),
  });
  const strict = scoreStreamability(bundle, DEFAULT_PROFILE);
  const lenient = scoreStreamability(bundle, profileWith({ streamability: { shareability: 10, clipPotential: 10, reactionDensity: 10, replayValue: 10 } }));
  assert.equal(lenient.pass, true);
  // Scores identical under both; only the bar moved.
  for (const s of strict.scores) {
    const other = lenient.scores.find((o) => o.metric === s.metric);
    assert.equal(s.score, other?.score);
  }
});

test('the gate emits a streamability decision', () => {
  const def = richLevel();
  const result = scoreStreamability(makeBundle({ def, runs: richRuns(def.levelId), optimization: optWindow(4) }), DEFAULT_PROFILE);
  assert.equal(result.decisions[0].source, 'streamability');
});
