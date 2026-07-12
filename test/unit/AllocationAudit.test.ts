/**
 * S11.1 — Allocation-bounded runtime + render-hot-path audit (REQ-160/161/162,
 * dm-0119). REQ-160 read literally ("zero-allocation runtime loop") would
 * force rewriting the immutable copy-on-write core (`Engine.tick`/
 * `StateManager`), which is the project's determinism/single-source-of-truth
 * correctness contract (dm-0004) — not a bug to fix. This file makes the
 * actual, deliberate claim explicit and regression-proof: the sim commits
 * EXACTLY ONE snapshot per fixed step, never more — bounded and predictable,
 * not zero. The render-side zero-alloc claims live beside their own modules:
 * `render/pool/Pool.test.ts` (fixed-capacity, no backing-array growth, ever)
 * and `test/unit/GlExecutor.test.ts` (GPU buffers created once per page,
 * reused every frame — the S11.1 fix; see `Atlas.ts`/`GlRenderer.ts`).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Engine } from '../../src/core/Engine';
import { createClock, FIXED_STEP_SECONDS } from '../../src/core/Clock';
import { createRng } from '../../src/core/Rng';
import { NEUTRAL_INPUT, type GameState } from '../../src/core/State';
import { StateManager } from '../../src/core/StateManager';
import type { System } from '../../src/systems/System';

interface TestWorld {
  readonly n: number;
}

function initialState(): GameState<TestWorld> {
  return { tick: 0, clock: createClock(), rng: createRng(1), input: NEUTRAL_INPUT, world: { n: 0 } };
}

const incrementSystem: System<TestWorld> = {
  id: 'increment',
  step: (state) => ({ ...state, world: { n: state.world.n + 1 } }),
};

/** Counts every commit without altering StateManager's own behavior. */
class CountingStateManager<T> extends StateManager<T> {
  commitCount = 0;

  override commit(next: GameState<T>): GameState<T> {
    this.commitCount++;
    return super.commit(next);
  }
}

test('Engine.tick commits exactly one snapshot per fixed step — never more, never fewer (REQ-160 bounded, dm-0119)', () => {
  const manager = new CountingStateManager(initialState());
  const engine = new Engine({ systems: [incrementSystem], stateManager: manager });

  const steps = 7;
  const result = engine.tick(FIXED_STEP_SECONDS * steps);

  assert.equal(manager.commitCount, steps, `expected exactly ${steps} commits (one snapshot object per fixed step), got ${manager.commitCount}`);
  assert.equal(result.world.n, steps, 'the world payload must have advanced exactly once per committed step, confirming no duplicate or skipped step');
});

test('a sub-step delta still commits exactly once (persisting the banked accumulator) — never zero, never more than one', () => {
  const manager = new CountingStateManager(initialState());
  const engine = new Engine({ systems: [incrementSystem], stateManager: manager });

  engine.tick(FIXED_STEP_SECONDS / 2);

  assert.equal(manager.commitCount, 1, 'a sub-step delta must still commit once to persist the banked accumulator, not skip the commit entirely, and must not commit twice');
});

test('repeated sub-step calls commit once per call (persisting the accumulator) but only advance world state on the calls that bank a whole step', () => {
  const manager = new CountingStateManager(initialState());
  const engine = new Engine({ systems: [incrementSystem], stateManager: manager });

  /* Ten calls alternately banking 0.5 then 1.0 of a step (0.5+0.5=1.0 every
     other call): every call commits once (either the zero-step
     accumulator-persist branch or one real step), but the WORLD PAYLOAD only
     advances on the five calls that actually bank a whole step — proving
     allocation tracks Engine.tick's own documented contract (exactly
     max(1, steps) commits per call), not an unbounded per-call multiplier. */
  let result = engine.tick(0);
  for (let i = 0; i < 10; i++) {
    result = engine.tick(FIXED_STEP_SECONDS / 2);
  }

  assert.equal(manager.commitCount, 11, `expected exactly 11 commits (1 initial zero-delta call + 10 half-step calls, each committing exactly once), got ${manager.commitCount}`);
  assert.equal(result.world.n, 5, 'world state must advance exactly once per whole banked step (5), never once per call (10)');
});
