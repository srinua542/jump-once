/**
 * PlayerPhysics — deterministic fixed-step integration and collision
 * resolution for the player body (S3.1).
 *
 * GDOS alignment: Section 16 (deterministic physics engine), Section 17
 * (collision evaluates only the player's neighborhood — tile scans are
 * range-bounded; entity narrow-phase runs only on the quadtree broad-phase
 * candidate set from SpatialPartition, S3.2 / REQ-162).
 *
 * Technique (P3 execution plan; dm-0017):
 *  - Semi-implicit (symplectic) Euler: velocity first, then position.
 *  - Swept, axis-separated resolution (X then Y): the moving AABB's swept
 *    tile range is scanned in travel order and position clamps to the first
 *    solid boundary — correct at any speed (no tunneling at spring-launch
 *    velocities), no epsilon nudging (contact snaps exactly to tile edges).
 *  - Solid entities are swept the same way per axis: the nearest blocking
 *    face inside the travel interval wins, whether tile or entity.
 *  - Math whitelist: only IEEE-exact operations (+ - * / %, floor/ceil/
 *    min/max/abs, comparisons). No transcendental functions in src/systems/.
 *
 * Semantics:
 *  - Overlap is half-open, matching the tilemap's world rects: flush contact
 *    (shared edge) is NOT overlap and does not block; any penetration does.
 *    Resting on a floor still grounds every step because gravity always
 *    produces a positive downward travel interval that the floor clamps.
 *  - Blocked travel zeroes the velocity component; downward blocking sets
 *    playerGrounded.
 *  - Door solidity is def-level in S3.1 (initiallyOpen); the S3.7 runtime
 *    open flag takes over when trigger execution lands.
 *  - Out-of-grid tiles are empty (levels author their own solid borders;
 *    falling out of the world is S3.4 lifecycle territory).
 *
 * Isolation: reads state.world only — never state.input (the player control
 * system, S3.3, is the sole input consumer) and never another system's
 * internals. Pure: returns a new state, mutates nothing.
 */

import { FIXED_STEP_SECONDS } from '../core/Clock';
import type { GameState } from '../core/State';
import { vec2, type Vec2 } from '../core/Vec2';
import { TILE_KIND_BY_ID } from '../components/Tilemap';
import { TUNING } from '../components/Tuning';
import { COLLISION_CLASS_BY_KIND } from '../components/CollisionClass';
import type { LevelDefinition } from '../components/Level';
import type { WorldState } from '../entities/World';
import { buildEntityQuadtree, queryQuadtree } from './SpatialPartition';
import type { System } from './System';

/** Index of the last tile a half-open interval ending at `edge` occupies. */
function lastTileIndex(edge: number, tileSize: number): number {
  return Math.ceil(edge / tileSize) - 1;
}

function isSolidTile(level: LevelDefinition, col: number, row: number): boolean {
  const { width, height, tiles } = level.tilemap;
  if (col < 0 || col >= width || row < 0 || row >= height) return false;
  return TILE_KIND_BY_ID[tiles[row * width + col]] === 'solid';
}

/** True if any tile in [rowMin..rowMax] of `col` is solid. */
function columnHasSolid(level: LevelDefinition, col: number, rowMin: number, rowMax: number): boolean {
  for (let row = rowMin; row <= rowMax; row++) {
    if (isSolidTile(level, col, row)) return true;
  }
  return false;
}

/** True if any tile in [colMin..colMax] of `row` is solid. */
function rowHasSolid(level: LevelDefinition, row: number, colMin: number, colMax: number): boolean {
  for (let col = colMin; col <= colMax; col++) {
    if (isSolidTile(level, col, row)) return true;
  }
  return false;
}

/**
 * Whether the entity at index `i` currently blocks movement.
 * world.entities is index-aligned with level.entities for authored entities
 * (World.ts invariant), so def and runtime state pair by index.
 */
function isSolidEntity(world: WorldState, i: number): boolean {
  const def = world.level.entities[i];
  const cls = COLLISION_CLASS_BY_KIND[def.behavior.kind];
  if (cls !== 'solid') return false;
  if (def.behavior.kind === 'door') return !def.behavior.initiallyOpen;
  return true;
}

interface AxisResult {
  /** New center coordinate on the swept axis. */
  readonly center: number;
  readonly blocked: boolean;
}

/**
 * Sweep the player AABB along one axis and clamp to the nearest solid
 * boundary (tile or entity) inside the travel interval.
 *
 * `axis` selects the travel axis; the perpendicular extent is fixed at the
 * player's current span. Travel is half-open: a face exactly at the leading
 * edge's destination does not block (flush contact), a face short of it does.
 *
 * `candidates` is the quadtree broad-phase result (entity indices) — only
 * those entities are narrow-phase tested (REQ-162: neighborhood only).
 */
function sweepAxis(
  world: WorldState,
  center: Vec2,
  half: Vec2,
  axis: 'x' | 'y',
  delta: number,
  candidates: readonly number[],
): AxisResult {
  if (delta === 0) return { center: axis === 'x' ? center.x : center.y, blocked: false };

  const level = world.level;
  const ts = level.tilemap.tileSize;
  const along = axis === 'x' ? center.x : center.y;
  const alongHalf = axis === 'x' ? half.x : half.y;
  const perp = axis === 'x' ? center.y : center.x;
  const perpHalf = axis === 'x' ? half.y : half.x;

  // Perpendicular tile span (half-open).
  const perpMin = Math.floor((perp - perpHalf) / ts);
  const perpMax = lastTileIndex(perp + perpHalf, ts);

  const dir = delta > 0 ? 1 : -1;
  const curEdge = along + dir * alongHalf;
  const newEdge = curEdge + delta;

  // Nearest blocking face in travel order; NaN = none found yet.
  let clampFace = Number.NaN;

  // ── Tiles ──
  if (dir > 0) {
    const first = Math.floor(curEdge / ts);
    const last = lastTileIndex(newEdge, ts);
    for (let line = first; line <= last; line++) {
      const face = line * ts;
      if (face < curEdge) continue; // already alongside this line
      const hit =
        axis === 'x'
          ? columnHasSolid(level, line, perpMin, perpMax)
          : rowHasSolid(level, line, perpMin, perpMax);
      if (hit) {
        clampFace = face;
        break; // travel order: first hit is nearest
      }
    }
  } else {
    const first = lastTileIndex(curEdge, ts);
    const last = Math.floor(newEdge / ts);
    for (let line = first; line >= last; line--) {
      const face = (line + 1) * ts;
      if (face > curEdge) continue;
      const hit =
        axis === 'x'
          ? columnHasSolid(level, line, perpMin, perpMax)
          : rowHasSolid(level, line, perpMin, perpMax);
      if (hit) {
        clampFace = face;
        break;
      }
    }
  }

  // ── Solid entities (quadtree-selected neighborhood only) ──
  for (const i of candidates) {
    if (!isSolidEntity(world, i)) continue;
    const def = level.entities[i];
    const pos = world.entities[i].position;
    const eCenterAlong = axis === 'x' ? pos.x + def.collider.offset.x : pos.y + def.collider.offset.y;
    const eCenterPerp = axis === 'x' ? pos.y + def.collider.offset.y : pos.x + def.collider.offset.x;
    const eHalfAlong = axis === 'x' ? def.collider.halfExtents.x : def.collider.halfExtents.y;
    const eHalfPerp = axis === 'x' ? def.collider.halfExtents.y : def.collider.halfExtents.x;

    // Strict perpendicular overlap (flush contact is not overlap).
    if (perp - perpHalf >= eCenterPerp + eHalfPerp || perp + perpHalf <= eCenterPerp - eHalfPerp) continue;

    const face = eCenterAlong - dir * eHalfAlong;
    if (dir > 0) {
      if (face >= curEdge && face < newEdge && !(face >= clampFace)) clampFace = face;
    } else {
      if (face <= curEdge && face > newEdge && !(face <= clampFace)) clampFace = face;
    }
  }

  if (Number.isNaN(clampFace)) {
    return { center: along + delta, blocked: false };
  }
  return { center: clampFace - dir * alongHalf, blocked: true };
}

/**
 * Advance the player body by exactly one fixed step: symplectic-Euler
 * velocity update (gravity, terminal-fall clamp), then swept X move, then
 * swept Y move. Pure — returns a new WorldState.
 */
export function stepPlayerPhysics(world: WorldState): WorldState {
  if (world.runState !== 'playing') return world; // frozen outside a live run (S3.4)
  const dt = FIXED_STEP_SECONDS;
  const half = TUNING.playerHalfExtents;

  // Velocity first (semi-implicit Euler), fall speed clamped.
  const vy = Math.min(world.playerVelocity.y + TUNING.gravityY * dt, TUNING.maxFallSpeed);
  const vx = world.playerVelocity.x;

  // Broad phase (REQ-162): quadtree query over the union of the player's
  // start AABB and its full-step destination AABB — a conservative superset
  // of everything either axis sweep can touch. Narrow phase stays exact.
  const p = world.playerPosition;
  const dx = vx * dt;
  const dy = vy * dt;
  const tree = buildEntityQuadtree(world);
  const candidates = queryQuadtree(
    tree,
    Math.min(p.x, p.x + dx) - half.x,
    Math.min(p.y, p.y + dy) - half.y,
    Math.max(p.x, p.x + dx) + half.x,
    Math.max(p.y, p.y + dy) + half.y,
  );

  // Axis-separated swept movement: X, then Y against the post-X position.
  const xRes = sweepAxis(world, p, half, 'x', dx, candidates);
  const afterX = vec2(xRes.center, p.y);
  const yRes = sweepAxis(world, afterX, half, 'y', vy * dt, candidates);

  const grounded = yRes.blocked && vy > 0;
  return {
    ...world,
    playerPosition: vec2(xRes.center, yRes.center),
    playerVelocity: vec2(xRes.blocked ? 0 : vx, yRes.blocked ? 0 : vy),
    playerGrounded: grounded,
  };
}

/** The player-physics System. Pure step over state.world; never reads state.input. */
export const playerPhysicsSystem: System<WorldState> = {
  id: 'playerPhysics',
  step(state: GameState<WorldState>): GameState<WorldState> {
    return { ...state, world: stepPlayerPhysics(state.world) };
  },
};
