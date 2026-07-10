/**
 * S7.7 — the REQ-090 eight-phase manufacturing pipeline (dm-0060/dm-0064) —
 * THE IRD P7 EXIT CONDITION: a fixture concept manufactures end-to-end into a
 * schema-valid level that passes P4 solvability + the S7.2 counterfactual +
 * the P5 gates, emitting a LevelRecord-ready product; a poisoned concept is
 * rejected at the correct phase with a logged reason and no product; and
 * manufactureLevel is deterministic.
 *
 * The acceptance path threads a PERMISSIVE VERIFICATION ScoringProfile (all
 * emotional + streamability thresholds 0) — this proves the MACHINE assembles
 * a product when every phase is satisfied, not that a trivial corridor is
 * shippable. Real content (P10) manufactures under DEFAULT_PROFILE and is
 * expected to be rejected/revised until it genuinely earns its gates; the
 * level-design skill's "don't lower thresholds to ship a weak level" applies
 * to that authoring, not to this pipeline-verification harness.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseLevel } from '../../src/schema/Parse';
import { auditSolvability } from '../../src/eval/local/Solvability';
import { auditJumpRelevance } from '../../src/eval/local/Counterfactual';
import { DEFAULT_EVALUATE_OPTIONS } from '../../src/eval/Evaluate';
import { manufactureLevel, type PipelineOptions, type PipelineProduct } from '../../src/gen/Pipeline';
import { DEFAULT_GEN_PROFILE } from '../../src/gen/GenProfile';
import { advanceStage, createEntry } from '../../src/gen/Lifecycle';
import type { MechanicLifecycleEntry } from '../../src/eval/gdos/DesignMemory';
import { conceptWith, genProfileWith } from '../helpers/GenFixtures';
import { profileWith } from '../helpers/GdosFixtures';

// Permissive verification profile: every gate threshold at 0, so a schema-valid
// level that produces any evidence passes the AI-Council phase (see header).
const PERMISSIVE = profileWith({
  emotional: { curiosity: 0, confidence: 0, surprise: 0, mastery: 0 },
  streamability: { shareability: 0, clipPotential: 0, reactionDensity: 0, replayValue: 0 },
});

function options(overrides: Partial<PipelineOptions> = {}): PipelineOptions {
  return {
    seed: 1,
    evalOptions: { ...DEFAULT_EVALUATE_OPTIONS, profile: PERMISSIVE },
    lifecycle: [],
    corpus: [],
    ...overrides,
  };
}

test('IRD EXIT CONDITION: a concept manufactures end-to-end into an accepted, LevelRecord-ready product', () => {
  const outcome = manufactureLevel(conceptWith({}), options(), DEFAULT_GEN_PROFILE);
  assert.ok('accepted' in outcome, `expected acceptance, got ${JSON.stringify('rejected' in outcome ? outcome.rejected : {})}`);
  const product = (outcome as { accepted: PipelineProduct }).accepted;

  // The product is a real, re-provable level that passes the load-bearing audits.
  assert.ok(parseLevel(JSON.parse(JSON.stringify(product.def))).ok, 'the product level must re-prove through the strict parser');
  assert.equal(auditSolvability(product.def).classification, 'solvable');
  assert.equal(auditJumpRelevance(product.def).classification, 'jump-necessary');
  assert.equal(product.report.pass, true);

  // It carries everything a campaign LevelRecord needs.
  assert.equal(product.concept.intentSentence, product.provenance.intentSentence);
  assert.ok(product.run !== undefined);
  assert.ok(product.mechanicsExercised instanceof Set);
  assert.equal(typeof product.provenance.revisions, 'number');
});

test('poisoned concept — a blocked mechanic — is rejected at the CONCEPT phase (REQ-082)', () => {
  let spring = createEntry('spring');
  const retired = advanceStage(spring, 'Retirement', '2026-07-10', 'exhausted', 'prune');
  assert.ok(retired.ok);
  const lifecycle: MechanicLifecycleEntry[] = retired.ok ? [retired.value] : [];
  const outcome = manufactureLevel(conceptWith({ mechanics: ['spring'] }), options({ lifecycle }), DEFAULT_GEN_PROFILE);
  assert.ok('rejected' in outcome);
  if ('rejected' in outcome) {
    assert.equal(outcome.rejected.phase, 'concept');
    assert.ok(outcome.rejected.findings.some((f) => f.includes('REQ-082')));
  }
});

test('poisoned concept — unbuildable geometry — is rejected at STRUCTURAL-PROTOTYPING', () => {
  const tight = genProfileWith({ profileId: 'tiny', generator: { corridorMinLength: 8, corridorMaxLength: 8 } });
  const crowded = conceptWith({ mechanics: ['iceSurface', 'conveyor', 'pressurePlate', 'gravityZone', 'proximityZone', 'collapsingFloor', 'movingPlatform'] });
  const outcome = manufactureLevel(crowded, options(), tight);
  assert.ok('rejected' in outcome);
  if ('rejected' in outcome) assert.equal(outcome.rejected.phase, 'structural-prototyping');
});

test('poisoned concept — strict gates it cannot meet — is rejected at AI-COUNCIL after exhausting revision', () => {
  // DEFAULT_PROFILE thresholds (90–95) are unreachable for a trivial corridor;
  // no revision fixes streamability, so the pipeline honestly rejects at the council.
  const strict = options({ evalOptions: { ...DEFAULT_EVALUATE_OPTIONS } });
  const outcome = manufactureLevel(conceptWith({}), strict, DEFAULT_GEN_PROFILE);
  assert.ok('rejected' in outcome);
  if ('rejected' in outcome) {
    assert.equal(outcome.rejected.phase, 'ai-council');
    assert.ok(outcome.rejected.reason.includes('revision'));
    assert.ok(outcome.rejected.findings.length > 0);
  }
});

test('poisoned concept — no rigorous lesson — is rejected at SIGN-OFF, not earlier', () => {
  // A non-empty but lesson-free sentence passes concept validation (phase 1)
  // and every gate, then dies at the intent gate (phase 7).
  const outcome = manufactureLevel(
    conceptWith({ intentSentence: 'The player jumps across the central pit to the platform.' }),
    options(),
    DEFAULT_GEN_PROFILE,
  );
  assert.ok('rejected' in outcome);
  if ('rejected' in outcome) {
    assert.equal(outcome.rejected.phase, 'sign-off');
    assert.ok(outcome.rejected.reason.includes('REQ-091'));
  }
});

test('a rejection persists no product — deletion means only the rejection record survives', () => {
  const outcome = manufactureLevel(conceptWith({ intentSentence: '' }), options(), DEFAULT_GEN_PROFILE);
  assert.ok('rejected' in outcome);
  assert.ok(!('accepted' in outcome));
});

test('manufactureLevel is deterministic: same inputs, identical outcome', () => {
  assert.deepEqual(
    manufactureLevel(conceptWith({}), options(), DEFAULT_GEN_PROFILE),
    manufactureLevel(conceptWith({}), options(), DEFAULT_GEN_PROFILE),
  );
});
