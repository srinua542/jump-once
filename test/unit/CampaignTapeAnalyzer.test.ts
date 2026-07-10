/**
 * S6.2 — TapeAnalyzer (REQ-032 Player Behavior Model, dm-0043/dm-0044/dm-0049).
 * Every signal is derived from ArchetypeRun.tape.frames (or run.attempts/
 * outcome directly for retryCount/dropOffRate) — frame counts only, never
 * wall-clock, never level geometry.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { analyzeTape } from '../../src/eval/campaign/TapeAnalyzer';
import { DEFAULT_CAMPAIGN_PROFILE } from '../../src/eval/campaign/CampaignProfile';
import { campaignProfileWith } from '../helpers/CampaignFixtures';
import { TAPE_SCHEMA_VERSION, type ReplayTape } from '../../src/schema/TapeIO';
import type { ArchetypeRun } from '../../src/eval/gdos/Evidence';
import type { InputFrame } from '../../src/core/State';

function frame(moveAxis: -1 | 0 | 1, jumpPressed = false, resetPressed = false): InputFrame {
  return { moveAxis, jumpPressed, resetPressed };
}

function tapeOf(frames: readonly InputFrame[]): ReplayTape {
  return { schemaVersion: TAPE_SCHEMA_VERSION, levelId: 'tape-analyzer-fixture', seed: 1, frames };
}

function runOf(frames: readonly InputFrame[], outcome: 'completed' | 'timeout' = 'completed', attempts = 0): ArchetypeRun {
  return { archetype: 'firstTime', outcome, attempts, ticksElapsed: frames.length, tape: tapeOf(frames) };
}

test('a trivially short, empty-input tape reports every signal at its neutral value', () => {
  const run = runOf([frame(0), frame(0), frame(0)]);
  const signals = analyzeTape(run, DEFAULT_CAMPAIGN_PROFILE);
  assert.equal(signals.hesitationFrames, 0);
  assert.equal(signals.retryCount, 0);
  assert.equal(signals.panicBurstCount, 0);
  assert.equal(signals.commitmentSpeed, undefined);
  assert.equal(signals.platformCheckCount, 0);
  assert.equal(signals.dropOffRate, 0);
});

test('hesitation: the longest no-input gap before a jump press is reported when it clears the profiled threshold', () => {
  const profile = campaignProfileWith({ behavior: { hesitationFrameThreshold: 2 } });
  const frames = [frame(1), frame(0), frame(0), frame(0), frame(0), frame(1, true)];
  const signals = analyzeTape(runOf(frames), profile);
  assert.equal(signals.hesitationFrames, 4);
});

test('hesitation takes the MAXIMUM qualifying gap across multiple jump presses in the tape', () => {
  const profile = campaignProfileWith({ behavior: { hesitationFrameThreshold: 2 } });
  const frames = [
    frame(0), frame(1, true), // gap of 1 before first jump — below threshold, does not qualify
    frame(0), frame(0), frame(0), frame(1, true), // gap of 3 before second jump — qualifies
  ];
  const signals = analyzeTape(runOf(frames), profile);
  assert.equal(signals.hesitationFrames, 3);
});

test('hesitation below the profiled threshold does not count — a brief reaction-time pause is not hesitation', () => {
  const profile = campaignProfileWith({ behavior: { hesitationFrameThreshold: 10 } });
  const frames = [frame(1), frame(0), frame(0), frame(1, true)]; // gap of 2, below threshold 10
  const signals = analyzeTape(runOf(frames), profile);
  assert.equal(signals.hesitationFrames, 0);
});

test('commitment speed: the frame index of the first jump press; undefined if the tape never jumps', () => {
  const jumps = runOf([frame(1), frame(1), frame(1, true), frame(0)]);
  assert.equal(analyzeTape(jumps, DEFAULT_CAMPAIGN_PROFILE).commitmentSpeed, 2);

  const noJumps = runOf([frame(1), frame(1), frame(-1)]);
  assert.equal(analyzeTape(noJumps, DEFAULT_CAMPAIGN_PROFILE).commitmentSpeed, undefined);
});

test('aggressive commitment: jumping on the very first frame reports commitmentSpeed 0', () => {
  const run = runOf([frame(1, true), frame(0)]);
  assert.equal(analyzeTape(run, DEFAULT_CAMPAIGN_PROFILE).commitmentSpeed, 0);
});

test('retry cadence and drop-off read run.attempts/run.outcome directly, never re-derived from frames', () => {
  const completed = runOf([frame(0)], 'completed', 4);
  const signals1 = analyzeTape(completed, DEFAULT_CAMPAIGN_PROFILE);
  assert.equal(signals1.retryCount, 4);
  assert.equal(signals1.dropOffRate, 0);

  const timedOut = runOf([frame(0)], 'timeout', 0);
  const signals2 = analyzeTape(timedOut, DEFAULT_CAMPAIGN_PROFILE);
  assert.equal(signals2.dropOffRate, 1);
});

test('panic burst: a cluster of active-input edges within the profiled window counts as one burst', () => {
  const profile = campaignProfileWith({ behavior: { panicBurstWindowFrames: 6, panicBurstInputCount: 3 } });
  // Six movement/jump/reset edges packed into 6 frames.
  const frames = [frame(1), frame(-1), frame(1, true), frame(-1), frame(1), frame(0, false, true)];
  const run = runOf(frames);
  const signals = analyzeTape(run, profile);
  assert.equal(signals.panicBurstCount, 1);
});

test('panic burst: held (non-edge) input does not itself trigger a burst', () => {
  const profile = campaignProfileWith({ behavior: { panicBurstWindowFrames: 6, panicBurstInputCount: 3 } });
  // moveAxis held at 1 for 8 frames: exactly one movement edge (the first frame), no further edges.
  const frames = Array.from({ length: 8 }, () => frame(1));
  const run = runOf(frames);
  const signals = analyzeTape(run, profile);
  assert.equal(signals.panicBurstCount, 0);
});

test('panic burst: two well-separated clusters count as two bursts', () => {
  const profile = campaignProfileWith({ behavior: { panicBurstWindowFrames: 3, panicBurstInputCount: 3 } });
  const cluster = [frame(1), frame(-1), frame(1, true)];
  const gap = Array.from({ length: 10 }, () => frame(0));
  const frames = [...cluster, ...gap, ...cluster];
  const run = runOf(frames);
  const signals = analyzeTape(run, profile);
  assert.equal(signals.panicBurstCount, 2);
});

test('platform check: a direction reversal with no jump within the window counts as one check', () => {
  const profile = campaignProfileWith({ behavior: { platformCheckWindowFrames: 4 } });
  // approach (+1), reverse (-1) with no jump in the next 4 frames.
  const frames = [frame(1), frame(1), frame(-1), frame(0), frame(0), frame(0)];
  const run = runOf(frames);
  const signals = analyzeTape(run, profile);
  assert.equal(signals.platformCheckCount, 1);
});

test('platform check: a reversal immediately followed by a jump within the window is NOT counted (the player committed)', () => {
  const profile = campaignProfileWith({ behavior: { platformCheckWindowFrames: 4 } });
  const frames = [frame(1), frame(1), frame(-1), frame(0), frame(-1, true)];
  const run = runOf(frames);
  const signals = analyzeTape(run, profile);
  assert.equal(signals.platformCheckCount, 0);
});

test('platform check: the very first movement is never a reversal (no prior direction to reverse from)', () => {
  const profile = campaignProfileWith({ behavior: { platformCheckWindowFrames: 4 } });
  const frames = [frame(1), frame(1), frame(1)];
  const run = runOf(frames);
  const signals = analyzeTape(run, profile);
  assert.equal(signals.platformCheckCount, 0);
});

test('two-profile fixture: the SAME tape yields different panicBurstCount and platformCheckCount under different calibration (dm-0045 externalization proof)', () => {
  const frames = [frame(1), frame(-1), frame(1, true), frame(-1), frame(1), frame(-1)];
  const run = runOf(frames);

  const strict = campaignProfileWith({ behavior: { panicBurstWindowFrames: 6, panicBurstInputCount: 2, platformCheckWindowFrames: 1 } });
  const lenient = campaignProfileWith({ behavior: { panicBurstWindowFrames: 6, panicBurstInputCount: 20, platformCheckWindowFrames: 20 } });

  const strictSignals = analyzeTape(run, strict);
  const lenientSignals = analyzeTape(run, lenient);

  assert.ok(strictSignals.panicBurstCount > lenientSignals.panicBurstCount);
  assert.notEqual(strictSignals.platformCheckCount, lenientSignals.platformCheckCount);
});

test('two-profile fixture: the SAME tape yields different hesitationFrames under different thresholds (dm-0045 externalization proof)', () => {
  const frames = [frame(1), frame(0), frame(0), frame(0), frame(1, true)];
  const run = runOf(frames);
  const low = campaignProfileWith({ behavior: { hesitationFrameThreshold: 1 } });
  const high = campaignProfileWith({ behavior: { hesitationFrameThreshold: 10 } });
  assert.notEqual(analyzeTape(run, low).hesitationFrames, analyzeTape(run, high).hesitationFrames);
});
