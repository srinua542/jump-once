/**
 * Camera — render-layer-only viewpoint state (S9.3, REQ-150 camera share).
 *
 * `CameraState` never lives in `WorldState`/`GameState` and is never written
 * back into the sim (dm-0004/dm-0082 projection purity): the shell (S9.8)
 * threads it frame-to-frame exactly like `StateManager` threads simulation
 * state, but through its OWN separate chain. `updateCamera` is a pure
 * exponential-smoothing step toward a target world position — never an
 * instant snap — so the camera glides rather than jitters.
 */

import type { Vec2 } from '../../src/core/Vec2';

export interface CameraState {
  readonly x: number;
  readonly y: number;
}

/** Render-layer tuning data (dm-0083: aesthetic materials, not gameplay values). */
export interface CameraProfile {
  /** Fraction of the remaining distance to the target closed per tick. In (0, 1]. */
  readonly smoothing: number;
}

export const DEFAULT_CAMERA_PROFILE: CameraProfile = Object.freeze({ smoothing: 0.12 });

export function createCamera(x: number, y: number): CameraState {
  return { x, y };
}

/** One smoothing step toward `target`. Pure; never mutates its arguments. */
export function updateCamera(camera: CameraState, target: Vec2, profile: CameraProfile = DEFAULT_CAMERA_PROFILE): CameraState {
  return {
    x: camera.x + (target.x - camera.x) * profile.smoothing,
    y: camera.y + (target.y - camera.y) * profile.smoothing,
  };
}
