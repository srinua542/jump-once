/**
 * Canvas2D — the real `CanvasRenderingContext2D` binding for the `Raster2D`
 * seam (render/style/Raster2D.ts, S11.2, dm-0086/dm-0121). Construction
 * only: every `Raster2D` method forwards 1:1 to the same-named (or
 * same-shaped property-assignment) real context call — no branching beyond
 * the fail-fast context-acquisition guard.
 *
 * `rasterizeToPixelData` closes the loop `render/gl/Batcher.ts`'s
 * `RasterizeToPixels` seam expects: draw a `StylePack` visual into a hidden
 * offscreen 2D canvas sized to the request, then read it back as `PixelData`
 * for `Atlas.ensureRegion`'s GPU upload. `ImageData.data` is already a
 * `Uint8ClampedArray` — the exact shape `PixelData.rgba` wants, no
 * conversion needed.
 */

import type { CompositeOperation, LineCap, Raster2D } from '../style/Raster2D';
import type { PixelData } from '../gl/Gl2Device';
import type { StylePack, VisualRequest } from '../style/StylePack';

export function createCanvas2DRaster(ctx: CanvasRenderingContext2D): Raster2D {
  return {
    save: () => ctx.save(),
    restore: () => ctx.restore(),
    translate: (x, y) => ctx.translate(x, y),
    scale: (sx, sy) => ctx.scale(sx, sy),
    rotate: (radians) => ctx.rotate(radians),
    beginPath: () => ctx.beginPath(),
    moveTo: (x, y) => ctx.moveTo(x, y),
    lineTo: (x, y) => ctx.lineTo(x, y),
    quadraticCurveTo: (cpx, cpy, x, y) => ctx.quadraticCurveTo(cpx, cpy, x, y),
    arc: (cx, cy, radius, startAngle, endAngle, counterclockwise) => ctx.arc(cx, cy, radius, startAngle, endAngle, counterclockwise),
    closePath: () => ctx.closePath(),
    fill: () => ctx.fill(),
    stroke: () => ctx.stroke(),
    fillRect: (x, y, w, h) => ctx.fillRect(x, y, w, h),
    setFillStyle: (color: string) => {
      ctx.fillStyle = color;
    },
    setStrokeStyle: (color: string) => {
      ctx.strokeStyle = color;
    },
    setLineWidth: (width: number) => {
      ctx.lineWidth = width;
    },
    setLineCap: (cap: LineCap) => {
      ctx.lineCap = cap;
    },
    setLineDash: (segments: readonly number[]) => ctx.setLineDash([...segments]),
    setGlobalAlpha: (alpha: number) => {
      ctx.globalAlpha = alpha;
    },
    setGlobalCompositeOperation: (op: CompositeOperation) => {
      ctx.globalCompositeOperation = op;
    },
  };
}

function create2dContext(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('Canvas2D: 2D context unavailable for offscreen rasterization');
  }
  return ctx;
}

/** Rasterize one StylePack visual request into pixel data, for Atlas.ensureRegion's GPU upload. */
export function rasterizeToPixelData(pack: StylePack, request: VisualRequest, width: number, height: number): PixelData {
  const ctx = create2dContext(width, height);
  pack.rasterize(request, createCanvas2DRaster(ctx));
  const imageData = ctx.getImageData(0, 0, width, height);
  return { width, height, rgba: imageData.data };
}
