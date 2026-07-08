/**
 * TilemapDef — the level's permanently-static geometry as a flat, row-major
 * grid of closed tile-kind ids.
 *
 * GDOS alignment: Section 13 (tilemaps statically defined within the payload;
 * encapsulated geometry).
 *
 * Invariants (dm-0009, dm-0015):
 *  - Tiles are ONLY permanently-static geometry. Anything that can change at
 *    runtime (collapsing floors, doors, moving platforms) is an entity, never
 *    a tile — the loaded tilemap is frozen for the level's lifetime and
 *    reference-shared by every snapshot.
 *  - P2 tile semantics are collision-relevant kinds only ({empty, solid});
 *    visual variants are a P9 schema extension via version bump (dm-0010).
 *  - Coordinate convention (normative statement: docs/level_schema.md):
 *    y-down, origin at the tilemap's top-left, gravity acts +y. The grid is
 *    row-major: tiles[row * width + col]; tile (col, row) covers world
 *    [col*tileSize, (col+1)*tileSize) × [row*tileSize, (row+1)*tileSize).
 *  - Structural constraints (validator-enforced, S2.3): width/height are
 *    positive integers, tileSize > 0, tiles.length === width*height, every
 *    id is a key of TILE_KIND_BY_ID.
 *
 * This file is pure data declarations — no function bodies (directory
 * invariant: src/components/ is logic-free).
 */

/** Closed collision-relevant tile kinds (P2 scope; visuals are P9). */
export type TileKind = 'empty' | 'solid';

/** Closed numeric tile-id mapping. The validator rejects any id not listed here. */
export const TILE_KIND_BY_ID: Readonly<Record<number, TileKind>> = {
  0: 'empty',
  1: 'solid',
};

export interface TilemapDef {
  /** Grid width in tiles. Positive integer. */
  readonly width: number;
  /** Grid height in tiles. Positive integer. */
  readonly height: number;
  /** Tile edge length in world units. Strictly positive. */
  readonly tileSize: number;
  /** Row-major tile ids; length must equal width × height. */
  readonly tiles: readonly number[];
}
