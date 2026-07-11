/**
 * DrawList — the plain-data output of `compileScene` (S9.3). Every field is
 * JSON-serializable; nothing here is a function, a class instance, or a
 * live device handle — the executor (S9.4) is the first thing that turns a
 * `DrawItem` into a real draw call.
 */

import type { GrammarCategoryId } from '../grammar/Grammar';
import type { BitmapHandle, VisualRequest } from '../style/StylePack';

export interface DrawItem {
  readonly bitmap: BitmapHandle;
  /**
   * The originating request, carried alongside `bitmap` (S9.4, dm-0095) so a
   * downstream consumer that has never seen this bitmap id before (the
   * atlas, the first time it packs it) can call `StylePack.rasterize(request,
   * device)` to actually produce it — `bitmap` alone is only an identity/size
   * handle, never enough to draw from scratch.
   */
  readonly request: VisualRequest;
  /** null for the reserved player role — the avatar is not a grammar signal (bible §1). */
  readonly category: GrammarCategoryId | null;
  /** REQ-016 × REQ-163 interlock: the quality controller (S9.10) may drop only critical: false items. */
  readonly critical: boolean;
  /** World-space position where the bitmap's anchor lands, already interpolated by alpha. */
  readonly worldX: number;
  readonly worldY: number;
  readonly anchorX: number;
  readonly anchorY: number;
}

export type DrawList = readonly DrawItem[];
