/**
 * Batcher — folds a DrawList into per-atlas-page instanced batches (S9.4,
 * REQ-162). Every item sharing a page becomes ONE instanced draw call
 * regardless of instance count — this is the actual batching win: dozens of
 * identical terrain-tile bitmaps (same mask+variant) already share one
 * atlas region and therefore one page, so they draw together.
 *
 * `rasterizeToPixels` is injected (not looked up from a global) so this
 * module never touches a real canvas — render/platform/ (S9.8) supplies the
 * real implementation (StylePack.rasterize against a bound Raster2D, read
 * back as PixelData); tests supply `fakePixelData`.
 *
 * Scope note (dm-0096): this batches per-SPRITE instances (terrain tiles,
 * entities, player, goal) via GPU instancing — a full pre-composed
 * "one background bitmap per level" merge (the bible §5 optimization for
 * Canvas2D-idiom engines) is NOT built here; instanced same-page batching
 * already satisfies REQ-162's "render batching for static geometry" in the
 * draw-call sense. A future slice MAY add background pre-composition as a
 * further optimization; it is not required by any current test or REQ.
 */

import type { DrawList } from '../scene/DrawList';
import type { StylePack, VisualRequest } from '../style/StylePack';
import type { Atlas } from './Atlas';
import type { Gl2Device, PixelData } from './Gl2Device';

export interface BatchInstance {
  readonly worldX: number;
  readonly worldY: number;
  readonly regionX: number;
  readonly regionY: number;
  readonly regionW: number;
  readonly regionH: number;
}

export interface Batch {
  readonly page: number;
  readonly instances: readonly BatchInstance[];
}

export type RasterizeToPixels = (pack: StylePack, request: VisualRequest, width: number, height: number) => PixelData;

/** Groups a DrawList into one Batch per atlas page, ascending by page index. */
export function buildBatches(
  drawList: DrawList,
  pack: StylePack,
  atlas: Atlas,
  device: Gl2Device,
  rasterizeToPixels: RasterizeToPixels,
): readonly Batch[] {
  const byPage = new Map<number, BatchInstance[]>();

  for (const item of drawList) {
    const region = atlas.ensureRegion(
      item.bitmap.id,
      item.bitmap.widthPx,
      item.bitmap.heightPx,
      () => rasterizeToPixels(pack, item.request, item.bitmap.widthPx, item.bitmap.heightPx),
      device,
    );
    const instances = byPage.get(region.page) ?? [];
    instances.push({
      worldX: item.worldX,
      worldY: item.worldY,
      regionX: region.x,
      regionY: region.y,
      regionW: region.width,
      regionH: region.height,
    });
    byPage.set(region.page, instances);
  }

  return [...byPage.entries()]
    .sort(([a], [b]) => a - b)
    .map(([page, instances]) => ({ page, instances }));
}
