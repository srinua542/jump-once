/**
 * S5.1–S5.4 — the end-to-end evidence seam. evaluateLevel runs the P4 audits +
 * archetypes ONCE, assembles the EvidenceBundle, and judges the level. Proves
 * the real assembler path (not just hand-built bundles) and its determinism.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildGridLevel } from '../helpers/GridLevel';
import { assembleLevelEvidence, evaluateLevel, DEFAULT_EVALUATE_OPTIONS } from '../../src/eval/Evaluate';

// A walkable corridor: spawn left, goal right, solid floor. Solvable by walking.
const CORRIDOR = buildGridLevel('s5-corridor', [
  '##########',
  '#S......G#',
  '##########',
]);

// A corridor with a spike in the path — the reactive archetypes die into it.
const DEADLY = buildGridLevel('s5-deadly', [
  '############',
  '#S...x....G#',
  '############',
]);

test('evaluateLevel produces a report with the three S5.2–S5.4 gates', () => {
  const { report } = evaluateLevel(CORRIDOR);
  const gateNames = report.gates.map((g) => g.gate).sort();
  assert.deepEqual(gateNames, ['emotional-threshold', 'info-density', 'streamability']);
  assert.equal(report.profileId, DEFAULT_EVALUATE_OPTIONS.profile.profileId);
});

test('the assembler runs every archetype and records lookback provenance', () => {
  const evidence = assembleLevelEvidence(CORRIDOR);
  assert.equal(evidence.runs.length, 5);
  assert.equal(evidence.lookbackTicks, DEFAULT_EVALUATE_OPTIONS.profile.infoDensity.fairnessLookbackTicks);
  assert.ok(evidence.solvability.classification === 'solvable');
});

test('a deadly corridor produces observed deaths with attribution', () => {
  const evidence = assembleLevelEvidence(DEADLY);
  assert.ok(evidence.deaths.length > 0, 'expected the reactive archetypes to die into the spike');
  // At least one death is attributed to the spike within the fairness radius.
  assert.ok(evidence.deaths.some((d) => d.killerKind === 'spike'));
});

test('evaluateLevel is deterministic: identical report across two runs', () => {
  const a = evaluateLevel(DEADLY);
  const b = evaluateLevel(DEADLY);
  assert.deepEqual(a.report, b.report);
  assert.deepEqual(a.evidence.deaths, b.evidence.deaths);
});
