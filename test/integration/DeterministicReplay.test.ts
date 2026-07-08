/**
 * Deterministic replay integration test (S1.9, REQ-121).
 *
 * Proves the core loop's central guarantee: a run is a pure function of its
 * (seed, input-tape). Two independent Engine instances driven through the
 * identical tape must land on a bit-identical final state. This is the property
 * the future trajectory solver and level-validation agents depend on
 * (design memory dm-0003) — if it ever regresses, replay and generated levels
 * stop being reproducible.
 *
 * The test system threads the RNG through the GameState tree (not a global) and
 * reads the input frame, so the assertion exercises the real Engine -> System
 * -> Clock -> StateManager pipeline end to end, not the Clock in isolation.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Engine } from '../../src/core/Engine';
import { createClock, FIXED_STEP_SECONDS, MAX_FRAME_SECONDS } from '../../src/core/Clock';
import { createRng, nextFloat } from '../../src/core/Rng';
import { type GameState, type InputFrame } from '../../src/core/State';
import { StateManager } from '../../src/core/StateManager';
import type { System } from '../../src/systems/System';

interface ReplayWorld {
  /** Accumulates the per-step input axis — proves input-dependence is deterministic. */
  readonly position: number;
  /** Accumulates RNG draws — proves the PRNG is threaded through state, not global. */
  readonly noise: number;
}

/**
 * A pure system: draw one float, thread the RNG forward, and fold both the draw
 * and the current input axis into the world. Immutable — returns a fresh tree.
 */
const replaySystem: System<ReplayWorld> = {
  id: 'replay-accumulator',
  step: (state) => {
    const draw = nextFloat(state.rng);
    return {
      ...state,
      rng: draw.next,
      world: {
        position: state.world.position + state.input.moveAxis,
        noise: state.world.noise + draw.value,
      },
    };
  },
};

interface TapeFrame {
  readonly delta: number;
  readonly moveAxis: -1 | 0 | 1;
}

/**
 * A fixed, hardcoded drive tape. Deliberately mixes sub-step deltas (bank, no
 * step), multi-step deltas, and one spike above MAX_FRAME_SECONDS (clamped to
 * 15 steps) — with a varying input axis. No wall-clock, no Math.random.
 */
const TAPE: readonly TapeFrame[] = [
  { delta: FIXED_STEP_SECONDS * 0.4, moveAxis: 1 },
  { delta: FIXED_STEP_SECONDS * 0.4, moveAxis: 1 },
  { delta: FIXED_STEP_SECONDS * 3, moveAxis: -1 },
  { delta: FIXED_STEP_SECONDS * 0.9, moveAxis: 0 },
  { delta: 1.0, moveAxis: 1 },
  { delta: FIXED_STEP_SECONDS * 2, moveAxis: -1 },
  { delta: FIXED_STEP_SECONDS * 0.25, moveAxis: 0 },
];

function inputFor(moveAxis: -1 | 0 | 1): InputFrame {
  return { moveAxis, jumpPressed: false, resetPressed: false };
}

/**
 * Drive a fresh Engine through the tape and return the final committed state.
 * Between frames the harness commits the frame's input (as a real input layer
 * would at the top of a frame) and then ticks the engine by the frame's delta.
 */
function runReplay(seed: number, tape: readonly TapeFrame[]): GameState<ReplayWorld> {
  const initial: GameState<ReplayWorld> = {
    tick: 0,
    clock: createClock(),
    rng: createRng(seed),
    input: inputFor(0),
    world: { position: 0, noise: 0 },
  };
  const manager = new StateManager(initial);
  const engine = new Engine({ systems: [replaySystem], stateManager: manager });

  for (const frame of tape) {
    const current = manager.getState();
    manager.commit({ ...current, input: inputFor(frame.moveAxis) });
    engine.tick(frame.delta);
  }
  return manager.getState();
}

/** Deterministic FNV-1a hash over a stable serialization of the final state. */
function hashState(state: GameState<ReplayWorld>): string {
  const serialized = JSON.stringify([
    state.tick,
    state.clock.stepIndex,
    state.clock.accumulator,
    state.rng.seed,
    state.input.moveAxis,
    state.world.position,
    state.world.noise,
  ]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < serialized.length; i++) {
    hash ^= serialized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

test('identical (seed, input-tape) produces a bit-identical final state across two independent runs', () => {
  const a = runReplay(0xc0ffee, TAPE);
  const b = runReplay(0xc0ffee, TAPE);

  assert.deepEqual(a, b, 'the two runs must be structurally identical');
  assert.equal(hashState(a), hashState(b), 'the two runs must share the same final state hash');
});

test('the replay actually exercised the pipeline (non-vacuous)', () => {
  const a = runReplay(0xc0ffee, TAPE);

  // Regardless of the exact per-frame step fold, the run must have advanced
  // ticks (the *3, spike, and *2 frames guarantee it) and drawn RNG noise.
  assert.ok(a.tick > 0, 'ticks must have advanced');
  assert.notEqual(a.world.noise, 0, 'the RNG-driven system must have run at least once');
  assert.equal(a.tick, a.clock.stepIndex, 'tick and the clock step index must stay in lockstep');
});

test('the MAX_FRAME_SECONDS spike is clamped, not banked into unbounded catch-up', () => {
  const singleSpike: readonly TapeFrame[] = [{ delta: 10, moveAxis: 0 }];
  const result = runReplay(1, singleSpike);

  const expected = Math.floor(MAX_FRAME_SECONDS / FIXED_STEP_SECONDS);
  assert.equal(result.tick, expected, 'a 10s stall must clamp to MAX_FRAME_SECONDS worth of steps');
});

test('a different seed yields a different final state (seed genuinely determines the run)', () => {
  const a = runReplay(1, TAPE);
  const b = runReplay(2, TAPE);

  assert.notEqual(hashState(a), hashState(b));
  assert.equal(a.world.position, b.world.position, 'input axis is identical, so only the RNG-driven noise should diverge');
  assert.notEqual(a.world.noise, b.world.noise);
});

test('a different input tape (same deltas) yields a different final state (input genuinely determines the run)', () => {
  const pushRight = TAPE.map((f) => ({ delta: f.delta, moveAxis: 1 as const }));
  const pushLeft = TAPE.map((f) => ({ delta: f.delta, moveAxis: -1 as const }));

  const a = runReplay(7, pushRight);
  const b = runReplay(7, pushLeft);

  assert.notEqual(hashState(a), hashState(b));
  assert.equal(a.world.noise, b.world.noise, 'deltas match so the RNG draw count is identical -> noise identical');
  assert.notEqual(a.world.position, b.world.position, 'opposite input axes must drive position apart');
  assert.equal(a.world.position, -b.world.position, 'symmetric input must yield symmetric position');
});
