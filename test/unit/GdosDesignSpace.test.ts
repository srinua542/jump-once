/**
 * S5.1 — design-space matrix (REQ-040/041) + Economy of Mechanics (REQ-042).
 * Axes are DERIVED from the sim registries (dm-0034), so they can never drift;
 * coverage is the union of exercised cells; economy = depth ÷ mechanic count.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ENTITY_KINDS } from '../../src/components/Behavior';
import { ARCHETYPES } from '../../src/eval/Archetypes';
import {
  EMOTION_ARC,
  ENVIRONMENT_MODIFIER_KINDS,
  MECHANIC_AXIS,
  OPTIMIZATION_STYLE_AXIS,
  PLAYER_TYPE_AXIS,
  coverageMatrix,
  extractCoverage,
} from '../../src/eval/gdos/DesignSpace';
import { economyOfMechanics, preferByEconomy, deepestMechanic } from '../../src/eval/gdos/Economy';
import { makeLevel, makeBundle, run, optWindow, optInapplicable } from '../helpers/GdosFixtures';

test('mechanic axis IS the entity-kind registry (no drift)', () => {
  assert.deepEqual([...MECHANIC_AXIS], [...ENTITY_KINDS]);
});

test('player-type axis IS the archetype registry keys', () => {
  assert.deepEqual([...PLAYER_TYPE_AXIS].sort(), Object.keys(ARCHETYPES).sort());
});

test('every environment modifier kind is a real entity kind (lockstep)', () => {
  for (const k of ENVIRONMENT_MODIFIER_KINDS) assert.ok((ENTITY_KINDS as readonly string[]).includes(k), `${k} not an entity kind`);
});

test('the emotion axis is the six-phase arc (REQ-015)', () => {
  assert.deepEqual([...EMOTION_ARC], ['curiosity', 'confidence', 'surpriseBetrayal', 'realization', 'mastery', 'renewedUncertainty']);
});

test('the optimization-style axis is the five tiers (REQ-101)', () => {
  assert.deepEqual([...OPTIMIZATION_STYLE_AXIS], ['discovery', 'good', 'fast', 'expert', 'worldRecord']);
});

test('a level with an ice surface exercises the ice environment cell', () => {
  const def = makeLevel({ id: 'ice', entities: [{ kind: 'iceSurface', x: 3, y: 4 }] });
  const bundle = makeBundle({
    def,
    runs: [run('firstTime', 'completed', 1, 100, def.levelId), run('expertSpeedrunner', 'completed', 0, 60, def.levelId)],
    optimization: optWindow(4),
  });
  const cells = extractCoverage(bundle);
  assert.ok(cells.size > 0);
  assert.ok([...cells].some((c) => c.includes('iceSurface')));
});

test('a modifier-free level occupies the baseline environment', () => {
  const def = makeLevel({ id: 'plain', entities: [{ kind: 'spike', x: 3, y: 4 }] });
  const bundle = makeBundle({ def, runs: [run('firstTime', 'completed', 0, 80, def.levelId)] });
  const cells = extractCoverage(bundle);
  assert.ok([...cells].some((c) => c.includes('|baseline|')));
});

test('a level nobody completes exercises no player-type cells', () => {
  const def = makeLevel({ id: 'unbeaten', entities: [{ kind: 'spike', x: 3, y: 4 }] });
  const bundle = makeBundle({ def, runs: [run('firstTime', 'timeout', 25, 3600, def.levelId)], optimization: optInapplicable() });
  assert.equal(extractCoverage(bundle).size, 0);
});

test('coverage is the union across a level set, with per-axis marginals', () => {
  const a = makeBundle({
    def: makeLevel({ id: 'a', entities: [{ kind: 'spring', x: 3, y: 4 }] }),
    runs: [run('firstTime', 'completed', 1, 100, 'a')],
    optimization: optWindow(4),
  });
  const b = makeBundle({
    def: makeLevel({ id: 'b', entities: [{ kind: 'conveyor', x: 3, y: 4 }] }),
    runs: [run('expertSpeedrunner', 'completed', 0, 60, 'b')],
    optimization: optWindow(4),
  });
  const matrix = coverageMatrix([a, b]);
  assert.ok(matrix.mechanicsCovered.includes('spring'));
  assert.ok(matrix.mechanicsCovered.includes('conveyor'));
  assert.ok(matrix.playerTypesCovered.includes('firstTime'));
  assert.ok(matrix.playerTypesCovered.includes('expertSpeedrunner'));
  assert.equal(matrix.totalCells, matrix.cells.size);
});

test('economy = distinct cells ÷ mechanic count, and deepening beats adding (REQ-042)', () => {
  // Deepen: one mechanic used across two environments (more cells per mechanic).
  const deep1 = makeBundle({
    def: makeLevel({ id: 'd1', entities: [{ kind: 'spring', x: 3, y: 4 }, { kind: 'iceSurface', x: 5, y: 4 }] }),
    runs: [run('firstTime', 'completed', 1, 100, 'd1'), run('expertSpeedrunner', 'completed', 0, 60, 'd1')],
    optimization: optWindow(4),
  });
  const deepen = coverageMatrix([deep1]);

  // Add mechanic: two mechanics, each shallow (baseline only).
  const add1 = makeBundle({
    def: makeLevel({ id: 'm1', entities: [{ kind: 'spring', x: 3, y: 4 }] }),
    runs: [run('firstTime', 'completed', 1, 100, 'm1')],
    optimization: optWindow(4),
  });
  const add2 = makeBundle({
    def: makeLevel({ id: 'm2', entities: [{ kind: 'door', x: 3, y: 4 }] }),
    runs: [run('firstTime', 'completed', 1, 100, 'm2')],
    optimization: optWindow(4),
  });
  const added = coverageMatrix([add1, add2]);

  const eDeep = economyOfMechanics(deepen);
  const eAdd = economyOfMechanics(added);
  assert.equal(eDeep.economy, eDeep.totalDepth / eDeep.mechanicCount);
  assert.ok(eDeep.economy > eAdd.economy, `deepening economy ${eDeep.economy} should beat adding ${eAdd.economy}`);

  const cmp = preferByEconomy(deepen, added);
  assert.equal(cmp.winner, 'deepen');
  assert.ok(deepestMechanic(eDeep) !== undefined);
});

test('economy is 0 when nothing is covered', () => {
  const empty = coverageMatrix([]);
  assert.equal(economyOfMechanics(empty).economy, 0);
});
