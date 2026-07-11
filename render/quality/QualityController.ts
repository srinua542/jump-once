/**
 * QualityController — REQ-163's dynamic quality scale-back, and the IRD's P9
 * exit condition (S9.10). A pure frame-time EMA state machine over
 * shell-reported durations: `QualityControllerState` never lives in
 * `WorldState`/`GameState` (render-layer-only, exactly like `CameraState`,
 * dm-0004/dm-0082) — the shell threads it frame-to-frame through its own
 * separate chain, never the sim's.
 *
 * Degrade is prioritized over upgrade on any tick where both would fire
 * (pressure relief matters more than optimism) and steps exactly one tier at
 * a time — never skips a rung. Upgrade additionally requires
 * `stabilityWindowTicks` CONSECUTIVE good ticks (a single good tick after a
 * long bad streak must not immediately re-detail the scene); any tick that
 * fails the upgrade threshold resets that streak to zero. Both directions
 * share one `cooldownTicks` floor since the last transition (hysteresis
 * alone does not prevent oscillation if the thresholds are ever probed at a
 * tick-by-tick cadence — the cooldown does).
 */

import type { QualityProfile, QualityTierRule } from './QualityProfile';

export interface QualityControllerState {
  readonly tierIndex: number;
  readonly ema: number;
  readonly ticksObserved: number;
  readonly ticksSinceTransition: number;
  readonly stableTicks: number;
}

/** Start at the best tier, with the cooldown already elapsed (a transition may fire on the very first pressured tick). */
export function createQualityController(profile: QualityProfile): QualityControllerState {
  return { tierIndex: 0, ema: 0, ticksObserved: 0, ticksSinceTransition: profile.cooldownTicks, stableTicks: 0 };
}

export function currentTier(profile: QualityProfile, state: QualityControllerState): QualityTierRule {
  return profile.tiers[state.tierIndex];
}

/** Fold in one shell-reported frame time (ms); may step the tier at most one rung in one direction. Pure. */
export function reportFrameTime(profile: QualityProfile, state: QualityControllerState, frameTimeMs: number): QualityControllerState {
  const ema = state.ticksObserved === 0 ? frameTimeMs : state.ema + (frameTimeMs - state.ema) * profile.emaAlpha;
  const ticksObserved = state.ticksObserved + 1;
  const ticksSinceTransition = state.ticksSinceTransition + 1;
  const canTransition = ticksSinceTransition >= profile.cooldownTicks;
  const worstIndex = profile.tiers.length - 1;

  if (canTransition && ema > profile.degradeThresholdMs && state.tierIndex < worstIndex) {
    return { tierIndex: state.tierIndex + 1, ema, ticksObserved, ticksSinceTransition: 0, stableTicks: 0 };
  }

  const stableTicks = ema <= profile.upgradeThresholdMs ? state.stableTicks + 1 : 0;

  if (canTransition && state.tierIndex > 0 && stableTicks >= profile.stabilityWindowTicks) {
    return { tierIndex: state.tierIndex - 1, ema, ticksObserved, ticksSinceTransition: 0, stableTicks: 0 };
  }

  return { tierIndex: state.tierIndex, ema, ticksObserved, ticksSinceTransition, stableTicks };
}
