/**
 * Curation — the Creative-Director machinery: Kill Switch, First-Party
 * Quality Review, and the Subtractive Removal engine (P5/S5.7,
 * REQ-020/021/022; REQ-012 curation share).
 *
 * GDOS alignment: Section 3 (operate as Creative Director — ruthless
 * curation; the Kill Switch for any non-elevating concept; the First-Party
 * review gate; the mandatory subtraction pass at every milestone), Section 2
 * (REQ-012: every challenge isolates/amplifies/tests the one-jump
 * constraint; omit anything that does not).
 *
 * These are decision PROCEDURES over already-computed data — a GdosReport,
 * the EvidenceBundle, an EconomyComparison, typed attestations — never
 * re-computations. Qualitative criteria (Self-Explanation, Hours of
 * Interest, Inevitable Polish) are represented honestly as authored
 * attestation records with mandatory rationales; the verdict logic over them
 * is deterministic (P5 plan finding 10 — never faked as measurements).
 *
 * Every verdict emits DesignDecision records; a KILL is a design-intent
 * commitment and carries the full five Intent Repository fields, ready for
 * the executable Design Memory (S5.6).
 *
 * PURE gdos module (dm-0037): no sim, no search, no I/O. Whitelist math.
 */

import type { EvidenceBundle } from './Evidence';
import type { EconomyComparison } from './Economy';
import type { GdosReport } from './Report';
import type { DesignDecision, IntentRepositoryFields } from './Report';

/* ── Kill Switch (REQ-020; REQ-012 share) ─────────────────────────────── */

/** The optional curation context a kill decision may weigh. */
export interface KillSwitchContext {
  /** True when the candidate introduces a mechanic new to the design space. */
  readonly addsNewMechanic?: boolean;
  /**
   * The REQ-042 exhaust-first comparison (deepen-existing vs add-the-new-
   * mechanic), computed by the caller from coverage matrices. Only consulted
   * when addsNewMechanic is true.
   */
  readonly economy?: EconomyComparison;
}

export interface KillSwitchVerdict {
  /** True iff the concept is killed (non-elevating). */
  readonly kill: boolean;
  /** Every reason that independently justified the kill (empty when passing). */
  readonly reasons: readonly string[];
  readonly decision: DesignDecision;
}

/** True iff every completing run pressed THE jump (the REQ-012 evidence proxy). */
function everyCompletionJumps(bundle: EvidenceBundle): boolean {
  for (const r of bundle.runs) {
    if (r.outcome !== 'completed') continue;
    let jumped = false;
    for (const f of r.tape.frames) {
      if (f.jumpPressed) { jumped = true; break; }
    }
    if (!jumped) return false;
  }
  return true;
}

function killIntent(subject: string, reasons: readonly string[]): IntentRepositoryFields {
  return {
    whyItExists: `Kill Switch rejection of "${subject}" (REQ-020: ruthless curation of non-elevating concepts).`,
    problemItSolves: `Prevents a non-elevating concept from entering the campaign. Grounds: ${reasons.join(' | ')}`,
    emotionTargeted: 'Protects the whole six-phase arc by refusing content that cannot deliver it.',
    misconceptionCreated: 'None — the rejection is recorded so the idea is not re-proposed unimproved (REQ-051).',
    whyAlternativesRejected: 'Shipping-and-iterating was rejected: the PRD mandates curation BEFORE approval; a below-bar concept costs player trust faster than iteration can repay it.',
  };
}

/**
 * The Kill Switch (REQ-020): kill any concept that fails its GDOS gates,
 * that a player can complete without THE jump (REQ-012 — the level does not
 * test the constraint), or that adds a mechanic while existing variations are
 * unexhausted (REQ-042 via the economy comparison).
 */
export function killSwitch(
  bundle: EvidenceBundle,
  report: GdosReport,
  context: KillSwitchContext = {},
): KillSwitchVerdict {
  const reasons: string[] = [];
  if (!report.pass) {
    const failed = report.gates.filter((g) => !g.pass).map((g) => g.gate);
    reasons.push(`fails GDOS gates: ${failed.join(', ')}`);
  }
  if (!everyCompletionJumps(bundle)) {
    reasons.push('completable without THE jump — the level does not isolate/test the one-jump constraint (REQ-012)');
  }
  if (context.addsNewMechanic === true && context.economy !== undefined && context.economy.winner === 'deepen') {
    reasons.push(`adds a mechanic while existing variations are unexhausted (economy: deepen ${context.economy.deepenEconomy.toFixed(2)} ≥ add ${context.economy.addMechanicEconomy.toFixed(2)}; REQ-042)`);
  }

  const kill = reasons.length > 0;
  const decision: DesignDecision = {
    source: 'kill-switch',
    subject: bundle.def.levelId,
    verdict: kill ? 'fail' : 'pass',
    summary: kill ? `KILLED: ${reasons[0]}` : 'elevating concept — Kill Switch passed',
    findings: reasons,
    ...(kill ? { intent: killIntent(bundle.def.levelId, reasons) } : {}),
  };
  return { kill, reasons, decision };
}

/* ── First-Party Quality Review (REQ-021) ─────────────────────────────── */

/** One honestly-authored qualitative judgement (finding 10: never faked as a computation). */
export interface Attestation {
  readonly affirmed: boolean;
  /** The reviewer's grounds. Mandatory and non-empty either way. */
  readonly rationale: string;
}

/** The three §3 First-Party criteria. */
export interface FirstPartyAttestations {
  /** The concept explains itself without tutorial text. */
  readonly selfExplanation: Attestation;
  /** The concept sustains hours of interest, not minutes. */
  readonly hoursOfInterest: Attestation;
  /** Polish is inevitable from the design, not hoped for. */
  readonly inevitablePolish: Attestation;
}

export interface FirstPartyVerdict {
  readonly approved: boolean;
  readonly findings: readonly string[];
  readonly decision: DesignDecision;
}

/**
 * The First-Party Quality Review gate (REQ-021): approve only when all three
 * criteria are affirmed with rationales AND (when supplied) the GDOS report
 * passes. An empty rationale is itself a failure — an unexplained judgement
 * is not a review.
 */
export function firstPartyReview(
  subject: string,
  attestations: FirstPartyAttestations,
  report?: GdosReport,
): FirstPartyVerdict {
  const findings: string[] = [];
  const entries: readonly [string, Attestation][] = [
    ['selfExplanation', attestations.selfExplanation],
    ['hoursOfInterest', attestations.hoursOfInterest],
    ['inevitablePolish', attestations.inevitablePolish],
  ];
  for (const [name, a] of entries) {
    if (a.rationale.length === 0) findings.push(`${name}: attestation has no rationale — an unexplained judgement is not a review`);
    else if (!a.affirmed) findings.push(`${name}: not affirmed — ${a.rationale}`);
  }
  if (report !== undefined && !report.pass) {
    findings.push(`GDOS report fails: ${report.gates.filter((g) => !g.pass).map((g) => g.gate).join(', ')}`);
  }

  const approved = findings.length === 0;
  const decision: DesignDecision = {
    source: 'first-party-review',
    subject,
    verdict: approved ? 'pass' : 'fail',
    summary: approved
      ? 'first-party review approved (Self-Explanation, Hours of Interest, Inevitable Polish all affirmed)'
      : `first-party review rejected: ${findings.length} finding(s)`,
    findings,
  };
  return { approved, findings, decision };
}

/* ── Subtractive Removal engine (REQ-022) ─────────────────────────────── */

/** One of the six §3 pruning questions. Answering TRUE justifies keeping the item. */
export interface SubtractiveQuestion {
  readonly id: string;
  readonly question: string;
}

/** The six pruning questions, as data (REQ-022). */
export const SUBTRACTIVE_QUESTIONS: readonly SubtractiveQuestion[] = Object.freeze([
  { id: 'elevates-core', question: 'Does it elevate the one-jump core fantasy rather than dilute it?' },
  { id: 'degrades-if-removed', question: 'Would the experience measurably degrade if it were removed?' },
  { id: 'non-duplicative', question: 'Is it free of overlap with what an existing element already delivers?' },
  { id: 'earns-complexity', question: 'Does it pay for its complexity under the Economy of Mechanics?' },
  { id: 'self-explanatory', question: 'Is it self-explanatory without tutorial text?' },
  { id: 'build-again', question: 'Knowing everything we know now, would we build it again today?' },
]);

/** One thing under the subtraction pass: a mechanic, system, document, tool, test group… */
export interface InventoryItem {
  readonly id: string;
  readonly kind: string;
  readonly description: string;
}

/** answers[itemId][questionId] = the six booleans; a missing answer flags the item. */
export type SubtractiveAnswers = Readonly<Record<string, Readonly<Record<string, boolean>>>>;

export interface SubtractiveFinding {
  readonly itemId: string;
  /** Question ids answered false — grounds for removal. */
  readonly failedQuestions: readonly string[];
  /** Question ids with no recorded answer — the pass is incomplete for this item. */
  readonly unansweredQuestions: readonly string[];
}

export interface SubtractiveReport {
  /** Items whose every question was answered true. */
  readonly kept: readonly string[];
  /** Items with at least one false answer — remove (or re-justify and re-run). */
  readonly removalCandidates: readonly SubtractiveFinding[];
  /** Items with unanswered questions — the milestone pass is not complete until empty. */
  readonly incomplete: readonly SubtractiveFinding[];
  /** True iff every item was fully answered and kept. */
  readonly clean: boolean;
  readonly decisions: readonly DesignDecision[];
}

/**
 * The mandatory milestone subtraction pass (REQ-022): every inventory item is
 * held against all six pruning questions. Any false answer makes it a removal
 * candidate; any missing answer leaves the pass incomplete — silence is not
 * a keep.
 */
export function subtractivePass(items: readonly InventoryItem[], answers: SubtractiveAnswers): SubtractiveReport {
  const kept: string[] = [];
  const removalCandidates: SubtractiveFinding[] = [];
  const incomplete: SubtractiveFinding[] = [];
  const decisions: DesignDecision[] = [];

  for (const item of items) {
    const itemAnswers = answers[item.id];
    const failedQuestions: string[] = [];
    const unansweredQuestions: string[] = [];
    for (const q of SUBTRACTIVE_QUESTIONS) {
      const a = itemAnswers === undefined ? undefined : itemAnswers[q.id];
      if (a === undefined) unansweredQuestions.push(q.id);
      else if (a === false) failedQuestions.push(q.id);
    }

    if (failedQuestions.length > 0) {
      removalCandidates.push({ itemId: item.id, failedQuestions, unansweredQuestions });
      decisions.push({
        source: 'subtractive-pass',
        subject: item.id,
        verdict: 'fail',
        summary: `removal candidate (${item.kind}): failed ${failedQuestions.join(', ')}`,
        findings: failedQuestions.map((q) => `answered NO to ${q}`),
      });
    } else if (unansweredQuestions.length > 0) {
      incomplete.push({ itemId: item.id, failedQuestions, unansweredQuestions });
      decisions.push({
        source: 'subtractive-pass',
        subject: item.id,
        verdict: 'flag',
        summary: `subtraction pass incomplete (${item.kind}): unanswered ${unansweredQuestions.join(', ')}`,
        findings: unansweredQuestions.map((q) => `no recorded answer for ${q}`),
      });
    } else {
      kept.push(item.id);
    }
  }

  return {
    kept,
    removalCandidates,
    incomplete,
    clean: removalCandidates.length === 0 && incomplete.length === 0 && items.length === kept.length,
    decisions,
  };
}
