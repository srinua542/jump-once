/**
 * Atlas — shelf-packs cached StylePack bitmaps into fixed-size GPU texture
 * pages, uploading each distinct bitmap id exactly once (S9.4, bible §5
 * "generate never per-frame" extended to the GPU-upload boundary).
 *
 * Atlas does NOT rasterize — it has no Raster2D, no canvas, and cannot
 * produce real pixels headlessly (that is render/platform/'s job, S9.8,
 * binding a real 2D context and reading back `ImageData`). Instead
 * `ensureRegion` takes a `producePixels` thunk, called AT MOST ONCE per
 * bitmap id (memoized by `regions`): in production it runs
 * `StylePack.rasterize` against a real device and reads back pixels; in
 * every headless test it is a trivial deterministic stand-in
 * (`fakePixelData`) — structurally sufficient, since nothing here inspects
 * actual pixel content, only dimensions, placement, and call counts.
 *
 * Page size is profile data (`AtlasProfile.pageSizePx`), not a literal.
 *
 * `ensureBuffer` (S11.1, REQ-161/162 P11 release-audit share, dm-0119): each
 * page's GPU instance buffer is created ONCE, lazily, on first use, and
 * memoized exactly like `page.texture` — never recreated per frame. Before
 * this fix `GlRenderer.drawBatches` called `device.createBuffer()` on every
 * call, which in production maps to a real `gl.createBuffer()` allocating a
 * native GPU object every frame forever — an unbounded native-resource churn
 * that plain JS object garbage never causes (V8's generational GC scavenges
 * short-lived JS objects almost for free; a GPU driver does not). Buffer
 * *data* is still re-uploaded every frame via `uploadBufferData` (the
 * instance transforms are genuinely live per-frame data) — only the buffer
 * *handle* is persistent.
 */

import type { BufferHandle, Gl2Device, PixelData, TextureHandle } from './Gl2Device';

export interface AtlasRegion {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AtlasProfile {
  /** Square page edge length, px. Strictly positive. */
  readonly pageSizePx: number;
}

export const DEFAULT_ATLAS_PROFILE: AtlasProfile = Object.freeze({ pageSizePx: 1024 });

export interface Atlas {
  /** Pack (or return the already-packed region for) one bitmap id. */
  ensureRegion(bitmapId: string, width: number, height: number, producePixels: () => PixelData, device: Gl2Device): AtlasRegion;
  readonly pageCount: number;
  /** The GPU texture backing a page, or null if that page has never been touched. */
  pageTexture(pageIndex: number): TextureHandle | null;
  /**
   * The persistent GPU buffer backing a page's per-frame instance data,
   * created once (lazily, on first call) and reused across every subsequent
   * call — never recreated per frame. Returns null for a page index that has
   * never been touched (mirrors `pageTexture`'s null contract; a page must
   * exist — i.e. `pageTexture(pageIndex)` is non-null — before its buffer
   * can be ensured).
   */
  ensureBuffer(pageIndex: number, device: Gl2Device): BufferHandle | null;
}

interface Shelf {
  y: number;
  height: number;
  cursorX: number;
}

interface Page {
  texture: TextureHandle | null;
  buffer: BufferHandle | null;
  shelves: Shelf[];
}

export function createAtlas(profile: AtlasProfile = DEFAULT_ATLAS_PROFILE): Atlas {
  const regions = new Map<string, AtlasRegion>();
  const pages: Page[] = [];

  function usedHeight(page: Page): number {
    return page.shelves.reduce((sum, s) => sum + s.height, 0);
  }

  /** First-fit shelf packer: try every existing shelf on every page, then a new shelf, then a new page. */
  function place(width: number, height: number): { page: number; x: number; y: number } {
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex];
      for (const shelf of page.shelves) {
        if (height <= shelf.height && shelf.cursorX + width <= profile.pageSizePx) {
          const x = shelf.cursorX;
          shelf.cursorX += width;
          return { page: pageIndex, x, y: shelf.y };
        }
      }
      const baseY = usedHeight(page);
      if (baseY + height <= profile.pageSizePx && width <= profile.pageSizePx) {
        page.shelves.push({ y: baseY, height, cursorX: width });
        return { page: pageIndex, x: 0, y: baseY };
      }
    }
    pages.push({ texture: null, buffer: null, shelves: [{ y: 0, height, cursorX: width }] });
    return { page: pages.length - 1, x: 0, y: 0 };
  }

  return {
    get pageCount() {
      return pages.length;
    },
    pageTexture(pageIndex: number): TextureHandle | null {
      return pages[pageIndex]?.texture ?? null;
    },
    ensureBuffer(pageIndex: number, device: Gl2Device): BufferHandle | null {
      const page = pages[pageIndex];
      if (page === undefined) return null;
      if (page.buffer === null) {
        page.buffer = device.createBuffer();
      }
      return page.buffer;
    },
    ensureRegion(bitmapId, width, height, producePixels, device) {
      const cached = regions.get(bitmapId);
      if (cached !== undefined) return cached;

      const placement = place(width, height);
      const page = pages[placement.page];
      if (page.texture === null) {
        page.texture = device.createTexture(profile.pageSizePx, profile.pageSizePx);
      }
      const pixels = producePixels();
      device.uploadTextureRegion(page.texture, placement.x, placement.y, pixels);

      const region: AtlasRegion = { page: placement.page, x: placement.x, y: placement.y, width, height };
      regions.set(bitmapId, region);
      return region;
    },
  };
}
