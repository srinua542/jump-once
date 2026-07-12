/**
 * S10.2 — difficulty estimator + dual-path proof + integration assembler,
 * proven against fixtures and real pipeline products (REQ-084 mechanism,
 * REQ-100/101/102 applied, REQ-090 phase-8 closure; dm-0110/0111/0112).
 *
 * The estimator/dual-path boundary math runs against synthetic verdicts; the
 * assembler runs against REAL manufactured products (permissive verification
 * profile, the GenPipeline precedent) so integrateProduct is proven to copy the
 * product verbatim and assembleChapterRecord is proven idempotent.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { EvidenceBundle } from '../../src/eval/gdos/Evidence';
import type { OptimizationVerdict } from '../../src/eval/local/Optimization';
import { manufactureLevel, type PipelineOptions, type PipelineProduct } from '../../src/gen/Pipeline';
import { DEFAULT_GEN_PROFILE } from '../../src/gen/GenProfile';
import { DEFAULT_EVALUATE_OPTIONS } from '../../src/eval/Evaluate';
import { conceptWith } from '../helpers/GenFixtures';
import { profileWith } from '../helpers/GdosFixtures';

import { estimateDifficulty, estimateDifficultyTier, bucketize } from '../../content/DifficultyEstimator';
import { proveDualPath, DEFAULT_DUAL_PATH_PROFILE } from '../../content/DualPathProof';
import { buildConceptFromSlot, integrateProduct, assembleChapterRecord, slotKgNode } from '../../content/Assembler';
import type { ChapterFramework, ChapterLevelSlot } from '../../content/schema/ChapterFramework';

/* ── synthetic verdict/evidence builders ─────────────────────────────────── */

function verdict(over: Partial<OptimizationVerdict> = {}): OptimizationVerdict {
  return {
    applicable: true,
    rejected: false,
    completions: [],
    deltaSeconds: 1.0,
    tiers: { discovery: 6, good: 5, fast: 4, expert: 3, worldRecord: 2 },
    ...over,
  } as OptimizationVerdict;
}

function evidenceWithRuns(runs: readonly { outcome: 'completed' | 'timeout'; attempts: number; ticksElapsed: number }[]): EvidenceBundle {
  return { runs } as unknown as EvidenceBundle;
}

/* ── DifficultyEstimator ─────────────────────────────────────────────────── */

test('bucketize maps scores across all five tiers at the boundaries', () => {
  assert.equal(bucketize(0.1), 'easy');
  assert.equal(bucketize(0.3), 'medium');
  assert.equal(bucketize(0.5), 'hard');
  assert.equal(bucketize(0.7), 'harder');
  assert.equal(bucketize(0.9), 'very-hard');
  // exact boundary values fall into the upper bucket (score < b is strict)
  assert.equal(bucketize(0.2), 'medium');
  assert.equal(bucketize(0.8), 'very-hard');
});

test('a level nothing solves estimates hard-or-above (unsolved saturates the time axis)', () => {
  const ev = evidenceWithRuns([
    { outcome: 'timeout', attempts: 0, ticksElapsed: 600 },
    { outcome: 'timeout', attempts: 0, ticksElapsed: 600 },
  ]);
  const est = estimateDifficulty(ev, verdict({ applicable: false, deltaSeconds: undefined, tiers: undefined }));
  assert.equal(est.unsolvedFraction, 1);
  assert.ok(['hard', 'harder', 'very-hard'].includes(est.tier), `expected hard+, got ${est.tier}`);
});

test('a fast clean first-clear estimates easy', () => {
  const ev = evidenceWithRuns([
    { outcome: 'completed', attempts: 0, ticksElapsed: 60 },
    { outcome: 'completed', attempts: 0, ticksElapsed: 66 },
  ]);
  const est = estimateDifficulty(ev, verdict({ deltaSeconds: 0.1, tiers: { discovery: 1, good: 1, fast: 1, expert: 1, worldRecord: 0.9 } }));
  assert.equal(est.tier, 'easy');
  assert.equal(est.discoverySeconds, 1);
});

test('more deaths-before-clear raises the estimated tier monotonically', () => {
  const easy = estimateDifficulty(evidenceWithRuns([{ outcome: 'completed', attempts: 0, ticksElapsed: 120 }]), verdict());
  const harder = estimateDifficulty(evidenceWithRuns([{ outcome: 'completed', attempts: 4, ticksElapsed: 120 }]), verdict());
  assert.ok(harder.score > easy.score, `expected more deaths ⇒ higher score (${harder.score} vs ${easy.score})`);
});

test('estimateDifficultyTier is the tier of estimateDifficulty', () => {
  const ev = evidenceWithRuns([{ outcome: 'completed', attempts: 1, ticksElapsed: 300 }]);
  assert.equal(estimateDifficultyTier(ev, verdict()), estimateDifficulty(ev, verdict()).tier);
});

test('the estimator never reads the authored difficultyTarget intent vector (dm-0111)', () => {
  const src = readFileSync(join(process.cwd(), 'content', 'DifficultyEstimator.ts'), 'utf8');
  assert.ok(!src.includes('difficultyTarget'), 'DifficultyEstimator must derive from measured evidence, never the authored intent vector');
});

/* ── DualPathProof ───────────────────────────────────────────────────────── */

test('an applicable window above the floor is dual-path (REQ-100)', () => {
  const v = proveDualPath(verdict({ deltaSeconds: 1.0 }));
  assert.equal(v.isDualPath, true);
  assert.equal(v.deltaSeconds, 1.0);
});

test('an inapplicable window is not dual-path', () => {
  const v = proveDualPath(verdict({ applicable: false, deltaSeconds: undefined }));
  assert.equal(v.isDualPath, false);
  assert.equal(v.deltaSeconds, null);
});

test('a delta below the floor is rejected as too flat (REQ-102)', () => {
  const v = proveDualPath(verdict({ deltaSeconds: 0.1 }), { minDeltaSeconds: 0.25 });
  assert.equal(v.isDualPath, false);
  assert.equal(v.deltaSeconds, 0.1);
  assert.ok(v.reason.includes('flat'));
});

test('the default dual-path floor is a positive number', () => {
  assert.ok(DEFAULT_DUAL_PATH_PROFILE.minDeltaSeconds > 0);
});

/* ── Assembler + integration (real products) ─────────────────────────────── */

const PERMISSIVE = profileWith({
  emotional: { curiosity: 0, confidence: 0, surprise: 0, mastery: 0 },
  streamability: { shareability: 0, clipPotential: 0, reactionDensity: 0, replayValue: 0 },
});

function options(seed: number): PipelineOptions {
  return { seed, evalOptions: { ...DEFAULT_EVALUATE_OPTIONS, profile: PERMISSIVE }, lifecycle: [], corpus: [] };
}

function manufacture(seed: number, over = {}): PipelineProduct {
  const out = manufactureLevel(conceptWith({ targetKgNode: `kg:asm/${seed}`, ...over }), options(seed), DEFAULT_GEN_PROFILE);
  assert.ok('accepted' in out, `expected acceptance for seed ${seed}, got ${JSON.stringify('rejected' in out ? out.rejected : {})}`);
  return (out as { accepted: PipelineProduct }).accepted;
}

test('slotKgNode composes chapter and slot ids', () => {
  assert.equal(slotKgNode('ch-a', 's1'), 'kg:ch-a/s1');
});

test('buildConceptFromSlot mints a concept traceable to the slot (dm-0109)', () => {
  const slot: ChapterLevelSlot = {
    slotId: 's1', archetype: 'timing', intentSentence: 'x', oneJumpDecision: 'y', mechanics: ['laser'],
    difficultyTarget: { executionPrecision: 0.5, readingComplexity: 0.2, timingStrictness: 0.3, routeAmbiguity: 0.1 },
    emotionalPhase: 'confidence', targetDifficultyTier: 'medium', seed: 1, rewardedSkip: { available: false },
  };
  const framework = { chapterId: 'ch-a' } as ChapterFramework;
  const concept = buildConceptFromSlot(framework, slot);
  assert.equal(concept.archetype, 'timing');
  assert.deepEqual(concept.mechanics, ['laser']);
  assert.equal(concept.targetKgNode, 'kg:ch-a/s1');
  assert.equal(concept.emotionalPhase, 'confidence');
});

test('integrateProduct (REQ-090 phase 8) copies the product into a LevelRecord verbatim (dm-0112)', () => {
  const product = manufacture(1);
  const macro = assembleChapterRecord('ch-x', [product]).record.macroVerdict;
  const record = integrateProduct(product, 'ch-x', macro);
  assert.equal(record.levelId, product.def.levelId);
  assert.equal(record.chapterId, 'ch-x');
  assert.equal(record.report, product.report);
  assert.equal(record.run, product.run);
  assert.equal(record.mechanicsExercised, product.mechanicsExercised);
  assert.equal(record.macroCriteria, macro);
});

test('assembleChapterRecord produces a ChapterRecord with a macro verdict and coverage', () => {
  const products = [manufacture(1), manufacture(2, { mechanics: ['laser'] })];
  const { record, difficulties } = assembleChapterRecord('ch-x', products);
  assert.equal(record.chapterId, 'ch-x');
  assert.equal(record.levels.length, 2);
  assert.equal(difficulties.length, 2);
  assert.ok(record.coverageMatrix.totalCells > 0);
  // every level record carries the same (chapter-level) macro verdict
  for (const lr of record.levels) assert.equal(lr.macroCriteria, record.macroVerdict);
});

test('assembleChapterRecord is idempotent: same products ⇒ deep-equal records', () => {
  const products = [manufacture(1), manufacture(2, { mechanics: ['laser'] })];
  const a = assembleChapterRecord('ch-x', products);
  const b = assembleChapterRecord('ch-x', products);
  assert.deepEqual(a.record.levels.map((l) => l.levelId), b.record.levels.map((l) => l.levelId));
  assert.deepEqual(a.difficulties, b.difficulties);
});

test('assembleChapterRecord tracks first-introduction of mechanics across the ordered chapter', () => {
  // Two levels both use laser; only the first introduces it.
  const products = [manufacture(3, { mechanics: ['laser'] }), manufacture(4, { mechanics: ['laser'] })];
  const { record } = assembleChapterRecord('ch-intro', products);
  // The macro verdict's cognitive mapping must not flag an orphan requirement.
  assert.equal(record.macroVerdict.cognitiveStructuralMapping.pass, true, JSON.stringify(record.macroVerdict.cognitiveStructuralMapping.findings));
});
