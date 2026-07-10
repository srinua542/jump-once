/**
 * Counterfactual — the jump-relevance audit (P7/S7.2; REQ-012 P7 share,
 * dm-0041/dm-0056).
 *
 * GDOS alignment: Section 2 (every challenge isolates/amplifies/tests the
 * one-jump constraint; omit anything that does not).
 *
 * Why this exists (dm-0041, deferred from P5): a completion tape that never
 * presses THE jump is a necessary-but-not-sufficient kill proxy — a level
 * where jumping is POSSIBLE but IRRELEVANT still passes it. Proving the
 * negative ("this level cannot be completed without the jump") needs
 * exhaustive bounded search, not sampled play.
 *
 * Design (dm-0056): the S4.4 `forbidden` taint hook already expresses a
 * no-jump search — any state whose jump lock has left its spawn phase
 * ('available', see World.ts JUMP_AVAILABLE and the forward-only
 * available → anticipating → spent machine in PlayerControl) taints the
 * macro, so the budgeted BFS explores exactly the no-jump reachable set.
 * ZERO modifications to Search.ts. The axiom stays ground truth (dm-0020):
 * this audit reads `world.jumpLock` as fact and never re-implements it.
 *
 * Three-way honesty, same as SolvabilityVerdict:
 *  - goal reached      ⇒ 'jump-irrelevant' (the REQ-012 kill), with the
 *    no-jump witness tape as the PROOF — self-provable via
 *    witnessCompletesWithoutJump;
 *  - frontier exhausted ⇒ 'jump-necessary' (the pass: the jump matters);
 *  - node cap hit       ⇒ 'inconclusive' (budget-bounded, never silently a pass).
 *
 * ORTHOGONAL to solvability: an unsolvable level trivially reports
 * 'jump-necessary' (nothing reaches the goal without the jump — or with it).
 * Consumers compose: REQ-012 passes a level that is BOTH solvable (S4.2) AND
 * jump-necessary (here).
 *
 * Whitelist math only; deterministic; no content authored (fixtures are unit
 * scaffolding). Lives in src/eval/local/ (dm-0022).
 */

import type { LevelDefinition } from '../../components/Level';
import { TAPE_SCHEMA_VERSION, type ReplayTape } from '../../schema/TapeIO';
import type { JumpOnceState } from '../../entities/World';
import { replayTape } from '../AgentHarness';
import {
  DEFAULT_SEARCH_OPTIONS,
  reconstructFrames,
  searchReachability,
  type SearchOptions,
} from './Search';

export type JumpRelevanceClassification = 'jump-necessary' | 'jump-irrelevant' | 'inconclusive';

export interface JumpRelevanceVerdict {
  /**
   * 'jump-necessary' — the no-jump frontier emptied within budget with no
   *   goal: the jump is load-bearing (REQ-012 pass);
   * 'jump-irrelevant' — a no-jump route reaches the goal: the jump is
   *   decoration (REQ-012 kill), witness attached;
   * 'inconclusive' — the node cap stopped the no-jump search before the
   *   frontier closed (budget too small; NOT a claim either way).
   */
  readonly classification: JumpRelevanceClassification;
  /** Present iff jump-irrelevant: a replay recipe that completes the level without ever engaging the jump lock. */
  readonly witness?: ReplayTape;
  /** No-jump search nodes explored. */
  readonly nodesExplored: number;
}

export interface JumpRelevanceOptions {
  /** The run seed for the search (and stamped into the witness tape). */
  readonly seed: number;
  /** Budget/shape for the no-jump search. */
  readonly search: SearchOptions;
}

export const DEFAULT_JUMP_RELEVANCE_OPTIONS: JumpRelevanceOptions = Object.freeze({
  seed: 1,
  search: DEFAULT_SEARCH_OPTIONS,
});

/** The lock has left its spawn phase — THE jump was engaged (available → anticipating → spent is forward-only). */
function jumpConsumed(state: JumpOnceState): boolean {
  return state.world.jumpLock.phase !== 'available';
}

/**
 * Audit whether `def` is completable WITHOUT the jump. Deterministic:
 * same (def, options) ⇒ identical verdict.
 */
export function auditJumpRelevance(
  def: LevelDefinition,
  options: JumpRelevanceOptions = DEFAULT_JUMP_RELEVANCE_OPTIONS,
): JumpRelevanceVerdict {
  const graph = searchReachability(def, options.seed, {
    ...options.search,
    stopAtGoal: true,
    forbidden: jumpConsumed,
  });
  if (graph.goalIndex >= 0) {
    const frames = reconstructFrames(graph, graph.goalIndex);
    return {
      classification: 'jump-irrelevant',
      witness: { schemaVersion: TAPE_SCHEMA_VERSION, levelId: def.levelId, seed: normalizeSeed(options.seed), frames },
      nodesExplored: graph.nodes.length,
    };
  }
  return {
    classification: graph.exhausted ? 'jump-necessary' : 'inconclusive',
    nodesExplored: graph.nodes.length,
  };
}

/**
 * Make a 'jump-irrelevant' verdict self-proving: replay the witness with no
 * agent and confirm the run completed with the jump lock still at its spawn
 * phase — the goal was reached and the jump was never engaged.
 */
export function witnessCompletesWithoutJump(def: LevelDefinition, verdict: JumpRelevanceVerdict): boolean {
  if (verdict.witness === undefined) return false;
  const final = replayTape(def, verdict.witness.seed, verdict.witness.frames);
  return final.world.runState === 'completed' && final.world.jumpLock.phase === 'available';
}

/** The uint32 seed normalization the sim applies (ToUint32), whitelist math. */
function normalizeSeed(seed: number): number {
  return ((Math.trunc(seed) % 4294967296) + 4294967296) % 4294967296;
}
