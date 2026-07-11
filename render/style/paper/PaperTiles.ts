/**
 * PaperTiles — the modular, seamless terrain autotile kit (S9.2, bible §4a,
 * dm-0079/dm-0080). Every tile is a T×T cell whose gameplay collision box is
 * a perfect, identical square; only the EXPOSED surfaces are drawn. A tile
 * fills its cell with clean solid ink and gives a gently torn paper edge to
 * any side facing empty space, while sides touching a solid neighbour stay
 * dead-straight and flush — edge irregularity tapers to 0 at the shared
 * corners, so adjacent tiles always meet seamlessly. Direct port of the
 * reference engine's PaperTiles (src/assets/paper-asset-library.html).
 *
 * `maskAt` takes an `isSolid` PREDICATE, not a tilemap — the caller decides
 * out-of-bounds handling (the reference convention, carried forward: solid
 * so a map's outer frame reads flush and only play-area-facing edges tear).
 */

import type { Raster2D } from '../Raster2D';
import { roughLine } from './Geometry';
import { createRng, type RngFn } from './PaperRng';

/** Bit set when that orthogonal neighbour is SOLID (edge is internal/flush). */
export const TILE_BITS = Object.freeze({ N: 1, E: 2, S: 4, W: 8 });

/** The documented construction kit — named masks (bit N=1,E=2,S=4,W=8). */
export const TILE_NAMES: Readonly<Record<string, number>> = Object.freeze({
  center: 15,
  top: 14,
  bottom: 11,
  left: 7,
  right: 13,
  cornerTL: 6,
  cornerTR: 12,
  cornerBL: 3,
  cornerBR: 9,
  isolated: 0,
  platformLeft: 2,
  platformMid: 10,
  platformRight: 8,
  wallTop: 4,
  wallMid: 5,
  wallBottom: 1,
});

/**
 * Walk edge a→b, pushing points offset INWARD by an envelope that is 0 at
 * both corners (flush, seamless) and gentle in the middle (the torn look).
 */
function tornEdge(
  pts: Array<readonly [number, number]>,
  ax: number, ay: number, bx: number, by: number,
  inx: number, iny: number,
  amp: number, rnd: RngFn,
): void {
  const len = Math.hypot(bx - ax, by - ay);
  const n = Math.max(2, Math.round(len / 11));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const env = Math.min(t, 1 - t) * 2;
    const d = (0.35 + rnd() * 0.65) * amp * env;
    pts.push([ax + (bx - ax) * t + inx * d, ay + (by - ay) * t + iny * d]);
  }
}

/** Draw one tile at the local origin, [0,0]..[T,T]. Edges erode INWARD only — never overhangs its cell. */
function drawTile(g: Raster2D, T: number, mask: number, rnd: RngFn, color: string): void {
  const sN = mask & TILE_BITS.N;
  const sE = mask & TILE_BITS.E;
  const sS = mask & TILE_BITS.S;
  const sW = mask & TILE_BITS.W;
  const amp = Math.max(1.4, T * 0.035);
  const pts: Array<readonly [number, number]> = [];

  if (sN) pts.push([0, 0], [T, 0]); else tornEdge(pts, 0, 0, T, 0, 0, 1, amp, rnd);
  if (sE) pts.push([T, 0], [T, T]); else tornEdge(pts, T, 0, T, T, -1, 0, amp, rnd);
  if (sS) pts.push([T, T], [0, T]); else tornEdge(pts, T, T, 0, T, 0, -1, amp, rnd);
  if (sW) pts.push([0, T], [0, 0]); else tornEdge(pts, 0, T, 0, 0, 1, 0, amp, rnd);

  g.setFillStyle(color);
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) g.moveTo(pts[i][0], pts[i][1]);
    else g.lineTo(pts[i][0], pts[i][1]);
  }
  g.closePath();
  g.fill();

  if (!sN) {
    g.setStrokeStyle(color);
    g.setGlobalAlpha(0.35);
    const strokes = Math.max(1, Math.round(T / 90));
    for (let i = 0; i < strokes; i++) {
      const px = 4 + rnd() * (T - 24);
      roughLine(g, px, 2.5, px + 10 + rnd() * 10, 2, rnd, 1.1, 0.4);
    }
    g.setGlobalAlpha(1);
  }
}

/**
 * Paint a tile DIRECTLY into a device at world (ox, oy) — terrain composes
 * this way (never per-tile blit) so adjacent flush edges share one
 * coordinate space with no sub-pixel sampling seam.
 */
export function paintTile(g: Raster2D, mask: number, T: number, ox: number, oy: number, variant: number, color: string): void {
  g.save();
  g.translate(ox, oy);
  drawTile(g, T, mask, createRng(1300 + mask * 29 + (variant || 0) * 131), color);
  g.restore();
}

/** 4-neighbour mask from a solid predicate (out-of-bounds handling is the predicate's call). */
export function maskAt(isSolid: (x: number, y: number) => boolean, x: number, y: number): number {
  return (isSolid(x, y - 1) ? TILE_BITS.N : 0) |
    (isSolid(x + 1, y) ? TILE_BITS.E : 0) |
    (isSolid(x, y + 1) ? TILE_BITS.S : 0) |
    (isSolid(x - 1, y) ? TILE_BITS.W : 0);
}
