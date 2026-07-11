/**
 * S9.6 — WebAudio procedural signatures + cue derivation (REQ-071 audio
 * share; REQ-170 WebAudio share). Cue derivation exactly-once per
 * transition; per-category patches compile to expected node-graph plans;
 * six patches structurally distinct; mute/resume gates scheduling;
 * derivation is pure.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { LevelDefinition } from '../../src/components/Level';
import { instantiateWorld, type WorldState } from '../../src/entities/World';
import { parseLevel } from '../../src/schema/Parse';
import { DEFAULT_GRAMMAR, GRAMMAR_CATEGORY_IDS } from '../../render/grammar/Grammar';
import { createTraceAudioDevice } from '../../render/audio/AudioDevice';
import { compilePatch } from '../../render/audio/PatchCompiler';
import { deriveAudioCues } from '../../render/audio/CueDerivation';
import { createAudioExecutor } from '../../render/audio/AudioExecutor';
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
  const width = 8;
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
    levelId: 'audio-fixture',
    title: 'S9.6 audio fixture',
    gdos: gdosFixture('audio-fixture'),
    tilemap: { width, height, tileSize: 1, tiles },
    entities: [
      { id: 'ice-1', transform: { position: { x: 4.5, y: 4.5 }, facing: 1 }, collider: { halfExtents: { x: 0.5, y: 0.5 }, offset: { x: 0, y: 0 } }, behavior: { kind: 'iceSurface' } },
    ],
    triggers: [],
    constraints: { spawn: { x: 2.5, y: 3.5 }, goal: { position: { x: 6.5, y: 3.5 }, halfExtents: { x: 0.5, y: 0.5 } }, parTimeTiersSeconds: [30, 10] },
  };
  const result = parseLevel(raw);
  if (!result.ok) throw new Error(`fixture failed schema gate: ${JSON.stringify(result.errors)}`);
  return result.value;
}

/* ── Cue derivation ────────────────────────────────────────────────────── */

test('deriveAudioCues fires a "landed" cue exactly once on the airborne -> grounded edge, categorized by what was landed on', () => {
  const level = buildFixtureLevel();
  const base = instantiateWorld(level);
  const airborne: WorldState = { ...base, playerGrounded: false, playerGroundEntity: -1 };
  const groundedOnTile: WorldState = { ...base, playerGrounded: true, playerGroundEntity: -1 };
  const stillGrounded: WorldState = { ...base, playerGrounded: true, playerGroundEntity: -1 };

  const cues = deriveAudioCues(airborne, groundedOnTile, DEFAULT_GRAMMAR);
  assert.equal(cues.length, 1);
  assert.deepEqual(cues[0], { transition: 'landed', category: 'safe' });

  const noRepeat = deriveAudioCues(groundedOnTile, stillGrounded, DEFAULT_GRAMMAR);
  assert.equal(noRepeat.length, 0, 'remaining grounded must not re-fire the landed cue every tick');
});

test('deriveAudioCues categorizes a landing on an entity by that entity\'s grammar category (ice -> safe, since iceSurface binds to safe)', () => {
  const level = buildFixtureLevel();
  const base = instantiateWorld(level);
  const iceIndex = level.entities.findIndex((e) => e.id === 'ice-1');
  const airborne: WorldState = { ...base, playerGrounded: false, playerGroundEntity: -1 };
  const groundedOnIce: WorldState = { ...base, playerGrounded: true, playerGroundEntity: iceIndex };
  const cues = deriveAudioCues(airborne, groundedOnIce, DEFAULT_GRAMMAR);
  assert.equal(cues.length, 1);
  assert.deepEqual(cues[0], { transition: 'landed', category: 'safe' });
});

test('deriveAudioCues fires "defeat" exactly on the transition into runState===defeated', () => {
  const level = buildFixtureLevel();
  const base = instantiateWorld(level);
  const playing: WorldState = { ...base, runState: 'playing' };
  const defeated: WorldState = { ...base, runState: 'defeated' };
  assert.deepEqual(deriveAudioCues(playing, defeated, DEFAULT_GRAMMAR), [{ transition: 'defeat', category: 'danger' }]);
  assert.deepEqual(deriveAudioCues(defeated, defeated, DEFAULT_GRAMMAR), [], 'holding defeated must not re-fire');
});

test('deriveAudioCues fires "goal" exactly on the transition into runState===completed', () => {
  const level = buildFixtureLevel();
  const base = instantiateWorld(level);
  const playing: WorldState = { ...base, runState: 'playing' };
  const completed: WorldState = { ...base, runState: 'completed' };
  assert.deepEqual(deriveAudioCues(playing, completed, DEFAULT_GRAMMAR), [{ transition: 'goal', category: 'interactive' }]);
  assert.deepEqual(deriveAudioCues(completed, completed, DEFAULT_GRAMMAR), [], 'holding completed must not re-fire');
});

test('deriveAudioCues is pure: identical snapshot pairs always yield identical cues', () => {
  const level = buildFixtureLevel();
  const base = instantiateWorld(level);
  const airborne: WorldState = { ...base, playerGrounded: false, playerGroundEntity: -1 };
  const grounded: WorldState = { ...base, playerGrounded: true, playerGroundEntity: -1 };
  const a = deriveAudioCues(airborne, grounded, DEFAULT_GRAMMAR);
  const b = deriveAudioCues(airborne, grounded, DEFAULT_GRAMMAR);
  assert.deepEqual(a, b);
});

/* ── PatchCompiler ─────────────────────────────────────────────────────── */

test('compilePatch produces a gain-envelope + oscillator/noise + master-connect call sequence', () => {
  const { device, trace } = createTraceAudioDevice();
  compilePatch(PAPER_STYLE_PACK.audioPatch('danger'), device);
  const calls = trace();
  assert.ok(calls[0].startsWith('createGain'));
  assert.ok(calls.some((l) => l.startsWith('connectGainToMaster')));
  assert.ok(calls.some((l) => l.startsWith('setGainEnvelope')));
  assert.ok(calls.some((l) => l.startsWith('createOscillator') || l.startsWith('createNoiseSource')));
  assert.ok(calls.some((l) => l.startsWith('start')));
});

test('the six category patches compile to structurally distinct node-graph plans', () => {
  const plans = GRAMMAR_CATEGORY_IDS.map((category) => {
    const { device, trace } = createTraceAudioDevice();
    compilePatch(PAPER_STYLE_PACK.audioPatch(category), device);
    return trace().join('\n');
  });
  assert.equal(new Set(plans).size, GRAMMAR_CATEGORY_IDS.length, 'expected six pairwise-distinct compiled plans');
});

test('a noise-waveform patch (secret) never calls createOscillator/setFrequencyRamp; a tonal patch never calls createNoiseSource', () => {
  const noiseDevice = createTraceAudioDevice();
  compilePatch(PAPER_STYLE_PACK.audioPatch('secret'), noiseDevice.device);
  const noiseTrace = noiseDevice.trace().join('\n');
  assert.ok(noiseTrace.includes('createNoiseSource'));
  assert.ok(!noiseTrace.includes('createOscillator'));
  assert.ok(!noiseTrace.includes('setFrequencyRamp'));

  const tonalDevice = createTraceAudioDevice();
  compilePatch(PAPER_STYLE_PACK.audioPatch('danger'), tonalDevice.device);
  const tonalTrace = tonalDevice.trace().join('\n');
  assert.ok(tonalTrace.includes('createOscillator'));
  assert.ok(!tonalTrace.includes('createNoiseSource'));
});

/* ── AudioExecutor: mute/resume gating ─────────────────────────────────── */

test('scheduleCues issues device calls when unmuted', () => {
  const { device, trace } = createTraceAudioDevice();
  const executor = createAudioExecutor(device);
  executor.scheduleCues([{ transition: 'defeat', category: 'danger' }], PAPER_STYLE_PACK);
  assert.ok(trace().length > 0);
});

test('muteForBreak silences the master gain AND stops scheduleCues from issuing any device calls at all', () => {
  const { device, trace } = createTraceAudioDevice();
  const executor = createAudioExecutor(device);
  executor.muteForBreak();
  assert.equal(executor.muted, true);
  assert.ok(trace().some((l) => l === 'setMasterGain(0)'));

  const before = trace().length;
  executor.scheduleCues([{ transition: 'goal', category: 'interactive' }], PAPER_STYLE_PACK);
  assert.equal(trace().length, before, 'no new device calls must be issued while muted — not even silent ones');
});

test('resume unmutes and restores scheduling', () => {
  const { device, trace } = createTraceAudioDevice();
  const executor = createAudioExecutor(device);
  executor.muteForBreak();
  executor.resume();
  assert.equal(executor.muted, false);
  assert.ok(trace().some((l) => l === 'setMasterGain(1)'));
  const before = trace().length;
  executor.scheduleCues([{ transition: 'landed', category: 'safe' }], PAPER_STYLE_PACK);
  assert.ok(trace().length > before, 'scheduling must resume issuing device calls');
});
