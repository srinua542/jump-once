/**
 * ParticlePool — the REQ-161 particle/visual-impact instantiation of the
 * generic Pool (S9.4). Capacity is profile data, never a literal buried in
 * logic (dm-0083's materials-behind-data discipline extended to render
 * tuning). Consumed by S9.5's game-feel modifiers (jump burst, landing
 * impact) to spawn/reclaim short-lived particle instances without
 * per-particle allocation churn.
 */

import type { GrammarCategoryId } from '../grammar/Grammar';
import { createPool, type Pool } from './Pool';

export interface ParticleInstance {
  readonly worldX: number;
  readonly worldY: number;
  readonly velocityX: number;
  readonly velocityY: number;
  /** Ticks remaining before the particle expires (fixed-step-driven, never wall-clock). */
  readonly ticksRemaining: number;
  readonly category: GrammarCategoryId;
}

export interface ParticlePoolProfile {
  readonly capacity: number;
}

export const DEFAULT_PARTICLE_POOL_PROFILE: ParticlePoolProfile = Object.freeze({ capacity: 128 });

export function createParticlePool(profile: ParticlePoolProfile = DEFAULT_PARTICLE_POOL_PROFILE): Pool<ParticleInstance> {
  return createPool<ParticleInstance>(profile.capacity);
}
