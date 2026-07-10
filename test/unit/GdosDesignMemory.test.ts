/**
 * S5.6 — the executable Design Memory (REQ-050/051/111; dm-0032). The store
 * is pure text→records→text over the LIVE meta/design_memory_ledger.json:
 * parses it losslessly (byte-idempotent round-trip), enforces the Intent
 * Repository contract on every entry, answers prior-art queries, and appends
 * canonically with a repetition guard. fs appears only HERE (the caller).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  INTENT_REPOSITORY_FIELDS,
  appendDecision,
  findPriorArt,
  nextDecisionId,
  parseDesignMemory,
  serializeDesignMemory,
  type LedgerDocument,
} from '../../src/eval/gdos/DesignMemory';

const LIVE_PATH = join(process.cwd(), 'meta', 'design_memory_ledger.json');
const liveText = readFileSync(LIVE_PATH, 'utf8');

function liveDoc(): LedgerDocument {
  const result = parseDesignMemory(liveText);
  assert.ok(result.ok, `live ledger failed its own store's parse: ${JSON.stringify(!result.ok ? result.errors.slice(0, 3) : [])}`);
  return (result as { ok: true; value: LedgerDocument }).value;
}

test('parses the LIVE ledger: every recorded decision satisfies the Intent Repository contract', () => {
  const doc = liveDoc();
  assert.ok(doc.decisions.length >= 39, `expected ≥39 decisions, got ${doc.decisions.length}`);
  assert.equal(doc.decisions[0].id, 'dm-0001');
});

test('byte idempotency on the live ledger: serialize(parse(text)) === text', () => {
  assert.equal(serializeDesignMemory(liveDoc()), liveText);
});

test('append → serialize → parse round-trips value-losslessly', () => {
  const doc = liveDoc();
  const appended = appendDecision(doc, {
    date: '2026-07-10',
    status: 'REJECTED',
    title: 'unit-test scratch decision (never lands on disk)',
    whyItExists: 'w',
    problemItSolves: 'p',
    emotionTargeted: 'e',
    misconceptionCreated: 'm',
    whyAlternativesRejected: 'r',
  });
  assert.ok(appended.ok);
  if (appended.ok) {
    const reparsed = parseDesignMemory(serializeDesignMemory(appended.value));
    assert.ok(reparsed.ok);
    if (reparsed.ok) assert.deepEqual(reparsed.value, appended.value);
    // Purity: the source document was not touched.
    assert.equal(doc.decisions.length + 1, appended.value.decisions.length);
  }
});

test('findPriorArt answers the parse-before-proposing query (REQ-051)', () => {
  const doc = liveDoc();
  const hits = findPriorArt(doc, ['rng']);
  assert.ok(hits.length > 0, 'expected prior art about the RNG');
  assert.ok(hits.some((d) => d.id === 'dm-0003'), 'dm-0003 (threaded RNG) is the canonical RNG decision');
  assert.deepEqual(findPriorArt(doc, []), []);
  assert.deepEqual(findPriorArt(doc, ['']), []);
});

test('nextDecisionId mints max+1 with zero padding', () => {
  const doc = liveDoc();
  const id = nextDecisionId(doc);
  assert.match(id, /^dm-\d{4}$/);
  const n = Number(id.slice(3));
  assert.ok(doc.decisions.every((d) => Number(d.id.slice(3)) < n));
});

test('the repetition guard rejects an exact-duplicate title', () => {
  const doc = liveDoc();
  const result = appendDecision(doc, {
    date: '2026-07-10',
    status: 'ACCEPTED',
    title: doc.decisions[0].title,
    whyItExists: 'w', problemItSolves: 'p', emotionTargeted: 'e', misconceptionCreated: 'm', whyAlternativesRejected: 'r',
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors[0].message.includes('REQ-051'));
});

test('appendDecision enforces the five mandatory fields and the date shape', () => {
  const doc = liveDoc();
  const missing = appendDecision(doc, {
    date: '2026-07-10', status: 'ACCEPTED', title: 't',
    whyItExists: '', problemItSolves: 'p', emotionTargeted: 'e', misconceptionCreated: 'm', whyAlternativesRejected: 'r',
  });
  assert.equal(missing.ok, false);
  const badDate = appendDecision(doc, {
    date: 'today', status: 'ACCEPTED', title: 't2',
    whyItExists: 'w', problemItSolves: 'p', emotionTargeted: 'e', misconceptionCreated: 'm', whyAlternativesRejected: 'r',
  });
  assert.equal(badDate.ok, false);
});

test('strict parse rejection suite (each defect is caught with its path)', () => {
  const base = JSON.parse(liveText) as Record<string, unknown>;
  const cases: { mutate: (raw: Record<string, unknown>) => void; path: string }[] = [
    { mutate: (r) => { r.schema_version = '2.0'; }, path: '/schema_version' },
    { mutate: (r) => { r.extra = 1; }, path: '/extra' },
    { mutate: (r) => { (r.intent_repository_fields as string[]).push('sixth_field'); }, path: '/intent_repository_fields' },
    { mutate: (r) => { ((r.decisions as Record<string, unknown>[])[0]).status = 'MAYBE'; }, path: '/decisions/0/status' },
    { mutate: (r) => { ((r.decisions as Record<string, unknown>[])[0]).id = 'dm-1'; }, path: '/decisions/0/id' },
    { mutate: (r) => { ((r.decisions as Record<string, unknown>[])[1]).id = 'dm-0001'; }, path: '/decisions/1/id' },
    { mutate: (r) => { ((r.decisions as Record<string, unknown>[])[0]).date = '10-07-2026'; }, path: '/decisions/0/date' },
    { mutate: (r) => { ((r.decisions as Record<string, unknown>[])[0]).why_it_exists = ''; }, path: '/decisions/0/why_it_exists' },
    { mutate: (r) => { ((r.decisions as Record<string, unknown>[])[0]).bonus = 'x'; }, path: '/decisions/0/bonus' },
    { mutate: (r) => { (r.rejected_ideas as unknown[]).push({}); }, path: '/rejected_ideas' },
    { mutate: (r) => { ((r.mechanic_lifecycle_registry as Record<string, unknown>).mechanics as unknown[]).push({}); }, path: '/mechanic_lifecycle_registry/mechanics' },
  ];
  for (const c of cases) {
    const raw = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    c.mutate(raw);
    const result = parseDesignMemory(JSON.stringify(raw));
    assert.equal(result.ok, false, `expected rejection for ${c.path}`);
    if (!result.ok) assert.ok(result.errors.some((e) => e.path === c.path), `expected an error at ${c.path}, got ${JSON.stringify(result.errors.map((e) => e.path))}`);
  }
});

test('parse never throws on garbage', () => {
  for (const bad of ['not json', '42', '[]', 'null', '{}']) {
    const result = parseDesignMemory(bad);
    assert.equal(result.ok, false);
  }
});

test('the canonical field list is the §12 five, in order (REQ-111)', () => {
  assert.deepEqual([...INTENT_REPOSITORY_FIELDS], [
    'why_it_exists', 'problem_it_solves', 'emotion_targeted', 'misconception_created', 'why_alternatives_rejected',
  ]);
});
