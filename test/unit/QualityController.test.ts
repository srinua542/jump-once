/**
 * S9.10 — render/quality/: the dynamic quality controller (REQ-163) and the
 * IRD's P9 exit condition. Synthetic frame-time sequences drive tier
 * transitions; the REQ-016 x REQ-163 interlock (applyTier never drops a
 * critical item) is proven directly against DrawItem fixtures.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { DrawItem, DrawList } from '../../render/scene/DrawList';
import { DEFAULT_QUALITY_PROFILE, type QualityProfile } from '../../render/quality/QualityProfile';
import { createQualityController, currentTier, reportFrameTime, type QualityControllerState } from '../../render/quality/QualityController';
import { applyTier } from '../../render/quality/QualityTier';

function drawItem(critical: boolean, id: string): DrawItem {
  return {
    bitmap: { id, widthPx: 8, heightPx: 8 },
    request: { role: 'terrain', state: 'default', widthPx: 8, heightPx: 8, identitySeed: 0 },
    category: 'safe',
    critical,
    worldX: 0,
    worldY: 0,
    anchorX: 0,
    anchorY: 0,
  };
}

test('DEFAULT_QUALITY_PROFILE maintains the hysteresis gap (upgradeThresholdMs strictly below degradeThresholdMs)', () => {
  assert.ok(DEFAULT_QUALITY_PROFILE.upgradeThresholdMs < DEFAULT_QUALITY_PROFILE.degradeThresholdMs);
  assert.ok(DEFAULT_QUALITY_PROFILE.tiers.length >= 2);
  assert.equal(DEFAULT_QUALITY_PROFILE.tiers[0].nonCriticalBudget, null, 'the best tier is unlimited');
});

test('applyTier never drops a critical item, at any budget including zero', () => {
  const drawList: DrawList = [drawItem(true, 'crit-1'), drawItem(true, 'crit-2'), drawItem(false, 'decor-1'), drawItem(false, 'decor-2')];
  const out = applyTier(drawList, { id: 'noGrain', nonCriticalBudget: 0 });
  assert.equal(out.filter((i) => i.critical).length, 2);
  assert.equal(out.filter((i) => !i.critical).length, 0);
});

test('applyTier keeps up to nonCriticalBudget non-critical items, in original order, and drops the rest', () => {
  const drawList: DrawList = [drawItem(false, 'a'), drawItem(true, 'crit'), drawItem(false, 'b'), drawItem(false, 'c')];
  const out = applyTier(drawList, { id: 'reducedParticles', nonCriticalBudget: 2 });
  assert.deepEqual(out.map((i) => i.bitmap.id), ['a', 'crit', 'b']);
});

test('applyTier is a no-op when nonCriticalBudget is null (the full tier)', () => {
  const drawList: DrawList = [drawItem(false, 'a'), drawItem(true, 'b'), drawItem(false, 'c')];
  const out = applyTier(drawList, { id: 'full', nonCriticalBudget: null });
  assert.deepEqual(out, drawList);
});

test('reportFrameTime computes a standard exponential moving average, seeded by the first observation', () => {
  const profile: QualityProfile = { ...DEFAULT_QUALITY_PROFILE, cooldownTicks: 1000 }; // suppress transitions for this math-only check
  let state = createQualityController(profile);
  state = reportFrameTime(profile, state, 10);
  assert.equal(state.ema, 10, 'first observation seeds the EMA directly');
  state = reportFrameTime(profile, state, 20);
  assert.equal(state.ema, 10 + (20 - 10) * profile.emaAlpha);
});

test('sustained high frame time degrades exactly one tier once the cooldown elapses, never skipping a rung', () => {
  const profile: QualityProfile = { ...DEFAULT_QUALITY_PROFILE, cooldownTicks: 20 };
  let state = createQualityController(profile);
  // A constant 100ms input converges the EMA to exactly 100 after the very first tick, so
  // the remaining 9 ticks (all inside the 20-tick cooldown) cannot trigger a second transition.
  for (let i = 0; i < 10; i++) state = reportFrameTime(profile, state, 100); // far above degradeThresholdMs
  assert.equal(state.tierIndex, 1, 'must step exactly one rung, not jump straight to the worst tier');
});

test('the cooldown blocks a second transition from firing immediately after the first (no boundary oscillation)', () => {
  const profile: QualityProfile = { ...DEFAULT_QUALITY_PROFILE, cooldownTicks: 10 };
  let state = createQualityController(profile);
  state = reportFrameTime(profile, state, 100); // first pressured tick: cooldown already elapsed at creation -> degrades immediately
  assert.equal(state.tierIndex, 1);
  for (let i = 0; i < 8; i++) {
    state = reportFrameTime(profile, state, 100); // still pressured, but within cooldown
    assert.equal(state.tierIndex, 1, `tick ${i}: must not degrade again before cooldownTicks elapse`);
  }
});

test('scale-up requires the FULL stability window of consecutive good ticks — a single good tick is not enough', () => {
  // Hand-constructed mid-flight state (already degraded to tier 1, EMA already settled low) so
  // this test isolates the stability-window COUNTING logic from the EMA's own decay curve.
  const profile: QualityProfile = { ...DEFAULT_QUALITY_PROFILE, cooldownTicks: 1, stabilityWindowTicks: 5 };
  let state: QualityControllerState = { tierIndex: 1, ema: 1, ticksObserved: 1, ticksSinceTransition: profile.cooldownTicks, stableTicks: 0 };

  for (let i = 0; i < 4; i++) {
    state = reportFrameTime(profile, state, 1); // well under upgradeThresholdMs
    assert.equal(state.tierIndex, 1, `tick ${i}: must not scale up before the stability window elapses`);
  }
  state = reportFrameTime(profile, state, 1); // the 5th consecutive good tick
  assert.equal(state.tierIndex, 0, 'scale-up returns to the better tier once the stability window is satisfied');
});

test('a single bad tick mid-stability-window resets the streak — the window must be truly consecutive', () => {
  // emaAlpha: 1 removes smoothing lag so each fed value IS the EMA on that tick, isolating the
  // streak-reset logic from decay-curve arithmetic. The spike (18ms) is chosen to sit strictly
  // between upgradeThresholdMs (14) and degradeThresholdMs (20): it must reset the streak without
  // itself triggering a further degrade.
  const profile: QualityProfile = { ...DEFAULT_QUALITY_PROFILE, cooldownTicks: 1, stabilityWindowTicks: 3, emaAlpha: 1 };
  let state: QualityControllerState = { tierIndex: 1, ema: 1, ticksObserved: 1, ticksSinceTransition: profile.cooldownTicks, stableTicks: 0 };

  state = reportFrameTime(profile, state, 1); // good (1/3)
  state = reportFrameTime(profile, state, 1); // good (2/3)
  assert.equal(state.tierIndex, 1);
  assert.equal(state.stableTicks, 2);

  state = reportFrameTime(profile, state, 18); // a spike between the two thresholds -- resets the streak, does not degrade
  assert.equal(state.tierIndex, 1, 'must not re-degrade: the spike never exceeded degradeThresholdMs');
  assert.equal(state.stableTicks, 0, 'the streak must reset — it was not degradeThresholdMs-worthy but was still above upgradeThresholdMs');

  state = reportFrameTime(profile, state, 1); // good (1/3, streak reset)
  state = reportFrameTime(profile, state, 1); // good (2/3)
  assert.equal(state.tierIndex, 1, 'must still be degraded — the interrupted streak restarted from zero');
  state = reportFrameTime(profile, state, 1); // good (3/3)
  assert.equal(state.tierIndex, 0, 'now the full fresh window has elapsed');
});

test('the tier index never goes below 0 (full) or above the worst rung', () => {
  const profile: QualityProfile = { ...DEFAULT_QUALITY_PROFILE, cooldownTicks: 1, stabilityWindowTicks: 1 };
  let state = createQualityController(profile);
  for (let i = 0; i < 50; i++) state = reportFrameTime(profile, state, 1); // sustained good, well past 'full'
  assert.equal(state.tierIndex, 0);

  for (let i = 0; i < 50; i++) state = reportFrameTime(profile, state, 100); // sustained bad, well past the worst tier
  assert.equal(state.tierIndex, profile.tiers.length - 1);
});

test('currentTier resolves the profile rule at the controller\'s current tierIndex', () => {
  const profile = DEFAULT_QUALITY_PROFILE;
  const state: QualityControllerState = { tierIndex: 2, ema: 0, ticksObserved: 0, ticksSinceTransition: 0, stableTicks: 0 };
  assert.equal(currentTier(profile, state).id, profile.tiers[2].id);
});

test('reportFrameTime is a pure function of (profile, state, frameTimeMs) — identical inputs produce identical output, and the prior state is untouched', () => {
  const profile = DEFAULT_QUALITY_PROFILE;
  const state = createQualityController(profile);
  const frozen = JSON.stringify(state);
  const a = reportFrameTime(profile, state, 25);
  const b = reportFrameTime(profile, state, 25);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(state), frozen, 'reportFrameTime must not mutate the state it was handed');
});
