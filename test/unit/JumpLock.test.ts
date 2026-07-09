/**
 * S3.5 — THE AXIOM: the single-jump lock state machine (REQ-004/010/011,
 * REQ-150 anticipation).
 *
 *  - grounded press → anticipation countdown (exact tick count) → ONE
 *    impulse of exactly -TUNING.jumpSpeed → 'spent';
 *  - air presses are ignored AND not consumed (no coyote time, dm-0020);
 *  - presses during anticipation and while spent do nothing;
 *  - the committed press fires even if support is lost mid-countdown;
 *  - 'spent' has no exit within a life; only reload (pure re-instantiation)
 *    refreshes — proven in both directions;
 *  - horizontal control keeps working while spent (locks-to-horizontal-only
 *    means the vertical axis is spent, not the controls);
 *  - THE PROPERTY TEST: seeded fuzzed input tapes across natural defeat and
 *    reset boundaries — never more than one impulse per life, and the
 *    machine never moves backward within a life.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createClock } from '../../src/core/Clock';
import { createRng, nextFloat, type RngState } from '../../src/core/Rng';
import { type InputFrame } from '../../src/core/State';
import { vec2 } from '../../src/core/Vec2';
import { TUNING } from '../../src/components/Tuning';
import { LEVEL_SCHEMA_VERSION, type LevelDefinition } from '../../src/components/Level';
import { instantiateWorld, type JumpOnceState } from '../../src/entities/World';
import { lifecycleSystem } from '../../src/systems/Lifecycle';
import { hazardsAndGoalSystem } from '../../src/systems/HazardsAndGoal';
import { playerControlSystem } from '../../src/systems/PlayerControl';
import { playerPhysicsSystem } from '../../src/systems/PlayerPhysics';

const N = TUNING.anticipationTicks;

/** Bordered 16×8 room with a pit at cols 8–11 (same shape as the lifecycle suite). */
function makeRoomDef(): LevelDefinition {
  const width = 16;
  const height = 8;
  const tiles: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const isPit = row === height - 1 && col >= 8 && col <= 11;
      const isBorder = row === 0 || row === height - 1 || col === 0 || col === width - 1;
      tiles.push(isBorder && !isPit ? 1 : 0);
    }
  }
  return {
    schemaVersion: LEVEL_SCHEMA_VERSION,
    levelId: 'unit-jump-room',
    title: 'JumpLock unit room',
    gdos: {
      targetKgNode: 'kg:test/jump-room',
      difficultyVectors: { executionPrecision: 0, readingComplexity: 0, timingStrictness: 0, routeAmbiguity: 0 },
      emotionalBudgetCurve: [
        { at: 0, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
        { at: 1, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
      ],
      creatorMomentFrame: { tickWindow: [0, 1], description: 'n/a (unit fixture)' },
    },
    tilemap: { width, height, tileSize: 1, tiles },
    entities: [],
    triggers: [],
    constraints: {
      spawn: vec2(3, 6),
      goal: { position: vec2(14, 2), halfExtents: vec2(0.5, 0.5) },
      parTimeTiersSeconds: [10, 5],
    },
  };
}

const NEUTRAL: InputFrame = { moveAxis: 0, jumpPressed: false, resetPressed: false };

function makeState(): JumpOnceState {
  return { tick: 0, clock: createClock(), rng: createRng(1), input: NEUTRAL, world: instantiateWorld(makeRoomDef()) };
}

function pipelineTick(state: JumpOnceState, input: InputFrame): JumpOnceState {
  let s: JumpOnceState = { ...state, tick: state.tick + 1, input };
  s = lifecycleSystem.step(s);
  s = playerControlSystem.step(s);
  s = playerPhysicsSystem.step(s);
  s = hazardsAndGoalSystem.step(s);
  return s;
}

/** Run neutral ticks until the player is grounded and at rest. */
function settle(state: JumpOnceState): JumpOnceState {
  let s = state;
  for (let i = 0; i < 240 && !s.world.playerGrounded; i++) s = pipelineTick(s, NEUTRAL);
  assert.equal(s.world.playerGrounded, true, 'settle() must reach the ground');
  return s;
}

test('grounded press → anticipation for exactly TUNING.anticipationTicks, then ONE impulse of exactly -jumpSpeed', () => {
  let s = settle(makeState());
  // Press tick: machine enters (or completes, if N=0) anticipation.
  s = pipelineTick(s, { ...NEUTRAL, jumpPressed: true });
  for (let i = 1; i <= N; i++) {
    assert.equal(s.world.jumpLock.phase, 'anticipating', `tick ${i} of the countdown`);
    // The impulse must not have fired yet: still moving with the floor.
    assert.equal(s.world.playerGrounded, true, 'no lift-off during anticipation');
    s = pipelineTick(s, NEUTRAL);
  }
  assert.equal(s.world.jumpLock.phase, 'spent', 'the impulse tick spends the jump');
  // Post-physics velocity on the impulse tick: -jumpSpeed plus one gravity step (exact).
  const dt = 1 / 60;
  assert.equal(s.world.playerVelocity.y, -TUNING.jumpSpeed + TUNING.gravityY * dt);
  assert.equal(s.world.playerGrounded, false, 'lift-off');
});

test('air presses are ignored AND not consumed: the jump stays available until a grounded press', () => {
  let s = makeState(); // spawned in the air (spawn y=6, floor face y=7)
  assert.equal(s.world.playerGrounded, false);
  s = pipelineTick(s, { ...NEUTRAL, jumpPressed: true });
  assert.equal(s.world.jumpLock.phase, 'available', 'air press must not consume the jump');
  s = settle(s);
  s = pipelineTick(s, { ...NEUTRAL, jumpPressed: true });
  assert.notEqual(s.world.jumpLock.phase, 'available', 'grounded press must start the machine');
});

test('presses during anticipation neither restart the countdown nor stack a second impulse', () => {
  let s = settle(makeState());
  s = pipelineTick(s, { ...NEUTRAL, jumpPressed: true });
  const remaining = s.world.jumpLock.ticksUntilImpulse;
  s = pipelineTick(s, { ...NEUTRAL, jumpPressed: true }); // mash during countdown
  assert.equal(s.world.jumpLock.ticksUntilImpulse, remaining - 1, 'countdown must keep falling, not restart');
});

test('the committed press fires even if support is lost mid-countdown (control-level machine semantics)', () => {
  let s = settle(makeState());
  s = pipelineTick(s, { ...NEUTRAL, jumpPressed: true });
  // Fabricate loss of support mid-anticipation (e.g. a collapsing floor vanished).
  s = { ...s, world: { ...s.world, playerGrounded: false } };
  let fired = false;
  for (let i = 0; i <= N + 1 && !fired; i++) {
    s = pipelineTick(s, NEUTRAL);
    fired = s.world.jumpLock.phase === 'spent';
  }
  assert.equal(fired, true, 'the committed impulse must fire without ground support');
});

test('spent is forever within a life: landing again and mashing jump does nothing', () => {
  let s = settle(makeState());
  s = pipelineTick(s, { ...NEUTRAL, jumpPressed: true });
  for (let i = 0; i < 240 && !(s.world.jumpLock.phase === 'spent' && s.world.playerGrounded); i++) {
    s = pipelineTick(s, NEUTRAL);
  }
  assert.equal(s.world.playerGrounded, true, 'landed after the jump');
  for (let i = 0; i < 60; i++) {
    s = pipelineTick(s, { ...NEUTRAL, jumpPressed: true });
    assert.equal(s.world.jumpLock.phase, 'spent');
    assert.ok(s.world.playerVelocity.y >= 0 || s.world.playerGrounded === false, 'no upward impulse can reappear');
  }
});

test('horizontal control keeps working while spent — the lock is vertical-only (REQ-150)', () => {
  let s = settle(makeState());
  s = pipelineTick(s, { ...NEUTRAL, jumpPressed: true });
  for (let i = 0; i < N; i++) s = pipelineTick(s, NEUTRAL); // through the countdown
  assert.equal(s.world.jumpLock.phase, 'spent');
  s = pipelineTick(s, { ...NEUTRAL, moveAxis: 1, jumpPressed: true });
  assert.equal(s.world.playerVelocity.x, TUNING.runSpeed, 'moveAxis still honored while spent');
});

test('ONLY scene reload refreshes: reset re-arms the machine (by construction), and the new life gets exactly one jump again', () => {
  let s = settle(makeState());
  s = pipelineTick(s, { ...NEUTRAL, jumpPressed: true });
  for (let i = 0; i < N; i++) s = pipelineTick(s, NEUTRAL);
  assert.equal(s.world.jumpLock.phase, 'spent');
  s = pipelineTick(s, { ...NEUTRAL, resetPressed: true });
  assert.equal(s.world.jumpLock.phase, 'available', 'reload refreshes the jump');
  assert.equal(s.world.attemptCount, 1);
  s = settle(s);
  s = pipelineTick(s, { ...NEUTRAL, jumpPressed: true });
  assert.notEqual(s.world.jumpLock.phase, 'available', 'the new life can jump');
});

test('PROPERTY (the axiom): fuzzed tapes across defeat/reset boundaries — never >1 impulse per life, machine never moves backward', () => {
  const PHASE_ORDER = { available: 0, anticipating: 1, spent: 2 } as const;
  let rng: RngState = createRng(20260709);
  const draw = (): number => {
    const d = nextFloat(rng);
    rng = d.next;
    return d.value;
  };
  for (let tape = 0; tape < 40; tape++) {
    let s = makeState();
    let impulsesThisLife = 0;
    let maxImpulsesObserved = 0;
    let livesObserved = 1;
    for (let i = 0; i < 300; i++) {
      const prev = s.world;
      const axisRoll = draw();
      const input: InputFrame = {
        moveAxis: axisRoll < 0.4 ? 1 : axisRoll < 0.6 ? -1 : axisRoll < 0.8 ? 0 : -1,
        jumpPressed: draw() < 0.25,
        resetPressed: draw() < 0.02,
      };
      s = pipelineTick(s, input);
      const cur = s.world;
      if (cur.attemptCount !== prev.attemptCount) {
        // Life boundary: counter resets with the fresh world.
        livesObserved++;
        impulsesThisLife = 0;
        assert.equal(cur.attemptCount, prev.attemptCount + 1, 'lives advance one at a time');
      } else {
        assert.ok(
          PHASE_ORDER[cur.jumpLock.phase] >= PHASE_ORDER[prev.jumpLock.phase],
          `tape ${tape} tick ${i}: machine moved backward (${prev.jumpLock.phase} -> ${cur.jumpLock.phase}) without a reload`,
        );
        if (prev.jumpLock.phase !== 'spent' && cur.jumpLock.phase === 'spent') impulsesThisLife++;
      }
      maxImpulsesObserved = Math.max(maxImpulsesObserved, impulsesThisLife);
      assert.ok(impulsesThisLife <= 1, `tape ${tape} tick ${i}: ${impulsesThisLife} impulses in one life — THE AXIOM IS BROKEN`);
    }
    assert.ok(livesObserved >= 1 && maxImpulsesObserved <= 1);
  }
});
