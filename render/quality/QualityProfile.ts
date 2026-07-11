/**
 * QualityProfile — the tuning data behind the dynamic quality controller
 * (S9.10, REQ-163). Render-layer aesthetic/performance data (dm-0083, same
 * class as `CameraProfile`/`FeelProfile`): nothing here can change how the
 * player moves, jumps, or collides — only how much of the already-simulated
 * scene gets drawn.
 *
 * The tier ladder is ordered best-to-worst (`tiers[0]` is always the fully
 * detailed tier, `tiers[length - 1]` the most reduced). Each rung's
 * `nonCriticalBudget` bounds how many `critical: false` `DrawItem`s survive
 * `applyTier` (`null` only ever on the best tier — unlimited). The REQ-016 ×
 * REQ-163 interlock is structural, not a rule this profile could violate:
 * `applyTier` (QualityTier.ts) never inspects, let alone drops, a `critical:
 * true` item regardless of budget.
 *
 * Hysteresis (`upgradeThresholdMs` strictly below `degradeThresholdMs`) plus
 * a `cooldownTicks` floor between any two transitions are what prevent
 * boundary oscillation when frame time hovers near a threshold;
 * `stabilityWindowTicks` additionally requires a sustained run of good
 * frames — not just one — before scaling back up.
 */

export type QualityTierId = 'full' | 'reducedParticles' | 'noDeferredDecoration' | 'noGrain';

export interface QualityTierRule {
  readonly id: QualityTierId;
  /** Max `critical: false` DrawItems kept at this tier. `null` = unlimited (the best tier only). Non-negative when finite. */
  readonly nonCriticalBudget: number | null;
}

export interface QualityProfile {
  /** Ordered best (index 0) to worst (last index). At least 2 entries (there must be somewhere to degrade to). */
  readonly tiers: readonly QualityTierRule[];
  /** Frame-time EMA smoothing factor. In (0, 1]. */
  readonly emaAlpha: number;
  /** EMA (ms) above which pressure builds to degrade one tier. Strictly positive. */
  readonly degradeThresholdMs: number;
  /** EMA (ms) at or below which pressure builds to upgrade one tier. Strictly positive and < degradeThresholdMs (the hysteresis gap). */
  readonly upgradeThresholdMs: number;
  /** Minimum ticks between any two tier transitions. Non-negative integer. */
  readonly cooldownTicks: number;
  /** Consecutive good (<= upgradeThresholdMs) ticks required before a scale-up actually happens. Positive integer. */
  readonly stabilityWindowTicks: number;
}

export const DEFAULT_QUALITY_PROFILE: QualityProfile = Object.freeze({
  tiers: Object.freeze([
    Object.freeze({ id: 'full', nonCriticalBudget: null }),
    Object.freeze({ id: 'reducedParticles', nonCriticalBudget: 64 }),
    Object.freeze({ id: 'noDeferredDecoration', nonCriticalBudget: 24 }),
    Object.freeze({ id: 'noGrain', nonCriticalBudget: 8 }),
  ]) as readonly QualityTierRule[],
  emaAlpha: 0.2,
  degradeThresholdMs: 20,
  upgradeThresholdMs: 14,
  cooldownTicks: 30,
  stabilityWindowTicks: 120,
}) as QualityProfile;
