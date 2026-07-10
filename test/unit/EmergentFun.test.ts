/**
 * S5.5 — emergent-fun discovery (REQ-054; dm-0037 placement). The probe walks
 * the bounded reachable state space and flags kinetic anchors: states whose
 * velocity escapes the plain-movement envelope (|vx| beyond running, upward
 * beyond THE jump). A strong spring is flagged and attributed; a flat corridor
 * yields nothing; results are deterministic and replayable.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseLevel } from '../../src/schema/Parse';
import type { LevelDefinition } from '../../src/components/Level';
import { buildGridLevel } from '../helpers/GridLevel';
import { replayTape } from '../../src/eval/AgentHarness';
import { DEFAULT_EMERGENT_FUN_OPTIONS, probeEmergentFun } from '../../src/eval/EmergentFun';

/** A closed 12×12 box: player spawns above a strong sideways spring. */
function springLevel(): LevelDefinition {
  const width = 12;
  const height = 12;
  const tiles: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const border = row === 0 || row === height - 1 || col === 0 || col === width - 1;
      tiles.push(border ? 1 : 0);
    }
  }
  const raw = {
    schemaVersion: 1,
    levelId: 's55-spring',
    title: 'P5 scaffolding: s55-spring',
    gdos: {
      targetKgNode: 'kg:test/s55-spring',
      difficultyVectors: { executionPrecision: 0, readingComplexity: 0, timingStrictness: 0, routeAmbiguity: 0 },
      emotionalBudgetCurve: [
        { at: 0, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
        { at: 1, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
      ],
      creatorMomentFrame: { tickWindow: [0, 1], description: 'n/a (unit fixture)' },
    },
    tilemap: { width, height, tileSize: 1, tiles },
    entities: [
      {
        id: 'launcher',
        transform: { position: { x: 2.5, y: 9.5 }, facing: 1 },
        collider: { halfExtents: { x: 0.5, y: 0.5 }, offset: { x: 0, y: 0 } },
        // vx 20 ≫ runSpeed 8 × 1.25 — an unmistakable horizontal-envelope escape.
        behavior: { kind: 'spring', launchVelocity: { x: 20, y: -6 } },
      },
    ],
    triggers: [],
    constraints: {
      spawn: { x: 2.5, y: 7.5 },
      goal: { position: { x: 9.5, y: 9.5 }, halfExtents: { x: 0.5, y: 0.5 } },
      parTimeTiersSeconds: [30, 10],
    },
  };
  const result = parseLevel(raw);
  if (!result.ok) throw new Error(`s55-spring failed the schema gate: ${JSON.stringify(result.errors)}`);
  return result.value;
}

// A sealed walkable corridor: nothing kinetic, nothing to flag.
const CORRIDOR = buildGridLevel('s55-corridor', [
  '##########',
  '#S......G#',
  '##########',
]);

test('a strong spring produces at least one attributed kinetic anchor', () => {
  const report = probeEmergentFun(springLevel());
  assert.ok(report.anchors.length > 0, 'expected the spring launch to be flagged');
  const attributed = report.anchors.find((a) => a.sourceId === 'launcher');
  assert.ok(attributed !== undefined, 'expected an anchor attributed to the spring');
  assert.equal(attributed.sourceKind, 'spring');
  assert.equal(attributed.axis, 'horizontal');
});

test('a flat corridor yields no anchors (running and THE jump are not emergence)', () => {
  const report = probeEmergentFun(CORRIDOR);
  assert.equal(report.anchors.length, 0, JSON.stringify(report.anchors));
});

test('anchor frames replay to a state with the flagged velocity (evidence is real)', () => {
  const def = springLevel();
  const report = probeEmergentFun(def);
  const anchor = report.anchors.find((a) => a.sourceId === 'launcher');
  assert.ok(anchor !== undefined);
  const state = replayTape(def, DEFAULT_EMERGENT_FUN_OPTIONS.seed, anchor.frames);
  assert.deepEqual(state.world.playerVelocity, anchor.velocity);
  assert.deepEqual(state.world.playerPosition, anchor.position);
});

test('the probe is deterministic: identical report across two runs', () => {
  const def = springLevel();
  assert.deepEqual(probeEmergentFun(def), probeEmergentFun(def));
});
