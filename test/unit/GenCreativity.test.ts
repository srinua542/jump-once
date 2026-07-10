/**
 * S7.5 — the REQ-081 creativity & iteration loop (dm-0062; REQ-053 applied):
 * evolveLevel generates → varies → GDOS-evaluates → compares to memory →
 * selects → repeats to diminishing returns; the best score is monotone, the
 * loop halts by epsilon or hard cap, a clone loses to a divergent variant on
 * novelty, budgets/weights are GenProfile calibration, and the run is
 * deterministic.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evolveLevel, type EvolutionResult } from '../../src/gen/Creativity';
import { buildDescriptor, type NoveltyDescriptor } from '../../src/eval/gdos/Novelty';
import { assembleLevelEvidence } from '../../src/eval/Evaluate';
import { generateCandidate } from '../../src/gen/Generator';
import { conceptWith, genProfileWith } from '../helpers/GenFixtures';

// Small loop budgets keep the suite fast: each candidate runs the full P5 seam.
const FAST = genProfileWith({ profileId: 'fast-loop', creativity: { variationsPerGeneration: 2, hardCapGenerations: 3 } });

function mustEvolve(profile = FAST, corpus: readonly NoveltyDescriptor[] = [], seed = 1): EvolutionResult {
  const r = evolveLevel(conceptWith({}), corpus, seed, profile);
  assert.ok(r.ok, `evolveLevel failed: ${r.ok ? '' : r.reason}`);
  return (r as { ok: true; value: EvolutionResult }).value;
}

test('the best selection score is monotone non-decreasing across generations', () => {
  const result = mustEvolve();
  for (let i = 1; i < result.bestScoreHistory.length; i++) {
    assert.ok(result.bestScoreHistory[i] >= result.bestScoreHistory[i - 1] - 1e-12, `score dropped at gen ${i}: ${result.bestScoreHistory.join(', ')}`);
  }
  assert.ok(result.evaluated >= 1);
});

test('epsilon 0 runs to the hard cap; a large epsilon converges immediately', () => {
  const hardCap = genProfileWith({ profileId: 'to-cap', creativity: { variationsPerGeneration: 2, hardCapGenerations: 3, diminishingReturnsEpsilon: 0 } });
  const capped = mustEvolve(hardCap);
  assert.equal(capped.termination, 'hard-cap');
  assert.equal(capped.generations, 3);

  const eager = genProfileWith({ profileId: 'eager', creativity: { variationsPerGeneration: 2, hardCapGenerations: 3, diminishingReturnsEpsilon: 1 } });
  const converged = mustEvolve(eager);
  assert.equal(converged.termination, 'converged');
  assert.equal(converged.generations, 1); // first generation cannot improve by ≥1 on a [0,1] score
});

test('novelty is measured against the corpus: a clone of a corpus member is penalized', () => {
  // Build the exact descriptor the seed candidate produces, seed the corpus with it.
  const seedCandidate = generateCandidate(conceptWith({}), 1, FAST);
  assert.ok(seedCandidate.ok);
  if (!seedCandidate.ok) return;
  const selfDescriptor = buildDescriptor(assembleLevelEvidence(seedCandidate.candidate.def));

  const noveltyOnly = genProfileWith({
    profileId: 'novelty-only',
    creativity: { variationsPerGeneration: 2, hardCapGenerations: 2, selectionWeights: { gatePass: 0, gateScore: 0, novelty: 1 } },
  });
  const againstEmpty = mustEvolve(noveltyOnly, []);
  const againstSelf = mustEvolve(noveltyOnly, [selfDescriptor]);
  // Against an empty corpus the seed is maximally novel (1.0); against its own
  // descriptor its divergence is 0, so the loop must diverge AWAY to score at all.
  assert.equal(againstEmpty.bestScoreHistory[0], 1);
  assert.ok(againstSelf.bestScoreHistory[0] < 1, 'a clone of the sole corpus member should not score maximally novel');
});

test('two-profile: selection weights change which candidate wins', () => {
  const passWeighted = genProfileWith({ profileId: 'pass-w', creativity: { variationsPerGeneration: 3, hardCapGenerations: 2, selectionWeights: { gatePass: 1, gateScore: 0, novelty: 0 } } });
  const noveltyWeighted = genProfileWith({ profileId: 'nov-w', creativity: { variationsPerGeneration: 3, hardCapGenerations: 2, selectionWeights: { gatePass: 0, gateScore: 0, novelty: 1 } } });
  const a = mustEvolve(passWeighted);
  const b = mustEvolve(noveltyWeighted);
  // Pass-weighted score is the passed-gate fraction; novelty-weighted is the
  // divergence — different composites, so the winning candidates differ in score.
  assert.notEqual(a.best.score, b.best.score);
});

test('an unbuildable seed concept fails honestly, never silently returns nothing', () => {
  const tight = genProfileWith({ profileId: 'tiny', generator: { corridorMinLength: 8, corridorMaxLength: 8 } });
  const crowded = conceptWith({ mechanics: ['iceSurface', 'conveyor', 'pressurePlate', 'gravityZone', 'proximityZone', 'collapsingFloor', 'movingPlatform'] });
  const r = evolveLevel(crowded, [], 1, tight);
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.reason.includes('corridor'));
});

test('the loop is deterministic: same inputs, identical EvolutionResult', () => {
  assert.deepEqual(mustEvolve(FAST, [], 7), mustEvolve(FAST, [], 7));
});
