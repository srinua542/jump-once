/**
 * Softlock — dead-zone detection (P4/S4.3, REQ-141).
 *
 * GDOS alignment: Section 15 (Softlock detection: a reachable state from
 * which the player can NEITHER reach the goal NOR die — trapped forever,
 * the worst feel failure a one-jump puzzle can ship).
 *
 * Built on the S4.2 bounded reachability graph, run EXHAUSTIVELY (no
 * stop-at-goal) so every reachable macro-state and its successors are known.
 * Then two backward reachability sweeps over the successor graph:
 *   - goalReachable[n]  — n can reach a 'goal' terminal;
 *   - deathReachable[n] — n can reach a 'dead' terminal (dying reloads to a
 *     fresh life — an escape, so a state that can die is NOT softlocked).
 * A softlock (trapped) node is a reachable, non-terminal state that is in
 * NEITHER set: no path forward wins, no path forward dies. By definition all
 * its onward paths loop among such states forever.
 *
 * Soundness is bounded honestly: the claim "no softlock" is only meaningful
 * when the search EXHAUSTED its frontier within budget. A truncated search
 * yields `exhaustive: false` and the verdict is inconclusive — never a false
 * "clean".
 *
 * Whitelist math only; deterministic; consumes the sim through public
 * contracts. Lives in src/eval/local/ (dm-0022).
 */

import type { Vec2 } from '../../core/Vec2';
import type { LevelDefinition } from '../../components/Level';
import { TAPE_SCHEMA_VERSION, type ReplayTape } from '../../schema/TapeIO';
import {
  reconstructFrames,
  searchReachability,
  type SearchGraph,
  type SearchNode,
  type SearchOptions,
} from './Search';

export interface SoftlockOptions {
  readonly seed: number;
  readonly search: SearchOptions;
}

export const DEFAULT_SOFTLOCK_OPTIONS: SoftlockOptions = Object.freeze({
  seed: 1,
  // Softlock needs the WHOLE reachable graph, so it never stops at the goal.
  search: Object.freeze({ holdTicks: 8, maxNodes: 60000, stopAtGoal: false }),
});

export interface SoftlockVerdict {
  /** True iff a reachable trapped state exists (only trustworthy when exhaustive). */
  readonly hasSoftlock: boolean;
  /** Player-center positions of representative trapped states (evidence). */
  readonly trappedRegions: readonly Vec2[];
  /** The trapped state with the greatest y — the bottom of the dead zone (evidence). */
  readonly deepestTrapped?: Vec2;
  /** Number of trapped macro-states found. */
  readonly trappedCount: number;
  /** A tape that drives the player INTO the first trapped state (evidence). */
  readonly witness?: ReplayTape;
  /** True iff the search closed its frontier — required for a sound "clean" verdict. */
  readonly exhaustive: boolean;
  /** Total reachable macro-states explored. */
  readonly nodesExplored: number;
}

/**
 * Mark every node that can reach a terminal the seed predicate accepts, by
 * reverse BFS over the successor edges.
 */
function backwardReachable(nodes: readonly SearchNode[], seed: (n: SearchNode) => boolean): boolean[] {
  const count = nodes.length;
  const reached = new Array<boolean>(count).fill(false);
  const reverse: number[][] = [];
  for (let i = 0; i < count; i++) reverse.push([]);
  for (let i = 0; i < count; i++) {
    for (const s of nodes[i].successors) reverse[s].push(i);
  }
  const stack: number[] = [];
  for (let i = 0; i < count; i++) {
    if (seed(nodes[i])) { reached[i] = true; stack.push(i); }
  }
  while (stack.length > 0) {
    const x = stack.pop() as number;
    for (const p of reverse[x]) {
      if (!reached[p]) { reached[p] = true; stack.push(p); }
    }
  }
  return reached;
}

/** Collect trapped node indices from an exhaustive graph, in node order (deterministic). */
function trappedIndices(graph: SearchGraph): number[] {
  const goalReachable = backwardReachable(graph.nodes, (n) => n.terminal === 'goal');
  const deathReachable = backwardReachable(graph.nodes, (n) => n.terminal === 'dead');
  const trapped: number[] = [];
  for (let i = 0; i < graph.nodes.length; i++) {
    const node = graph.nodes[i];
    if (node.terminal === 'none' && !goalReachable[i] && !deathReachable[i]) trapped.push(i);
  }
  return trapped;
}

/**
 * Audit a level for softlocks. Deterministic: same (def, options) ⇒
 * identical verdict.
 */
export function detectSoftlock(
  def: LevelDefinition,
  options: SoftlockOptions = DEFAULT_SOFTLOCK_OPTIONS,
): SoftlockVerdict {
  const graph = searchReachability(def, options.seed, { ...options.search, stopAtGoal: false });
  const trapped = trappedIndices(graph);

  // A representative sample of the trapped region (BFS order — shallow first),
  // plus the deepest trapped state as the "bottom of the dead zone" evidence.
  const regions: Vec2[] = [];
  let deepest: Vec2 | undefined;
  for (const idx of trapped) {
    const pos = graph.nodes[idx].state.world.playerPosition;
    if (regions.length < 5) regions.push(pos);
    if (deepest === undefined || pos.y > deepest.y) deepest = pos;
  }

  const verdict: SoftlockVerdict = {
    hasSoftlock: trapped.length > 0,
    trappedRegions: regions,
    deepestTrapped: deepest,
    trappedCount: trapped.length,
    exhaustive: graph.exhausted,
    nodesExplored: graph.nodes.length,
  };

  if (trapped.length > 0) {
    const frames = reconstructFrames(graph, trapped[0]);
    return {
      ...verdict,
      witness: { schemaVersion: TAPE_SCHEMA_VERSION, levelId: def.levelId, seed: normalizeSeed(options.seed), frames },
    };
  }
  return verdict;
}

/** The uint32 seed normalization the sim applies (ToUint32), whitelist math. */
function normalizeSeed(seed: number): number {
  return ((Math.trunc(seed) % 4294967296) + 4294967296) % 4294967296;
}
