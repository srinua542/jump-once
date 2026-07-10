/**
 * EmergentFun — the emergent-fun discovery search (P5/S5.5, REQ-054).
 *
 * GDOS alignment: Section 6 (Emergent Fun Discovery: probe physics edge
 * cases; flag high-value kinetic anchors for future layouts). P7's generator
 * consumes the anchors; P5 owns the probe.
 *
 * Placement (dm-0037): this module EXECUTES the S4.2 reachability search, so
 * it lives at the TOP level of src/eval/ beside Evaluate.ts — never under
 * gdos/, which is scan-enforced pure over pre-assembled evidence.
 *
 * What an anchor is: a reachable state whose velocity escapes the plain-
 * movement envelope — |vx| beyond what running can produce, or upward speed
 * beyond what THE jump can produce. Only kinetic elements (springs, gravity
 * zones, conveyors, movers — the shared KINETIC_KINDS grouping) can create
 * such states, so each anchor is attributed to the nearest kinetic entity and
 * carries the exact input frames that reproduce it (a P7 layout can be built
 * AROUND a discovered moment). Downward speed is never flagged: falling fast
 * is gravity, not emergence.
 *
 * Thresholds are data (an options record, the eval-audit idiom): factors over
 * TUNING.runSpeed / TUNING.jumpSpeed, not absolute literals, so retuning the
 * game re-scopes the envelope automatically. Deterministic; whitelist math
 * (squared distances only).
 */

import type { InputFrame } from '../core/State';
import type { Vec2 } from '../core/Vec2';
import { TUNING } from '../components/Tuning';
import type { LevelDefinition } from '../components/Level';
import type { EntityKind } from '../components/Behavior';
import { KINETIC_KINDS } from './gdos/DesignSpace';
import {
  DEFAULT_SEARCH_OPTIONS,
  reconstructFrames,
  searchReachability,
  type SearchOptions,
} from './local/Search';

export interface EmergentFunOptions {
  readonly seed: number;
  /** Search envelope; explores the whole reachable graph (stopAtGoal false). */
  readonly search: SearchOptions;
  /** |vx| must exceed runSpeed × this factor to flag. >0. */
  readonly horizontalSpeedFactor: number;
  /** Upward speed must exceed jumpSpeed × this factor to flag. >0. */
  readonly upwardSpeedFactor: number;
  /** Attribution radius in tiles: the nearest kinetic entity within it is the anchor's cause. ≥0. */
  readonly attributionRadiusTiles: number;
}

export const DEFAULT_EMERGENT_FUN_OPTIONS: EmergentFunOptions = Object.freeze({
  seed: 1,
  search: Object.freeze({ ...DEFAULT_SEARCH_OPTIONS, stopAtGoal: false, maxNodes: 20000 }),
  horizontalSpeedFactor: 1.25,
  upwardSpeedFactor: 1.1,
  attributionRadiusTiles: 3,
});

/** One flagged kinetic moment — data for P7 to design layouts around. */
export interface KineticAnchor {
  /** Player center at the flagged state. */
  readonly position: Vec2;
  /** Player velocity at the flagged state. */
  readonly velocity: Vec2;
  /** Which envelope was escaped. */
  readonly axis: 'horizontal' | 'upward';
  /** The kinetic entity attributed as the cause (nearest within radius), if any. */
  readonly sourceId?: string;
  readonly sourceKind?: EntityKind;
  /** Input frames from spawn that reproduce the state (replayable evidence). */
  readonly frames: readonly InputFrame[];
}

export interface EmergentFunReport {
  readonly anchors: readonly KineticAnchor[];
  /** True iff the search closed the frontier (the anchor list is complete for the discretization). */
  readonly exhaustive: boolean;
  readonly nodesExplored: number;
}

function sqDist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Probe a level's reachable state space for kinetic anchors (REQ-054).
 * Deterministic: same (def, options) ⇒ identical report.
 */
export function probeEmergentFun(
  def: LevelDefinition,
  options: EmergentFunOptions = DEFAULT_EMERGENT_FUN_OPTIONS,
): EmergentFunReport {
  const kinetic: { id: string; kind: EntityKind; index: number }[] = [];
  for (let i = 0; i < def.entities.length; i++) {
    const kind = def.entities[i].behavior.kind;
    if ((KINETIC_KINDS as readonly string[]).includes(kind)) {
      kinetic.push({ id: def.entities[i].id, kind, index: i });
    }
  }

  const graph = searchReachability(def, options.seed, options.search);
  const maxVx = TUNING.runSpeed * options.horizontalSpeedFactor;
  const maxUp = TUNING.jumpSpeed * options.upwardSpeedFactor;
  const radiusWorld = options.attributionRadiusTiles * def.tilemap.tileSize;
  const radiusSq = radiusWorld * radiusWorld;

  const anchors: KineticAnchor[] = [];
  const seen = new Set<string>();
  const q = def.tilemap.tileSize / 2;

  for (let n = 0; n < graph.nodes.length; n++) {
    const node = graph.nodes[n];
    const w = node.state.world;
    const vx = w.playerVelocity.x;
    const vy = w.playerVelocity.y;
    const horizontal = Math.abs(vx) > maxVx;
    const upward = -vy > maxUp;
    if (!horizontal && !upward) continue;

    // Dedupe by quantized position + escaped axis so one launch is one anchor.
    const axis: KineticAnchor['axis'] = horizontal ? 'horizontal' : 'upward';
    const key = `${Math.floor(w.playerPosition.x / q)},${Math.floor(w.playerPosition.y / q)},${axis}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Attribute to the nearest kinetic entity's LIVE position within radius.
    let sourceId: string | undefined;
    let sourceKind: EntityKind | undefined;
    let bestSq = radiusSq;
    for (const k of kinetic) {
      const d = sqDist(w.playerPosition, w.entities[k.index].position);
      if (d <= bestSq) { bestSq = d; sourceId = k.id; sourceKind = k.kind; }
    }

    anchors.push({
      position: w.playerPosition,
      velocity: w.playerVelocity,
      axis,
      sourceId,
      sourceKind,
      frames: reconstructFrames(graph, n),
    });
  }

  return { anchors, exhaustive: graph.exhausted, nodesExplored: graph.nodes.length };
}
