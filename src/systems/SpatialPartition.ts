/**
 * SpatialPartition — deterministic quadtree over entity AABBs (S3.2).
 *
 * GDOS alignment: Section 17 (spatial partitioning so collision evaluates
 * only the player's neighborhood — REQ-162, P3 share).
 *
 * Determinism contract (P3 execution plan, review point 10):
 *  - buildEntityQuadtree is a PURE function of WorldState: entities insert in
 *    array order, node capacity and max depth are fixed constants, children
 *    split at exact arithmetic midpoints — the same world always yields the
 *    structurally identical tree.
 *  - queryQuadtree returns entity indices in ascending order and applies the
 *    same STRICT overlap convention as the physics sweep (flush contact is
 *    NOT overlap), so its result set is exactly equal to a brute-force scan —
 *    the acceptance property (equivalence under seeded fuzz).
 *  - Entries that straddle a child boundary stay at the parent node; only
 *    entries fully contained by a child descend. Bounds come from the
 *    tilemap's world rect, expanded to admit out-of-rect entities.
 *
 * The tree is rebuilt per consumer step (entities move); it is derived data,
 * never stored in state (dm-0016 spirit: derive, don't duplicate).
 * Allocation cost is accepted per dm-0004 — pooling is P11's concern.
 *
 * Math whitelist (dm-0017) holds: arithmetic and comparisons only.
 */

import type { WorldState } from '../entities/World';

/** Fixed structural constants — changing either changes every tree shape; ledgered decision only. */
const NODE_CAPACITY = 8;
const MAX_DEPTH = 8;

/** One indexed entity AABB, in world units. */
export interface QuadtreeEntry {
  /** Index into world.entities / world.level.entities (index-aligned, World.ts invariant). */
  readonly index: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface QuadtreeNode {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  /** Entries resident at this node (straddlers, or leaf contents), in insertion order. */
  readonly entries: readonly QuadtreeEntry[];
  /** Exactly 4 children (NW, NE, SW, SE) once split; null while a leaf. */
  readonly children: readonly [QuadtreeNode, QuadtreeNode, QuadtreeNode, QuadtreeNode] | null;
}

/** Strict AABB overlap: flush contact (shared edge) is NOT overlap — matches the physics sweep. */
function overlapsStrict(
  aMinX: number, aMinY: number, aMaxX: number, aMaxY: number,
  bMinX: number, bMinY: number, bMaxX: number, bMaxY: number,
): boolean {
  return aMinX < bMaxX && aMaxX > bMinX && aMinY < bMaxY && aMaxY > bMinY;
}

function contains(node: { minX: number; minY: number; maxX: number; maxY: number }, e: QuadtreeEntry): boolean {
  return e.minX >= node.minX && e.maxX <= node.maxX && e.minY >= node.minY && e.maxY <= node.maxY;
}

/** Mutable build-time shape; frozen into QuadtreeNode by construction order (never exposed). */
interface BuildNode {
  minX: number; minY: number; maxX: number; maxY: number;
  entries: QuadtreeEntry[];
  children: [BuildNode, BuildNode, BuildNode, BuildNode] | null;
  depth: number;
}

function makeBuildNode(minX: number, minY: number, maxX: number, maxY: number, depth: number): BuildNode {
  return { minX, minY, maxX, maxY, entries: [], children: null, depth };
}

function split(node: BuildNode): void {
  const midX = (node.minX + node.maxX) / 2;
  const midY = (node.minY + node.maxY) / 2;
  node.children = [
    makeBuildNode(node.minX, node.minY, midX, midY, node.depth + 1), // NW
    makeBuildNode(midX, node.minY, node.maxX, midY, node.depth + 1), // NE
    makeBuildNode(node.minX, midY, midX, node.maxY, node.depth + 1), // SW
    makeBuildNode(midX, midY, node.maxX, node.maxY, node.depth + 1), // SE
  ];
  // Re-home entries that fit fully inside a child; straddlers stay here.
  const staying: QuadtreeEntry[] = [];
  for (const e of node.entries) {
    const child = node.children.find((c) => contains(c, e));
    if (child) child.entries.push(e);
    else staying.push(e);
  }
  node.entries = staying;
}

function insert(node: BuildNode, e: QuadtreeEntry): void {
  if (node.children === null) {
    node.entries.push(e);
    if (node.entries.length > NODE_CAPACITY && node.depth < MAX_DEPTH) split(node);
    return;
  }
  const child = node.children.find((c) => contains(c, e));
  if (child) insert(child, e);
  else node.entries.push(e);
}

/**
 * Build the quadtree for the current world: one entry per entity, AABB from
 * runtime position + authored collider (offset ± halfExtents). Root bounds
 * are the tilemap world rect expanded to admit any out-of-rect entity.
 */
export function buildEntityQuadtree(world: WorldState): QuadtreeNode {
  const { width, height, tileSize } = world.level.tilemap;
  let minX = 0;
  let minY = 0;
  let maxX = width * tileSize;
  let maxY = height * tileSize;

  const entries: QuadtreeEntry[] = [];
  for (let i = 0; i < world.level.entities.length; i++) {
    const def = world.level.entities[i];
    const pos = world.entities[i].position;
    const cx = pos.x + def.collider.offset.x;
    const cy = pos.y + def.collider.offset.y;
    const e: QuadtreeEntry = {
      index: i,
      minX: cx - def.collider.halfExtents.x,
      minY: cy - def.collider.halfExtents.y,
      maxX: cx + def.collider.halfExtents.x,
      maxY: cy + def.collider.halfExtents.y,
    };
    entries.push(e);
    minX = Math.min(minX, e.minX);
    minY = Math.min(minY, e.minY);
    maxX = Math.max(maxX, e.maxX);
    maxY = Math.max(maxY, e.maxY);
  }

  const root = makeBuildNode(minX, minY, maxX, maxY, 0);
  for (const e of entries) insert(root, e);
  return root;
}

function collect(node: QuadtreeNode, minX: number, minY: number, maxX: number, maxY: number, out: number[]): void {
  for (const e of node.entries) {
    if (overlapsStrict(e.minX, e.minY, e.maxX, e.maxY, minX, minY, maxX, maxY)) out.push(e.index);
  }
  if (node.children === null) return;
  for (const child of node.children) {
    // Inclusive bounds test for descent (a strict-overlap hit flush against a
    // child seam must not be missed); the per-entry test above stays strict.
    if (minX <= child.maxX && maxX >= child.minX && minY <= child.maxY && maxY >= child.minY) {
      collect(child, minX, minY, maxX, maxY, out);
    }
  }
}

/**
 * All entity indices whose AABB strictly overlaps the query box, ascending.
 * Exactly equal to a brute-force scan under the same overlap convention.
 */
export function queryQuadtree(root: QuadtreeNode, minX: number, minY: number, maxX: number, maxY: number): readonly number[] {
  const out: number[] = [];
  collect(root, minX, minY, maxX, maxY, out);
  out.sort((a, b) => a - b);
  return out;
}
