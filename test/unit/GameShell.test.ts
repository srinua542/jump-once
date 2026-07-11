/**
 * S9.8 — GameShell: the projection-purity proof (sim state bit-identical to
 * a headless run given the same InputFrames), plus lifecycle-trigger
 * integration (gameplayStart on first meaningful input, gameplayStop on
 * leaving 'playing', both re-arming across a reload).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { LevelDefinition } from '../../src/components/Level';
import { Engine } from '../../src/core/Engine';
import { FIXED_STEP_SECONDS } from '../../src/core/Clock';
import { NEUTRAL_INPUT, type InputFrame } from '../../src/core/State';
import { StateManager } from '../../src/core/StateManager';
import { createInitialState, type WorldState } from '../../src/entities/World';
import { CANONICAL_PIPELINE } from '../../src/eval/AgentHarness';
import { parseLevel } from '../../src/schema/Parse';
import { createAudioExecutor } from '../../render/audio/AudioExecutor';
import { createTraceAudioDevice } from '../../render/audio/AudioDevice';
import { DEFAULT_GRAMMAR } from '../../render/grammar/Grammar';
import { createGameShell } from '../../render/shell/GameShell';
import { createPortalLifecycle } from '../../render/shell/PortalLifecycle';
import type { PortalSdk } from '../../render/shell/PortalSdk';
import type { Viewport } from '../../render/scene/SceneCompiler';
import { PAPER_STYLE_PACK } from '../../render/style/paper/PaperStylePack';

function gdosFixture(id: string): unknown {
  return {
    targetKgNode: `kg:test/${id}`,
    difficultyVectors: { executionPrecision: 0, readingComplexity: 0, timingStrictness: 0, routeAmbiguity: 0 },
    emotionalBudgetCurve: [
      { at: 0, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
      { at: 1, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
    ],
    creatorMomentFrame: { tickWindow: [0, 1], description: 'n/a (unit fixture)' },
  };
}

function buildFixtureLevel(): LevelDefinition {
  const width = 10;
  const height = 6;
  const tiles: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const border = row === 0 || row === height - 1 || col === 0 || col === width - 1;
      tiles.push(border ? 1 : 0);
    }
  }
  const raw = {
    schemaVersion: 1,
    levelId: 'game-shell-fixture',
    title: 'S9.8 shell fixture',
    gdos: gdosFixture('game-shell-fixture'),
    tilemap: { width, height, tileSize: 1, tiles },
    entities: [
      { id: 'spike-1', transform: { position: { x: 5.5, y: 4.5 }, facing: 1 }, collider: { halfExtents: { x: 0.5, y: 0.5 }, offset: { x: 0, y: 0 } }, behavior: { kind: 'spike' } },
    ],
    triggers: [],
    constraints: { spawn: { x: 2.5, y: 4.5 }, goal: { position: { x: 8.5, y: 4.5 }, halfExtents: { x: 0.5, y: 0.5 } }, parTimeTiersSeconds: [30, 10] },
  };
  const result = parseLevel(raw);
  if (!result.ok) throw new Error(`fixture failed schema gate: ${JSON.stringify(result.errors)}`);
  return result.value;
}

function makeRecordingSdk(): { sdk: PortalSdk; calls: string[] } {
  const calls: string[] = [];
  const sdk: PortalSdk = {
    async init() { calls.push('init'); },
    gameLoadingFinished() { calls.push('gameLoadingFinished'); },
    gameplayStart() { calls.push('gameplayStart'); },
    gameplayStop() { calls.push('gameplayStop'); },
    async commercialBreak(onStart) { onStart?.(); },
    async rewardedBreak() { return false; },
  };
  return { sdk, calls };
}

const VIEWPORT: Viewport = { halfWidth: 10, halfHeight: 6 };

test('projection purity: GameShell\'s sim state is bit-identical to a headless Engine/StateManager/CANONICAL_PIPELINE run fed the same InputFrames', () => {
  const level = buildFixtureLevel();
  const seed = 7;
  const frames: InputFrame[] = [
    { moveAxis: 1, jumpPressed: false, resetPressed: false },
    { moveAxis: 1, jumpPressed: true, resetPressed: false },
    { moveAxis: 0, jumpPressed: false, resetPressed: false },
    { moveAxis: 1, jumpPressed: false, resetPressed: false },
    NEUTRAL_INPUT,
  ];

  const { sdk } = makeRecordingSdk();
  const lifecycle = createPortalLifecycle(sdk, createAudioExecutor(createTraceAudioDevice().device));
  const shell = createGameShell({ def: level, seed, grammar: DEFAULT_GRAMMAR, pack: PAPER_STYLE_PACK, tileSizePx: 1 }, lifecycle);
  for (const frame of frames) shell.advanceFrame(FIXED_STEP_SECONDS, frame, VIEWPORT);

  const manager = new StateManager<WorldState>(createInitialState(level, seed));
  const engine = new Engine<WorldState>({ systems: CANONICAL_PIPELINE, stateManager: manager });
  let headless = manager.getState();
  for (const frame of frames) {
    manager.commit({ ...manager.getState(), input: frame });
    headless = engine.tick(FIXED_STEP_SECONDS);
  }

  assert.deepEqual(shell.currentState(), headless, 'GameShell must not diverge from the headless CANONICAL_PIPELINE drive by even one bit');
});

test('a zero real-time delta advances zero fixed steps (matches Clock.advance\'s own contract)', () => {
  const level = buildFixtureLevel();
  const { sdk } = makeRecordingSdk();
  const lifecycle = createPortalLifecycle(sdk, createAudioExecutor(createTraceAudioDevice().device));
  const shell = createGameShell({ def: level, seed: 1, grammar: DEFAULT_GRAMMAR, pack: PAPER_STYLE_PACK, tileSizePx: 1 }, lifecycle);
  const before = shell.currentState().tick;
  shell.advanceFrame(0, NEUTRAL_INPUT, VIEWPORT);
  assert.equal(shell.currentState().tick, before);
});

test('gameplayStart fires exactly once on the first meaningful input, not on neutral frames', () => {
  const level = buildFixtureLevel();
  const { sdk, calls } = makeRecordingSdk();
  const lifecycle = createPortalLifecycle(sdk, createAudioExecutor(createTraceAudioDevice().device));
  const shell = createGameShell({ def: level, seed: 1, grammar: DEFAULT_GRAMMAR, pack: PAPER_STYLE_PACK, tileSizePx: 1 }, lifecycle);

  shell.advanceFrame(FIXED_STEP_SECONDS, NEUTRAL_INPUT, VIEWPORT);
  shell.advanceFrame(FIXED_STEP_SECONDS, NEUTRAL_INPUT, VIEWPORT);
  assert.deepEqual(calls, [], 'neutral input must never trigger gameplayStart');

  shell.advanceFrame(FIXED_STEP_SECONDS, { moveAxis: 1, jumpPressed: false, resetPressed: false }, VIEWPORT);
  assert.deepEqual(calls, ['gameplayStart']);

  shell.advanceFrame(FIXED_STEP_SECONDS, { moveAxis: 1, jumpPressed: false, resetPressed: false }, VIEWPORT);
  assert.deepEqual(calls, ['gameplayStart'], 'must not re-fire while still actively playing');
});

test('gameplayStop fires on a REAL defeat transition, and gameplayStart re-arms on the next meaningful input after reload', () => {
  /* Spawn on solid ground, a few tiles away from a spike on the same floor —
     walking right eventually produces a genuine swept-hazard defeat
     (HazardsAndGoal.ts) through the real sim, not a fabricated WorldState.
     Spawn must NOT overlap the spike, or every reload would immediately
     re-die on the same tick (the fresh spawn would re-trigger defeat before
     ever committing a 'playing' snapshot). */
  const width = 10;
  const height = 6;
  const tiles: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const border = row === 0 || row === height - 1 || col === 0 || col === width - 1;
      tiles.push(border ? 1 : 0);
    }
  }
  const raw = {
    schemaVersion: 1,
    levelId: 'game-shell-defeat-fixture',
    title: 'S9.8 defeat fixture',
    gdos: gdosFixture('game-shell-defeat-fixture'),
    tilemap: { width, height, tileSize: 1, tiles },
    entities: [
      { id: 'spike-ahead', transform: { position: { x: 6.5, y: 4.5 }, facing: 1 }, collider: { halfExtents: { x: 0.5, y: 0.5 }, offset: { x: 0, y: 0 } }, behavior: { kind: 'spike' } },
    ],
    triggers: [],
    constraints: { spawn: { x: 2.5, y: 4.5 }, goal: { position: { x: 8.5, y: 4.5 }, halfExtents: { x: 0.5, y: 0.5 } }, parTimeTiersSeconds: [30, 10] },
  };
  const result = parseLevel(raw);
  if (!result.ok) throw new Error(`fixture failed schema gate: ${JSON.stringify(result.errors)}`);
  const level = result.value;

  const { sdk, calls } = makeRecordingSdk();
  const lifecycle = createPortalLifecycle(sdk, createAudioExecutor(createTraceAudioDevice().device));
  const shell = createGameShell({ def: level, seed: 1, grammar: DEFAULT_GRAMMAR, pack: PAPER_STYLE_PACK, tileSizePx: 1 }, lifecycle);

  const moveRight: InputFrame = { moveAxis: 1, jumpPressed: false, resetPressed: false };
  const MAX_TICKS = 300;
  let diedAtTick = -1;
  for (let i = 0; i < MAX_TICKS && diedAtTick === -1; i++) {
    shell.advanceFrame(FIXED_STEP_SECONDS, moveRight, VIEWPORT);
    if (shell.currentState().world.runState === 'defeated') diedAtTick = i;
  }
  assert.ok(diedAtTick >= 0, `expected the player to walk into the spike within ${MAX_TICKS} ticks`);
  assert.deepEqual(calls, ['gameplayStart', 'gameplayStop']);

  /* Next tick: Lifecycle (first in the pipeline) reloads back to 'playing'
     before anything else runs, and the fresh spawn does NOT overlap the
     spike, so it genuinely stays 'playing' — neither start nor stop fires
     on the reload itself. */
  shell.advanceFrame(FIXED_STEP_SECONDS, NEUTRAL_INPUT, VIEWPORT);
  assert.equal(shell.currentState().world.runState, 'playing');
  assert.deepEqual(calls, ['gameplayStart', 'gameplayStop'], 'a reload by itself must not trigger any lifecycle call');

  /* A fresh meaningful input after the reload re-arms gameplayStart. */
  shell.advanceFrame(FIXED_STEP_SECONDS, moveRight, VIEWPORT);
  assert.deepEqual(calls, ['gameplayStart', 'gameplayStop', 'gameplayStart']);
});
