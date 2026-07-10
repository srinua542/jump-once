/**
 * IntentGate — the REQ-091 Single-Sentence Intent Verification gate
 * (P7/S7.6; dm-0063).
 *
 * GDOS alignment: Section 10 — "layouts that cannot state their lesson in one
 * rigorous sentence are denied compile and deleted." This is the pipeline's
 * Sign-off/Intent phase (S7.7 phase 7): the last structural check before a
 * candidate becomes a product.
 *
 * "Rigorous" is judged STRUCTURALLY, not by NLP (dm-0059): a lesson sentence
 * must be exactly ONE sentence, sit inside the profiled word band, and contain
 * at least one CAUSAL CONNECTIVE from a closed grammar — the marker that turns
 * a label ("a spring level") into a lesson with a reason ("commit the jump
 * only after reading the gap, because the pit punishes an early press"). The
 * connective set is a structural constant (like the lifecycle stages), not
 * calibration; only the length band lives in GenProfile.intent.
 *
 * A denial is a typed record carrying every failed check — the pipeline logs
 * it and discards the candidate; "deleted" means no product is persisted, only
 * the rejection (dm-0059). Pure over (concept, profile); whitelist math; no
 * clock. Lives in src/gen/.
 */

import type { SchemaError } from '../schema/Parse';
import type { GenProfile } from './GenProfile';
import type { LevelConcept } from './Concept';

export type IntentDenialReason =
  | 'empty'
  | 'not-one-sentence'
  | 'too-short'
  | 'too-long'
  | 'no-lesson';

export interface IntentVerdict {
  readonly pass: boolean;
  /** Every failed check, typed. Empty iff pass. */
  readonly reasons: readonly IntentDenialReason[];
  /** Human-readable findings, one per failed check (empty iff pass). */
  readonly findings: readonly SchemaError[];
}

/**
 * The closed causal-connective grammar (dm-0063): a lesson states a
 * cause/condition/consequence. Matched case-insensitively as whole words.
 */
export const LESSON_CONNECTIVES = Object.freeze([
  'because', 'so', 'when', 'only', 'unless', 'after', 'before',
  'until', 'since', 'if', 'once', 'whenever', 'then',
] as const);

const CONNECTIVE_SET: ReadonlySet<string> = new Set(LESSON_CONNECTIVES);
const TERMINATOR = /[.!?]/g;

/** Words of the sentence body (terminator stripped), lowercased, punctuation-trimmed. */
function words(sentenceBody: string): string[] {
  return sentenceBody
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9']/g, '').toLowerCase())
    .filter((w) => w.length > 0);
}

/**
 * Verify a concept's intent sentence. Collects ALL applicable denial reasons
 * (a caller sees every reason at once), except that an empty sentence
 * short-circuits — no other check is meaningful on nothing.
 */
export function verifyIntent(concept: LevelConcept, profile: GenProfile): IntentVerdict {
  const raw = concept.intentSentence.trim();
  const reasons: IntentDenialReason[] = [];
  const findings: SchemaError[] = [];
  const deny = (reason: IntentDenialReason, message: string): void => {
    reasons.push(reason);
    findings.push({ path: '/intentSentence', message });
  };

  if (raw.length === 0) {
    deny('empty', 'the intent sentence is empty — a level with no stated lesson is denied (REQ-091)');
    return { pass: false, reasons, findings };
  }

  // Exactly one sentence: exactly one terminator, and it ends the sentence.
  const terminators = raw.match(TERMINATOR);
  const terminatorCount = terminators === null ? 0 : terminators.length;
  if (terminatorCount !== 1 || !/[.!?]\s*$/.test(raw)) {
    deny('not-one-sentence', `a rigorous lesson is exactly one sentence ending in one terminator (found ${terminatorCount})`);
  }

  const body = raw.replace(TERMINATOR, ' ');
  const tokens = words(body);
  if (tokens.length < profile.intent.minWords) {
    deny('too-short', `the lesson has ${tokens.length} words; the profile requires >= ${profile.intent.minWords}`);
  } else if (tokens.length > profile.intent.maxWords) {
    deny('too-long', `the lesson has ${tokens.length} words; the profile caps at ${profile.intent.maxWords}`);
  }

  if (!tokens.some((w) => CONNECTIVE_SET.has(w))) {
    deny('no-lesson', `the sentence names no decision — a lesson needs a causal connective (one of: ${LESSON_CONNECTIVES.join(', ')})`);
  }

  return { pass: reasons.length === 0, reasons, findings };
}
