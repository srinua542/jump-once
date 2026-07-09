/**
 * AgentPolicy — the pure decision contract every evaluation agent implements
 * (P4/S4.1, REQ-141).
 *
 * GDOS alignment: Section 15 (agent archetypes drive the deterministic sim
 * headlessly to judge levels before any human plays them).
 *
 * Determinism by construction (dm-0024):
 *  - `decide` is a pure function: (state, memory) → (input, memory). All
 *    agent statefulness — held intent, countdowns, per-life plans, the agent
 *    RNG cursor — is threaded through AgentMemory by the harness, exactly
 *    like sim state threads through GameState. No closures over mutable
 *    variables, no hidden fields: same (level, seed, archetype) ⇒ the same
 *    tape, every run.
 *  - Agents draw randomness ONLY from their own seeded stream
 *    (`memory.rng`), never from `state.rng`. The sim RNG belongs to the
 *    simulation alone: a tape replay runs with no agent present, so any
 *    agent draw against the sim stream would make the live final state
 *    diverge bit-wise from the replayed one.
 *  - Agents read GameState (world, tick, jumpLock…) but never construct or
 *    mutate it; their entire influence on the sim is the InputFrame they
 *    return — the dm-0019 input boundary.
 *
 * This lives in src/eval/ (dm-0022): evaluation-time logic. The dependency
 * is one-way — nothing under src/{core,systems,components,entities,schema}
 * may import from here.
 */

import { createRng, type RngState } from '../core/Rng';
import type { InputFrame } from '../core/State';
import type { JumpOnceState } from '../entities/World';

/**
 * Everything an agent remembers between ticks. Threaded by the harness;
 * per-life fields are re-planned by the policy when it observes a new
 * `world.attemptCount` (scene reload — dm-0018's pure re-instantiation).
 */
export interface AgentMemory {
  /** The agent's OWN seeded RNG stream (dm-0024). Never `state.rng`. */
  readonly rng: RngState;
  /** Horizontal intent held between replans (models reaction latency). */
  readonly heldMove: -1 | 0 | 1;
  /** Ticks until the agent re-reads the world; 0 = replan this tick. */
  readonly ticksUntilReplan: number;
  /** True while a jump decision is committed but not yet pressed. */
  readonly jumpPending: boolean;
  /** Stand-still ticks remaining before a pending jump is pressed. */
  readonly hesitationLeft: number;
  /** Stand-still ticks remaining of a hazard-caution pause. */
  readonly pauseLeft: number;
  /** True while inside a hazard's caution radius (rising-edge pause gate). */
  readonly nearHazard: boolean;
  /** Exploration-prefix ticks remaining in this life (Curious Explorer). */
  readonly exploreLeft: number;
  /** Direction of this life's exploration prefix. */
  readonly exploreDir: -1 | 1;
  /** The `world.attemptCount` last seen; a change means a fresh life. */
  readonly lifeAttempt: number;
}

export interface AgentDecision {
  readonly input: InputFrame;
  readonly memory: AgentMemory;
}

export interface AgentPolicy {
  /** Stable archetype name; keys tapes and reports. */
  readonly name: string;
  /** Pure: same (state, memory) ⇒ same decision. Whitelist math only (dm-0017). */
  decide(state: JumpOnceState, memory: AgentMemory): AgentDecision;
}

/**
 * Fresh agent memory for the start of a run. `agentSeed` must already be
 * the agent-stream seed (the harness derives it from the run seed with a
 * fixed offset so the two streams can never be conflated).
 */
export function createAgentMemory(agentSeed: number): AgentMemory {
  return {
    rng: createRng(agentSeed),
    heldMove: 0,
    ticksUntilReplan: 0,
    jumpPending: false,
    hesitationLeft: 0,
    pauseLeft: 0,
    nearHazard: false,
    exploreLeft: 0,
    exploreDir: 1,
    lifeAttempt: -1,
  };
}
