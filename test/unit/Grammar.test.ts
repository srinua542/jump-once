/**
 * S9.1 — VisualGrammar: the sixth versioned schema (dm-0083). Strict parse
 * with the full P2 discipline; the structural half of REQ-070's mixing
 * prohibition (total, single-valued bindings; danger structurally always-
 * critical); the dm-0085 goal->interactive reconciliation.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_GRAMMAR,
  GRAMMAR_CATEGORY_IDS,
  GRAMMAR_SCHEMA_VERSION,
  RENDERABLE_ROLES,
  parseGrammar,
  resolveCategory,
} from '../../render/grammar/Grammar';

function defaultRaw(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(DEFAULT_GRAMMAR)) as Record<string, unknown>;
}

test('the default grammar parses through its own strict parser (round-trip)', () => {
  const result = parseGrammar(defaultRaw());
  assert.ok(result.ok, `default grammar failed its own parse: ${JSON.stringify(!result.ok ? result.errors : [])}`);
  if (result.ok) assert.deepEqual(result.value, DEFAULT_GRAMMAR);
});

test('the default grammar is deeply frozen', () => {
  assert.ok(Object.isFrozen(DEFAULT_GRAMMAR));
  assert.ok(Object.isFrozen(DEFAULT_GRAMMAR.categories));
  assert.ok(Object.isFrozen(DEFAULT_GRAMMAR.bindings));
});

test('version pin: any other grammarSchemaVersion is hard-rejected', () => {
  for (const bad of [0, 2, '1', null, undefined]) {
    const raw = defaultRaw();
    if (bad === undefined) delete raw.grammarSchemaVersion;
    else raw.grammarSchemaVersion = bad;
    const result = parseGrammar(raw);
    assert.equal(result.ok, false, `expected rejection for version ${JSON.stringify(bad)}`);
    if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/grammarSchemaVersion'));
  }
  assert.equal(GRAMMAR_SCHEMA_VERSION, 1);
});

test('exactly the six REQ-071 categories are mandatory, each appearing once', () => {
  assert.deepEqual(
    [...GRAMMAR_CATEGORY_IDS].sort(),
    ['danger', 'interactive', 'optimization', 'safe', 'secret', 'temporary'],
  );

  const missing = defaultRaw();
  (missing.categories as unknown[]).pop();
  const missingResult = parseGrammar(missing);
  assert.equal(missingResult.ok, false);
  if (!missingResult.ok) assert.ok(missingResult.errors.some((e) => e.path === '/categories'));

  const duplicated = defaultRaw();
  const cats = duplicated.categories as Record<string, unknown>[];
  cats.push(JSON.parse(JSON.stringify(cats[0])));
  const dupResult = parseGrammar(duplicated);
  assert.equal(dupResult.ok, false);
  if (!dupResult.ok) assert.ok(dupResult.errors.some((e) => e.path === '/categories'));
});

test('danger is structurally always-critical: non-critical danger is rejected (REQ-016)', () => {
  const raw = defaultRaw();
  const danger = (raw.categories as Record<string, unknown>[]).find((c) => c.id === 'danger')!;
  danger.critical = false;
  const result = parseGrammar(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/categories/1/critical'));
});

test('every renderable role must be bound; unbound roles are rejected', () => {
  const raw = defaultRaw();
  delete (raw.bindings as Record<string, unknown>).spike;
  const result = parseGrammar(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/bindings/spike'));
});

test('an unknown renderable role in bindings is rejected', () => {
  const raw = defaultRaw();
  (raw.bindings as Record<string, unknown>).notARole = 'safe';
  const result = parseGrammar(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/bindings/notARole'));
});

test('a binding naming an unknown category is rejected', () => {
  const raw = defaultRaw();
  (raw.bindings as Record<string, unknown>).spike = 'not-a-category';
  const result = parseGrammar(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/bindings/spike'));
});

test('bindings are total over RENDERABLE_ROLES in the default grammar', () => {
  for (const role of RENDERABLE_ROLES) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(DEFAULT_GRAMMAR.bindings, role),
      `role "${role}" is unbound in DEFAULT_GRAMMAR`,
    );
  }
});

test('dm-0085: the goal binds to interactive, not danger — terracotta means exactly "kills you"', () => {
  assert.equal(DEFAULT_GRAMMAR.bindings.goal, 'interactive');
  assert.notEqual(DEFAULT_GRAMMAR.bindings.goal, 'danger');
});

test('resolveCategory resolves a bound role to its category record', () => {
  const category = resolveCategory(DEFAULT_GRAMMAR, 'spike');
  assert.equal(category.id, 'danger');
  assert.equal(category.critical, true);
});

test('unknown keys at the top level and inside a category are rejected', () => {
  const topLevel = defaultRaw();
  (topLevel as Record<string, unknown>).extra = 1;
  const topResult = parseGrammar(topLevel);
  assert.equal(topResult.ok, false);
  if (!topResult.ok) assert.ok(topResult.errors.some((e) => e.path === '/extra'));

  const nested = defaultRaw();
  (nested.categories as Record<string, unknown>[])[0].extra = 1;
  const nestedResult = parseGrammar(nested);
  assert.equal(nestedResult.ok, false);
  if (!nestedResult.ok) assert.ok(nestedResult.errors.some((e) => e.path === '/categories/0/extra'));
});

test('grammarId must be a non-empty string', () => {
  const raw = defaultRaw();
  raw.grammarId = '';
  const result = parseGrammar(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.path === '/grammarId'));
});

test('non-object input is rejected without throwing', () => {
  for (const bad of [null, undefined, 'x', 42, []]) {
    const result = parseGrammar(bad);
    assert.equal(result.ok, false);
  }
});
