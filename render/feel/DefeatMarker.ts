/**
 * DefeatMarker — REQ-016's fairness visual: failure information always
 * visually present (S9.5). Closes the dm-0089 open question left by S9.1
 * planning: `Lifecycle.ts` (P3-VERIFIED) reloads on the tick immediately
 * after `runState === 'defeated'`, so exactly ONE committed `WorldState`
 * snapshot ever carries it — but that snapshot is real and renders for
 * every real display frame the frame loop draws before the next fixed step
 * lands (S9.8's frame loop is decoupled from the tick rate; multiple real
 * frames may render the SAME current/previous pair at different
 * `interpolationAlpha` values before the next tick advances). No extra
 * "hold" state is needed at S9.5 — the marker's screen time already
 * follows naturally from the existing fixed-step/render decoupling.
 * dm-0097 records this as the resolution; if playtesting later shows it
 * reads as too brief, a genuine sim-side grace-tick in `Lifecycle.ts` is
 * the fallback (its own anchor-safety pass against a VERIFIED module).
 *
 * Scope note: this derives the marker's POSITION and CRITICAL flag from
 * real `WorldState` — a testable, deterministic proof that REQ-016's data
 * is always available. The exact pack-drawn glyph (an "X" or skull motif)
 * is a presentation refinement for a later slice; `render/grammar/Grammar.ts`
 * (S9.1, its own completed-not-verified surface) is deliberately left
 * untouched rather than widened for a single marker role mid-phase.
 */

import type { WorldState } from '../../src/entities/World';

export interface DefeatMarker {
  readonly worldX: number;
  readonly worldY: number;
  /** Always true — REQ-016's fairness signal must survive every quality tier. */
  readonly critical: true;
}

/** Null unless the world is currently defeated (the single renderable tick). */
export function deriveDefeatMarker(world: WorldState): DefeatMarker | null {
  if (world.runState !== 'defeated') return null;
  return { worldX: world.playerPosition.x, worldY: world.playerPosition.y, critical: true };
}
