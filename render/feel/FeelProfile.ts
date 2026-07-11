/**
 * FeelProfile — the versioned tuning data behind every game-feel modifier
 * (S9.5, REQ-150 visual sub-clauses). Render-layer aesthetic data (dm-0083):
 * no gameplay value lives here — nothing in this file can change how the
 * player moves, jumps, or collides, only how the already-simulated motion
 * READS on screen.
 */

export interface SquashStretchTuning {
  /** Vertical scale at maximum observed velocity (>1 = stretch). */
  readonly maxStretch: number;
  /** Horizontal scale at maximum observed velocity (<1 = squash). */
  readonly maxSquash: number;
  /** |velocity.y| (world units/sec) at which the effect reaches its maximum. Strictly positive. */
  readonly velocityForMaxEffect: number;
}

export interface BurstTuning {
  /** Particles spawned per burst. Positive integer. */
  readonly count: number;
  /** Outward speed, world units/sec. Strictly positive. */
  readonly speed: number;
  /** Particle lifetime, fixed ticks. Positive integer. */
  readonly lifetimeTicks: number;
}

export interface FeelProfile {
  readonly squashStretch: SquashStretchTuning;
  readonly jumpBurst: BurstTuning;
  readonly landingBurst: BurstTuning;
}

export const DEFAULT_FEEL_PROFILE: FeelProfile = Object.freeze({
  squashStretch: Object.freeze({ maxStretch: 1.25, maxSquash: 0.8, velocityForMaxEffect: 12 }),
  jumpBurst: Object.freeze({ count: 6, speed: 3, lifetimeTicks: 18 }),
  landingBurst: Object.freeze({ count: 4, speed: 2, lifetimeTicks: 12 }),
}) as FeelProfile;
