/**
 * Report — the pure data records the GDOS Scoring Engine emits (P5/S5.1).
 *
 * GDOS alignment: Section 6 (emotional thresholds + streamability as quality
 * gates), Section 12 (Design Intent Repository — the five fields every
 * accepted/rejected decision records), Section 13 (all decisions are data).
 *
 * Design (dm-0031/dm-0032):
 *  - Every gate and curation step returns a GateResult (its named metric
 *    scores + pass/fail + evidence findings) and emits DesignDecision records.
 *    Recording is decoupled from storage: these are pure data; the executable
 *    Design Memory (S5.6) is the only thing that persists them. Building the
 *    record type here — with the gates — lets S5.2–S5.5 record correctly
 *    before the store exists.
 *  - A GdosReport aggregates a level's gate results into one verdict. It is
 *    the single value the P10 pipeline reads (via judgeLevel); consumers read
 *    reports, never re-derive scores.
 *
 * Pure declarations + trivial constructors only. No sim imports, no audit
 * imports (dm-0031: gdos consumes verdicts as data). Whitelist math elsewhere;
 * this file has no arithmetic.
 */

/** The five §12 Design Intent Repository fields (REQ-111). */
export interface IntentRepositoryFields {
  readonly whyItExists: string;
  readonly problemItSolves: string;
  readonly emotionTargeted: string;
  readonly misconceptionCreated: string;
  readonly whyAlternativesRejected: string;
}

/** What a decision did to its subject. */
export type DecisionVerdict = 'pass' | 'fail' | 'flag';

/**
 * One pure decision record a gate/curation step emits about a subject level.
 * `intent` is present when the decision is a genuine design-intent commitment
 * (accepted/rejected concepts — the Kill Switch, CDRE proposals); a routine
 * gate pass/fail carries just its rationale. The store (S5.6) assigns the
 * permanent id — records are id-less until persisted (idempotent recording).
 */
export interface DesignDecision {
  /** The emitting gate/step, e.g. "emotional-threshold", "streamability", "info-density". */
  readonly source: string;
  /** The levelId (or campaign subject) the decision is about. */
  readonly subject: string;
  readonly verdict: DecisionVerdict;
  /** One-line human-readable rationale. Non-empty by construction. */
  readonly summary: string;
  /** Machine-readable evidence findings backing the verdict (may be empty). */
  readonly findings: readonly string[];
  /** The five Intent Repository fields, when this is a design-intent commitment. */
  readonly intent?: IntentRepositoryFields;
}

/** One named metric's score against its profile threshold. */
export interface MetricScore {
  /** The PRD §-metric name, e.g. "curiosity", "clipPotential", "informationDensity". */
  readonly metric: string;
  /** Estimator output in [0, 100]. */
  readonly score: number;
  /** The profile threshold this metric must meet or exceed to pass. */
  readonly threshold: number;
  /** True iff score >= threshold. */
  readonly pass: boolean;
}

/** One gate's full result: its metric scores, overall pass, evidence, decisions. */
export interface GateResult {
  /** The gate name, e.g. "emotional-threshold". */
  readonly gate: string;
  readonly scores: readonly MetricScore[];
  /** True iff every metric passed. */
  readonly pass: boolean;
  /** Human-readable evidence (empty when passing cleanly). */
  readonly findings: readonly string[];
  /** Decision records this gate emitted for the Design Memory. */
  readonly decisions: readonly DesignDecision[];
}

/** A level's full GDOS judgement: every gate result aggregated. */
export interface GdosReport {
  readonly levelId: string;
  /** The scoring profile version the report was computed under (dm-0031: cross-version scores are not comparable). */
  readonly profileId: string;
  readonly gates: readonly GateResult[];
  /** Every decision from every gate, flattened for the Design Memory. */
  readonly decisions: readonly DesignDecision[];
  /** True iff every gate passed. */
  readonly pass: boolean;
}

/** Build one MetricScore, deriving pass from score >= threshold. */
export function metricScore(metric: string, score: number, threshold: number): MetricScore {
  return { metric, score, threshold, pass: score >= threshold };
}

/** Build a GateResult, deriving `pass` from all metrics passing. */
export function gateResult(
  gate: string,
  scores: readonly MetricScore[],
  findings: readonly string[],
  decisions: readonly DesignDecision[],
): GateResult {
  let pass = true;
  for (const s of scores) if (!s.pass) pass = false;
  return { gate, scores, pass, findings, decisions };
}

/** Aggregate gate results into a GdosReport for one level. */
export function gdosReport(levelId: string, profileId: string, gates: readonly GateResult[]): GdosReport {
  const decisions: DesignDecision[] = [];
  let pass = true;
  for (const g of gates) {
    if (!g.pass) pass = false;
    for (const d of g.decisions) decisions.push(d);
  }
  return { levelId, profileId, gates, decisions, pass };
}
