/**
 * Archetypes — the five agent archetypes as data-parameterized policies over
 * ONE shared sensing/decision core (P4/S4.1, REQ-141; dm-0024).
 *
 * GDOS alignment: Section 15 (Local Spatial Verification is performed by
 * simulated player archetypes: First-Time, Cautious, Experienced, Expert
 * Speedrunner, Curious Explorer).
 *
 * Archetypes are NOT five code forks: each is a frozen ArchetypeParams
 * record feeding the same decision core, so behavioral differences are
 * data differences (reaction cadence, hesitation, jump-commit lookahead,
 * hazard caution, exploration prefix) and adding a sixth archetype later is
 * a data change. Behavioral distinctness is proven by test — pairwise
 * distinct tapes on a discriminating fixture — never asserted by naming.
 *
 * The decision core is a reactive heuristic: walk toward the goal, sense
 * walls and floor gaps in tile space ahead, commit THE jump (sensed from
 * `world.jumpLock.phase` — the axiom is engine truth, never re-modeled)
 * with archetype-specific hesitation, pause near hazards per caution, and
 * optionally explore before committing to the goal. It produces *evidence*
 * of how a player class experiences a level; it is deliberately not a
 * solvability proof — that is S4.2's bounded search (P4 plan, finding 7).
 *
 * Determinism: pure decide(), explicit AgentMemory, agent-own RNG stream
 * (dm-0024), and whitelist math only — `+ − × ÷ %`, Math.floor/abs/min/max
 * (dm-0017 extended to src/eval/). No transcendental calls, no Math.random,
 * no delta-time.
 */

import { nextFloat } from '../core/Rng';
import type { InputFrame } from '../core/State';
import { TUNING } from '../components/Tuning';
import { COLLISION_CLASS_BY_KIND } from '../components/CollisionClass';
import { TILE_KIND_BY_ID } from '../components/Tilemap';
import type { JumpOnceState, WorldState } from '../entities/World';
import type { AgentDecision, AgentMemory, AgentPolicy } from './AgentPolicy';

/** The five §15 archetype names — a closed set. */
export type ArchetypeName =
  | 'firstTime'
  | 'cautious'
  | 'experienced'
  | 'expertSpeedrunner'
  | 'curiousExplorer';

/**
 * The behavioral parameter record one archetype is made of. Pure data;
 * evaluation-model parameters, NOT gameplay tuning — src/systems/ can never
 * read these (one-way import rule, dm-0022).
 */
export interface ArchetypeParams {
  readonly name: ArchetypeName;
  /** Ticks between world re-reads; 1 reacts every tick. ≥1. */
  readonly replanTicks: number;
  /** Stand-still ticks between deciding to jump and pressing it. ≥0. */
  readonly hesitationTicks: number;
  /** Obstacles/gaps within this many tiles ahead trigger the jump commit. ≥1. */
  readonly jumpLookaheadTiles: number;
  /** Stop-and-wait ticks on first entering a hazard's caution radius (0 disables). */
  readonly hazardPauseTicks: number;
  /** World-unit radius for hazard caution sensing. */
  readonly cautionRadius: number;
  /** Ticks spent probing away from the goal at the start of each life (0 disables). */
  readonly exploreTicks: number;
}

/** The five archetypes (REQ-141). Frozen: editing these invalidates recorded tapes. */
export const ARCHETYPES: Readonly<Record<ArchetypeName, ArchetypeParams>> = Object.freeze({
  firstTime: Object.freeze({
    name: 'firstTime' as const,
    replanTicks: 12,
    hesitationTicks: 18,
    jumpLookaheadTiles: 4,
    hazardPauseTicks: 0,
    cautionRadius: 0,
    exploreTicks: 0,
  }),
  cautious: Object.freeze({
    name: 'cautious' as const,
    replanTicks: 6,
    hesitationTicks: 10,
    jumpLookaheadTiles: 3,
    hazardPauseTicks: 30,
    cautionRadius: 4,
    exploreTicks: 0,
  }),
  experienced: Object.freeze({
    name: 'experienced' as const,
    replanTicks: 3,
    hesitationTicks: 4,
    jumpLookaheadTiles: 2,
    hazardPauseTicks: 0,
    cautionRadius: 0,
    exploreTicks: 0,
  }),
  expertSpeedrunner: Object.freeze({
    name: 'expertSpeedrunner' as const,
    replanTicks: 1,
    hesitationTicks: 0,
    jumpLookaheadTiles: 1,
    hazardPauseTicks: 0,
    cautionRadius: 0,
    exploreTicks: 0,
  }),
  curiousExplorer: Object.freeze({
    name: 'curiousExplorer' as const,
    replanTicks: 4,
    hesitationTicks: 6,
    jumpLookaheadTiles: 3,
    hazardPauseTicks: 0,
    cautionRadius: 0,
    exploreTicks: 90,
  }),
});

// ---------------------------------------------------------------------------
// Sensing — read-only queries over tiles and runtime entity state.
// ---------------------------------------------------------------------------

function tileSolid(world: WorldState, col: number, row: number): boolean {
  const { width, height, tiles } = world.level.tilemap;
  if (col < 0 || col >= width || row < 0 || row >= height) return false;
  return TILE_KIND_BY_ID[tiles[row * width + col]] === 'solid';
}

/** Row index of the tile the player's feet rest on when flush (y-down grid). */
function supportRow(world: WorldState): number {
  const ts = world.level.tilemap.tileSize;
  return Math.floor((world.playerPosition.y + TUNING.playerHalfExtents.y) / ts);
}

/** Rows overlapped by the player's body, [top, bottom] inclusive. */
function bodyRows(world: WorldState): { top: number; bottom: number } {
  const ts = world.level.tilemap.tileSize;
  const top = Math.floor((world.playerPosition.y - TUNING.playerHalfExtents.y) / ts);
  const bottom = Math.ceil((world.playerPosition.y + TUNING.playerHalfExtents.y) / ts) - 1;
  return { top, bottom: Math.max(top, bottom) };
}

function playerCol(world: WorldState): number {
  return Math.floor(world.playerPosition.x / world.level.tilemap.tileSize);
}

/** A solid tile at body height within `lookahead` columns in `dir`. */
function wallAhead(world: WorldState, dir: -1 | 1, lookahead: number): boolean {
  const col = playerCol(world);
  const { top, bottom } = bodyRows(world);
  for (let step = 1; step <= lookahead; step++) {
    const c = col + dir * step;
    for (let row = top; row <= bottom; row++) {
      if (tileSolid(world, c, row)) return true;
    }
  }
  return false;
}

/**
 * A column within `lookahead` ahead whose floor drops away: no solid support
 * at the current support row or up to two rows below it (a step-down of ≤2
 * tiles is walkable; deeper is a gap worth the jump).
 */
function gapAhead(world: WorldState, dir: -1 | 1, lookahead: number): boolean {
  const col = playerCol(world);
  const support = supportRow(world);
  for (let step = 1; step <= lookahead; step++) {
    const c = col + dir * step;
    let supported = false;
    for (let row = support; row <= support + 2; row++) {
      if (tileSolid(world, c, row)) {
        supported = true;
        break;
      }
    }
    if (!supported) return true;
  }
  return false;
}

/** Any lethal-class entity (runtime position) within `radius` of the player. */
function lethalNear(world: WorldState, radius: number): boolean {
  for (let i = 0; i < world.entities.length; i++) {
    const kind = world.level.entities[i].behavior.kind;
    if (COLLISION_CLASS_BY_KIND[kind] !== 'lethal') continue;
    const e = world.entities[i];
    const dx = Math.abs(e.position.x - world.playerPosition.x);
    const dy = Math.abs(e.position.y - world.playerPosition.y);
    if (dx <= radius && dy <= radius) return true;
  }
  return false;
}

/** Horizontal intent toward the goal, with a half-tile deadzone. */
function goalDirection(world: WorldState): -1 | 0 | 1 {
  const dx = world.level.constraints.goal.position.x - world.playerPosition.x;
  const deadzone = world.level.tilemap.tileSize / 2;
  if (dx > deadzone) return 1;
  if (dx < -deadzone) return -1;
  return 0;
}

/** The goal sits above the player's feet and within ~1.5 tiles horizontally. */
function goalAboveClose(world: WorldState): boolean {
  const goal = world.level.constraints.goal;
  const ts = world.level.tilemap.tileSize;
  const dx = Math.abs(goal.position.x - world.playerPosition.x);
  const feetY = world.playerPosition.y + TUNING.playerHalfExtents.y;
  return dx <= 1.5 * ts && goal.position.y < feetY - ts;
}

// ---------------------------------------------------------------------------
// The shared decision core.
// ---------------------------------------------------------------------------

const NEUTRAL: InputFrame = { moveAxis: 0, jumpPressed: false, resetPressed: false };

function move(axis: -1 | 0 | 1): InputFrame {
  return { moveAxis: axis, jumpPressed: false, resetPressed: false };
}

/** Build the archetype's policy: params + the shared core (dm-0024). */
export function archetypePolicy(params: ArchetypeParams): AgentPolicy {
  return {
    name: params.name,

    decide(state: JumpOnceState, memory: AgentMemory): AgentDecision {
      const world = state.world;

      // The defeat tick is consumed by the lifecycle reload; contribute nothing.
      if (world.runState !== 'playing') {
        return { input: NEUTRAL, memory };
      }

      let m = memory;

      // A new life (fresh world after reload, or the very first tick): re-plan.
      if (world.attemptCount !== m.lifeAttempt) {
        let rng = m.rng;
        let exploreDir: -1 | 1 = 1;
        if (params.exploreTicks > 0) {
          const draw = nextFloat(rng);
          rng = draw.next;
          exploreDir = draw.value < 0.5 ? -1 : 1;
        }
        m = {
          rng,
          heldMove: 0,
          ticksUntilReplan: 0,
          jumpPending: false,
          hesitationLeft: 0,
          pauseLeft: 0,
          nearHazard: false,
          exploreLeft: params.exploreTicks,
          exploreDir,
          lifeAttempt: world.attemptCount,
        };
      }

      // Exploration prefix: probe away from the route, but never off a cliff
      // or into a wall — curious, not reckless. Flipping keeps it moving.
      if (m.exploreLeft > 0) {
        let dir = m.exploreDir;
        if (world.playerGrounded && (wallAhead(world, dir, 1) || gapAhead(world, dir, 1))) {
          dir = dir === 1 ? -1 : 1;
        }
        return {
          input: move(dir),
          memory: { ...m, exploreLeft: m.exploreLeft - 1, exploreDir: dir },
        };
      }

      // Hazard-caution pause: frozen mid-route, sizing up the danger.
      if (m.pauseLeft > 0) {
        return { input: NEUTRAL, memory: { ...m, pauseLeft: m.pauseLeft - 1 } };
      }

      // A committed jump: hesitate standing still, then press exactly once.
      if (m.jumpPending) {
        if (!world.playerGrounded || world.jumpLock.phase !== 'available') {
          // Conditions changed under us (fell off the ledge, jump spent): abort.
          m = { ...m, jumpPending: false, hesitationLeft: 0 };
        } else if (m.hesitationLeft > 0) {
          return { input: NEUTRAL, memory: { ...m, hesitationLeft: m.hesitationLeft - 1 } };
        } else {
          return {
            input: { moveAxis: m.heldMove, jumpPressed: true, resetPressed: false },
            memory: { ...m, jumpPending: false },
          };
        }
      }

      // Between replans: reaction latency — keep doing what we were doing.
      if (m.ticksUntilReplan > 0) {
        return { input: move(m.heldMove), memory: { ...m, ticksUntilReplan: m.ticksUntilReplan - 1 } };
      }

      // Replan: re-read the world.
      const dir = goalDirection(world);
      let next: AgentMemory = { ...m, heldMove: dir, ticksUntilReplan: params.replanTicks - 1 };

      // Caution: pause once on ENTERING a hazard's radius (rising edge only,
      // so a hazard camped near the route cannot pause the agent forever).
      if (params.hazardPauseTicks > 0) {
        const near = lethalNear(world, params.cautionRadius);
        if (near && !m.nearHazard) {
          next = { ...next, nearHazard: true, pauseLeft: params.hazardPauseTicks - 1 };
          return { input: NEUTRAL, memory: next };
        }
        next = { ...next, nearHazard: near };
      }

      // Commit THE jump when the route ahead demands height or crossing.
      // Availability is sensed from the engine's lock machine — the axiom is
      // ground truth here, never re-modeled (dm-0020).
      if (world.playerGrounded && world.jumpLock.phase === 'available') {
        const routeBlocked =
          dir !== 0 &&
          (wallAhead(world, dir, params.jumpLookaheadTiles) ||
            gapAhead(world, dir, params.jumpLookaheadTiles));
        if (routeBlocked || goalAboveClose(world)) {
          next = { ...next, jumpPending: true, hesitationLeft: params.hesitationTicks };
          if (params.hesitationTicks > 0) {
            return { input: NEUTRAL, memory: { ...next, hesitationLeft: params.hesitationTicks - 1 } };
          }
          return {
            input: { moveAxis: dir, jumpPressed: true, resetPressed: false },
            memory: { ...next, jumpPending: false, heldMove: dir },
          };
        }
      }

      return { input: move(dir), memory: next };
    },
  };
}
