/**
 * Score — shared scoring primitives for the GDOS gates (P5/S5.x).
 *
 * The [0,100] score scale is the definition of a GDOS score, not calibration
 * (dm-0031): 0 and 100 are the fixed endpoints every estimator maps into, so
 * clamping to them is not a magic number. All actual calibration (gains,
 * references, thresholds) lives in the ScoringProfile.
 *
 * Whitelist math only: Math.min / Math.max. Lives in src/eval/gdos/.
 */

/** Clamp an estimator output into the canonical [0,100] score range. */
export function clamp100(x: number): number {
  return Math.max(0, Math.min(100, x));
}
