/**
 * Parse — the structural validator and ONLY construction path from untrusted
 * input to a typed LevelDefinition (parse, don't validate).
 *
 * GDOS alignment: Section 13 (Level Definition Schema).
 *
 * Contract (dm-0010, dm-0014, dm-0015; normative doc: docs/level_schema.md):
 *  - parseLevel(raw: unknown) never throws on any input; it returns either
 *    {ok:true, value} with a freshly constructed, fully validated value, or
 *    {ok:false, errors} with ALL findings, each carrying a JSON-pointer-style
 *    path. All-errors collection (not fail-fast) is deliberate: the P8 editor
 *    surfaces every problem in one pass.
 *  - Unknown/extra keys are STRICTLY rejected at every object (dm-0014).
 *  - Every number must be a finite IEEE double; -0 is normalized to 0.
 *  - schemaVersion must equal LEVEL_SCHEMA_VERSION — hard reject (dm-0010).
 *  - Identity: entity/trigger ids unique; authored ids must not use the
 *    reserved runtime prefix; triggers are checked for referential integrity
 *    AND source/target kind compatibility (dm-0015).
 *  - The returned value is built from fresh objects (never aliases the
 *    input), so no unvalidated data can be smuggled past this boundary.
 *
 * This is the sanctioned minting point for EntityId/TriggerId brands.
 * Lives in src/schema/ (dm-0013): definition-time I/O, never per-frame.
 */

import type { Vec2 } from '../core/Vec2';
import { RUNTIME_SPAWN_ID_PREFIX, type EntityId } from '../components/EntityId';
import type { TransformDef } from '../components/Transform';
import type { AabbDef } from '../components/Collider';
import type { BehaviorDef, EntityKind, MovingMode } from '../components/Behavior';
import type { EntityDef } from '../components/Entity';
import {
  TRIGGER_ACTIONS,
  TRIGGER_ACTION_TARGET_KIND,
  type TriggerActionKind,
  type TriggerDef,
  type TriggerId,
} from '../components/Trigger';
import { DIFFICULTY_AXES, type DifficultyAxis, type EmotionalKeyframe, type GdosMetadata } from '../components/Gdos';
import { TILE_KIND_BY_ID, type TilemapDef } from '../components/Tilemap';
import { LEVEL_SCHEMA_VERSION, type ConstraintsDef, type GoalDef, type LevelDefinition } from '../components/Level';

export interface SchemaError {
  /** JSON-pointer-style location, e.g. "/entities/3/behavior/speed". "" is the root. */
  readonly path: string;
  readonly message: string;
}

export type ParseResult =
  | { readonly ok: true; readonly value: LevelDefinition }
  | { readonly ok: false; readonly errors: readonly SchemaError[] };

type Errors = SchemaError[];

function fail(errors: Errors, path: string, message: string): undefined {
  errors.push({ path, message });
  return undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Strict-key gate: every present key must be expected (dm-0014). Missing keys are reported by the field parsers. */
function checkKeys(v: Record<string, unknown>, path: string, allowed: readonly string[], errors: Errors): void {
  for (const key of Object.keys(v)) {
    if (!allowed.includes(key)) fail(errors, `${path}/${key}`, `unknown key "${key}" (schema v${LEVEL_SCHEMA_VERSION} is strict; see docs/level_schema.md)`);
  }
}

/** Finite-number gate with -0 normalization (dm-0010). */
function parseNumber(v: unknown, path: string, errors: Errors): number | undefined {
  if (typeof v !== 'number') return fail(errors, path, `expected a number, got ${describe(v)}`);
  if (!Number.isFinite(v)) return fail(errors, path, 'expected a finite number (NaN/Infinity are not serializable)');
  return v === 0 ? 0 : v;
}

function parseString(v: unknown, path: string, errors: Errors): string | undefined {
  if (typeof v !== 'string') return fail(errors, path, `expected a string, got ${describe(v)}`);
  if (v.length === 0) return fail(errors, path, 'expected a non-empty string');
  return v;
}

function parseBoolean(v: unknown, path: string, errors: Errors): boolean | undefined {
  if (typeof v !== 'boolean') return fail(errors, path, `expected a boolean, got ${describe(v)}`);
  return v;
}

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'an array';
  return typeof v;
}

interface NumberBounds {
  readonly min?: number;
  readonly max?: number;
  readonly exclusiveMin?: number;
  readonly integer?: boolean;
}

function parseBoundedNumber(v: unknown, path: string, errors: Errors, bounds: NumberBounds): number | undefined {
  const n = parseNumber(v, path, errors);
  if (n === undefined) return undefined;
  if (bounds.integer === true && !Number.isInteger(n)) return fail(errors, path, `expected an integer, got ${n}`);
  if (bounds.exclusiveMin !== undefined && n <= bounds.exclusiveMin) return fail(errors, path, `expected a value > ${bounds.exclusiveMin}, got ${n}`);
  if (bounds.min !== undefined && n < bounds.min) return fail(errors, path, `expected a value >= ${bounds.min}, got ${n}`);
  if (bounds.max !== undefined && n > bounds.max) return fail(errors, path, `expected a value <= ${bounds.max}, got ${n}`);
  return n;
}

function parseVec2(v: unknown, path: string, errors: Errors): Vec2 | undefined {
  if (!isRecord(v)) return fail(errors, path, `expected an object {x, y}, got ${describe(v)}`);
  checkKeys(v, path, ['x', 'y'], errors);
  const x = parseNumber(v.x, `${path}/x`, errors);
  const y = parseNumber(v.y, `${path}/y`, errors);
  if (x === undefined || y === undefined) return undefined;
  return { x, y };
}

function parseTransform(v: unknown, path: string, errors: Errors): TransformDef | undefined {
  if (!isRecord(v)) return fail(errors, path, `expected an object, got ${describe(v)}`);
  checkKeys(v, path, ['position', 'facing'], errors);
  const position = parseVec2(v.position, `${path}/position`, errors);
  let facing: 1 | -1 | undefined;
  if (v.facing === 1 || v.facing === -1) facing = v.facing;
  else fail(errors, `${path}/facing`, `expected 1 or -1, got ${describe(v.facing)}`);
  if (position === undefined || facing === undefined) return undefined;
  return { position, facing };
}

function parseCollider(v: unknown, path: string, errors: Errors): AabbDef | undefined {
  if (!isRecord(v)) return fail(errors, path, `expected an object, got ${describe(v)}`);
  checkKeys(v, path, ['halfExtents', 'offset'], errors);
  const halfExtents = parseVec2(v.halfExtents, `${path}/halfExtents`, errors);
  const offset = parseVec2(v.offset, `${path}/offset`, errors);
  if (halfExtents !== undefined && (halfExtents.x <= 0 || halfExtents.y <= 0)) {
    return fail(errors, `${path}/halfExtents`, 'half-extents must be strictly positive');
  }
  if (halfExtents === undefined || offset === undefined) return undefined;
  return { halfExtents, offset };
}

const MOVING_MODES: readonly MovingMode[] = ['linear', 'looping', 'triggered'];

function parseWaypoints(v: unknown, path: string, errors: Errors): readonly Vec2[] | undefined {
  if (!Array.isArray(v)) return fail(errors, path, `expected an array of {x, y}, got ${describe(v)}`);
  if (v.length < 2) return fail(errors, path, `waypoint polyline needs at least 2 points, got ${v.length}`);
  const out: Vec2[] = [];
  for (let i = 0; i < v.length; i++) {
    const p = parseVec2(v[i], `${path}/${i}`, errors);
    if (p === undefined) return undefined;
    out.push(p);
  }
  return out;
}

function parseMode(v: unknown, path: string, errors: Errors): MovingMode | undefined {
  if (typeof v === 'string' && (MOVING_MODES as readonly string[]).includes(v)) return v as MovingMode;
  return fail(errors, path, `expected one of ${MOVING_MODES.join('|')}, got ${describe(v)}`);
}

function parseBehavior(v: unknown, path: string, errors: Errors): BehaviorDef | undefined {
  if (!isRecord(v)) return fail(errors, path, `expected an object, got ${describe(v)}`);
  const kind = v.kind;
  switch (kind) {
    case 'movingPlatform':
    case 'movingHazard': {
      checkKeys(v, path, ['kind', 'waypoints', 'speed', 'mode'], errors);
      const waypoints = parseWaypoints(v.waypoints, `${path}/waypoints`, errors);
      const speed = parseBoundedNumber(v.speed, `${path}/speed`, errors, { exclusiveMin: 0 });
      const mode = parseMode(v.mode, `${path}/mode`, errors);
      if (waypoints === undefined || speed === undefined || mode === undefined) return undefined;
      return { kind, waypoints, speed, mode };
    }
    case 'collapsingFloor': {
      checkKeys(v, path, ['kind', 'collapseDelaySeconds'], errors);
      const delay = parseBoundedNumber(v.collapseDelaySeconds, `${path}/collapseDelaySeconds`, errors, { min: 0 });
      if (delay === undefined) return undefined;
      return { kind, collapseDelaySeconds: delay };
    }
    case 'iceSurface':
    case 'spike':
    case 'pressurePlate':
    case 'proximityZone': {
      checkKeys(v, path, ['kind'], errors);
      return { kind };
    }
    case 'laser': {
      checkKeys(v, path, ['kind', 'periodSeconds', 'onFractionOfPeriod', 'phaseSeconds'], errors);
      const period = parseBoundedNumber(v.periodSeconds, `${path}/periodSeconds`, errors, { exclusiveMin: 0 });
      const fraction = parseBoundedNumber(v.onFractionOfPeriod, `${path}/onFractionOfPeriod`, errors, { exclusiveMin: 0, max: 1 });
      const phase = parseBoundedNumber(v.phaseSeconds, `${path}/phaseSeconds`, errors, { min: 0 });
      if (period === undefined || fraction === undefined || phase === undefined) return undefined;
      return { kind, periodSeconds: period, onFractionOfPeriod: fraction, phaseSeconds: phase };
    }
    case 'door': {
      checkKeys(v, path, ['kind', 'initiallyOpen'], errors);
      const initiallyOpen = parseBoolean(v.initiallyOpen, `${path}/initiallyOpen`, errors);
      if (initiallyOpen === undefined) return undefined;
      return { kind, initiallyOpen };
    }
    case 'spring': {
      checkKeys(v, path, ['kind', 'launchVelocity'], errors);
      const launchVelocity = parseVec2(v.launchVelocity, `${path}/launchVelocity`, errors);
      if (launchVelocity === undefined) return undefined;
      if (launchVelocity.x === 0 && launchVelocity.y === 0) {
        return fail(errors, `${path}/launchVelocity`, 'spring launch velocity must be non-zero');
      }
      return { kind, launchVelocity };
    }
    case 'gravityZone': {
      checkKeys(v, path, ['kind', 'gravityScale'], errors);
      const scale = parseNumber(v.gravityScale, `${path}/gravityScale`, errors);
      if (scale === undefined) return undefined;
      if (scale === 0) return fail(errors, `${path}/gravityScale`, 'gravityScale must be non-zero (0 would be a hidden no-op)');
      return { kind, gravityScale: scale };
    }
    case 'conveyor': {
      checkKeys(v, path, ['kind', 'surfaceVelocityX'], errors);
      const vx = parseNumber(v.surfaceVelocityX, `${path}/surfaceVelocityX`, errors);
      if (vx === undefined) return undefined;
      if (vx === 0) return fail(errors, `${path}/surfaceVelocityX`, 'surfaceVelocityX must be non-zero (0 would be a hidden no-op)');
      return { kind, surfaceVelocityX: vx };
    }
    default:
      return fail(errors, `${path}/kind`, `unknown entity kind ${JSON.stringify(kind)}`);
  }
}

function parseEntity(v: unknown, path: string, errors: Errors): EntityDef | undefined {
  if (!isRecord(v)) return fail(errors, path, `expected an object, got ${describe(v)}`);
  checkKeys(v, path, ['id', 'transform', 'collider', 'behavior'], errors);
  const rawId = parseString(v.id, `${path}/id`, errors);
  if (rawId !== undefined && rawId.startsWith(RUNTIME_SPAWN_ID_PREFIX)) {
    fail(errors, `${path}/id`, `authored ids must not use the reserved runtime prefix "${RUNTIME_SPAWN_ID_PREFIX}"`);
  }
  const transform = parseTransform(v.transform, `${path}/transform`, errors);
  const collider = parseCollider(v.collider, `${path}/collider`, errors);
  const behavior = parseBehavior(v.behavior, `${path}/behavior`, errors);
  if (rawId === undefined || transform === undefined || collider === undefined || behavior === undefined) return undefined;
  if (rawId.startsWith(RUNTIME_SPAWN_ID_PREFIX)) return undefined;
  return { id: rawId as EntityId, transform, collider, behavior };
}

function parseTilemap(v: unknown, path: string, errors: Errors): TilemapDef | undefined {
  if (!isRecord(v)) return fail(errors, path, `expected an object, got ${describe(v)}`);
  checkKeys(v, path, ['width', 'height', 'tileSize', 'tiles'], errors);
  const width = parseBoundedNumber(v.width, `${path}/width`, errors, { integer: true, exclusiveMin: 0 });
  const height = parseBoundedNumber(v.height, `${path}/height`, errors, { integer: true, exclusiveMin: 0 });
  const tileSize = parseBoundedNumber(v.tileSize, `${path}/tileSize`, errors, { exclusiveMin: 0 });
  if (!Array.isArray(v.tiles)) return fail(errors, `${path}/tiles`, `expected an array of tile ids, got ${describe(v.tiles)}`);
  const tiles: number[] = [];
  let tilesValid = true;
  for (let i = 0; i < v.tiles.length; i++) {
    const id = parseBoundedNumber(v.tiles[i], `${path}/tiles/${i}`, errors, { integer: true, min: 0 });
    if (id === undefined) { tilesValid = false; continue; }
    if (TILE_KIND_BY_ID[id] === undefined) {
      fail(errors, `${path}/tiles/${i}`, `unknown tile id ${id} (closed set: ${Object.keys(TILE_KIND_BY_ID).join(', ')})`);
      tilesValid = false;
      continue;
    }
    tiles.push(id);
  }
  if (width === undefined || height === undefined || tileSize === undefined || !tilesValid) return undefined;
  if (v.tiles.length !== width * height) {
    return fail(errors, `${path}/tiles`, `expected width*height = ${width * height} tiles, got ${v.tiles.length}`);
  }
  return { width, height, tileSize, tiles };
}

function parseKeyframe(v: unknown, path: string, errors: Errors): EmotionalKeyframe | undefined {
  if (!isRecord(v)) return fail(errors, path, `expected an object, got ${describe(v)}`);
  checkKeys(v, path, ['at', 'curiosity', 'confidence', 'surprise', 'mastery'], errors);
  const at = parseBoundedNumber(v.at, `${path}/at`, errors, { min: 0, max: 1 });
  const curiosity = parseBoundedNumber(v.curiosity, `${path}/curiosity`, errors, { min: 0, max: 100 });
  const confidence = parseBoundedNumber(v.confidence, `${path}/confidence`, errors, { min: 0, max: 100 });
  const surprise = parseBoundedNumber(v.surprise, `${path}/surprise`, errors, { min: 0, max: 100 });
  const mastery = parseBoundedNumber(v.mastery, `${path}/mastery`, errors, { min: 0, max: 100 });
  if (at === undefined || curiosity === undefined || confidence === undefined || surprise === undefined || mastery === undefined) return undefined;
  return { at, curiosity, confidence, surprise, mastery };
}

function parseGdos(v: unknown, path: string, errors: Errors): GdosMetadata | undefined {
  if (!isRecord(v)) return fail(errors, path, `expected an object, got ${describe(v)}`);
  checkKeys(v, path, ['targetKgNode', 'difficultyVectors', 'emotionalBudgetCurve', 'creatorMomentFrame'], errors);
  const targetKgNode = parseString(v.targetKgNode, `${path}/targetKgNode`, errors);

  let difficultyVectors: Record<DifficultyAxis, number> | undefined;
  if (!isRecord(v.difficultyVectors)) {
    fail(errors, `${path}/difficultyVectors`, `expected an object, got ${describe(v.difficultyVectors)}`);
  } else {
    checkKeys(v.difficultyVectors, `${path}/difficultyVectors`, DIFFICULTY_AXES, errors);
    const vectors: Partial<Record<DifficultyAxis, number>> = {};
    let allPresent = true;
    for (const axis of DIFFICULTY_AXES) {
      const n = parseBoundedNumber(v.difficultyVectors[axis], `${path}/difficultyVectors/${axis}`, errors, { min: 0, max: 1 });
      if (n === undefined) allPresent = false;
      else vectors[axis] = n;
    }
    if (allPresent) difficultyVectors = vectors as Record<DifficultyAxis, number>;
  }

  let emotionalBudgetCurve: EmotionalKeyframe[] | undefined;
  if (!Array.isArray(v.emotionalBudgetCurve)) {
    fail(errors, `${path}/emotionalBudgetCurve`, `expected an array, got ${describe(v.emotionalBudgetCurve)}`);
  } else if (v.emotionalBudgetCurve.length === 0) {
    fail(errors, `${path}/emotionalBudgetCurve`, 'curve must have at least one keyframe');
  } else {
    const frames: EmotionalKeyframe[] = [];
    let framesValid = true;
    for (let i = 0; i < v.emotionalBudgetCurve.length; i++) {
      const frame = parseKeyframe(v.emotionalBudgetCurve[i], `${path}/emotionalBudgetCurve/${i}`, errors);
      if (frame === undefined) { framesValid = false; continue; }
      frames.push(frame);
    }
    if (framesValid) {
      for (let i = 1; i < frames.length; i++) {
        if (frames[i].at <= frames[i - 1].at) {
          fail(errors, `${path}/emotionalBudgetCurve/${i}/at`, `keyframe "at" must be strictly increasing (${frames[i].at} follows ${frames[i - 1].at})`);
          framesValid = false;
        }
      }
    }
    if (framesValid) emotionalBudgetCurve = frames;
  }

  let creatorMomentFrame: GdosMetadata['creatorMomentFrame'] | undefined;
  if (!isRecord(v.creatorMomentFrame)) {
    fail(errors, `${path}/creatorMomentFrame`, `expected an object, got ${describe(v.creatorMomentFrame)}`);
  } else {
    const cmf = v.creatorMomentFrame;
    const cmfPath = `${path}/creatorMomentFrame`;
    checkKeys(cmf, cmfPath, ['tickWindow', 'description'], errors);
    const description = parseString(cmf.description, `${cmfPath}/description`, errors);
    let window: readonly [number, number] | undefined;
    if (!Array.isArray(cmf.tickWindow) || cmf.tickWindow.length !== 2) {
      fail(errors, `${cmfPath}/tickWindow`, 'expected [startTick, endTick]');
    } else {
      const start = parseBoundedNumber(cmf.tickWindow[0], `${cmfPath}/tickWindow/0`, errors, { integer: true, min: 0 });
      const end = parseBoundedNumber(cmf.tickWindow[1], `${cmfPath}/tickWindow/1`, errors, { integer: true, min: 0 });
      if (start !== undefined && end !== undefined) {
        if (start > end) fail(errors, `${cmfPath}/tickWindow`, `start tick ${start} exceeds end tick ${end}`);
        else window = [start, end];
      }
    }
    if (description !== undefined && window !== undefined) creatorMomentFrame = { tickWindow: window, description };
  }

  if (targetKgNode === undefined || difficultyVectors === undefined || emotionalBudgetCurve === undefined || creatorMomentFrame === undefined) return undefined;
  return { targetKgNode, difficultyVectors, emotionalBudgetCurve, creatorMomentFrame };
}

function insideBounds(p: Vec2, tilemap: TilemapDef): boolean {
  return p.x >= 0 && p.x <= tilemap.width * tilemap.tileSize && p.y >= 0 && p.y <= tilemap.height * tilemap.tileSize;
}

function parseConstraints(v: unknown, path: string, errors: Errors, tilemap: TilemapDef | undefined): ConstraintsDef | undefined {
  if (!isRecord(v)) return fail(errors, path, `expected an object, got ${describe(v)}`);
  checkKeys(v, path, ['spawn', 'goal', 'parTimeTiersSeconds'], errors);
  const spawn = parseVec2(v.spawn, `${path}/spawn`, errors);
  if (spawn !== undefined && tilemap !== undefined && !insideBounds(spawn, tilemap)) {
    fail(errors, `${path}/spawn`, 'spawn lies outside the tilemap world bounds');
  }

  let goal: GoalDef | undefined;
  if (!isRecord(v.goal)) {
    fail(errors, `${path}/goal`, `expected an object, got ${describe(v.goal)}`);
  } else {
    checkKeys(v.goal, `${path}/goal`, ['position', 'halfExtents'], errors);
    const position = parseVec2(v.goal.position, `${path}/goal/position`, errors);
    const halfExtents = parseVec2(v.goal.halfExtents, `${path}/goal/halfExtents`, errors);
    if (position !== undefined && tilemap !== undefined && !insideBounds(position, tilemap)) {
      fail(errors, `${path}/goal/position`, 'goal lies outside the tilemap world bounds');
    } else if (halfExtents !== undefined && (halfExtents.x <= 0 || halfExtents.y <= 0)) {
      fail(errors, `${path}/goal/halfExtents`, 'goal half-extents must be strictly positive');
    } else if (position !== undefined && halfExtents !== undefined) {
      goal = { position, halfExtents };
    }
  }

  let parTimeTiersSeconds: number[] | undefined;
  if (!Array.isArray(v.parTimeTiersSeconds)) {
    fail(errors, `${path}/parTimeTiersSeconds`, `expected an array, got ${describe(v.parTimeTiersSeconds)}`);
  } else if (v.parTimeTiersSeconds.length === 0) {
    fail(errors, `${path}/parTimeTiersSeconds`, 'at least one par tier is required');
  } else {
    const tiers: number[] = [];
    let tiersValid = true;
    for (let i = 0; i < v.parTimeTiersSeconds.length; i++) {
      const t = parseBoundedNumber(v.parTimeTiersSeconds[i], `${path}/parTimeTiersSeconds/${i}`, errors, { exclusiveMin: 0 });
      if (t === undefined) { tiersValid = false; continue; }
      tiers.push(t);
    }
    if (tiersValid) {
      for (let i = 1; i < tiers.length; i++) {
        if (tiers[i] >= tiers[i - 1]) {
          fail(errors, `${path}/parTimeTiersSeconds/${i}`, `par tiers must be strictly decreasing (casual -> optimal); ${tiers[i]} follows ${tiers[i - 1]}`);
          tiersValid = false;
        }
      }
    }
    if (tiersValid) parTimeTiersSeconds = tiers;
  }

  if (spawn === undefined || goal === undefined || parTimeTiersSeconds === undefined) return undefined;
  if (tilemap !== undefined && !insideBounds(spawn, tilemap)) return undefined;
  return { spawn, goal, parTimeTiersSeconds };
}

function parseTrigger(
  v: unknown,
  path: string,
  errors: Errors,
  kindById: ReadonlyMap<string, EntityKind>,
): TriggerDef | undefined {
  if (!isRecord(v)) return fail(errors, path, `expected an object, got ${describe(v)}`);
  checkKeys(v, path, ['id', 'source', 'targets', 'action', 'once'], errors);
  const id = parseString(v.id, `${path}/id`, errors);
  const source = parseString(v.source, `${path}/source`, errors);
  const once = parseBoolean(v.once, `${path}/once`, errors);

  let action: TriggerActionKind | undefined;
  if (typeof v.action === 'string' && (TRIGGER_ACTIONS as readonly string[]).includes(v.action)) {
    action = v.action as TriggerActionKind;
  } else {
    fail(errors, `${path}/action`, `unknown trigger action ${JSON.stringify(v.action)} (closed set: ${TRIGGER_ACTIONS.join(', ')})`);
  }

  let sourceOk = false;
  if (source !== undefined) {
    const sourceKind = kindById.get(source);
    if (sourceKind === undefined) {
      fail(errors, `${path}/source`, `dangling reference: no entity with id "${source}"`);
    } else if (sourceKind !== 'pressurePlate' && sourceKind !== 'proximityZone') {
      fail(errors, `${path}/source`, `trigger source must be a pressurePlate or proximityZone, "${source}" is a ${sourceKind}`);
    } else {
      sourceOk = true;
    }
  }

  let targets: EntityId[] | undefined;
  if (!Array.isArray(v.targets)) {
    fail(errors, `${path}/targets`, `expected an array of entity ids, got ${describe(v.targets)}`);
  } else if (v.targets.length === 0) {
    fail(errors, `${path}/targets`, 'a trigger must have at least one target');
  } else {
    const out: EntityId[] = [];
    let targetsValid = true;
    for (let i = 0; i < v.targets.length; i++) {
      const t = parseString(v.targets[i], `${path}/targets/${i}`, errors);
      if (t === undefined) { targetsValid = false; continue; }
      const targetKind = kindById.get(t);
      if (targetKind === undefined) {
        fail(errors, `${path}/targets/${i}`, `dangling reference: no entity with id "${t}"`);
        targetsValid = false;
        continue;
      }
      if (action !== undefined && targetKind !== TRIGGER_ACTION_TARGET_KIND[action]) {
        fail(errors, `${path}/targets/${i}`, `action "${action}" requires a ${TRIGGER_ACTION_TARGET_KIND[action]} target, "${t}" is a ${targetKind}`);
        targetsValid = false;
        continue;
      }
      out.push(t as EntityId);
    }
    if (targetsValid) targets = out;
  }

  if (id === undefined || source === undefined || once === undefined || action === undefined || !sourceOk || targets === undefined) return undefined;
  return { id: id as TriggerId, source: source as EntityId, targets, action, once };
}

/** Parse an already-JSON-decoded value. Never throws. */
export function parseLevel(raw: unknown): ParseResult {
  const errors: Errors = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: [{ path: '', message: `expected a level object, got ${describe(raw)}` }] };
  }
  checkKeys(raw, '', ['schemaVersion', 'levelId', 'title', 'gdos', 'tilemap', 'entities', 'triggers', 'constraints'], errors);

  if (raw.schemaVersion !== LEVEL_SCHEMA_VERSION) {
    // Hard reject (dm-0010): no best-effort parsing of other versions.
    fail(errors, '/schemaVersion', `unsupported schema version ${JSON.stringify(raw.schemaVersion)}; this build reads exactly v${LEVEL_SCHEMA_VERSION}`);
    return { ok: false, errors };
  }

  const levelId = parseString(raw.levelId, '/levelId', errors);
  const title = parseString(raw.title, '/title', errors);
  const gdos = parseGdos(raw.gdos, '/gdos', errors);
  const tilemap = parseTilemap(raw.tilemap, '/tilemap', errors);

  let entities: EntityDef[] | undefined;
  const kindById = new Map<string, EntityKind>();
  if (!Array.isArray(raw.entities)) {
    fail(errors, '/entities', `expected an array, got ${describe(raw.entities)}`);
  } else {
    const out: EntityDef[] = [];
    let entitiesValid = true;
    const seen = new Set<string>();
    for (let i = 0; i < raw.entities.length; i++) {
      const e = parseEntity(raw.entities[i], `/entities/${i}`, errors);
      if (e === undefined) { entitiesValid = false; continue; }
      if (seen.has(e.id)) {
        fail(errors, `/entities/${i}/id`, `duplicate entity id "${e.id}"`);
        entitiesValid = false;
        continue;
      }
      seen.add(e.id);
      kindById.set(e.id, e.behavior.kind);
      out.push(e);
    }
    if (entitiesValid) entities = out;
  }

  let triggers: TriggerDef[] | undefined;
  if (!Array.isArray(raw.triggers)) {
    fail(errors, '/triggers', `expected an array, got ${describe(raw.triggers)}`);
  } else {
    const out: TriggerDef[] = [];
    let triggersValid = true;
    const seen = new Set<string>();
    for (let i = 0; i < raw.triggers.length; i++) {
      const t = parseTrigger(raw.triggers[i], `/triggers/${i}`, errors, kindById);
      if (t === undefined) { triggersValid = false; continue; }
      if (seen.has(t.id)) {
        fail(errors, `/triggers/${i}/id`, `duplicate trigger id "${t.id}"`);
        triggersValid = false;
        continue;
      }
      seen.add(t.id);
      out.push(t);
    }
    if (triggersValid) triggers = out;
  }

  const constraints = parseConstraints(raw.constraints, '/constraints', errors, tilemap);

  if (
    errors.length > 0 ||
    levelId === undefined ||
    title === undefined ||
    gdos === undefined ||
    tilemap === undefined ||
    entities === undefined ||
    triggers === undefined ||
    constraints === undefined
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      schemaVersion: LEVEL_SCHEMA_VERSION,
      levelId,
      title,
      gdos,
      tilemap,
      entities,
      triggers,
      constraints,
    },
  };
}

/** Parse level JSON text. JSON syntax errors surface as a root-path SchemaError; never throws. */
export function parseLevelText(text: string): ParseResult {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ path: '', message: `invalid JSON: ${e instanceof Error ? e.message : String(e)}` }] };
  }
  return parseLevel(decoded);
}
