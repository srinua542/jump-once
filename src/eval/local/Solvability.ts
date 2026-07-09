/**
 * Solvability — the exactly-one-jump solvability audit (P4/S4.2, REQ-141).
 *
 * GDOS alignment: Section 15 (Local Spatial Verification: is the level
 * completable at all, under the one-jump axiom, from spawn to goal?).
 *
 * Two-tier, per the P4 plan (finding 7):
 *  1. FAST PATH — run the five archetypes headlessly. If any completes, the
 *     level is solvable and that run's tape is the witness. Archetype play
 *     is realistic evidence and usually cheap.
 *  2. SEARCH — if no archetype completes (evidence of difficulty, NOT proof
 *     of unsolvability), fall back to the bounded deterministic reachability
 *     search. A reachable goal leaf ⇒ solvable, with a reconstructed witness
 *     tape; an exhausted frontier with no goal ⇒ unsolvable within budget;
 *     a truncated search ⇒ inconclusive (budget too small — surfaced
 *     honestly, never silently reported as unsolvable).
 *
 * THE AXIOM IS GROUND TRUTH, not a parameter (dm-0020/dm-0011): neither tier
 * counts jumps or caps them — the engine's lock does. A completion is proof
 * the goal is reachable within the one jump the sim grants; the audit reads
 * `world.jumpLock` as fact and never re-implements it. Every 'solvable'
 * verdict carries a witness tape that, replayed with no agent, reaches the
 * goal (asserted by the harness's live≡replay guarantee).
 *
 * Whitelist math only; deterministic; no content authored (fixtures are
 * unit scaffolding). Lives in src/eval/local/ (dm-0022).
 */

import type { LevelDefinition } from '../../components/Level';
import { TAPE_SCHEMA_VERSION, type ReplayTape } from '../../schema/TapeIO';
import {
  ARCHETYPES,
  archetypePolicy,
  type ArchetypeName,
} from '../Archetypes';
import {
  DEFAULT_EVAL_BUDGET,
  replayTape,
  runAgent,
  type EvalBudget,
} from '../AgentHarness';
import {
  DEFAULT_SEARCH_OPTIONS,
  reconstructFrames,
  searchReachability,
  type SearchOptions,
} from './Search';

/** How the verdict was reached — kept as evidence, not just a boolean. */
export type SolvabilityMethod = 'archetype' | 'search' | 'none';

export type SolvabilityClassification = 'solvable' | 'unsolvable' | 'inconclusive';

export interface SolvabilityVerdict {
  /**
   * 'solvable' — a witness reaches the goal within one jump;
   * 'unsolvable' — the reachability frontier emptied within budget with no
   *   goal (bounded, but complete for the search's discretization);
   * 'inconclusive' — the search hit its node cap before closing the frontier
   *   (budget too small; NOT a claim of unsolvability).
   */
  readonly classification: SolvabilityClassification;
  /** Which tier decided it. */
  readonly method: SolvabilityMethod;
  /** Present iff solvable: a replay recipe that completes the level. */
  readonly witness?: ReplayTape;
  /** The archetype whose run was the witness, when method === 'archetype'. */
  readonly witnessArchetype?: ArchetypeName;
  /** Search nodes explored (0 when the fast path decided it). */
  readonly nodesExplored: number;
}

export interface SolvabilityOptions {
  /** The run seed for archetype play and the search. */
  readonly seed: number;
  /** Budget for each archetype fast-path run. */
  readonly agentBudget: EvalBudget;
  /** Budget/shape for the fallback search. */
  readonly search: SearchOptions;
}

export const DEFAULT_SOLVABILITY_OPTIONS: SolvabilityOptions = Object.freeze({
  seed: 1,
  agentBudget: DEFAULT_EVAL_BUDGET,
  search: DEFAULT_SEARCH_OPTIONS,
});

/** The five archetypes as the fast-path fleet, in a fixed order. */
const FLEET: readonly ArchetypeName[] = Object.freeze([
  'expertSpeedrunner',
  'experienced',
  'firstTime',
  'cautious',
  'curiousExplorer',
]);

/**
 * Audit whether `def` is completable from spawn to goal under the one-jump
 * axiom. Deterministic: same (def, options) ⇒ identical verdict.
 */
export function auditSolvability(
  def: LevelDefinition,
  options: SolvabilityOptions = DEFAULT_SOLVABILITY_OPTIONS,
): SolvabilityVerdict {
  // Tier 1 — archetype fast path.
  for (const name of FLEET) {
    const result = runAgent(def, options.seed, archetypePolicy(ARCHETYPES[name]), options.agentBudget);
    if (result.outcome === 'completed') {
      return {
        classification: 'solvable',
        method: 'archetype',
        witness: result.tape,
        witnessArchetype: name,
        nodesExplored: 0,
      };
    }
  }

  // Tier 2 — bounded deterministic search (stop at the first goal).
  const graph = searchReachability(def, options.seed, { ...options.search, stopAtGoal: true });
  if (graph.goalIndex >= 0) {
    const frames = reconstructFrames(graph, graph.goalIndex);
    return {
      classification: 'solvable',
      method: 'search',
      witness: { schemaVersion: TAPE_SCHEMA_VERSION, levelId: def.levelId, seed: normalizeSeed(options.seed), frames },
      nodesExplored: graph.nodes.length,
    };
  }

  return {
    classification: graph.exhausted ? 'unsolvable' : 'inconclusive',
    method: graph.exhausted ? 'search' : 'none',
    nodesExplored: graph.nodes.length,
  };
}

/**
 * Confirm a verdict's witness actually completes the level: replay the tape
 * with no agent and check the run ended 'completed' with the jump spent (or
 * never needed). Callers use this to make a 'solvable' verdict self-proving.
 */
export function witnessCompletes(def: LevelDefinition, verdict: SolvabilityVerdict): boolean {
  if (verdict.witness === undefined) return false;
  const final = replayTape(def, verdict.witness.seed, verdict.witness.frames);
  return final.world.runState === 'completed';
}

/** The uint32 seed normalization the sim applies (ToUint32), whitelist math. */
function normalizeSeed(seed: number): number {
  return ((Math.trunc(seed) % 4294967296) + 4294967296) % 4294967296;
}
