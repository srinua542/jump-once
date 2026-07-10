/**
 * AgentHarness — runs an agent policy against a level headlessly, records
 * the replay tape, and replays tapes with no agent present (P4/S4.1,
 * REQ-141).
 *
 * GDOS alignment: Section 15 (levels are judged by simulated play before
 * any human sees them), Section 13 (deterministic state processor).
 *
 * Level design prerequisite: every LevelDefinition run through this harness
 * must satisfy the `.claude/skills/level-design-principle` criteria BEFORE
 * being submitted — archetype selection, GDOS metric mapping, emotional-arc
 * phase assignment, and the six review-output checks. A passing score here
 * does not substitute for that design-time review; it validates that the
 * implemented layout matches the design intent.
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
import type { Vec2 } from '../core/Vec2';
import { StateManager } from '../core/StateManager';
import type { LevelDefinition } from '../components/Level';
import { COLLISION_CLASS_BY_KIND } from '../components/CollisionClass';
import type { EntityKind } from '../components/Behavior';
import { createInitialState, type JumpOnceState, type RunState, type WorldState } from '../entities/World';
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

/** A lethal entity's live position at one observed tick. */
export interface LethalObservation {
  readonly id: string;
  readonly kind: EntityKind;
  readonly position: Vec2;
}

/** One tick of a replay, projected to what death/fairness analysis needs. */
export interface TickObservation {
  /** GameState tick after this step. */
  readonly tick: number;
  readonly runState: RunState;
  /** Player center after this step. */
  readonly playerPosition: Vec2;
  /** Positions of every lethal-class entity this tick (index-aligned with nothing; carry ids). */
  readonly lethals: readonly LethalObservation[];
}

/**
 * Re-drive a tape and project each post-tick state to a TickObservation. Same
 * pipeline and determinism as replayTape; used by the P5 evidence assembler to
 * extract deaths and killer positions for the REQ-016 fairness check. Lethal
 * classification is by static collision class (dm-0021): spike/laser/
 * movingHazard — the on-fraction timing of a laser is not modeled here, so
 * attribution is by proximity to a lethal-class entity, which is sufficient
 * evidence for the fairness proxy.
 */
export function replayObserved(
  def: LevelDefinition,
  seed: number,
  frames: readonly InputFrame[],
): TickObservation[] {
  const lethalIndices: number[] = [];
  for (let i = 0; i < def.entities.length; i++) {
    if (COLLISION_CLASS_BY_KIND[def.entities[i].behavior.kind] === 'lethal') lethalIndices.push(i);
  }
  const { manager, engine } = assemble(def, seed);
  let state = manager.getState();
  const observations: TickObservation[] = [];
  for (const frame of frames) {
    manager.commit({ ...state, input: frame });
    state = engine.tick(FIXED_STEP_SECONDS);
    const lethals: LethalObservation[] = [];
    for (const i of lethalIndices) {
      const ent = state.world.entities[i];
      lethals.push({ id: ent.id, kind: def.entities[i].behavior.kind, position: ent.position });
    }
    observations.push({
      tick: state.tick,
      runState: state.world.runState,
      playerPosition: state.world.playerPosition,
      lethals,
    });
  }
  return observations;
}
