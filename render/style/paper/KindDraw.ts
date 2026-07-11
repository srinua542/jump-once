/**
 * KindDraw — one base/overlay draw pair per schema `behavior.kind` (S9.2,
 * bible §2 principle 9 / §4a, dm-0078). Direct port of the reference
 * engine's KindDraw table (src/assets/paper-asset-library.html), covering
 * exactly the twelve `EntityKind`s (src/components/Behavior.ts) plus the
 * `player` and `goal` roles.
 *
 * Every entry's `base` is seeded from the KIND ALONE (never state, never
 * per-instance identity) so an entity's silhouette/proportions/block
 * structure are byte-identical across every state — the dm-0078 fix,
 * structural here rather than a convention: `drawKind` below always derives
 * the base RNG from `hashSeed(BASE_SEED, kind)` and nothing else. Only
 * `overlay` (indicators, beams, accents, moving parts) varies with state.
 *
 * Live, per-frame, time-driven elements the reference engine draws OUTSIDE
 * KindDraw (dashed waypoint paths, the laser beam raycast, the animated
 * conveyor chevron sweep, trigger wires, id labels — all in its `render()`
 * loop) are OUT OF SCOPE here by design: those are scene-compiler concerns
 * (S9.3) driven by `MotionSpec`/observable state transitions, not baked into
 * a cached bitmap. The spawn-position wayfinding marker is a non-grammar-
 * bound wayfinding decoration (no `RenderableRole` names it) and is
 * similarly out of scope for this port — noted, not silently dropped.
 *
 * dm-0085 (ledgered at S9.1 planning, applied here): the goal's flag pennant
 * is `GOAL_ACCENT` (teal, Interactive) — NOT the reference sheet's original
 * terracotta — because the goal is bound to Interactive, not Danger, in
 * `render/grammar/Grammar.ts`'s `DEFAULT_GRAMMAR`. Every other colour below
 * (including `movingPlatform`'s ink glyph and `conveyor`'s ink/cream body)
 * is carried forward UNCHANGED from the reference sheet — on inspection
 * during this port, neither ever used a terracotta accent, correcting an
 * inaccurate assumption in dm-0084's original rationale text (see dm-0090).
 */

import type { EntityKind } from '../../../src/components/Behavior';
import type { Raster2D } from '../Raster2D';
import { blockSlab } from './PaperBlocks';
import { fillRough, roughLine, roughPoly, roughRect, wear, type Point } from './Geometry';
import { createRng, hashSeed, type RngFn } from './PaperRng';
import { CREAM, GOAL_ACCENT, INK, LAVENDER, PINK, TEAL, TEAL_DARK, TERRA, WASHED_BLUE } from './Palette';

export interface KindDrawEntry {
  base(g: Raster2D, T: number, rnd: RngFn): void;
  overlay?(g: Raster2D, T: number, rnd: RngFn, state: string): void;
}

export const KindDraw: Readonly<Record<EntityKind, KindDrawEntry>> = Object.freeze({
  movingPlatform: {
    base(g, T, rnd) {
      blockSlab(g, 2, T * 0.36, T - 4, T * 0.26, rnd, undefined, INK, 1.4);
      g.setStrokeStyle(INK);
      g.setFillStyle(INK);
      roughLine(g, T * 0.3, T * 0.24, T * 0.7, T * 0.24, rnd, 2, 0.5);
      roughPoly(g, [[T * 0.3, T * 0.19], [T * 0.2, T * 0.24], [T * 0.3, T * 0.29]], rnd, 0.5, 4);
      g.fill();
      roughPoly(g, [[T * 0.7, T * 0.19], [T * 0.8, T * 0.24], [T * 0.7, T * 0.29]], rnd, 0.5, 4);
      g.fill();
    },
  },

  collapsingFloor: {
    base(g, T, rnd) {
      blockSlab(g, 2, 2, T - 4, T - 4, rnd, undefined, PINK, 1.6);
      g.setStrokeStyle(INK);
      g.setLineWidth(1.6);
      roughLine(g, T * 0.55, 4, T * 0.42, T * 0.5, rnd, 1.6, 1.6);
      roughLine(g, T * 0.42, T * 0.5, T * 0.6, T - 4, rnd, 1.6, 1.6);
      roughLine(g, T * 0.42, T * 0.5, T * 0.2, T * 0.66, rnd, 1.4, 1.4);
    },
    overlay(g, T, rnd, state) {
      if (!state || state === 'intact') return;
      g.setStrokeStyle(INK);
      g.setLineWidth(1.6);
      roughLine(g, T * 0.75, 4, T * 0.8, T - 4, rnd, 1.8, 2.2);
      roughLine(g, T * 0.2, 4, T * 0.16, T * 0.5, rnd, 1.6, 2);
      g.setFillStyle(INK);
      for (let i = 0; i < 7; i++) g.fillRect(rnd() * T, T - 6 + rnd() * 10, 2.5, 2.5);
    },
  },

  iceSurface: {
    base(g, T, rnd) {
      blockSlab(g, 2, 2, T - 4, T - 4, rnd, undefined, WASHED_BLUE, 1.4);
      g.setStrokeStyle('rgba(255,255,252,.85)');
      g.setLineWidth(3);
      roughLine(g, T * 0.2, T * 0.75, T * 0.62, T * 0.3, rnd, 3, 0.8);
      roughLine(g, T * 0.5, T * 0.85, T * 0.8, T * 0.55, rnd, 2, 0.7);
      g.setStrokeStyle('rgba(35,32,25,.5)');
      g.setLineWidth(1.2);
      for (let i = 0; i < 3; i++) roughLine(g, T * (0.25 + i * 0.25), T - 3, T * (0.25 + i * 0.25), T + 4, rnd, 1.4, 0.4);
    },
  },

  spike: {
    base(g, T, rnd) {
      g.setFillStyle(INK);
      const n = 4;
      const s = T / n;
      for (let i = 0; i < n; i++) {
        const px = i * s;
        roughPoly(g, [[px, T], [px + s / 2, T - s * 1.25], [px + s, T]], rnd, 0.9, 6);
        g.fill();
      }
    },
  },

  laser: {
    base(g, T, rnd) {
      blockSlab(g, T * 0.28, T * 0.14, T * 0.24, T * 0.72, rnd, undefined, INK, 1.2);
      g.setStrokeStyle(INK);
      roughLine(g, T * 0.2, T * 0.1, T * 0.2, T * 0.24, rnd, 1.6, 0.4);
      roughLine(g, T * 0.2, T * 0.76, T * 0.2, T * 0.9, rnd, 1.6, 0.4);
    },
    overlay(g, T, _rnd, state) {
      g.setFillStyle(state === 'off' ? 'rgba(205,91,51,.35)' : TERRA);
      g.fillRect(T * 0.46, T * 0.42, T * 0.1, T * 0.16);
    },
  },

  movingHazard: {
    base(g, T, rnd) {
      const cx = T / 2;
      const cy = T / 2;
      const r = T * 0.24;
      g.setFillStyle(INK);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * 6.283;
        const spike: readonly Point[] = [
          [cx + Math.cos(a - 0.28) * r, cy + Math.sin(a - 0.28) * r],
          [cx + Math.cos(a) * (r + T * 0.14), cy + Math.sin(a) * (r + T * 0.14)],
          [cx + Math.cos(a + 0.28) * r, cy + Math.sin(a + 0.28) * r],
        ];
        roughPoly(g, spike, rnd, 0.6, 5);
        g.fill();
      }
      g.beginPath();
      g.arc(cx, cy, r, 0, 7);
      g.fill();
      g.setFillStyle(PINK);
      g.beginPath();
      g.arc(cx, cy, r * 0.45, 0, 7);
      g.fill();
      wear(g, cx - r, cy - r, r * 2, r * 2, rnd, 0.5);
    },
  },

  pressurePlate: {
    base(g, T, rnd) {
      blockSlab(g, T * 0.12, T - 0.14 * T, T * 0.76, T * 0.14, rnd, undefined, INK, 1.2);
    },
    overlay(g, T, rnd, state) {
      const up = state === 'pressed' ? T * 0.06 : T * 0.16;
      g.setFillStyle(TERRA);
      roughRect(g, T * 0.2, T - 0.14 * T - up, T * 0.6, up + 2, rnd, 1);
      g.fill();
      wear(g, T * 0.2, T - 0.14 * T - up, T * 0.6, up, rnd, 0.4);
      if (state === 'pressed') {
        g.setStrokeStyle(INK);
        roughLine(g, T * 0.12, T * 0.62, T * 0.2, T * 0.72, rnd, 1.4, 0.4);
        roughLine(g, T * 0.88, T * 0.62, T * 0.8, T * 0.72, rnd, 1.4, 0.4);
      }
    },
  },

  proximityZone: {
    base(g, T, _rnd) {
      g.setStrokeStyle(TEAL_DARK);
      g.setLineWidth(2);
      g.setLineDash([5, 5]);
      g.beginPath();
      g.arc(T / 2, T / 2, T * 0.42, 0, 7);
      g.stroke();
      g.setLineDash([]);
      const s = T * 0.24;
      const cx = T / 2;
      const cy = T / 2;
      g.setFillStyle(TEAL);
      g.beginPath();
      g.moveTo(cx - s, cy);
      g.quadraticCurveTo(cx, cy - s * 0.85, cx + s, cy);
      g.quadraticCurveTo(cx, cy + s * 0.85, cx - s, cy);
      g.fill();
      g.setStrokeStyle(INK);
      g.setLineWidth(1.6);
      g.beginPath();
      g.moveTo(cx - s, cy);
      g.quadraticCurveTo(cx, cy - s * 0.85, cx + s, cy);
      g.quadraticCurveTo(cx, cy + s * 0.85, cx - s, cy);
      g.stroke();
      g.setFillStyle(CREAM);
      g.beginPath();
      g.arc(cx, cy, s * 0.4, 0, 7);
      g.fill();
      g.setFillStyle(INK);
      g.beginPath();
      g.arc(cx, cy, s * 0.18, 0, 7);
      g.fill();
    },
  },

  door: {
    base(g, T, rnd) {
      blockSlab(g, T * 0.14, T * 0.02, T * 0.72, T * 0.98, rnd, undefined, INK, 1.8);
    },
    overlay(g, T, rnd, state) {
      if (state === 'open') {
        fillRough(g, T * 0.26, T * 0.12, T * 0.48, T * 0.84, LAVENDER, rnd, 1);
      } else {
        fillRough(g, T * 0.26, T * 0.12, T * 0.48, T * 0.84, '#171512', rnd, 1);
        g.setFillStyle(CREAM);
        g.beginPath();
        g.arc(T * 0.64, T * 0.55, 2.4, 0, 7);
        g.fill();
      }
    },
  },

  spring: {
    base(g, T, rnd) {
      blockSlab(g, T * 0.2, T - 0.12 * T, T * 0.6, T * 0.12, rnd, undefined, INK, 1);
    },
    overlay(g, T, rnd, state) {
      const ext = state === 'launch' ? T * 0.52 : T * 0.3;
      g.setStrokeStyle(INK);
      g.setLineWidth(2.6);
      g.setLineCap('round');
      g.beginPath();
      const zz = 5;
      for (let i = 0; i <= zz; i++) {
        const yy = T - 0.12 * T - (i / zz) * ext;
        const xx = T / 2 + (i % 2 ? 1 : -1) * T * 0.14;
        if (i === 0) g.moveTo(T / 2, T - 0.12 * T);
        else g.lineTo(xx, yy);
      }
      g.lineTo(T / 2, T - 0.12 * T - ext);
      g.stroke();
      fillRough(g, T * 0.24, T - 0.12 * T - ext - T * 0.1, T * 0.52, T * 0.1, PINK, rnd, 1);
      if (state === 'launch') {
        g.setStrokeStyle(TERRA);
        for (let i = -1; i <= 1; i++) {
          roughLine(g, T / 2 + i * T * 0.14, T * 0.26, T / 2 + i * T * 0.17, T * 0.1, rnd, 1.6, 0.5);
        }
      }
    },
  },

  gravityZone: {
    base(g, T, rnd) {
      g.setStrokeStyle(LAVENDER);
      g.setLineWidth(2.2);
      g.setLineDash([6, 5]);
      roughRect(g, 3, 3, T - 6, T - 6, rnd, 1);
      g.stroke();
      g.setLineDash([]);
      g.setGlobalAlpha(0.14);
      g.setFillStyle(LAVENDER);
      g.fillRect(4, 4, T - 8, T - 8);
      g.setGlobalAlpha(1);
      g.setFillStyle(INK);
      for (let i = 0; i < 5; i++) g.fillRect(6 + rnd() * (T - 12), 6 + rnd() * (T - 12), 1.8, 1.8);
    },
    overlay(g, T, rnd, state) {
      const up = state !== 'normal';
      g.setStrokeStyle(INK);
      g.setFillStyle(INK);
      for (let i = 0; i < 2; i++) {
        const px = T * (0.35 + i * 0.3);
        const y1 = up ? T * 0.68 : T * 0.32;
        const y2 = up ? T * 0.32 : T * 0.68;
        roughLine(g, px, y1, px, y2, rnd, 2, 0.5);
        const arrow: readonly Point[] = up
          ? [[px - 4, y2 + 7], [px, y2 - 1], [px + 4, y2 + 7]]
          : [[px - 4, y2 - 7], [px, y2 + 1], [px + 4, y2 - 7]];
        roughPoly(g, arrow, rnd, 0.5, 4);
        g.fill();
      }
    },
  },

  conveyor: {
    base(g, T, rnd) {
      blockSlab(g, 2, T * 0.36, T - 4, T * 0.28, rnd, undefined, INK, 1.6);
      g.setFillStyle(CREAM);
      g.beginPath();
      g.arc(T * 0.14, T * 0.5, T * 0.08, 0, 7);
      g.arc(T * 0.86, T * 0.5, T * 0.08, 0, 7);
      g.fill();
      g.setStrokeStyle(INK);
      g.setLineWidth(1.4);
      g.beginPath();
      g.arc(T * 0.14, T * 0.5, T * 0.08, 0, 7);
      g.stroke();
      g.beginPath();
      g.arc(T * 0.86, T * 0.5, T * 0.08, 0, 7);
      g.stroke();
    },
  },
});

const BASE_SEED = 900;
const OVERLAY_SEED = 1700;

/** Draw a kind's base (kind-seeded only, dm-0078) + state overlay (if any) into `g`. */
export function drawKind(g: Raster2D, kind: EntityKind, T: number, state: string): void {
  const def = KindDraw[kind];
  def.base(g, T, createRng(hashSeed(BASE_SEED, kind)));
  if (def.overlay) def.overlay(g, T, createRng(hashSeed(hashSeed(OVERLAY_SEED, kind), state)), state);
}

/** The player avatar. `pose`: 'idle' | 'prejump' | 'air'. Ported verbatim (INK ink figure, no category — the avatar is not a grammar signal). */
export function drawPlayer(g: Raster2D, cx: number, baseY: number, rnd: RngFn, pose: string, s = 1): void {
  g.save();
  g.translate(cx, baseY);
  g.scale(s, s);
  g.setFillStyle(INK);
  const air = pose === 'air';
  const sq = pose === 'prejump' ? 1 : 0;
  if (!air) {
    fillRough(g, -5.5, -8 + sq * 2, 3.4, 8 - sq * 2, INK, rnd, 0.5);
    fillRough(g, 2.1, -8 + sq * 2, 3.4, 8 - sq * 2, INK, rnd, 0.5);
  } else {
    fillRough(g, -6.5, -9, 3.4, 6, INK, rnd, 0.5);
    fillRough(g, 3.1, -7, 3.4, 5, INK, rnd, 0.5);
  }
  const bh = pose === 'prejump' ? 12 : 14;
  const bt = air ? -24 : -8 - bh;
  roughPoly(g, [[-5, bt], [5, bt], [7.5, air ? -9 : -8 + sq * 2], [-7.5, air ? -9 : -8 + sq * 2]], rnd, 0.7, 5);
  g.fill();
  const hy = bt - 6.5 + (pose === 'prejump' ? 1.5 : 0);
  g.beginPath();
  g.arc(0, hy, 8, 0, 7);
  g.fill();
  roughPoly(g, [[-8, hy - 2], [8, hy - 2], [8, hy + 4], [-8, hy + 4]], rnd, 0.6, 6);
  g.fill();
  g.setFillStyle('#fff');
  g.beginPath();
  g.arc(-3, hy - 0.5, 1.7, 0, 7);
  g.arc(3.4, hy - 0.5, 1.7, 0, 7);
  g.fill();
  g.restore();
}

/**
 * The goal pennant. dm-0085: `GOAL_ACCENT` (teal) replaces the reference
 * sheet's original terracotta fill — the goal is bound to Interactive, not
 * Danger, so its silhouette-and-colour signature must not collide with a
 * hazard's.
 */
export function drawFlag(g: Raster2D, x: number, groundY: number, rnd: RngFn, s = 1): void {
  g.save();
  g.translate(x, groundY);
  g.scale(s, s);
  g.setStrokeStyle(INK);
  roughLine(g, 0, 0, 0, -52, rnd, 3, 0.8);
  g.setFillStyle(GOAL_ACCENT);
  roughPoly(g, [[1, -52], [30, -43], [1, -33]], rnd, 1, 6);
  g.fill();
  fillRough(g, -7, -3, 14, 4, INK, rnd, 0.8);
  g.restore();
}
