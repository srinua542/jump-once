/**
 * S4.1 — the canonical replay-tape format (dm-0023).
 *
 *  - round-trip: value-lossless (deep-equal) and byte-idempotent
 *    (serialize(parse(serialize(t))) === serialize(t));
 *  - strict parse: every rejection rule has a failing fixture with a
 *    path-qualified error — wrong/missing version, unknown key at root and
 *    frame level, empty levelId, non-uint32 seed, malformed frames;
 *  - parse never throws, even on malformed JSON text.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { InputFrame } from '../../src/core/State';
import {
  TAPE_SCHEMA_VERSION,
  parseTape,
  parseTapeText,
  serializeTape,
  type ReplayTape,
} from '../../src/schema/TapeIO';

function frame(moveAxis: -1 | 0 | 1, jumpPressed = false, resetPressed = false): InputFrame {
  return { moveAxis, jumpPressed, resetPressed };
}

function makeTape(): ReplayTape {
  return {
    schemaVersion: TAPE_SCHEMA_VERSION,
    levelId: 'unit-tape-level',
    seed: 20260709,
    frames: [frame(1), frame(1, true), frame(0), frame(-1), frame(0, false, true)],
  };
}

/** Deep-clone through JSON so mutations for bad fixtures never share structure. */
function rawOf(tape: ReplayTape): Record<string, unknown> {
  return JSON.parse(serializeTape(tape)) as Record<string, unknown>;
}

function expectReject(raw: unknown, pathFragment: string): void {
  const result = parseTape(raw);
  assert.equal(result.ok, false, `expected rejection mentioning "${pathFragment}"`);
  if (result.ok) return;
  assert.ok(
    result.errors.some((e) => e.path.includes(pathFragment)),
    `no error path contains "${pathFragment}": ${JSON.stringify(result.errors)}`,
  );
}

test('round-trip: parse(serialize(t)) is value-lossless', () => {
  const tape = makeTape();
  const result = parseTapeText(serializeTape(tape));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, tape);
});

test('round-trip: serialize(parse(serialize(t))) is byte-identical (canonical idempotence)', () => {
  const tape = makeTape();
  const first = serializeTape(tape);
  const result = parseTapeText(first);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(serializeTape(result.value), first);
});

test('canonical form: keys re-serialize in fixed order regardless of input key order', () => {
  const scrambled = {
    frames: [{ resetPressed: false, moveAxis: 0, jumpPressed: false }],
    seed: 1,
    levelId: 'scrambled',
    schemaVersion: TAPE_SCHEMA_VERSION,
  };
  const result = parseTape(scrambled);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const text = serializeTape(result.value);
  assert.ok(text.indexOf('"schemaVersion"') < text.indexOf('"levelId"'));
  assert.ok(text.indexOf('"levelId"') < text.indexOf('"seed"'));
  assert.ok(text.indexOf('"seed"') < text.indexOf('"frames"'));
  assert.ok(text.indexOf('"moveAxis"') < text.indexOf('"jumpPressed"'));
  assert.ok(text.indexOf('"jumpPressed"') < text.indexOf('"resetPressed"'));
});

test('rejects a non-object root', () => {
  for (const bad of [null, 7, 'tape', [makeTape()]]) {
    const result = parseTape(bad);
    assert.equal(result.ok, false, `root ${JSON.stringify(bad)} must be rejected`);
  }
});

test('rejects any schemaVersion other than the current one (no migrations exist)', () => {
  const raw = rawOf(makeTape());
  raw['schemaVersion'] = TAPE_SCHEMA_VERSION + 1;
  expectReject(raw, '/schemaVersion');
  delete raw['schemaVersion'];
  expectReject(raw, '/schemaVersion');
});

test('rejects unknown keys at the root (strict, dm-0014 discipline)', () => {
  const raw = rawOf(makeTape());
  raw['recordedBy'] = 'v9-future-field';
  expectReject(raw, '/recordedBy');
});

test('rejects unknown keys inside a frame', () => {
  const raw = rawOf(makeTape());
  (raw['frames'] as Record<string, unknown>[])[2]['dashPressed'] = true;
  expectReject(raw, '/frames/2/dashPressed');
});

test('rejects an empty or non-string levelId', () => {
  const raw = rawOf(makeTape());
  raw['levelId'] = '';
  expectReject(raw, '/levelId');
  raw['levelId'] = 42;
  expectReject(raw, '/levelId');
});

test('rejects seeds outside normalized uint32 form', () => {
  for (const badSeed of [-1, 1.5, 4294967296, Number.NaN, Number.POSITIVE_INFINITY]) {
    const raw = rawOf(makeTape());
    raw['seed'] = badSeed;
    expectReject(raw, '/seed');
  }
});

test('rejects malformed frames: bad moveAxis, non-boolean buttons, non-array, non-object frame', () => {
  let raw = rawOf(makeTape());
  (raw['frames'] as Record<string, unknown>[])[0]['moveAxis'] = 2;
  expectReject(raw, '/frames/0/moveAxis');

  raw = rawOf(makeTape());
  (raw['frames'] as Record<string, unknown>[])[1]['jumpPressed'] = 'yes';
  expectReject(raw, '/frames/1/jumpPressed');

  raw = rawOf(makeTape());
  (raw['frames'] as Record<string, unknown>[])[4]['resetPressed'] = 0;
  expectReject(raw, '/frames/4/resetPressed');

  raw = rawOf(makeTape());
  raw['frames'] = 'not-an-array';
  expectReject(raw, '/frames');

  raw = rawOf(makeTape());
  (raw['frames'] as unknown[])[3] = null;
  expectReject(raw, '/frames/3');
});

test('parseTapeText returns a Result error on malformed JSON — never throws', () => {
  const result = parseTapeText('{"schemaVersion": 1, "levelId": ');
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors[0].message.includes('malformed JSON'));
});

test('an empty frames array is a valid (zero-tick) tape', () => {
  const result = parseTape({
    schemaVersion: TAPE_SCHEMA_VERSION,
    levelId: 'empty-run',
    seed: 0,
    frames: [],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.frames.length, 0);
});
