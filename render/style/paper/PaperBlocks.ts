/**
 * PaperBlocks — the 9-slice rough-ink slab library, the single source of
 * structural geometry for every block-based entity (S9.2, bible §4a). A
 * direct port of blockSlab()/BLOCK_EDGES (src/assets/paper-asset-library.html):
 * only a slab's OUTER (exposed) edges carry the torn/cut jitter; inner edges
 * stay flush and bleed outward by `BLEED` so neighbouring pieces overlap
 * (no anti-aliasing crack) — this is what lets floors/walls/platforms tile
 * seamlessly while still reading as hand-cut paper on their exposed side.
 *
 * dm-0080's clean-solid rule is structural here, not an afterthought: this
 * module draws ONLY the outline fill plus a faint top-edge highlight — no
 * interior wear/grain call exists in `blockSlab` at all, so a solid block's
 * interior can never regress to the "noisy black" the dm-0079/dm-0080 fix
 * corrected.
 */

import type { Raster2D } from '../Raster2D';
import { roughLine } from './Geometry';
import type { RngFn } from './PaperRng';

/** Which sides of a 9-slice piece carry the outer torn edge. */
export interface BlockEdges {
  readonly t?: true;
  readonly r?: true;
  readonly b?: true;
  readonly l?: true;
}

export const BLOCK_EDGES: Readonly<Record<string, BlockEdges>> = Object.freeze({
  tl: Object.freeze({ t: true, l: true }),
  t: Object.freeze({ t: true }),
  tr: Object.freeze({ t: true, r: true }),
  l: Object.freeze({ l: true }),
  c: Object.freeze({}),
  r: Object.freeze({ r: true }),
  bl: Object.freeze({ b: true, l: true }),
  b: Object.freeze({ b: true }),
  br: Object.freeze({ b: true, r: true }),
  all: Object.freeze({ t: true, r: true, b: true, l: true }),
});

/**
 * Draw one rough-ink slab. Outer (exposed) edges are inset by `IN` and
 * jittered by `j`; inner (shared) edges are bled outward by `BLEED` and stay
 * dead straight — the seamless-tiling contract (bible §4a). No interior
 * wear/grain (dm-0079/dm-0080): structural blocks are clean solid ink.
 */
export function blockSlab(
  g: Raster2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rnd: RngFn,
  edges: BlockEdges = BLOCK_EDGES.all,
  color = '#232019',
  j = 1.4,
): void {
  const IN = 2;
  const BLEED = 1;
  const xa = edges.l ? x + IN : x - BLEED;
  const xb = edges.r ? x + w - IN : x + w + BLEED;
  const ya = edges.t ? y + IN : y - BLEED;
  const yb = edges.b ? y + h - IN : y + h + BLEED;
  const corners: readonly (readonly [number, number])[] = [[xa, ya], [xb, ya], [xb, yb], [xa, yb]];
  const outer: readonly (true | undefined)[] = [edges.t, edges.r, edges.b, edges.l];

  g.setFillStyle(color);
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const n = Math.max(1, Math.round(Math.hypot(dx, dy) / 14));
    const jj = outer[i] ? j : 0;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const px = a[0] + dx * t + (rnd() - 0.5) * jj * 2;
      const py = a[1] + dy * t + (rnd() - 0.5) * jj * 2;
      if (i === 0 && k === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
  }
  g.closePath();
  g.fill();

  if (edges.t) {
    g.setStrokeStyle(color);
    g.setGlobalAlpha(0.4);
    const strokes = Math.max(1, Math.round(w / 90));
    for (let i = 0; i < strokes; i++) {
      const px = x + 3 + rnd() * (w - 22);
      roughLine(g, px, ya + 1.5, px + 10 + rnd() * 10, ya + 1, rnd, 1.2, 0.4);
    }
    g.setGlobalAlpha(1);
  }
}

/** A fully-torn free-standing slab (all four edges outer). */
export function inkBlock(g: Raster2D, x: number, y: number, w: number, h: number, rnd: RngFn, color = '#232019', j = 1.4): void {
  blockSlab(g, x, y, w, h, rnd, BLOCK_EDGES.all, color, j);
}
