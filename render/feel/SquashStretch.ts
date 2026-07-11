/**
 * SquashStretch — REQ-150's squash-and-stretch visual sub-clause (S9.5).
 * A pure function of the player's CURRENT vertical velocity (already
 * simulated, read-only): fast motion stretches the avatar vertically and
 * squashes it horizontally; zero velocity returns exactly to identity scale.
 * Never mutates `WorldState`; never influences physics.
 */

import type { FeelProfile } from './FeelProfile';

export interface Scale {
  readonly scaleX: number;
  readonly scaleY: number;
}

export const IDENTITY_SCALE: Scale = Object.freeze({ scaleX: 1, scaleY: 1 });

/** Derives a squash/stretch scale from vertical velocity. Identity at v=0; clamped at |v| >= velocityForMaxEffect. */
export function deriveSquashStretch(velocityY: number, profile: FeelProfile): Scale {
  const t = Math.min(1, Math.abs(velocityY) / profile.squashStretch.velocityForMaxEffect);
  const scaleY = 1 + t * (profile.squashStretch.maxStretch - 1);
  const scaleX = 1 - t * (1 - profile.squashStretch.maxSquash);
  return { scaleX, scaleY };
}
