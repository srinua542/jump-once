/**
 * DesignMemory — the executable GDOS Design Memory / Intent Repository
 * (P5/S5.6; completes REQ-050/051/111 with P0's procedural share).
 *
 * GDOS alignment: Section 6 (Persistent Design Memory: version control for
 * creative intent; record every accepted/rejected idea; parse history before
 * proposing to prevent regression/repetition), Section 12 (Design Intent
 * Repository: the five permanent fields on every decision).
 *
 * Backing store: `meta/design_memory_ledger.json` — designated by that file's
 * own header note ("In Phase 5 this file becomes the store backing the
 * executable GDOS Design Memory") and by dm-0032. This module is the typed,
 * strict, PURE text→records→text layer over that document:
 *  - parseDesignMemory(text): the only construction path from the raw ledger
 *    to typed records — never throws, path-qualified Result errors, strict
 *    unknown-key rejection, closed status set (ACCEPTED|REJECTED), dm-####
 *    id format + uniqueness, YYYY-MM-DD dates, all five Intent Repository
 *    fields non-empty. v1.0 keeps `rejected_ideas` and the mechanic-lifecycle
 *    `mechanics` list EMPTY (rejected ideas are decisions with status
 *    REJECTED; lifecycle entries are P7's, behind a version bump).
 *  - findPriorArt(doc, terms): the REQ-051 parse-before-proposing check —
 *    case-insensitive term search over titles + the five fields.
 *  - appendDecision(doc, entry): PURE — returns a new document; rejects a
 *    duplicate id and an exact-duplicate title (the repetition guard). The
 *    date is a PARAMETER (no Date.now — determinism, dm-0032); ids are
 *    minted by nextDecisionId.
 *  - serializeDesignMemory(doc): the canonical byte form (fixed key order,
 *    two-space indent, trailing newline). serialize(parse(s)) === s for a
 *    canonical document — byte idempotency, the dm-0023 discipline.
 *
 * fs stays at the caller (tools/tests); this module never touches the disk.
 * Lives in src/eval/gdos/ — pure over data (dm-0037), no sim, no search.
 */

import type { SchemaError } from '../../schema/Parse';

/** The ledger schema version this build reads and writes (dm-0010 policy). */
export const LEDGER_SCHEMA_VERSION = '1.0';

/** The five §12 Design Intent Repository field names, in canonical order. */
export const INTENT_REPOSITORY_FIELDS = Object.freeze([
  'why_it_exists',
  'problem_it_solves',
  'emotion_targeted',
  'misconception_created',
  'why_alternatives_rejected',
] as const);

export type DecisionStatus = 'ACCEPTED' | 'REJECTED';

/** One ledgered design decision with its five permanent Intent Repository fields. */
export interface LedgerDecision {
  /** dm-#### — unique, monotonically minted. */
  readonly id: string;
  /** YYYY-MM-DD. */
  readonly date: string;
  readonly status: DecisionStatus;
  readonly title: string;
  readonly whyItExists: string;
  readonly problemItSolves: string;
  readonly emotionTargeted: string;
  readonly misconceptionCreated: string;
  readonly whyAlternativesRejected: string;
}

/** The typed ledger document. */
export interface LedgerDocument {
  readonly schemaVersion: string;
  readonly notes: string;
  readonly decisions: readonly LedgerDecision[];
  /** The mechanic-lifecycle registry's notes (entries are P7's, v1.0 keeps the list empty). */
  readonly mechanicLifecycleNotes: string;
}

export type MemoryParseResult =
  | { readonly ok: true; readonly value: LedgerDocument }
  | { readonly ok: false; readonly errors: readonly SchemaError[] };

export type AppendResult =
  | { readonly ok: true; readonly value: LedgerDocument }
  | { readonly ok: false; readonly errors: readonly SchemaError[] };

type Errors = SchemaError[];

function fail(errors: Errors, path: string, message: string): undefined {
  errors.push({ path, message });
  return undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'an array';
  return typeof v;
}

function checkKeys(v: Record<string, unknown>, path: string, allowed: readonly string[], errors: Errors): void {
  for (const key of Object.keys(v)) {
    if (!allowed.includes(key)) fail(errors, `${path}/${key}`, `unknown key "${key}" (ledger v${LEDGER_SCHEMA_VERSION} is strict)`);
  }
}

function str(v: unknown, path: string, errors: Errors): string | undefined {
  if (typeof v !== 'string') return fail(errors, path, `expected a string, got ${describe(v)}`);
  if (v.length === 0) return fail(errors, path, 'expected a non-empty string');
  return v;
}

const ID_PATTERN = /^dm-\d{4}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDecision(v: unknown, path: string, errors: Errors): LedgerDecision | undefined {
  if (!isRecord(v)) return fail(errors, path, `expected a decision object, got ${describe(v)}`);
  checkKeys(v, path, ['id', 'date', 'status', 'title', ...INTENT_REPOSITORY_FIELDS], errors);
  const id = str(v.id, `${path}/id`, errors);
  if (id !== undefined && !ID_PATTERN.test(id)) fail(errors, `${path}/id`, `id must match dm-#### (got "${id}")`);
  const date = str(v.date, `${path}/date`, errors);
  if (date !== undefined && !DATE_PATTERN.test(date)) fail(errors, `${path}/date`, `date must be YYYY-MM-DD (got "${date}")`);
  let status: DecisionStatus | undefined;
  if (v.status === 'ACCEPTED' || v.status === 'REJECTED') status = v.status;
  else fail(errors, `${path}/status`, `status must be ACCEPTED or REJECTED (got ${JSON.stringify(v.status)})`);
  const title = str(v.title, `${path}/title`, errors);
  const whyItExists = str(v.why_it_exists, `${path}/why_it_exists`, errors);
  const problemItSolves = str(v.problem_it_solves, `${path}/problem_it_solves`, errors);
  const emotionTargeted = str(v.emotion_targeted, `${path}/emotion_targeted`, errors);
  const misconceptionCreated = str(v.misconception_created, `${path}/misconception_created`, errors);
  const whyAlternativesRejected = str(v.why_alternatives_rejected, `${path}/why_alternatives_rejected`, errors);
  if (
    id === undefined || date === undefined || status === undefined || title === undefined ||
    whyItExists === undefined || problemItSolves === undefined || emotionTargeted === undefined ||
    misconceptionCreated === undefined || whyAlternativesRejected === undefined ||
    !ID_PATTERN.test(id) || !DATE_PATTERN.test(date)
  ) return undefined;
  return { id, date, status, title, whyItExists, problemItSolves, emotionTargeted, misconceptionCreated, whyAlternativesRejected };
}

/** Parse ledger JSON text into the typed document. Never throws. */
export function parseDesignMemory(text: string): MemoryParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ path: '', message: `invalid JSON: ${e instanceof Error ? e.message : String(e)}` }] };
  }
  const errors: Errors = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: [{ path: '', message: `expected a ledger object, got ${describe(raw)}` }] };
  }
  checkKeys(raw, '', ['schema_version', 'notes', 'intent_repository_fields', 'decisions', 'rejected_ideas', 'mechanic_lifecycle_registry'], errors);

  if (raw.schema_version !== LEDGER_SCHEMA_VERSION) {
    fail(errors, '/schema_version', `unsupported ledger version ${JSON.stringify(raw.schema_version)}; this build reads exactly v${LEDGER_SCHEMA_VERSION}`);
    return { ok: false, errors };
  }
  const notes = str(raw.notes, '/notes', errors);

  // The declared field list must be exactly the five canonical §12 fields, in order.
  if (!Array.isArray(raw.intent_repository_fields) ||
    raw.intent_repository_fields.length !== INTENT_REPOSITORY_FIELDS.length ||
    !INTENT_REPOSITORY_FIELDS.every((f, i) => (raw.intent_repository_fields as unknown[])[i] === f)) {
    fail(errors, '/intent_repository_fields', `must be exactly [${INTENT_REPOSITORY_FIELDS.join(', ')}] in order`);
  }

  let decisions: LedgerDecision[] | undefined;
  if (!Array.isArray(raw.decisions)) {
    fail(errors, '/decisions', `expected an array, got ${describe(raw.decisions)}`);
  } else {
    const out: LedgerDecision[] = [];
    const seen = new Set<string>();
    let valid = true;
    for (let i = 0; i < raw.decisions.length; i++) {
      const d = parseDecision(raw.decisions[i], `/decisions/${i}`, errors);
      if (d === undefined) { valid = false; continue; }
      if (seen.has(d.id)) {
        fail(errors, `/decisions/${i}/id`, `duplicate decision id "${d.id}"`);
        valid = false;
        continue;
      }
      seen.add(d.id);
      out.push(d);
    }
    if (valid) decisions = out;
  }

  if (!Array.isArray(raw.rejected_ideas)) {
    fail(errors, '/rejected_ideas', `expected an array, got ${describe(raw.rejected_ideas)}`);
  } else if (raw.rejected_ideas.length !== 0) {
    fail(errors, '/rejected_ideas', 'rejected ideas are recorded as decisions with status REJECTED; this list stays empty in v1.0');
  }

  let mechanicLifecycleNotes: string | undefined;
  if (!isRecord(raw.mechanic_lifecycle_registry)) {
    fail(errors, '/mechanic_lifecycle_registry', `expected an object, got ${describe(raw.mechanic_lifecycle_registry)}`);
  } else {
    checkKeys(raw.mechanic_lifecycle_registry, '/mechanic_lifecycle_registry', ['notes', 'mechanics'], errors);
    mechanicLifecycleNotes = str(raw.mechanic_lifecycle_registry.notes, '/mechanic_lifecycle_registry/notes', errors);
    if (!Array.isArray(raw.mechanic_lifecycle_registry.mechanics)) {
      fail(errors, '/mechanic_lifecycle_registry/mechanics', 'expected an array');
    } else if (raw.mechanic_lifecycle_registry.mechanics.length !== 0) {
      fail(errors, '/mechanic_lifecycle_registry/mechanics', 'lifecycle entries are defined by P7 behind a ledger version bump; the list stays empty in v1.0');
    }
  }

  if (errors.length > 0 || notes === undefined || decisions === undefined || mechanicLifecycleNotes === undefined) {
    return { ok: false, errors };
  }
  return { ok: true, value: { schemaVersion: LEDGER_SCHEMA_VERSION, notes, decisions, mechanicLifecycleNotes } };
}

/** Serialize the typed document into its canonical byte form (fixed key order, 2-space indent, trailing newline). */
export function serializeDesignMemory(doc: LedgerDocument): string {
  const canonical = {
    schema_version: doc.schemaVersion,
    notes: doc.notes,
    intent_repository_fields: [...INTENT_REPOSITORY_FIELDS],
    decisions: doc.decisions.map((d) => ({
      id: d.id,
      date: d.date,
      status: d.status,
      title: d.title,
      why_it_exists: d.whyItExists,
      problem_it_solves: d.problemItSolves,
      emotion_targeted: d.emotionTargeted,
      misconception_created: d.misconceptionCreated,
      why_alternatives_rejected: d.whyAlternativesRejected,
    })),
    rejected_ideas: [],
    mechanic_lifecycle_registry: {
      notes: doc.mechanicLifecycleNotes,
      mechanics: [],
    },
  };
  return JSON.stringify(canonical, null, 2) + '\n';
}

/**
 * The REQ-051 parse-before-proposing check: decisions whose title or any of
 * the five intent fields contains ANY of the given terms (case-insensitive
 * substring). Empty terms match nothing. Order follows the ledger.
 */
export function findPriorArt(doc: LedgerDocument, terms: readonly string[]): readonly LedgerDecision[] {
  const needles = terms.filter((t) => t.length > 0).map((t) => t.toLowerCase());
  if (needles.length === 0) return [];
  return doc.decisions.filter((d) => {
    const haystack = `${d.title}\n${d.whyItExists}\n${d.problemItSolves}\n${d.emotionTargeted}\n${d.misconceptionCreated}\n${d.whyAlternativesRejected}`.toLowerCase();
    return needles.some((n) => haystack.includes(n));
  });
}

/** Mint the next decision id (max existing + 1). */
export function nextDecisionId(doc: LedgerDocument): string {
  let max = 0;
  for (const d of doc.decisions) {
    const n = Number(d.id.slice(3));
    if (n > max) max = n;
  }
  const next = max + 1;
  let digits = String(next);
  while (digits.length < 4) digits = `0${digits}`;
  return `dm-${digits}`;
}

/** A decision to append: everything but the id (minted here). */
export interface DecisionDraft {
  /** YYYY-MM-DD — a parameter, never a clock read (determinism, dm-0032). */
  readonly date: string;
  readonly status: DecisionStatus;
  readonly title: string;
  readonly whyItExists: string;
  readonly problemItSolves: string;
  readonly emotionTargeted: string;
  readonly misconceptionCreated: string;
  readonly whyAlternativesRejected: string;
}

/**
 * Append a decision, PURELY: returns a new document (the input is untouched).
 * Rejects an exact-duplicate title — the REQ-051 repetition guard: parse
 * history (findPriorArt) before proposing. Validates the draft with the same
 * rules as the parser so a bad append can never corrupt the store.
 */
export function appendDecision(doc: LedgerDocument, draft: DecisionDraft): AppendResult {
  const errors: Errors = [];
  if (!DATE_PATTERN.test(draft.date)) fail(errors, '/date', `date must be YYYY-MM-DD (got "${draft.date}")`);
  if (draft.title.length === 0) fail(errors, '/title', 'expected a non-empty title');
  for (const [path, value] of [
    ['/why_it_exists', draft.whyItExists],
    ['/problem_it_solves', draft.problemItSolves],
    ['/emotion_targeted', draft.emotionTargeted],
    ['/misconception_created', draft.misconceptionCreated],
    ['/why_alternatives_rejected', draft.whyAlternativesRejected],
  ] as const) {
    if (value.length === 0) fail(errors, path, 'all five Intent Repository fields are mandatory (REQ-111)');
  }
  for (const d of doc.decisions) {
    if (d.title === draft.title) {
      fail(errors, '/title', `duplicate title of ${d.id} — repetition guard (REQ-051): parse history with findPriorArt before proposing`);
      break;
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  const decision: LedgerDecision = { id: nextDecisionId(doc), ...draft };
  return {
    ok: true,
    value: {
      schemaVersion: doc.schemaVersion,
      notes: doc.notes,
      decisions: [...doc.decisions, decision],
      mechanicLifecycleNotes: doc.mechanicLifecycleNotes,
    },
  };
}
