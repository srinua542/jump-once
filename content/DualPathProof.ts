/**
 * DualPathProof — REQ-100's Dual-Path axiom, proven by composition over the
 * existing OptimizationVerdict (P10/S10.2, dm-0110).
 *
 * GDOS alignment: Section 11 — every level supports a Discovery Path and a
 * Mastery Path in one physical space. For a one-jump precision platformer the
 * "two paths" are execution-quality ROUTES through identical geometry (a
 * slow-but-legible discovery route and a materially faster optimized route),
 * NOT branching layout — authoring literal alternate geometry would violate
 * REQ-005's rejection of power-set depth expansion. That distinction is exactly
 * what `src/eval/local/Optimization.ts` already measures:
 *   - `applicable` — both a discovery completion and a search/archetype-derived
 *     optimum exist, so a spread is meaningful, and
 *   - `deltaSeconds` — Time_Discovery − Time_WorldRecord, REQ-102's own metric.
 *
 * A level is dual-path iff it is applicable AND its delta clears a calibrated
 * `minDeltaSeconds` floor. No new path-counting mechanism, no route-authoring
 * API — the proof is a pure read of a lower layer's verdict (the dm-0107
 * discipline: never re-derive what a lower layer already computes).
 *
 * Pure over (verdict, profile). Whitelist math (none). Lives in content/.
 */

import type { OptimizationVerdict } from '../src/eval/local/Optimization';

export interface DualPathProfile {
  /** The minimum Discovery→World-Record spread (seconds) a shippable level must offer. > 0. */
  readonly minDeltaSeconds: number;
}

/** The S10.2 baseline; recalibrated with a ledger entry if the pilot shows drift (dm-0113). */
export const DEFAULT_DUAL_PATH_PROFILE: DualPathProfile = Object.freeze({
  minDeltaSeconds: 0.25,
});

export interface DualPathVerdict {
  /** True iff the level supports a genuine discovery-vs-mastery route spread. */
  readonly isDualPath: boolean;
  /** The measured Discovery→WR delta in seconds, or null when the window is inapplicable. */
  readonly deltaSeconds: number | null;
  /** Why the verdict is what it is (for the campaign evidence manifest). */
  readonly reason: string;
}

/**
 * Prove the Dual-Path axiom for one level from its optimization window.
 * A verdict that is not `applicable` cannot be dual-path (there is no measurable
 * second route); an applicable verdict passes iff its delta clears the floor.
 */
export function proveDualPath(
  verdict: OptimizationVerdict,
  profile: DualPathProfile = DEFAULT_DUAL_PATH_PROFILE,
): DualPathVerdict {
  if (!verdict.applicable || verdict.deltaSeconds === undefined) {
    return {
      isDualPath: false,
      deltaSeconds: null,
      reason: 'optimization window inapplicable — no measurable discovery-vs-mastery spread (REQ-100 unmet)',
    };
  }
  const delta = verdict.deltaSeconds;
  if (delta < profile.minDeltaSeconds) {
    return {
      isDualPath: false,
      deltaSeconds: delta,
      reason: `discovery→WR spread ${delta.toFixed(2)}s below the ${profile.minDeltaSeconds}s dual-path floor — the level is too flat for a mastery route (REQ-102)`,
    };
  }
  return {
    isDualPath: true,
    deltaSeconds: delta,
    reason: `discovery→WR spread ${delta.toFixed(2)}s clears the ${profile.minDeltaSeconds}s floor — a distinct mastery route exists in one space (REQ-100)`,
  };
}
