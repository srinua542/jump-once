/**
 * AgentHarness — runs an agent policy against a level headlessly, records
 * the replay tape, and replays tapes with no agent present (P4/S4.1,
 * REQ-141).
 *
 * GDOS alignment: Section 15 (levels are judged by simulated play before
 * any human sees them), Section 13 (deterministic state processor).
 *
 * Contract (P4 execution plan, design summary point 3):
 *  - The engine is assembled in the NORMATIVE canonical pipeline order —
 *    lifecycle → entityKinematics → playerControl → playerPhysics →
 *    sensors → hazardsAndGoal (kinetic modifiers are folded into
 *    control/physics per dm-0021; there is no surfaceEffects system). Every
 *    P4+ harness that assembles the engine must use CANONICAL_PIPELINE.
 *  - Per tick: the agent decides from the current state, the frame is
 *    committed as `state.input`, the engine advances exactly one fixed step,
 *    and the frame is recorded. frames[i] is the input that drove tick i+1.
 *  - The agent RNG stream is derived from the run seed with a fixed offset
 *    and threaded through AgentMemory (dm-0024); `state.rng` is never
 *    touched by the agent, so a tape replay (no agent) reproduces the live
 *    run bit for bit.
 *  - Halting is a property: the data-driven EvalBudget bounds ticks and
 *    lives; exhaustion is the typed 'timeout' outcome, never a hang and
 *    never a throw. Defeat is NOT terminal — the lifecycle system reloads
 *    and the agent keeps trying until completion or budget.
 *
 * This lives in src/eval/ (dm-0022): evaluation-time logic consuming the
 * sim strictly through its public contracts. One-way dependency — the sim
 * never imports from here.
 */

import { FIXED_STEP_SECONDS } from '../core/Clock';
import { Engine } from '../core/Engine';
import type { InputFrame } from '../core/State';
import { StateManager } from '../core/StateManager';
import type { LevelDefinition } from '../components/Level';
import { createInitialState, type JumpOnceState, type WorldState } from '../entities/World';
import type { System } from '../systems/System';
import { lifecycleSystem } from '../systems/Lifecycle';
import { entityKinematicsSystem } from '../systems/EntityKinematics';
import { playerControlSystem } from '../systems/PlayerControl';
import { playerPhysicsSystem } from '../systems/PlayerPhysics';
import { sensorsSystem } from '../systems/Sensors';
import { hazardsAndGoalSystem } from '../systems/HazardsAndGoal';
import { TAPE_SCHEMA_VERSION, type ReplayTape } from '../schema/TapeIO';
import { createAgentMemory, type AgentPolicy } from './AgentPolicy';

/**
 * The normative system order (P3 plan §9, dm-0021). Composition order is a
 * determinism parameter: assembling these six in any other order is a
 * different simulation.
 */
export const CANONICAL_PIPELINE: ReadonlyArray<System<WorldState>> = Object.freeze([
  lifecycleSystem,
  entityKinematicsSystem,
  playerControlSystem,
  playerPhysicsSystem,
  sensorsSystem,
  hazardsAndGoalSystem,
]);

/** Hard stops for a harness run. Data, not literals (halting is a property). */
export interface EvalBudget {
  /** Maximum simulation ticks before the run is declared 'timeout'. ≥1. */
  readonly maxTicks: number;
  /** Maximum lives (scene reloads) before the run is declared 'timeout'. ≥1. */
  readonly maxAttempts: number;
}

/** 60 seconds of sim time, 25 lives — generous for unit-scale fixtures. */
export const DEFAULT_EVAL_BUDGET: EvalBudget = Object.freeze({
  maxTicks: 3600,
  maxAttempts: 25,
});

/**
 * Fixed additive offset (2^32 · φ⁻¹, the golden-ratio constant already used
 * by the core Rng's increment) separating the agent RNG stream from the sim
 * stream so the two can never be conflated. Whitelist arithmetic only.
 */
const AGENT_STREAM_OFFSET = 2654435769;

/** Derive the agent-stream seed from the run seed. Exported for S4.2+ solvers. */
export function agentStreamSeed(runSeed: number): number {
  return (runSeed + AGENT_STREAM_OFFSET) % 4294967296;
}

export type RunOutcome = 'completed' | 'timeout';

export interface AgentRunResult {
  /** 'completed' iff the goal was reached within budget; 'timeout' otherwise. */
  readonly outcome: RunOutcome;
  /** The full reproduction recipe for this run (dm-0023). */
  readonly tape: ReplayTape;
  /** Simulation ticks actually consumed (=== tape.frames.length). */
  readonly ticksElapsed: number;
  /** Scene reloads performed (world.attemptCount at stop). */
  readonly attempts: number;
  /** The final committed state — replayTape reproduces this bit for bit. */
  readonly finalState: JumpOnceState;
}

function assemble(def: LevelDefinition, seed: number): { manager: StateManager<WorldState>; engine: Engine<WorldState> } {
  const manager = new StateManager(createInitialState(def, seed), { freezeOnCommit: true });
  const engine = new Engine<WorldState>({ systems: CANONICAL_PIPELINE, stateManager: manager });
  return { manager, engine };
}

/**
 * Drive one archetype through a level headlessly. Deterministic: same
 * (def, seed, policy, budget) ⇒ identical result, tape and all.
 */
export function runAgent(
  def: LevelDefinition,
  seed: number,
  policy: AgentPolicy,
  budget: EvalBudget = DEFAULT_EVAL_BUDGET,
): AgentRunResult {
  const { manager, engine } = assemble(def, seed);
  let memory = createAgentMemory(agentStreamSeed(seed));
  const frames: InputFrame[] = [];
  let state = manager.getState();

  while (
    state.world.runState !== 'completed' &&
    frames.length < budget.maxTicks &&
    state.world.attemptCount < budget.maxAttempts
  ) {
    const decision = policy.decide(state, memory);
    memory = decision.memory;
    manager.commit({ ...state, input: decision.input });
    state = engine.tick(FIXED_STEP_SECONDS);
    frames.push(decision.input);
  }

  return {
    outcome: state.world.runState === 'completed' ? 'completed' : 'timeout',
    tape: {
      schemaVersion: TAPE_SCHEMA_VERSION,
      levelId: def.levelId,
      seed: normalizeSeed(seed),
      frames,
    },
    ticksElapsed: frames.length,
    attempts: state.world.attemptCount,
    finalState: state,
  };
}

/** The uint32 normalization createRng applies (ToUint32), without bitwise operators. */
function normalizeSeed(seed: number): number {
  return ((Math.trunc(seed) % 4294967296) + 4294967296) % 4294967296;
}

/**
 * Re-drive the sim from a recorded tape with NO agent present. Bit equality
 * of the returned state with the live run's finalState is the determinism
 * proof: the tape alone reproduces the run.
 */
export function replayTape(
  def: LevelDefinition,
  seed: number,
  frames: readonly InputFrame[],
): JumpOnceState {
  const { manager, engine } = assemble(def, seed);
  let state = manager.getState();
  for (const frame of frames) {
    manager.commit({ ...state, input: frame });
    state = engine.tick(FIXED_STEP_SECONDS);
  }
  return state;
}
