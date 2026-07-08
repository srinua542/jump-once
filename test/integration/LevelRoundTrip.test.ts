/**
 * S2.4 — the hand-authored sample level fixture parses, validates, and
 * round-trips losslessly (REQ-122):
 *  - value-level: parse(serialize(v)) deep-equals v;
 *  - byte-level:  serialize(parse(serialize(v))) === serialize(v);
 *  - the canonical form is anchored to a committed golden sha256 (dm-0014) —
 *    if this test fails after a serializer change, that change altered the
 *    canonical form: revert it, or deliberately re-anchor and ledger why;
 *  - fixture coverage of every closed list is asserted programmatically,
 *    not by eyeball.
 * Byte identity with the AUTHORED file is deliberately not asserted — the
 * fixture is 4-space formatted precisely to pin that non-promise.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ENTITY_KINDS } from '../../src/components/Behavior';
import { DIFFICULTY_AXES } from '../../src/components/Gdos';
import { TILE_KIND_BY_ID } from '../../src/components/Tilemap';
import { TRIGGER_ACTIONS } from '../../src/components/Trigger';
import type { LevelDefinition } from '../../src/components/Level';
import { parseLevel, parseLevelText } from '../../src/schema/Parse';
import { serializeLevel } from '../../src/schema/Serialize';
import { makeSampleLevel } from '../helpers/Samples';

const FIXTURE_PATH = join(process.cwd(), 'test', 'fixtures', 'fixture-all-kinds.level.json');

/** Committed anchor of the canonical form (dm-0014). Re-anchoring is a ledgered decision, never a casual edit. */
const GOLDEN_CANONICAL_SHA256 = 'c0ec3b1f89033e73b2f6d5819090c2cfcaf18a342b2c4dbf4cf5baa2ada8174e';

function loadFixture(): { text: string; value: LevelDefinition } {
  const text = readFileSync(FIXTURE_PATH, 'utf8');
  const result = parseLevelText(text);
  assert.equal(result.ok, true, result.ok ? '' : `fixture failed to parse: ${JSON.stringify((result as { errors: unknown }).errors)}`);
  if (!result.ok) throw new Error('unreachable');
  return { text, value: result.value };
}

test('the hand-authored fixture parses and validates', () => {
  loadFixture();
});

test('the fixture value equals its in-code twin (test/helpers/Samples.makeSampleLevel)', () => {
  assert.deepStrictEqual(loadFixture().value, makeSampleLevel());
});

test('value-level round-trip: parse(serialize(v)) deep-equals v', () => {
  const { value } = loadFixture();
  const reparsed = parseLevelText(serializeLevel(value));
  assert.equal(reparsed.ok, true);
  if (reparsed.ok) assert.deepStrictEqual(reparsed.value, value);
});

test('byte-level idempotence: serialize(parse(serialize(v))) === serialize(v)', () => {
  const { value } = loadFixture();
  const once = serializeLevel(value);
  const reparsed = parseLevelText(once);
  assert.equal(reparsed.ok, true);
  if (reparsed.ok) assert.equal(serializeLevel(reparsed.value), once);
});

test('the canonical form matches the committed golden hash (dm-0014)', () => {
  const { value } = loadFixture();
  const digest = createHash('sha256').update(serializeLevel(value), 'utf8').digest('hex');
  assert.equal(
    digest,
    GOLDEN_CANONICAL_SHA256,
    'canonical form changed — revert the serializer change, or deliberately re-anchor this hash and record the decision in the design ledger',
  );
});

test('byte identity with the authored file is NOT promised — and indeed does not hold', () => {
  const { text, value } = loadFixture();
  assert.notEqual(serializeLevel(value), text, 'fixture accidentally canonical; reformat it so this non-promise stays pinned');
});

test('fixture coverage is programmatic: every entity kind, trigger action, tile id, and difficulty axis appears', () => {
  const { value } = loadFixture();
  const kinds = new Set(value.entities.map((e) => e.behavior.kind));
  for (const kind of ENTITY_KINDS) assert.ok(kinds.has(kind), `entity kind not exercised by fixture: ${kind}`);
  const actions = new Set(value.triggers.map((t) => t.action));
  for (const action of TRIGGER_ACTIONS) assert.ok(actions.has(action), `trigger action not exercised by fixture: ${action}`);
  const tileIds = new Set(value.tilemap.tiles);
  for (const id of Object.keys(TILE_KIND_BY_ID)) assert.ok(tileIds.has(Number(id)), `tile id not exercised by fixture: ${id}`);
  for (const axis of DIFFICULTY_AXES) {
    assert.equal(typeof value.gdos.difficultyVectors[axis], 'number', `difficulty axis missing: ${axis}`);
  }
  assert.ok(value.gdos.emotionalBudgetCurve.length >= 2, 'curve should have at least two keyframes to be non-trivial');
});

test('mutating the fixture file content is caught (the fixture itself is validated, not trusted)', () => {
  const { text } = loadFixture();
  const sabotaged = text.replace('"schemaVersion": 1', '"schemaVersion": 9');
  const result = parseLevelText(sabotaged);
  assert.equal(result.ok, false);
});

test('parseLevel accepts the fixture decoded by plain JSON.parse too (text and value paths agree)', () => {
  const { text, value } = loadFixture();
  const viaValue = parseLevel(JSON.parse(text));
  assert.equal(viaValue.ok, true);
  if (viaValue.ok) assert.deepStrictEqual(viaValue.value, value);
});
