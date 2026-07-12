/**
 * Assembler — the bridge from authored framework slots to campaign records
 * (P10/S10.2, dm-0112).
 *
 * GDOS alignment: Section 9/10. Three responsibilities:
 *   1. buildConceptFromSlot — the ONLY path that mints a LevelConcept for the
 *      generation pipeline (dm-0109): a concept exists iff an already-parsed
 *      ChapterFramework slot produced it, which is how "framework before
 *      generation" (REQ-083) is enforced structurally rather than by convention.
 *   2. integrateProduct — the literal, previously-unbuilt REQ-090 phase 8
 *      ("Campaign Integration"): a PipelineProduct becomes a LevelRecord. P7's
 *      manufactureLevel stops at the product (PipelinePhase has seven members,
 *      not eight, confirmed by direct read); this is new P10 code, not a P7
 *      retrofit (dm-0112). Every field is copied straight from the product —
 *      zero re-computation (the dm-0107 discipline).
 *   3. assembleChapterRecord — folds a chapter's ordered products into a
 *      ChapterRecord: derives each level's measured difficulty and macro signals,
 *      runs the P4 macro curriculum validation ONCE per chapter, stamps the
 *      resulting MacroVerdict onto every LevelRecord, and aggregates coverage.
 *
 * Pure over its inputs; idempotent (same products ⇒ identical records).
 * Consumes generation/evaluation only through public seams (dm-0108). Whitelist
 * math (none of its own). Lives in content/.
 */

import type { EntityKind } from '../src/components/Behavior';
import type { PipelineProduct } from '../src/gen/Pipeline';
import { type LevelConcept } from '../src/gen/Concept';
import type { LevelRecord } from '../src/eval/campaign/CampaignState';
import type { ChapterRecord } from '../src/eval/campaign/CampaignDirector';
import { coverageMatrix, type CoverageMatrix } from '../src/eval/gdos/DesignSpace';
import { validateCurriculum, type CurriculumLevel, type CurriculumOptions, type MacroVerdict, DEFAULT_CURRICULUM_OPTIONS } from '../src/eval/macro/Curriculum';
import { estimateDifficulty, type DifficultyEstimate, type DifficultyProfile, DEFAULT_DIFFICULTY_PROFILE } from './DifficultyEstimator';
import type { ChapterFramework, ChapterLevelSlot } from './schema/ChapterFramework';

/** The knowledge-graph node id a slot maps to (GdosMetadata.targetKgNode). */
export function slotKgNode(chapterId: string, slotId: string): string {
  return `kg:${chapterId}/${slotId}`;
}

/**
 * Mint the pipeline's phase-1 LevelConcept from an authored slot. The ONLY
 * concept-construction path (dm-0109): there is no way to generate a level
 * without an upstream, already-parsed ChapterFramework slot.
 */
export function buildConceptFromSlot(framework: ChapterFramework, slot: ChapterLevelSlot): LevelConcept {
  return {
    archetype: slot.archetype,
    intentSentence: slot.intentSentence,
    oneJumpDecision: slot.oneJumpDecision,
    mechanics: slot.mechanics,
    difficultyTarget: slot.difficultyTarget,
    emotionalPhase: slot.emotionalPhase,
    targetKgNode: slotKgNode(framework.chapterId, slot.slotId),
  };
}

/**
 * REQ-090 phase 8 — Campaign Integration: a manufactured product becomes a
 * campaign LevelRecord under `chapterId`, stamped with the chapter's macro
 * verdict. Pure field copy — no re-evaluation, no re-derivation (dm-0112).
 */
export function integrateProduct(product: PipelineProduct, chapterId: string, macroVerdict: MacroVerdict): LevelRecord {
  return {
    levelId: product.def.levelId,
    chapterId,
    report: product.report,
    run: product.run,
    macroCriteria: macroVerdict,
    mechanicsExercised: product.mechanicsExercised,
  };
}

/** Read a metric's [0,100] score from a product's GDOS report gate (0 when absent). */
function gateMetric(product: PipelineProduct, gate: string, metric: string): number {
  const g = product.report.gates.find((x) => x.gate === gate);
  return g?.scores.find((s) => s.metric === metric)?.score ?? 0;
}

/**
 * Build one CurriculumLevel (the macro pass's per-level input) from a product,
 * its measured difficulty, and the mechanics newly introduced at this position
 * in the chapter. The difficulty proxy is discovery seconds (monotone,
 * ratio-friendly for the degradation criterion).
 */
function toCurriculumLevel(product: PipelineProduct, estimate: DifficultyEstimate, introducedMechanics: readonly string[]): CurriculumLevel {
  const ev = product.evidence;
  return {
    levelId: product.def.levelId,
    solvable: ev.solvability.classification === 'solvable',
    hasSoftlock: ev.softlock.hasSoftlock,
    // dm-0117: assembleChapterRecord only consumes pipeline-ACCEPTED products,
    // which the pipeline proves jump-necessary (its load-bearing challenge check,
    // dm-0041/dm-0064). The entity-exploit proxy provably MISFIRES on a
    // well-formed one-jump pit — it flags "jumping over the pit" (the intended
    // solution) as a skip that avoids the hazard envelope. That misfire must not
    // be re-counted as a real exploit at the macro-health layer, exactly as the
    // pipeline itself deliberately does not gate on it.
    hasExploit: false,
    difficulty: estimate.discoverySeconds,
    requiredMechanics: [...product.mechanicsExercised],
    introducedMechanics,
    curiosity: gateMetric(product, 'emotional-threshold', 'curiosity'),
  };
}

export interface AssembleOptions {
  readonly difficultyProfile: DifficultyProfile;
  readonly curriculumOptions: CurriculumOptions;
}

export const DEFAULT_ASSEMBLE_OPTIONS: AssembleOptions = Object.freeze({
  difficultyProfile: DEFAULT_DIFFICULTY_PROFILE,
  curriculumOptions: DEFAULT_CURRICULUM_OPTIONS,
});

export interface ChapterAssembly {
  readonly record: ChapterRecord;
  /** Per-level measured difficulty, in the chapter's slot order (parallel to record.levels). */
  readonly difficulties: readonly DifficultyEstimate[];
}

/**
 * Fold a chapter's ordered manufactured products into a ChapterRecord: derive
 * each level's measured difficulty + macro signals, run the macro curriculum
 * validation once, stamp its verdict onto every LevelRecord, and aggregate
 * coverage. `products` must be in the chapter's authored slot order (introduced-
 * mechanic tracking depends on it). Idempotent.
 */
export function assembleChapterRecord(
  chapterId: string,
  products: readonly PipelineProduct[],
  options: AssembleOptions = DEFAULT_ASSEMBLE_OPTIONS,
): ChapterAssembly {
  const difficulties = products.map((p) => estimateDifficulty(p.evidence, p.evidence.optimization, options.difficultyProfile));

  // Track first-introduction of each mechanic across the ordered chapter.
  const seen = new Set<EntityKind>();
  const curriculum: CurriculumLevel[] = [];
  for (let i = 0; i < products.length; i++) {
    const introduced: string[] = [];
    for (const m of products[i].mechanicsExercised) {
      if (!seen.has(m)) { seen.add(m); introduced.push(m); }
    }
    curriculum.push(toCurriculumLevel(products[i], difficulties[i], introduced));
  }

  const macroVerdict = validateCurriculum(curriculum, options.curriculumOptions);
  const levels = products.map((p) => integrateProduct(p, chapterId, macroVerdict));
  const matrix: CoverageMatrix = coverageMatrix(products.map((p) => p.evidence));

  return {
    record: { chapterId, levels, macroVerdict, coverageMatrix: matrix },
    difficulties,
  };
}
