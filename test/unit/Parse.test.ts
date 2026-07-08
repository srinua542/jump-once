/**
 * S2.3 — structural validator: every rejection rule has a dedicated failing
 * fixture with a path-qualified error; a valid payload parses to a value
 * deep-equal to its source; the seeded fuzz never provokes a throw and every
 * accepted mutant re-serializes idempotently.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createRng, nextInt, type RngState } from '../../src/core/Rng';
import { parseLevel, parseLevelText, type ParseResult } from '../../src/schema/Parse';
import { serializeLevel } from '../../src/schema/Serialize';
import { makeSampleLevel } from '../helpers/Samples';

/** Fresh plain-JSON copy of the sample level, optionally mutated. */
function payload(mutate?: (obj: any) => void): unknown {
  const obj = JSON.parse(serializeLevel(makeSampleLevel()));
  if (mutate) mutate(obj);
  return obj;
}

/** Assert rejection with at least one error whose path starts with `pathPrefix`. */
function expectReject(result: ParseResult, pathPrefix: string): void {
  assert.equal(result.ok, false, `expected rejection with an error at ${pathPrefix}`);
  if (result.ok) return;
  const hit = result.errors.some((e) => e.path.startsWith(pathPrefix));
  assert.ok(hit, `no error at ${pathPrefix}; got: ${result.errors.map((e) => e.path).join(', ')}`);
}

test('a valid payload parses, and the parsed value deep-equals the authored definition', () => {
  const result = parseLevel(payload());
  assert.equal(result.ok, true, result.ok ? '' : JSON.stringify((result as { errors: unknown }).errors));
  if (result.ok) assert.deepStrictEqual(result.value, makeSampleLevel());
});

test('rejects a non-object root with a root-path error', () => {
  for (const root of [null, 42, 'level', [1, 2]]) {
    const result = parseLevel(root);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.errors[0].path, '');
  }
});

test('parseLevelText reports JSON syntax errors as a root SchemaError instead of throwing', () => {
  const result = parseLevelText('{ not json');
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors[0].message, /invalid JSON/);
});

test('hard-rejects any schemaVersion other than the current one (dm-0010)', () => {
  expectReject(parseLevel(payload((o) => { o.schemaVersion = 2; })), '/schemaVersion');
  expectReject(parseLevel(payload((o) => { o.schemaVersion = '1'; })), '/schemaVersion');
});

test('strictly rejects unknown keys at every level of the tree (dm-0014)', () => {
  expectReject(parseLevel(payload((o) => { o.futureField = true; })), '/futureField');
  expectReject(parseLevel(payload((o) => { o.tilemap.theme = 'lava'; })), '/tilemap/theme');
  expectReject(parseLevel(payload((o) => { o.entities[0].layer = 3; })), '/entities/0/layer');
  expectReject(parseLevel(payload((o) => { o.entities[0].behavior.bounce = 1; })), '/entities/0/behavior/bounce');
  expectReject(parseLevel(payload((o) => { o.constraints.maxJumps = 2; })), '/constraints/maxJumps');
});

test('rejects non-finite numbers (NaN/Infinity cannot survive JSON anyway)', () => {
  expectReject(parseLevel(payload((o) => { o.tilemap.tileSize = Number.NaN; })), '/tilemap/tileSize');
  expectReject(parseLevel(payload((o) => { o.constraints.spawn.x = Number.POSITIVE_INFINITY; })), '/constraints/spawn/x');
  expectReject(parseLevel(payload((o) => { o.constraints.spawn.y = null; })), '/constraints/spawn/y');
});

test('normalizes -0 to +0 at the boundary (dm-0010)', () => {
  const result = parseLevel(payload((o) => { o.entities[0].collider.offset.x = -0; }));
  assert.equal(result.ok, true);
  if (result.ok) assert.ok(Object.is(result.value.entities[0].collider.offset.x, 0));
});

test('rejects tilemap tiles length mismatch against width*height', () => {
  expectReject(parseLevel(payload((o) => { o.tilemap.tiles.push(0); })), '/tilemap/tiles');
});

test('rejects non-positive or non-integer tilemap dimensions and tileSize', () => {
  expectReject(parseLevel(payload((o) => { o.tilemap.width = 0; })), '/tilemap/width');
  expectReject(parseLevel(payload((o) => { o.tilemap.height = -3; })), '/tilemap/height');
  expectReject(parseLevel(payload((o) => { o.tilemap.width = 2.5; })), '/tilemap/width');
  expectReject(parseLevel(payload((o) => { o.tilemap.tileSize = 0; })), '/tilemap/tileSize');
});

test('rejects unknown tile ids (closed set)', () => {
  expectReject(parseLevel(payload((o) => { o.tilemap.tiles[5] = 7; })), '/tilemap/tiles/5');
});

test('rejects an unknown entity kind (closed union)', () => {
  expectReject(parseLevel(payload((o) => { o.entities[0].behavior = { kind: 'teleporter' }; })), '/entities/0/behavior/kind');
});

test('rejects duplicate entity ids', () => {
  expectReject(parseLevel(payload((o) => { o.entities[1].id = o.entities[0].id; })), '/entities/1/id');
});

test('rejects authored ids in the reserved runtime namespace', () => {
  expectReject(parseLevel(payload((o) => { o.entities[0].id = 'rt:42'; })), '/entities/0/id');
});

test('rejects invalid facing (only 1 and -1 exist)', () => {
  expectReject(parseLevel(payload((o) => { o.entities[0].transform.facing = 0; })), '/entities/0/transform/facing');
});

test('rejects non-positive collider half-extents', () => {
  expectReject(parseLevel(payload((o) => { o.entities[0].collider.halfExtents.y = 0; })), '/entities/0/collider/halfExtents');
});

test('rejects behavior payload violations (waypoints < 2, laser fraction 0, zero-velocity spring/conveyor/gravity)', () => {
  expectReject(parseLevel(payload((o) => { o.entities[0].behavior.waypoints = [{ x: 0, y: 0 }]; })), '/entities/0/behavior/waypoints');
  expectReject(parseLevel(payload((o) => { o.entities[0].behavior.speed = 0; })), '/entities/0/behavior/speed');
  expectReject(parseLevel(payload((o) => { o.entities[0].behavior.mode = 'random'; })), '/entities/0/behavior/mode');
  expectReject(parseLevel(payload((o) => { o.entities[4].behavior.onFractionOfPeriod = 0; })), '/entities/4/behavior/onFractionOfPeriod');
  expectReject(parseLevel(payload((o) => { o.entities[9].behavior.launchVelocity = { x: 0, y: 0 }; })), '/entities/9/behavior/launchVelocity');
  expectReject(parseLevel(payload((o) => { o.entities[10].behavior.gravityScale = 0; })), '/entities/10/behavior/gravityScale');
  expectReject(parseLevel(payload((o) => { o.entities[11].behavior.surfaceVelocityX = 0; })), '/entities/11/behavior/surfaceVelocityX');
});

test('rejects an unknown trigger action (closed set)', () => {
  expectReject(parseLevel(payload((o) => { o.triggers[0].action = 'explode'; })), '/triggers/0/action');
});

test('rejects duplicate trigger ids', () => {
  expectReject(parseLevel(payload((o) => { o.triggers[1].id = o.triggers[0].id; })), '/triggers/1/id');
});

test('rejects dangling trigger references (source and target)', () => {
  expectReject(parseLevel(payload((o) => { o.triggers[0].source = 'e-ghost'; })), '/triggers/0/source');
  expectReject(parseLevel(payload((o) => { o.triggers[0].targets = ['e-ghost']; })), '/triggers/0/targets/0');
});

test('rejects kind-incompatible trigger wiring (dm-0015 compatibility table)', () => {
  // a door cannot be a signal source
  expectReject(parseLevel(payload((o) => { o.triggers[0].source = 'e-door'; })), '/triggers/0/source');
  // openDoor cannot drive a spike
  expectReject(parseLevel(payload((o) => { o.triggers[0].targets = ['e-spike']; })), '/triggers/0/targets/0');
});

test('rejects an empty trigger target list', () => {
  expectReject(parseLevel(payload((o) => { o.triggers[0].targets = []; })), '/triggers/0/targets');
});

test('rejects spawn/goal outside the tilemap world bounds', () => {
  expectReject(parseLevel(payload((o) => { o.constraints.spawn.x = 99; })), '/constraints/spawn');
  expectReject(parseLevel(payload((o) => { o.constraints.goal.position.y = -1; })), '/constraints/goal/position');
});

test('rejects a non-increasing emotional budget curve and out-of-range values', () => {
  expectReject(parseLevel(payload((o) => { o.gdos.emotionalBudgetCurve[1].at = 0; })), '/gdos/emotionalBudgetCurve/1/at');
  expectReject(parseLevel(payload((o) => { o.gdos.emotionalBudgetCurve[0].surprise = 101; })), '/gdos/emotionalBudgetCurve/0/surprise');
});

test('rejects difficulty vectors with missing, extra, or out-of-range axes', () => {
  expectReject(parseLevel(payload((o) => { delete o.gdos.difficultyVectors.routeAmbiguity; })), '/gdos/difficultyVectors/routeAmbiguity');
  expectReject(parseLevel(payload((o) => { o.gdos.difficultyVectors.luck = 0.5; })), '/gdos/difficultyVectors/luck');
  expectReject(parseLevel(payload((o) => { o.gdos.difficultyVectors.timingStrictness = 1.5; })), '/gdos/difficultyVectors/timingStrictness');
});

test('rejects a malformed creator-moment frame (inverted or negative tick window)', () => {
  expectReject(parseLevel(payload((o) => { o.gdos.creatorMomentFrame.tickWindow = [200, 100]; })), '/gdos/creatorMomentFrame/tickWindow');
  expectReject(parseLevel(payload((o) => { o.gdos.creatorMomentFrame.tickWindow = [-1, 100]; })), '/gdos/creatorMomentFrame/tickWindow/0');
});

test('rejects non-decreasing par time tiers', () => {
  expectReject(parseLevel(payload((o) => { o.constraints.parTimeTiersSeconds = [30, 30, 12]; })), '/constraints/parTimeTiersSeconds/1');
});

test('collects ALL errors in one pass, each path-qualified (editor contract)', () => {
  const result = parseLevel(payload((o) => {
    o.tilemap.tileSize = 0;
    o.entities[0].transform.facing = 0;
    o.triggers[0].action = 'explode';
  }));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.length >= 3, `expected >=3 errors, got ${result.errors.length}`);
    for (const e of result.errors) assert.ok(e.path.startsWith('/'), `unqualified error path: "${e.path}"`);
  }
});

/* ── Seeded fuzz (dm-0014): mutations never throw, never break idempotence ── */

interface Fuzz { rng: RngState }

function fuzzInt(f: Fuzz, maxExclusive: number): number {
  const drawn = nextInt(f.rng, 0, maxExclusive);
  f.rng = drawn.next;
  return drawn.value;
}

const JUNK_VALUES: readonly unknown[] = [null, 'junk', -1, 0, true, [], {}, 3.5, Number.NaN, -0, [null], { x: 'y' }];

/** Apply one random structural mutation somewhere in the object tree. */
function mutateOnce(f: Fuzz, obj: unknown): void {
  if (typeof obj !== 'object' || obj === null) return;
  // walk to a random node
  let node: Record<string, unknown> | unknown[] = obj as Record<string, unknown>;
  const depth = fuzzInt(f, 5);
  for (let i = 0; i < depth; i++) {
    const keys = Array.isArray(node) ? node.map((_, k) => k) : Object.keys(node);
    if (keys.length === 0) break;
    const key = keys[fuzzInt(f, keys.length)];
    const next = (node as Record<string, unknown>)[key as string];
    if (typeof next !== 'object' || next === null) break;
    node = next as Record<string, unknown> | unknown[];
  }
  const op = fuzzInt(f, 4);
  if (Array.isArray(node)) {
    if (op === 0 && node.length > 0) node.length = fuzzInt(f, node.length); // truncate
    else if (op === 1) node.push(JUNK_VALUES[fuzzInt(f, JUNK_VALUES.length)]);
    else if (node.length > 0) node[fuzzInt(f, node.length)] = JUNK_VALUES[fuzzInt(f, JUNK_VALUES.length)];
    return;
  }
  const keys = Object.keys(node);
  if (op === 0 && keys.length > 0) delete node[keys[fuzzInt(f, keys.length)]];
  else if (op === 1) node[`fuzz_${fuzzInt(f, 1000)}`] = JUNK_VALUES[fuzzInt(f, JUNK_VALUES.length)];
  else if (keys.length > 0) node[keys[fuzzInt(f, keys.length)]] = JUNK_VALUES[fuzzInt(f, JUNK_VALUES.length)];
}

test('seeded fuzz: 300 mutants never throw; accepted mutants re-serialize byte-idempotently', () => {
  const f: Fuzz = { rng: createRng(20260709) };
  let accepted = 0;
  let rejected = 0;
  for (let i = 0; i < 300; i++) {
    const obj = payload();
    const mutations = 1 + fuzzInt(f, 3);
    for (let m = 0; m < mutations; m++) mutateOnce(f, obj);

    let result: ParseResult;
    try {
      result = parseLevel(obj);
    } catch (e) {
      assert.fail(`parseLevel threw on fuzz iteration ${i}: ${e instanceof Error ? e.stack : String(e)}`);
    }
    if (result.ok) {
      accepted++;
      const text = serializeLevel(result.value);
      const reparsed = parseLevelText(text);
      assert.equal(reparsed.ok, true, `accepted mutant ${i} failed to re-parse its own canonical form`);
      if (reparsed.ok) {
        assert.equal(serializeLevel(reparsed.value), text, `accepted mutant ${i} is not byte-idempotent`);
      }
    } else {
      rejected++;
      for (const e of result.errors) assert.equal(typeof e.message, 'string');
    }
  }
  // The fuzz must actually exercise both outcomes to be meaningful.
  assert.ok(rejected > 0, 'fuzz never rejected anything — mutator is broken');
  assert.ok(accepted + rejected === 300);
});
