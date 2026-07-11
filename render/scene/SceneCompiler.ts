/**
 * SceneCompiler — the pure projection `(state, previous, alpha, grammar,
 * pack, camera, viewport) → DrawList` (S9.3). This is the ONLY place P9
 * resolves simulation state through the Visual Grammar into pack visuals.
 *
 * Projection purity (dm-0004/dm-0082): reads `WorldState` one-way; nothing
 * computed here is ever written back into it. `alpha` (P1's
 * `interpolationAlpha`) is the only real-time-adjacent input, and it only
 * blends between two already-committed snapshots — it never influences
 * which snapshot exists.
 *
 * Culling (REQ-162): entities are culled via the P3 `SpatialPartition`
 * quadtree, queried against the viewport's world-space AABB — reused
 * read-only, not re-implemented (REQ-162's own wording). Terrain is culled
 * by a direct tile-range clamp (a dense grid needs no tree). The goal is
 * culled by a direct AABB check. Every item actually inside the viewport
 * AABB is included regardless of its `critical` flag — culling is a correct
 * containment test, not a distance heuristic, so "never culls critical
 * items in view" holds by construction, not by a special case.
 *
 * Per-entity `state` derivation (documented here since it is this module's
 * one real judgment call): derived ONLY from fields already exposed by
 * `WorldState`/`LevelDefinition` — never by re-deriving physics/trigger
 * logic the render layer has no business re-implementing.
 *  - `laser`: on/off from the entity's own `LaserDef` timing fields and
 *    ticks elapsed since life start (`tick - world.spawnTick`) — the same
 *    deterministic formula the reference engine used, just tick-driven
 *    instead of wall-clock-driven.
 *  - `door`: `EntityState.doorOpen`.
 *  - `collapsingFloor`: `'intact'` before first contact, `'cracking'`
 *    from first contact onward (including after it has actually collapsed —
 *    a collapsed floor's non-solid state is a physics fact the scene
 *    compiler does not additionally hide; whether a fallen floor should
 *    stop rendering at all is a later slice's call, noted as an open item).
 *  - `gravityZone`: `'invert'`/`'normal'` from the entity's OWN static
 *    `GravityZoneDef.gravityScale` sign — level-authored data, not runtime
 *    state.
 *  - `pressurePlate`, `spring`: no live "currently pressed/launching" signal
 *    is exposed by `WorldState` today (that would require re-deriving
 *    Sensors/trigger evaluation, out of scope for a render-layer module).
 *    Both render their base/idle overlay for now — an explicit, documented
 *    scope limit, not a silent gap.
 *  - every other kind has no `overlay` in `KindDraw` at all, so its state
 *    string is irrelevant; `'default'` is passed for cache-key cleanliness.
 */

import type { EntityDef } from '../../src/components/Entity';
import { TILE_KIND_BY_ID } from '../../src/components/Tilemap';
import { FIXED_STEP_SECONDS } from '../../src/core/Clock';
import type { Vec2 } from '../../src/core/Vec2';
import type { EntityState, JumpOnceState, WorldState } from '../../src/entities/World';
import { buildEntityQuadtree, queryQuadtree } from '../../src/systems/SpatialPartition';
import { PLAYER_IS_CRITICAL, resolveCategory, type GrammarCategory, type VisualGrammar } from '../grammar/Grammar';
import type { StylePack, VisualRequest } from '../style/StylePack';
import type { CameraState } from './Camera';
import type { DrawItem, DrawList } from './DrawList';

export interface Viewport {
  /** World-space visible half-extents around the camera center. Strictly positive. */
  readonly halfWidth: number;
  readonly halfHeight: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/** Terrain tile-mask autotile, matching PaperTiles/PaperStylePack's convention: out-of-bounds counts SOLID. */
function isSolidTile(world: WorldState, col: number, row: number): boolean {
  const { width, height, tiles } = world.level.tilemap;
  if (col < 0 || row < 0 || col >= width || row >= height) return true;
  return TILE_KIND_BY_ID[tiles[row * width + col]] === 'solid';
}

function terrainMask(world: WorldState, col: number, row: number): number {
  const N = isSolidTile(world, col, row - 1) ? 1 : 0;
  const E = isSolidTile(world, col + 1, row) ? 2 : 0;
  const S = isSolidTile(world, col, row + 1) ? 4 : 0;
  const W = isSolidTile(world, col - 1, row) ? 8 : 0;
  return N | E | S | W;
}

/** Position-hashed small variant set (0-2) — ported from the reference engine's terrain composer. */
function terrainVariant(col: number, row: number): number {
  return (((col * 3 + row * 7) % 3) + 3) % 3;
}

function laserState(world: WorldState, tick: number, def: EntityDef): string {
  if (def.behavior.kind !== 'laser') return 'default';
  const elapsedSeconds = (tick - world.spawnTick) * FIXED_STEP_SECONDS;
  const phase = ((elapsedSeconds + def.behavior.phaseSeconds) % def.behavior.periodSeconds) / def.behavior.periodSeconds;
  return phase < def.behavior.onFractionOfPeriod ? 'on' : 'off';
}

function entityState(world: WorldState, tick: number, def: EntityDef, runtime: EntityState): string {
  switch (def.behavior.kind) {
    case 'laser':
      return laserState(world, tick, def);
    case 'door':
      return runtime.doorOpen ? 'open' : 'closed';
    case 'collapsingFloor':
      return runtime.firstContactTick === null ? 'intact' : 'cracking';
    case 'gravityZone':
      return def.behavior.gravityScale < 0 ? 'invert' : 'normal';
    default:
      return 'default';
  }
}

function playerPose(world: WorldState): string {
  if (world.jumpLock.phase === 'anticipating') return 'prejump';
  if (!world.playerGrounded) return 'air';
  return 'idle';
}

function visualItem(pack: StylePack, request: VisualRequest, worldX: number, worldY: number, category: GrammarCategory | null): DrawItem {
  const cached = pack.visual(request);
  return {
    bitmap: cached.bitmap,
    request,
    category: category === null ? null : category.id,
    critical: category === null ? PLAYER_IS_CRITICAL : category.critical,
    worldX: worldX - cached.anchorX,
    worldY: worldY - cached.anchorY,
    anchorX: cached.anchorX,
    anchorY: cached.anchorY,
  };
}

/**
 * Compile the current visible scene into a plain-data DrawList. `tileSizePx`
 * is the world-to-request-size scale the StylePack draws at (the pack's `T`
 * convention) — the caller (the shell, S9.8) owns the world-to-screen ratio.
 */
export function compileScene(
  current: JumpOnceState,
  previous: JumpOnceState,
  alpha: number,
  grammar: VisualGrammar,
  pack: StylePack,
  camera: CameraState,
  viewport: Viewport,
  tileSizePx: number,
): DrawList {
  const world = current.world;
  const items: DrawItem[] = [];

  const minX = camera.x - viewport.halfWidth;
  const maxX = camera.x + viewport.halfWidth;
  const minY = camera.y - viewport.halfHeight;
  const maxY = camera.y + viewport.halfHeight;

  /* Terrain — one item per visible solid tile; S9.4's batcher merges repeats. */
  const { width, height, tileSize } = world.level.tilemap;
  const minCol = Math.max(0, Math.floor(minX / tileSize));
  const maxCol = Math.min(width - 1, Math.ceil(maxX / tileSize));
  const minRow = Math.max(0, Math.floor(minY / tileSize));
  const maxRow = Math.min(height - 1, Math.ceil(maxY / tileSize));
  const terrainCategory = resolveCategory(grammar, 'terrain');
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (!isSolidTile(world, col, row)) continue;
      const mask = terrainMask(world, col, row);
      const variant = terrainVariant(col, row);
      const request: VisualRequest = {
        role: 'terrain',
        state: `${mask}:${variant}`,
        widthPx: tileSizePx,
        heightPx: tileSizePx,
        identitySeed: 0,
      };
      items.push(visualItem(pack, request, col * tileSize, row * tileSize, terrainCategory));
    }
  }

  /* Entities — quadtree-culled against the CURRENT snapshot's positions
     (a deliberate, documented simplification: culling against the
     pre-interpolation position may lag a fast mover by up to one tick at
     the viewport edge; acceptable for S9.3, revisit if it ever matters). */
  const tree = buildEntityQuadtree(world);
  const visibleIndices = queryQuadtree(tree, minX, minY, maxX, maxY);
  for (const index of visibleIndices) {
    const def = world.level.entities[index];
    const prevRuntime = previous.world.entities[index];
    const currRuntime = world.entities[index];
    const position = lerpVec(prevRuntime.position, currRuntime.position, alpha);
    const category = resolveCategory(grammar, def.behavior.kind);
    const request: VisualRequest = {
      role: def.behavior.kind,
      state: entityState(world, current.tick, def, currRuntime),
      widthPx: tileSizePx,
      heightPx: tileSizePx,
      identitySeed: 0,
    };
    items.push(visualItem(pack, request, position.x, position.y, category));
  }

  /* Player — always included, never culled. */
  const playerPosition = lerpVec(previous.world.playerPosition, world.playerPosition, alpha);
  const playerRequest: VisualRequest = {
    role: 'player',
    state: playerPose(world),
    widthPx: tileSizePx,
    heightPx: tileSizePx,
    identitySeed: 0,
  };
  items.push(visualItem(pack, playerRequest, playerPosition.x, playerPosition.y, null));

  /* Goal — static (level data, not runtime state); culled by direct AABB check. */
  const goal = world.level.constraints.goal;
  const goalMinX = goal.position.x - goal.halfExtents.x;
  const goalMaxX = goal.position.x + goal.halfExtents.x;
  const goalMinY = goal.position.y - goal.halfExtents.y;
  const goalMaxY = goal.position.y + goal.halfExtents.y;
  if (goalMinX < maxX && goalMaxX > minX && goalMinY < maxY && goalMaxY > minY) {
    const goalCategory = resolveCategory(grammar, 'goal');
    const goalRequest: VisualRequest = {
      role: 'goal',
      state: 'default',
      widthPx: tileSizePx,
      heightPx: tileSizePx,
      identitySeed: 0,
    };
    items.push(visualItem(pack, goalRequest, goal.position.x, goal.position.y, goalCategory));
  }

  return items;
}
