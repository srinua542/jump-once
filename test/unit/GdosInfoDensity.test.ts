/**
 * S5.4 — Information Density regulator (REQ-061) + failure-visibility fairness
 * (REQ-016 P5 share; dm-0035). The "screen" is the profile viewport slid over
 * the level: too many elements in one window is overwhelm, a global peak below
 * the floor is boring. The same window is the fairness primitive — a death
 * whose killer was off-screen the moment before impact is an unfair kill.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { DeathEvent } from '../../src/eval/gdos/Evidence';
import { DEFAULT_PROFILE } from '../../src/eval/gdos/Profile';
import { scoreInfoDensity } from '../../src/eval/gdos/InfoDensity';
import { makeLevel, makeBundle, profileWith } from '../helpers/GdosFixtures';

function manyEntities(n: number) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ kind: 'spike', x: i + 1, y: 4 });
  return out;
}

test('a screen packed past the max reads as overwhelm', () => {
  const def = makeLevel({ id: 'overwhelm', width: 12, height: 6, entities: manyEntities(10) });
  const result = scoreInfoDensity(makeBundle({ def }), DEFAULT_PROFILE);
  assert.equal(result.pass, false);
  assert.ok(result.findings.some((f) => f.startsWith('overwhelm')));
  assert.equal(result.scores.find((s) => s.metric === 'peakScreenDensity')?.pass, false);
});

test('a level below the density floor reads as boring', () => {
  const def = makeLevel({ id: 'boring', width: 12, height: 6, entities: [] });
  // Default floor is 1 and the goal always counts, so raise the floor to force boring.
  const result = scoreInfoDensity(makeBundle({ def }), profileWith({ infoDensity: { minElementsPerScreen: 5 } }));
  assert.equal(result.pass, false);
  assert.ok(result.findings.some((f) => f.startsWith('boring')));
});

test('a level in the density band with no deaths passes cleanly', () => {
  const def = makeLevel({ id: 'inband', width: 12, height: 6, entities: manyEntities(3) });
  const result = scoreInfoDensity(makeBundle({ def }), DEFAULT_PROFILE);
  assert.ok(result.pass, JSON.stringify(result.findings));
});

test('a kill by an off-screen hazard fails the fairness check (REQ-016)', () => {
  const def = makeLevel({ id: 'invisible', width: 40, height: 6, entities: [{ kind: 'spike', x: 5, y: 4 }, { kind: 'spike', x: 20, y: 4 }] });
  const invisible: DeathEvent = {
    tick: 100,
    playerPosition: { x: 5, y: 4 },
    killerId: 'spike-0',
    killerKind: 'spike',
    playerPositionAtLookback: { x: 5, y: 4 },
    killerPositionAtLookback: { x: 30, y: 4 }, // 25 tiles away — off-screen (viewport half-width 8)
  };
  const result = scoreInfoDensity(makeBundle({ def, deaths: [invisible] }), DEFAULT_PROFILE);
  assert.equal(result.pass, false);
  assert.equal(result.scores.find((s) => s.metric === 'failureVisibility')?.pass, false);
  assert.ok(result.findings.some((f) => f.includes('off-screen')));
});

test('a kill by a visible hazard is fair', () => {
  const def = makeLevel({ id: 'visible', width: 40, height: 6, entities: [{ kind: 'spike', x: 5, y: 4 }] });
  const visible: DeathEvent = {
    tick: 100,
    playerPosition: { x: 5, y: 4 },
    killerId: 'spike-0',
    killerKind: 'spike',
    playerPositionAtLookback: { x: 4, y: 4 },
    killerPositionAtLookback: { x: 6, y: 4 }, // 2 tiles away — on-screen
  };
  const result = scoreInfoDensity(makeBundle({ def, deaths: [visible] }), DEFAULT_PROFILE);
  assert.ok(result.pass);
  assert.equal(result.scores.find((s) => s.metric === 'failureVisibility')?.pass, true);
});

test('a fall (no attributable killer) is fair by default', () => {
  const def = makeLevel({ id: 'fall', width: 12, height: 6, entities: manyEntities(3) });
  const fall: DeathEvent = {
    tick: 50,
    playerPosition: { x: 5, y: 5 },
    playerPositionAtLookback: { x: 5, y: 4 },
  };
  const result = scoreInfoDensity(makeBundle({ def, deaths: [fall] }), DEFAULT_PROFILE);
  assert.equal(result.scores.find((s) => s.metric === 'failureVisibility')?.pass, true);
});

test('calibration is external: shrinking the viewport turns a fair kill unfair (dm-0031)', () => {
  const def = makeLevel({ id: 'viewport', width: 40, height: 6, entities: [{ kind: 'spike', x: 5, y: 4 }] });
  const death: DeathEvent = {
    tick: 100,
    playerPosition: { x: 5, y: 4 },
    killerId: 'spike-0',
    killerKind: 'spike',
    playerPositionAtLookback: { x: 5, y: 4 },
    killerPositionAtLookback: { x: 11, y: 4 }, // 6 tiles away
  };
  const wide = scoreInfoDensity(makeBundle({ def, deaths: [death] }), DEFAULT_PROFILE); // half-width 8 → fair
  const narrow = scoreInfoDensity(makeBundle({ def, deaths: [death] }), profileWith({ infoDensity: { viewportTilesX: 4 } })); // half-width 2 → unfair
  assert.equal(wide.scores.find((s) => s.metric === 'failureVisibility')?.pass, true);
  assert.equal(narrow.scores.find((s) => s.metric === 'failureVisibility')?.pass, false);
});
