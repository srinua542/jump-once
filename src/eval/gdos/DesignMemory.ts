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
 *    fields non-empty. `rejected_ideas` stays EMPTY (rejected ideas are
 *    decisions with status REJECTED). v1.1 (P7/S7.1, dm-0055) unlocks the
 *    mechanic-lifecycle `mechanics` list that v1.0 pinned empty: typed
 *    MechanicLifecycleEntry records — mechanic (a closed EntityKind, unique),
 *    one of the nine REQ-082 stages, a prune|convert disposition exactly when
 *    Retired, and a forward-only transition history chained from Introduction
 *    to the current stage, each step dated and evidence-backed. The stage
 *    TRACKER (assess/advance/isBlocked) lives in src/gen/Lifecycle.ts; this
 *    store owns only the schema and the validated upsert (setMechanicEntry).
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
import { ENTITY_KINDS, type EntityKind } from '../../components/Behavior';

/** The ledger schema version this build reads and writes (dm-0010 policy; bumped 1.0→1.1 at P7/S7.1 per dm-0055). */
export const LEDGER_SCHEMA_VERSION = '1.1';

/**
 * The nine REQ-082 mechanic lifecycle stages, in canonical forward order
 * (dm-0055): derived from the level-design chapter arc (introduce → apply →
 * deepen → test mastery) plus REQ-082's exhaustion economics. Transitions are
 * forward-only; Exhaustion and Retirement block the mechanic from new-concept
 * selection; Retirement carries a prune|convert disposition.
 */
export const LIFECYCLE_STAGES = Object.freeze([
  'Introduction',
  'Isolation',
  'Development',
  'Combination',
  'Subversion',
  'Mastery',
  'Saturation',
  'Exhaustion',
  'Retirement',
] as const);

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/** What Retirement did with the mechanic (REQ-082: prune, or convert into something else). */
export type RetirementDisposition = 'prune' | 'convert';

/** One forward step in a mechanic's lifecycle history. */
export interface StageTransition {
  readonly from: LifecycleStage;
  readonly to: LifecycleStage;
  /** YYYY-MM-DD — a parameter, never a clock read (determinism, dm-0032). */
  readonly date: string;
  /** Non-empty rationale: the observable evidence backing the advance. */
  readonly evidence: string;
}

/**
 * One mechanic's lifecycle record. `mechanic` is a closed EntityKind — the
 * same mechanic identity the coverage matrix and Campaign Intelligence track
 * (dm-0050); unique across the registry. Invariants (parse-enforced): empty
 * history ⇔ stage is Introduction; a non-empty history starts FROM
 * Introduction, chains contiguously, moves strictly forward each step, and
 * ends at the current stage; `disposition` present exactly when Retired.
 */
export interface MechanicLifecycleEntry {
  readonly mechanic: EntityKind;
  readonly stage: LifecycleStage;
  readonly disposition?: RetirementDisposition;
  readonly history: readonly StageTransition[];
}

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
  /** The mechanic-lifecycle registry's notes. */
  readonly mechanicLifecycleNotes: string;
  /** The REQ-082 lifecycle registry (v1.1, dm-0055). One entry per mechanic, unique. */
  readonly mechanics: readonly MechanicLifecycleEntry[];
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

const stageIndex = new Map<string, number>(LIFECYCLE_STAGES.map((s, i) => [s, i]));

function parseStage(v: unknown, path: string, errors: Errors): LifecycleStage | undefined {
  if (typeof v !== 'string' || !stageIndex.has(v)) {
    return fail(errors, path, `stage must be one of [${LIFECYCLE_STAGES.join(', ')}] (got ${JSON.stringify(v)})`);
  }
  return v as LifecycleStage;
}

function parseTransition(v: unknown, path: string, errors: Errors): StageTransition | undefined {
  if (!isRecord(v)) return fail(errors, path, `expected a transition object, got ${describe(v)}`);
  checkKeys(v, path, ['from', 'to', 'date', 'evidence'], errors);
  const from = parseStage(v.from, `${path}/from`, errors);
  const to = parseStage(v.to, `${path}/to`, errors);
  const date = str(v.date, `${path}/date`, errors);
  if (date !== undefined && !DATE_PATTERN.test(date)) fail(errors, `${path}/date`, `date must be YYYY-MM-DD (got "${date}")`);
  const evidence = str(v.evidence, `${path}/evidence`, errors);
  if (from === undefined || to === undefined || date === undefined || evidence === undefined || !DATE_PATTERN.test(date)) return undefined;
  if ((stageIndex.get(to) as number) <= (stageIndex.get(from) as number)) {
    return fail(errors, path, `transitions are forward-only (dm-0055): "${from}" → "${to}" does not advance`);
  }
  return { from, to, date, evidence };
}

function parseMechanicEntry(v: unknown, path: string, errors: Errors): MechanicLifecycleEntry | undefined {
  if (!isRecord(v)) return fail(errors, path, `expected a lifecycle entry object, got ${describe(v)}`);
  checkKeys(v, path, ['mechanic', 'stage', 'disposition', 'history'], errors);
  let mechanic: EntityKind | undefined;
  if (typeof v.mechanic !== 'string' || !(ENTITY_KINDS as readonly string[]).includes(v.mechanic)) {
    fail(errors, `${path}/mechanic`, `mechanic must be a closed EntityKind [${ENTITY_KINDS.join(', ')}] (got ${JSON.stringify(v.mechanic)})`);
  } else {
    mechanic = v.mechanic as EntityKind;
  }
  const stage = parseStage(v.stage, `${path}/stage`, errors);
  let disposition: RetirementDisposition | undefined;
  if (v.disposition !== undefined) {
    if (v.disposition === 'prune' || v.disposition === 'convert') disposition = v.disposition;
    else fail(errors, `${path}/disposition`, `disposition must be "prune" or "convert" (got ${JSON.stringify(v.disposition)})`);
  }
  let history: StageTransition[] | undefined;
  if (!Array.isArray(v.history)) {
    fail(errors, `${path}/history`, `expected an array, got ${describe(v.history)}`);
  } else {
    const out: StageTransition[] = [];
    let valid = true;
    for (let i = 0; i < v.history.length; i++) {
      const t = parseTransition(v.history[i], `${path}/history/${i}`, errors);
      if (t === undefined) { valid = false; continue; }
      out.push(t);
    }
    if (valid) history = out;
  }
  if (mechanic === undefined || stage === undefined || history === undefined) return undefined;
  // Chain invariants (dm-0055): empty history ⇔ Introduction; otherwise the
  // chain departs Introduction, links contiguously, and ends at the current stage.
  if (history.length === 0) {
    if (stage !== 'Introduction') {
      return fail(errors, path, `an entry with no history must be at Introduction (got "${stage}")`);
    }
  } else {
    if (history[0].from !== 'Introduction') {
      return fail(errors, `${path}/history/0/from`, `the first transition must depart Introduction (got "${history[0].from}")`);
    }
    for (let i = 1; i < history.length; i++) {
      if (history[i].from !== history[i - 1].to) {
        return fail(errors, `${path}/history/${i}/from`, `history must chain contiguously: expected "${history[i - 1].to}", got "${history[i].from}"`);
      }
    }
    if (history[history.length - 1].to !== stage) {
      return fail(errors, path, `history must end at the current stage "${stage}" (last transition reaches "${history[history.length - 1].to}")`);
    }
  }
  if ((stage === 'Retirement') !== (disposition !== undefined)) {
    return fail(errors, `${path}/disposition`, stage === 'Retirement'
      ? 'a Retired mechanic must carry a prune|convert disposition (REQ-082)'
      : 'disposition is only valid at Retirement');
  }
  return disposition === undefined ? { mechanic, stage, history } : { mechanic, stage, disposition, history };
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
  let mechanics: MechanicLifecycleEntry[] | undefined;
  if (!isRecord(raw.mechanic_lifecycle_registry)) {
    fail(errors, '/mechanic_lifecycle_registry', `expected an object, got ${describe(raw.mechanic_lifecycle_registry)}`);
  } else {
    checkKeys(raw.mechanic_lifecycle_registry, '/mechanic_lifecycle_registry', ['notes', 'mechanics'], errors);
    mechanicLifecycleNotes = str(raw.mechanic_lifecycle_registry.notes, '/mechanic_lifecycle_registry/notes', errors);
    const rawMechanics = raw.mechanic_lifecycle_registry.mechanics;
    if (!Array.isArray(rawMechanics)) {
      fail(errors, '/mechanic_lifecycle_registry/mechanics', 'expected an array');
    } else {
      const out: MechanicLifecycleEntry[] = [];
      const seen = new Set<string>();
      let valid = true;
      for (let i = 0; i < rawMechanics.length; i++) {
        const e = parseMechanicEntry(rawMechanics[i], `/mechanic_lifecycle_registry/mechanics/${i}`, errors);
        if (e === undefined) { valid = false; continue; }
        if (seen.has(e.mechanic)) {
          fail(errors, `/mechanic_lifecycle_registry/mechanics/${i}/mechanic`, `duplicate mechanic "${e.mechanic}" — one lifecycle entry per mechanic`);
          valid = false;
          continue;
        }
        seen.add(e.mechanic);
        out.push(e);
      }
      if (valid) mechanics = out;
    }
  }

  if (errors.length > 0 || notes === undefined || decisions === undefined || mechanicLifecycleNotes === undefined || mechanics === undefined) {
    return { ok: false, errors };
  }
  return { ok: true, value: { schemaVersion: LEDGER_SCHEMA_VERSION, notes, decisions, mechanicLifecycleNotes, mechanics } };
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
      mechanics: doc.mechanics.map((m) => ({
        mechanic: m.mechanic,
        stage: m.stage,
        ...(m.disposition === undefined ? {} : { disposition: m.disposition }),
        history: m.history.map((t) => ({ from: t.from, to: t.to, date: t.date, evidence: t.evidence })),
      })),
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
      mechanics: doc.mechanics,
    },
  };
}

/**
 * Upsert one mechanic's lifecycle entry, PURELY: returns a new document (the
 * input is untouched). The entry is validated through the parser's own rules
 * (via its canonical raw form) so a bad upsert can never corrupt the store —
 * the same guarantee appendDecision gives decisions. An existing entry for
 * the same mechanic is replaced in place; a new mechanic appends at the end.
 */
export function setMechanicEntry(doc: LedgerDocument, entry: MechanicLifecycleEntry): AppendResult {
  const errors: Errors = [];
  const raw = JSON.parse(JSON.stringify(entry)) as unknown;
  const parsed = parseMechanicEntry(raw, '/entry', errors);
  if (parsed === undefined || errors.length > 0) return { ok: false, errors };
  const idx = doc.mechanics.findIndex((m) => m.mechanic === parsed.mechanic);
  const mechanics = idx === -1
    ? [...doc.mechanics, parsed]
    : doc.mechanics.map((m, i) => (i === idx ? parsed : m));
  return {
    ok: true,
    value: {
      schemaVersion: doc.schemaVersion,
      notes: doc.notes,
      decisions: doc.decisions,
      mechanicLifecycleNotes: doc.mechanicLifecycleNotes,
      mechanics,
    },
  };
}
