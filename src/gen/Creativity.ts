/**
 * Creativity — the REQ-081 creativity & iteration evolutionary loop
 * (P7/S7.5; dm-0062). REQ-053 (novelty search) applied.
 *
 * GDOS alignment: Section 9 — "generate → variations → GDOS eval →
 * mutate/combine → compare to memory → select hybrid → improve → repeat to
 * diminishing returns."
 *
 * evolveLevel realizes exactly that cycle as a deterministic, doubly-bounded
 * fold over generations:
 *   1. GENERATE the seed candidate from the concept (gen/Generator).
 *   2. Each GENERATION breeds `variationsPerGeneration` VARIATIONS of the
 *      current survivors — mutate the best, or (with ≥2 survivors and the
 *      profiled probability) combine the top two into a HYBRID.
 *   3. EVALUATE every candidate through the real P5 seam (evaluateLevel) and
 *      COMPARE TO MEMORY via noveltyDivergence against the prior corpus
 *      (REQ-053). SELECT by a profile-weighted composite of gate pass, mean
 *      gate score, and novelty — keeping the top two as next-gen survivors.
 *   4. IMPROVE until diminishing returns: because survivors carry forward,
 *      the best selection score is monotone non-decreasing, so "improvement"
 *      is the non-negative delta of that best between generations. The loop
 *      halts when improvement < epsilon (converged) or at the hard cap.
 *
 * Everything stochastic threads a core/Rng state; every candidate is the
 * generator's parse-proven output; evaluation is deterministic under a fixed
 * seed. Same (concept, corpus, seed, genProfile, evalOptions) ⇒ identical
 * EvolutionResult. Calibration split (dm-0057): the loop budget, operator mix,
 * and selection weights are GenProfile.creativity; the gate scoring is the
 * ScoringProfile inside evalOptions.
 *
 * Pure over its inputs; consumes evaluation only through the public seam
 * (dm-0057). Whitelist math. Lives in src/gen/.
 */

import { createRng, nextFloat } from '../core/Rng';
import type { GdosReport } from '../eval/gdos/Report';
import { DEFAULT_EVALUATE_OPTIONS, evaluateLevel, type EvaluateOptions } from '../eval/Evaluate';
import { buildDescriptor, noveltyDivergence, type NoveltyDescriptor } from '../eval/gdos/Novelty';
import type { LevelConcept } from './Concept';
import type { GenProfile } from './GenProfile';
import { combineCandidates, generateCandidate, mutateCandidate, type Candidate } from './Generator';

/** One scored candidate: the generated level, its judgement, its descriptor, and its selection score. */
export interface ScoredCandidate {
  readonly candidate: Candidate;
  readonly report: GdosReport;
  readonly descriptor: NoveltyDescriptor;
  /** Novelty divergence vs the corpus (null when the corpus is empty). */
  readonly divergence: number | null;
  /** Profile-weighted composite selection score in [0,1]. */
  readonly score: number;
}

export type EvolutionTermination = 'converged' | 'hard-cap';

export interface EvolutionResult {
  /** The highest-scoring candidate found. */
  readonly best: ScoredCandidate;
  /** Generations actually run (0 = the seed alone already converged). */
  readonly generations: number;
  /** The best selection score after each generation, generation 0 = the seed. Monotone non-decreasing. */
  readonly bestScoreHistory: readonly number[];
  readonly termination: EvolutionTermination;
  /** Candidates evaluated across the whole run (the cost ledger). */
  readonly evaluated: number;
}

export type EvolutionOutcome =
  | { readonly ok: true; readonly value: EvolutionResult }
  | { readonly ok: false; readonly reason: string };

/** Mean of every metric score across every gate, in [0,1] (empty ⇒ 0). */
function meanGateScore(report: GdosReport): number {
  let sum = 0;
  let count = 0;
  for (const gate of report.gates) {
    for (const s of gate.scores) { sum += s.score; count++; }
  }
  return count === 0 ? 0 : sum / count / 100;
}

/** The profile-weighted selection composite (dm-0062): gate pass, mean score, novelty. */
function selectionScore(report: GdosReport, divergence: number | null, profile: GenProfile): number {
  const w = profile.creativity.selectionWeights;
  const total = w.gatePass + w.gateScore + w.novelty;
  const passComponent = report.pass
    ? 1
    : (report.gates.length === 0 ? 0 : report.gates.filter((g) => g.pass).length / report.gates.length);
  const scoreComponent = meanGateScore(report);
  // Empty corpus ⇒ nothing to resemble ⇒ maximally novel; otherwise clamp to [0,1].
  const noveltyComponent = divergence === null ? 1 : Math.min(1, divergence);
  return (w.gatePass * passComponent + w.gateScore * scoreComponent + w.novelty * noveltyComponent) / total;
}

/** Evaluate + score one candidate against the corpus. */
function score(candidate: Candidate, corpus: readonly NoveltyDescriptor[], profile: GenProfile, evalOptions: EvaluateOptions): ScoredCandidate {
  const { evidence, report } = evaluateLevel(candidate.def, evalOptions);
  const descriptor = buildDescriptor(evidence);
  const { divergence } = noveltyDivergence(descriptor, corpus, evalOptions.profile);
  return { candidate, report, descriptor, divergence, score: selectionScore(report, divergence, profile) };
}

/** Deterministic ordering: score desc, then levelId asc (stable, seed-independent). */
function better(a: ScoredCandidate, b: ScoredCandidate): number {
  if (a.score !== b.score) return b.score - a.score;
  return a.candidate.def.levelId < b.candidate.def.levelId ? -1 : a.candidate.def.levelId > b.candidate.def.levelId ? 1 : 0;
}

/**
 * Evolve a level from a concept. Returns the best candidate found, or a
 * failure reason if the seed concept cannot even be generated (an unbuildable
 * concept — the generator's typed refusal, surfaced honestly rather than
 * silently returning nothing).
 */
export function evolveLevel(
  concept: LevelConcept,
  corpus: readonly NoveltyDescriptor[],
  seed: number,
  profile: GenProfile,
  evalOptions: EvaluateOptions = DEFAULT_EVALUATE_OPTIONS,
): EvolutionOutcome {
  const c = profile.creativity;
  let rng = createRng(seed);
  const seedGen = generateCandidate(concept, seed, profile);
  if (!seedGen.ok) return { ok: false, reason: seedGen.errors[0]?.message ?? 'seed concept is unbuildable' };
  rng = seedGen.rng;

  let survivors: ScoredCandidate[] = [score(seedGen.candidate, corpus, profile, evalOptions)];
  let evaluated = 1;
  const bestScoreHistory: number[] = [survivors[0].score];
  let termination: EvolutionTermination = 'hard-cap';
  let generations = 0;

  for (let gen = 0; gen < c.hardCapGenerations; gen++) {
    generations = gen + 1;
    const newcomers: ScoredCandidate[] = [];
    for (let v = 0; v < c.variationsPerGeneration; v++) {
      const draw = nextFloat(rng);
      rng = draw.next;
      const useCombine = survivors.length >= 2 && draw.value < c.combineProbability;
      const bred = useCombine
        ? combineCandidates(survivors[0].candidate, survivors[1].candidate, rng, profile)
        : mutateCandidate(survivors[0].candidate, rng, profile);
      if (!bred.ok) continue; // a clamped operator may fail to build; skip it (counted by absence)
      rng = bred.rng;
      newcomers.push(score(bred.candidate, corpus, profile, evalOptions));
      evaluated++;
    }
    const merged = [...survivors, ...newcomers].sort(better);
    survivors = merged.slice(0, 2);
    const improvement = survivors[0].score - bestScoreHistory[bestScoreHistory.length - 1];
    bestScoreHistory.push(survivors[0].score);
    if (improvement < c.diminishingReturnsEpsilon) { termination = 'converged'; break; }
  }

  return {
    ok: true,
    value: { best: survivors[0], generations, bestScoreHistory, termination, evaluated },
  };
}
