/**
 * Search — a bounded, deterministic reachability search over the frozen sim
 * (P4/S4.2). The shared primitive under Solvability (S4.2) and Softlock
 * (S4.3).
 *
 * GDOS alignment: Section 15 (Local Spatial Verification — a level is
 * solvable iff the goal is reachable from spawn under the one-jump rule).
 *
 * Why a search and not just archetype play (P4 plan, finding 7): a reactive
 * archetype failing a level is evidence, not proof, of unsolvability. The
 * audit needs a systematic explorer. This one is deliberately bounded and
 * deterministic:
 *
 *  - MACRO-ACTIONS. Branching every tick is intractable; instead each edge
 *    holds ONE InputFrame for `holdTicks` steps. The action set is the full
 *    cross product moveAxis {-1,0,+1} × jumpPressed {false,true} — six edges,
 *    a fixed, ordered set so expansion order is deterministic.
 *  - THE AXIOM IS ENGINE TRUTH. The search never counts or caps jumps; the
 *    engine's lock (dm-0020) does. jumpLock.phase is part of the dedup
 *    signature, so "here with the jump available" and "here with it spent"
 *    are correctly distinct search states — the exactly-one-jump structure
 *    falls out of the simulation, never re-modeled here (dm-0011 holds).
 *  - DEATH IS A LEAF, NOT A DETOUR. Reload re-instantiates an identical
 *    world (dm-0018), so a life that ends at defeat returns to the start
 *    state — crossing a death can never make new ground reachable. Defeat
 *    and goal are terminal leaves; the live search space is one life.
 *  - HALTING IS STRUCTURAL. A visited-signature set (quantized player state
 *    + persistent entity flags) plus a node-count cap bound the search; it
 *    always terminates, reporting whether it closed the frontier
 *    (`exhausted`) or hit the cap (`truncated`).
 *
 * Whitelist math only (dm-0017 extended to src/eval/): quantization uses
 * Math.floor; no transcendental calls, no Math.random, no delta-time.
 *
 * This lives in src/eval/local/ (dm-0022): per-level evaluation logic
 * consuming the sim through public contracts only; the sim never imports it.
 */

import { FIXED_STEP_SECONDS } from '../../core/Clock';
import { Engine } from '../../core/Engine';
import type { InputFrame } from '../../core/State';
import { StateManager } from '../../core/StateManager';
import type { LevelDefinition } from '../../components/Level';
import { createInitialState, type JumpOnceState } from '../../entities/World';
import { CANONICAL_PIPELINE } from '../AgentHarness';

/** The six macro-actions, in fixed expansion order (determinism). */
const ACTIONS: readonly InputFrame[] = Object.freeze([
  { moveAxis: 0, jumpPressed: false, resetPressed: false },
  { moveAxis: 1, jumpPressed: false, resetPressed: false },
  { moveAxis: -1, jumpPressed: false, resetPressed: false },
  { moveAxis: 0, jumpPressed: true, resetPressed: false },
  { moveAxis: 1, jumpPressed: true, resetPressed: false },
  { moveAxis: -1, jumpPressed: true, resetPressed: false },
]);

export interface SearchOptions {
  /** Ticks one macro-action holds its frame. ≥1. */
  readonly holdTicks: number;
  /** Hard cap on distinct search nodes; the halting backstop. ≥1. */
  readonly maxNodes: number;
  /** Stop the moment a goal leaf is found (Solvability); false explores the
   *  whole reachable graph within budget (Softlock). */
  readonly stopAtGoal: boolean;
  /**
   * Optional constraint (S4.4): a state the route must never enter. Any macro
   * that touches a forbidden state at any of its ticks is TAINTED — the child
   * is pruned (never enqueued, never counted as a goal). Undefined = no
   * constraint (the default for Solvability/Softlock). Used by exploit
   * filtration to search for a hazard-avoiding "skip" route.
   */
  readonly forbidden?: (state: JumpOnceState) => boolean;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = Object.freeze({
  holdTicks: 8,
  maxNodes: 40000,
  stopAtGoal: true,
});

type Terminal = 'goal' | 'dead' | 'none';

export interface SearchNode {
  readonly state: JumpOnceState;
  /** Parent node index, or -1 for the root. */
  readonly parent: number;
  /** The macro frames that led from parent to here (root: []). */
  readonly frames: readonly InputFrame[];
  /** 'goal'/'dead' leaves are never expanded; 'none' interior nodes are. */
  readonly terminal: Terminal;
  /** Child node indices (filled as the node is expanded; [] for leaves/unexpanded). */
  readonly successors: number[];
}

export interface SearchGraph {
  readonly nodes: readonly SearchNode[];
  readonly rootIndex: number;
  /** Index of the first goal leaf found, or -1 if none within budget. */
  readonly goalIndex: number;
  /** True iff the frontier emptied within budget (a real "no goal reachable"). */
  readonly exhausted: boolean;
  /** True iff the node cap stopped the search early (verdict is budget-bounded). */
  readonly truncated: boolean;
}

function assemble(def: LevelDefinition, seed: number): { manager: StateManager<JumpOnceState['world']>; engine: Engine<JumpOnceState['world']> } {
  // freezeOnCommit off: the search only needs determinism, not the mutation
  // guard, and skipping the deep-freeze keeps the bounded sweep fast.
  const manager = new StateManager(createInitialState(def, seed), { freezeOnCommit: false });
  const engine = new Engine<JumpOnceState['world']>({ systems: CANONICAL_PIPELINE, stateManager: manager });
  return { manager, engine };
}

/** Quantized dedup key: player state to a sub-tile lattice + persistent entity flags. */
function signature(state: JumpOnceState): string {
  const w = state.world;
  const q = w.level.tilemap.tileSize / 4;
  const px = Math.floor(w.playerPosition.x / q);
  const py = Math.floor(w.playerPosition.y / q);
  const vx = Math.floor(w.playerVelocity.x);
  const vy = Math.floor(w.playerVelocity.y);
  const g = w.playerGrounded ? 1 : 0;
  let ent = '';
  for (const e of w.entities) {
    ent += (e.collapsed ? '1' : '0') + (e.doorOpen ? '1' : '0') + (e.firstContactTick !== null ? '1' : '0');
  }
  return `${px},${py},${vx},${vy},${g},${w.jumpLock.phase},${w.jumpLock.ticksUntilImpulse},${ent}`;
}

function classify(state: JumpOnceState): Terminal {
  if (state.world.runState === 'completed') return 'goal';
  if (state.world.runState === 'defeated') return 'dead';
  return 'none';
}

/**
 * Run one macro-action from `start`: hold `frame` for up to holdTicks steps,
 * stopping early if the run completes or the player dies. Returns the child
 * state, the frames actually applied, and the terminal classification.
 */
function applyMacro(
  manager: StateManager<JumpOnceState['world']>,
  engine: Engine<JumpOnceState['world']>,
  start: JumpOnceState,
  frame: InputFrame,
  holdTicks: number,
  forbidden: ((state: JumpOnceState) => boolean) | undefined,
): { child: JumpOnceState; frames: InputFrame[]; terminal: Terminal; tainted: boolean } {
  let state = start;
  const frames: InputFrame[] = [];
  for (let i = 0; i < holdTicks; i++) {
    manager.commit({ ...state, input: frame });
    state = engine.tick(FIXED_STEP_SECONDS) as JumpOnceState;
    frames.push(frame);
    if (forbidden !== undefined && forbidden(state)) {
      return { child: state, frames, terminal: classify(state), tainted: true };
    }
    const t = classify(state);
    if (t !== 'none') return { child: state, frames, terminal: t, tainted: false };
  }
  return { child: state, frames, terminal: 'none', tainted: false };
}

/**
 * Breadth-first reachability over macro-actions. Deterministic and bounded.
 * The root is the spawn state after zero ticks; interior nodes are expanded
 * in FIFO order, children in fixed ACTIONS order.
 */
export function searchReachability(
  def: LevelDefinition,
  seed: number,
  options: SearchOptions = DEFAULT_SEARCH_OPTIONS,
): SearchGraph {
  const { manager, engine } = assemble(def, seed);
  const root = manager.getState() as JumpOnceState;

  const nodes: SearchNode[] = [{ state: root, parent: -1, frames: [], terminal: classify(root), successors: [] }];
  const visited = new Map<string, number>([[signature(root), 0]]);
  const queue: number[] = [0];
  let goalIndex = nodes[0].terminal === 'goal' ? 0 : -1;
  let truncated = false;

  if (goalIndex >= 0 && options.stopAtGoal) {
    return { nodes, rootIndex: 0, goalIndex, exhausted: false, truncated: false };
  }

  let head = 0;
  while (head < queue.length) {
    const nodeIndex = queue[head++];
    const node = nodes[nodeIndex];
    if (node.terminal !== 'none') continue;

    for (const frame of ACTIONS) {
      if (nodes.length >= options.maxNodes) {
        truncated = true;
        break;
      }
      const { child, frames, terminal, tainted } = applyMacro(manager, engine, node.state, frame, options.holdTicks, options.forbidden);

      // A tainted macro entered a forbidden state: prune the whole branch.
      if (tainted) continue;

      if (terminal === 'goal') {
        const goalNode: SearchNode = { state: child, parent: nodeIndex, frames, terminal: 'goal', successors: [] };
        nodes.push(goalNode);
        node.successors.push(nodes.length - 1);
        if (goalIndex < 0) goalIndex = nodes.length - 1;
        if (options.stopAtGoal) {
          return { nodes, rootIndex: 0, goalIndex, exhausted: false, truncated };
        }
        continue;
      }

      if (terminal === 'dead') {
        // Distinct dead leaves are kept once (they carry no reachable ground).
        const key = `dead:${signature(child)}`;
        const seen = visited.get(key);
        if (seen !== undefined) { node.successors.push(seen); continue; }
        const deadNode: SearchNode = { state: child, parent: nodeIndex, frames, terminal: 'dead', successors: [] };
        nodes.push(deadNode);
        const idx = nodes.length - 1;
        visited.set(key, idx);
        node.successors.push(idx);
        continue;
      }

      const sig = signature(child);
      const existing = visited.get(sig);
      if (existing !== undefined) { node.successors.push(existing); continue; }
      const childNode: SearchNode = { state: child, parent: nodeIndex, frames, terminal: 'none', successors: [] };
      nodes.push(childNode);
      const idx = nodes.length - 1;
      visited.set(sig, idx);
      node.successors.push(idx);
      queue.push(idx);
    }
    if (truncated) break;
  }

  return { nodes, rootIndex: 0, goalIndex, exhausted: !truncated, truncated };
}

/** Reconstruct the full input frame sequence from the root to `nodeIndex`. */
export function reconstructFrames(graph: SearchGraph, nodeIndex: number): InputFrame[] {
  const parts: InputFrame[][] = [];
  let i = nodeIndex;
  while (i >= 0) {
    parts.push(graph.nodes[i].frames as InputFrame[]);
    i = graph.nodes[i].parent;
  }
  parts.reverse();
  const frames: InputFrame[] = [];
  for (const p of parts) for (const f of p) frames.push(f);
  return frames;
}
