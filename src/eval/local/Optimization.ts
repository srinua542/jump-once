/**
 * Optimization — the optimization-space model: five routing tiers, the delta
 * metric, and minimal-delta rejection (P4/S4.5, REQ-101, REQ-102).
 *
 * GDOS alignment: Section 11 (Optimization Space — a level must reward skill
 * with a meaningful spread between a first clear and an optimal run; a layout
 * with no such spread is flat and is rejected).
 *
 * Tier derivation (open question #1, resolved as dm-0028; WR anchor upgraded
 * to the search optimum as dm-0030):
 *   - Discovery   ≈ the First-Time archetype's clear (naive, hesitant);
 *   - World Record = the FASTEST known route — the shorter of the
 *     Expert-Speedrunner's clear and the bounded search's OPTIMAL route
 *     (the S4.2 BFS finds the shortest macro-path to the goal). Anchoring WR
 *     to the search route makes the delta reflect genuine route optimization,
 *     not merely the reaction-time gap between archetypes that all walk the
 *     same path — the limitation dm-0028 flagged and deferred;
 *   - Good / Fast / Expert interpolate linearly between them at 1/4, 1/2, 3/4
 *     of the window — honest intermediate anchors given only the two skill
 *     extremes are grounded.
 * The Curious-Explorer is deliberately excluded from tier anchoring: its
 * dawdling models behavioral coverage, not a skill tier, and would inflate
 * the window on a trivial level.
 *
 * Delta metric (REQ-102): delta = T_Discovery − T_WorldRecord, in seconds. A
 * layout whose delta falls below `minDeltaSeconds` has no optimization window
 * — no room for mastery to express — and is REJECTED. The authored
 * `parTimeTiersSeconds` (S2.2) is cross-checked, never trusted as the source:
 * if the designer's optimal par is faster than the sim's own World Record,
 * the par times are impossible and flagged.
 *
 * Times are measured in fixed-step ticks and converted to seconds via
 * FIXED_STEP_SECONDS (dm-0003). Whitelist math only; deterministic; consumes
 * the sim through the S4.1 harness. Lives in src/eval/local/.
 */

import { FIXED_STEP_SECONDS } from '../../core/Clock';
import type { LevelDefinition } from '../../components/Level';
import {
  ARCHETYPES,
  archetypePolicy,
  type ArchetypeName,
} from '../Archetypes';
import { DEFAULT_EVAL_BUDGET, runAgent, type EvalBudget } from '../AgentHarness';
import {
  DEFAULT_SEARCH_OPTIONS,
  reconstructFrames,
  searchReachability,
  type SearchOptions,
} from './Search';

export interface OptimizationOptions {
  readonly seed: number;
  readonly agentBudget: EvalBudget;
  /** Minimum Discovery−WR spread (seconds) for the layout to pass REQ-102. */
  readonly minDeltaSeconds: number;
  /** Budget/shape for the World-Record search route (dm-0030). */
  readonly search: SearchOptions;
}

export const DEFAULT_OPTIMIZATION_OPTIONS: OptimizationOptions = Object.freeze({
  seed: 1,
  agentBudget: DEFAULT_EVAL_BUDGET,
  minDeltaSeconds: 0.25,
  search: DEFAULT_SEARCH_OPTIONS,
});

/** The five routing tiers (REQ-101), Discovery (slowest) → World Record (fastest). */
export interface TierTimes {
  readonly discovery: number;
  readonly good: number;
  readonly fast: number;
  readonly expert: number;
  readonly worldRecord: number;
}

export interface ArchetypeCompletion {
  readonly archetype: ArchetypeName;
  readonly completed: boolean;
  readonly seconds: number | null;
}

export interface OptimizationVerdict {
  /** False when fewer than one archetype completes (no times to route). */
  readonly applicable: boolean;
  /** The five tier times in seconds (absent when not applicable). */
  readonly tiers?: TierTimes;
  /** T_Discovery − T_WorldRecord in seconds (absent when not applicable). */
  readonly deltaSeconds?: number;
  /** True iff the delta is below the minimum — the layout is too flat (REQ-102). */
  readonly rejected: boolean;
  /** Cross-check: is the authored optimal par ≥ the simulated World Record? */
  readonly parPlausible?: boolean;
  /** Whether the World-Record anchor came from the search route or an archetype (dm-0030). */
  readonly worldRecordSource?: 'search' | 'archetype';
  /** The bounded search's optimal route time in seconds, if it found one (evidence). */
  readonly searchOptimalSeconds?: number;
  /** Per-archetype completion evidence. */
  readonly completions: readonly ArchetypeCompletion[];
}

const ANCHOR_DISCOVERY: ArchetypeName = 'firstTime';
const ANCHOR_WR: ArchetypeName = 'expertSpeedrunner';
const ALL: readonly ArchetypeName[] = ['firstTime', 'cautious', 'experienced', 'expertSpeedrunner', 'curiousExplorer'];

/**
 * Compute the optimization window for a level. Deterministic: same
 * (def, options) ⇒ identical verdict.
 */
export function computeOptimizationWindow(
  def: LevelDefinition,
  options: OptimizationOptions = DEFAULT_OPTIMIZATION_OPTIONS,
): OptimizationVerdict {
  const completions: ArchetypeCompletion[] = [];
  const times = new Map<ArchetypeName, number>();
  for (const name of ALL) {
    const result = runAgent(def, options.seed, archetypePolicy(ARCHETYPES[name]), options.agentBudget);
    const completed = result.outcome === 'completed';
    const seconds = completed ? result.ticksElapsed * FIXED_STEP_SECONDS : null;
    completions.push({ archetype: name, completed, seconds });
    if (completed) times.set(name, seconds as number);
  }

  if (times.size === 0) {
    return { applicable: false, rejected: false, completions };
  }

  // Skill-tier anchors exclude the explorer (its dawdle is coverage, not skill).
  const skillTimes: number[] = [];
  for (const [name, t] of times) if (name !== 'curiousExplorer') skillTimes.push(t);
  const pool = skillTimes.length > 0 ? skillTimes : [...times.values()];

  // The best archetype clear: the expert's, else the fastest completer.
  const archetypeWR = times.has(ANCHOR_WR) ? (times.get(ANCHOR_WR) as number) : Math.min(...pool);

  // The bounded search's OPTIMAL route (dm-0030): BFS finds the shortest
  // macro-path to the goal, a route no archetype may take. Its tape length is
  // the exact tick count to the goal.
  let searchOptimalSeconds: number | undefined;
  const graph = searchReachability(def, options.seed, { ...options.search, stopAtGoal: true });
  if (graph.goalIndex >= 0) {
    searchOptimalSeconds = reconstructFrames(graph, graph.goalIndex).length * FIXED_STEP_SECONDS;
  }

  // World Record = the fastest KNOWN route: the shorter of the two anchors.
  const worldRecord = searchOptimalSeconds !== undefined
    ? Math.min(archetypeWR, searchOptimalSeconds)
    : archetypeWR;
  const worldRecordSource: 'search' | 'archetype' =
    searchOptimalSeconds !== undefined && searchOptimalSeconds < archetypeWR ? 'search' : 'archetype';

  // Discovery: the first-timer's clear, else the slowest skill clear.
  let discovery = times.has(ANCHOR_DISCOVERY) ? (times.get(ANCHOR_DISCOVERY) as number) : Math.max(...pool);
  // Anchors must not cross (the search route or a fallback could beat Discovery).
  if (discovery < worldRecord) discovery = worldRecord;

  const delta = discovery - worldRecord;
  const tiers: TierTimes = {
    discovery,
    good: discovery - delta * 0.25,
    fast: discovery - delta * 0.5,
    expert: discovery - delta * 0.75,
    worldRecord,
  };

  const authoredOptimal = Math.min(...def.constraints.parTimeTiersSeconds);
  const parPlausible = authoredOptimal >= worldRecord;

  return {
    applicable: true,
    tiers,
    deltaSeconds: delta,
    rejected: delta < options.minDeltaSeconds,
    parPlausible,
    worldRecordSource,
    searchOptimalSeconds,
    completions,
  };
}
