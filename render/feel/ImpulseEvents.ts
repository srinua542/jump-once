/**
 * ImpulseEvents — jump/landing edge-detection + particle burst spawning
 * (S9.5, REQ-150's particle-burst sub-clause). Both edges are pure
 * transition detectors over two already-committed `WorldState` snapshots —
 * never a continuous condition, so a burst fires EXACTLY ONCE per jump/
 * landing, no matter how many render frames observe the same tick pair.
 *
 * `jumpFired`: the jump-lock's impulse actually released this tick
 * (`anticipating` → `spent`, S3.5's forward-only machine) — not merely
 * "anticipating", which can last several ticks and must not re-trigger a
 * burst every one of them.
 *
 * `landed`: the player transitioned from airborne to grounded this tick.
 *
 * Bursts are spawned into the S9.4 `ParticlePool`; the outward angle/speed
 * jitter is drawn from an INJECTED seeded `RngFn` (bible §4/dm-0003 —
 * never `Math.random`), NOT the simulation's own `Rng` (that stream is
 * reserved for gameplay-affecting decisions; visual jitter must never
 * perturb it or be perturbed by unrelated sim draws).
 */

import type { Vec2 } from '../../src/core/Vec2';
import type { WorldState } from '../../src/entities/World';
import type { GrammarCategoryId } from '../grammar/Grammar';
import type { Pool, PoolHandle } from '../pool/Pool';
import type { ParticleInstance } from '../pool/ParticlePool';
import type { RngFn } from '../style/paper/PaperRng';
import type { BurstTuning } from './FeelProfile';

export function jumpFired(previous: WorldState, current: WorldState): boolean {
  return previous.jumpLock.phase === 'anticipating' && current.jumpLock.phase === 'spent';
}

export function landed(previous: WorldState, current: WorldState): boolean {
  return !previous.playerGrounded && current.playerGrounded;
}

/** Acquire up to `tuning.count` particles at `at`, radiating outward. Returns the handles actually acquired (fewer than `count` if the pool is near capacity). */
export function spawnBurst(
  pool: Pool<ParticleInstance>,
  at: Vec2,
  tuning: BurstTuning,
  category: GrammarCategoryId,
  rnd: RngFn,
): readonly PoolHandle[] {
  const handles: PoolHandle[] = [];
  for (let i = 0; i < tuning.count; i++) {
    const angle = rnd() * Math.PI * 2;
    const speed = tuning.speed * (0.5 + rnd() * 0.5);
    const handle = pool.acquire({
      worldX: at.x,
      worldY: at.y,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      ticksRemaining: tuning.lifetimeTicks,
      category,
    });
    if (handle !== null) handles.push(handle);
  }
  return handles;
}
