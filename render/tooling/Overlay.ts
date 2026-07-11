/**
 * Overlay — REQ-131 P9 share: painting the P8 debug descriptors
 * (`tools/debug/Overlay.ts`) into plain-data primitives.
 *
 * `render/tooling/` is the ONLY `render/` area permitted to import `tools/`
 * (dm-0081) — the game shell renders the sim, not the tooling. This module
 * is the presentation half of REQ-131 part 1 (dm-0065): P8 already computes
 * every descriptor as pure geometry; this file turns those six descriptor
 * kinds into a semantic, still-device-free primitive list. Colour/stroke
 * choices are deliberately NOT baked in here — they are a rendering
 * decision, and binding to a real canvas is `render/platform/`'s job (P11,
 * dm-0103's precedent): `source` on each primitive is the semantic hook a
 * future executor keys its stroke style from.
 *
 * Zero P8 modification: every descriptor function is called verbatim.
 */

import type { Vec2 } from '../../src/core/Vec2';
import type { JumpOnceState } from '../../src/entities/World';
import {
  hitboxDescriptors,
  jumpArcDescriptor,
  normalDescriptor,
  pathDescriptors,
  physicsStateDescriptor,
  triggerDescriptors,
} from '../../tools/debug/Overlay';

/** How far the ground-normal arrow extends past the player position, in world units. Debug-visualization-only. */
export const NORMAL_ARROW_LENGTH_WORLD_UNITS = 0.5;

export type OverlaySource = 'hitbox' | 'trigger' | 'path' | 'jumpArc' | 'normal' | 'physicsState';

export interface OverlayRect {
  readonly kind: 'rect';
  readonly source: 'hitbox';
  readonly id: string;
  readonly cx: number;
  readonly cy: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

export interface OverlayPolyline {
  readonly kind: 'polyline';
  readonly source: 'trigger' | 'path' | 'jumpArc' | 'normal';
  readonly id: string;
  readonly points: readonly Vec2[];
}

export interface OverlayLabel {
  readonly kind: 'label';
  readonly source: 'physicsState';
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly text: string;
}

export type OverlayPrimitive = OverlayRect | OverlayPolyline | OverlayLabel;
export type OverlayDrawList = readonly OverlayPrimitive[];

/**
 * Paint every P8 descriptor kind (hitbox, trigger, path, jump-arc, normal,
 * physics-state) for `state` into plain-data primitives. `jumpArcTicks`
 * bounds the forward preview (`jumpArcDescriptor` never mutates `state`).
 */
export function paintOverlays(state: JumpOnceState, jumpArcTicks: number): OverlayDrawList {
  const world = state.world;
  const out: OverlayPrimitive[] = [];

  for (const h of hitboxDescriptors(world)) {
    out.push({ kind: 'rect', source: 'hitbox', id: h.id, cx: h.center.x, cy: h.center.y, halfWidth: h.halfExtents.x, halfHeight: h.halfExtents.y });
  }

  for (const t of triggerDescriptors(world)) {
    if (t.sourcePosition === null) continue;
    for (let i = 0; i < t.targetPositions.length; i++) {
      out.push({ kind: 'polyline', source: 'trigger', id: `${t.id}#${i}`, points: [t.sourcePosition, t.targetPositions[i]] });
    }
  }

  for (const p of pathDescriptors(world)) {
    out.push({ kind: 'polyline', source: 'path', id: p.id, points: p.points });
  }

  const arc = jumpArcDescriptor(state, jumpArcTicks);
  out.push({ kind: 'polyline', source: 'jumpArc', id: 'jump-arc', points: arc.points });

  const normal = normalDescriptor(world);
  if (normal !== null) {
    const origin = world.playerPosition;
    const tip: Vec2 = { x: origin.x + normal.x * NORMAL_ARROW_LENGTH_WORLD_UNITS, y: origin.y + normal.y * NORMAL_ARROW_LENGTH_WORLD_UNITS };
    out.push({ kind: 'polyline', source: 'normal', id: 'player-normal', points: [origin, tip] });
  }

  const physics = physicsStateDescriptor(world);
  out.push({
    kind: 'label',
    source: 'physicsState',
    id: 'physics-state',
    x: world.playerPosition.x,
    y: world.playerPosition.y,
    text: `grounded=${physics.grounded} phase=${physics.jumpLockPhase} run=${physics.runState}`,
  });

  return out;
}
