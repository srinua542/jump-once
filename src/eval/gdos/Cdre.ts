/**
 * Cdre — the Continuous Design Research Engine (P5/S5.8, REQ-052; dm-0033).
 *
 * GDOS alignment: Section 6 (CDRE: a self-improving loop that improves the
 * design process itself and feeds validated discoveries back into GDOS).
 *
 * Scope, pinned by dm-0033 before any code: CDRE is a DETERMINISTIC
 * PROFILE-EVOLUTION loop — not ML, not self-modifying code (both impossible
 * under the determinism + zero-dependency invariants, and unverifiable).
 *
 *   mine(inputs, options) → CdreProposal[]        // observe, never mutate
 *   apply(profile, ACCEPTED proposal) → profile'  // an explicit, ledgered act
 *
 * "Self-improving" means the CALIBRATION improves through a versioned
 * feedback channel: every weight and threshold already lives in the
 * ScoringProfile (dm-0031), so evolving the scoring engine is a data change.
 * Proposals are pure records carrying the five §12 Intent Repository fields,
 * ready for the executable Design Memory (S5.6). A proposal is inert until
 * something ACCEPTS it; apply() refuses anything not ACCEPTED, so the loop can
 * never silently change gate behavior.
 *
 * What is mined, and the honest reading of each signal:
 *  - THRESHOLD-ADJUSTMENT (from GdosReports). A metric failing in nearly every
 *    report means one of two things — the bar is miscalibrated, or the content
 *    is bad. CDRE cannot distinguish them, so it PROPOSES and a human/GDOS
 *    decides. The symmetric signal matters just as much: a metric that passes
 *    everywhere with a wide margin has a bar below reality and proposes a
 *    RAISE. Mining only the lowering direction would be a Goodhart ratchet.
 *  - ESTIMATOR-UNMEASURABLE. A metric scoring exactly 0 in every report is not
 *    a threshold problem: its evidence source never fires. The proposal points
 *    at the estimator, never at the threshold.
 *  - COVERAGE-GAP (from a CoverageMatrix). Axis values the level set has never
 *    exercised — dead regions of the design space (REQ-041).
 *  - RECURRING-REJECTION (from DesignDecision history). One rejection reason
 *    dominating the record is a systemic design problem, not a calibration one.
 * Only THRESHOLD-ADJUSTMENT is applicable to a profile; the rest are findings
 * that feed the design process (which is precisely REQ-052's subject).
 *
 * The info-density metrics are deliberately NOT threshold-mined: peakScreenDensity
 * is a band test and failureVisibility a zero-limit test — neither is a
 * "score ≥ threshold" cutoff, so percentile recalibration is meaningless there.
 *
 * PURE gdos module (dm-0037): no sim, no search, no I/O, no clock (dates and
 * ids are parameters/derived). Whitelist math (floor/min/max).
 */

import { parseProfile, type ScoringProfile } from './Profile';
import type { SchemaError } from '../../schema/Parse';
import type { CoverageMatrix } from './DesignSpace';
import {
  EMOTION_ARC,
  ENVIRONMENT_AXIS,
  MECHANIC_AXIS,
  OPTIMIZATION_STYLE_AXIS,
  PLAYER_TYPE_AXIS,
} from './DesignSpace';
import type { DesignDecision, GdosReport, IntentRepositoryFields } from './Report';

export type ProposalKind =
  | 'threshold-adjustment'
  | 'estimator-unmeasurable'
  | 'coverage-gap'
  | 'recurring-rejection';

export type ProposalStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED';

/** Which gate's threshold table a metric lives in. Only these two are ≥-cutoff gates. */
export type ThresholdGate = 'emotional' | 'streamability';

export interface ThresholdTarget {
  readonly gate: ThresholdGate;
  /** A key of that gate's thresholds record. */
  readonly metric: string;
}

/** A proposed change to the design process. Inert until ACCEPTED. */
export interface CdreProposal {
  /** cdre-#### in deterministic emission order. */
  readonly id: string;
  readonly kind: ProposalKind;
  readonly status: ProposalStatus;
  readonly summary: string;
  /** The observations that produced the proposal. */
  readonly evidence: readonly string[];
  /** The five §12 fields — a proposal is a design-intent commitment (REQ-111). */
  readonly intent: IntentRepositoryFields;
  /** Present iff kind === 'threshold-adjustment'. */
  readonly target?: ThresholdTarget;
  readonly currentThreshold?: number;
  readonly proposedThreshold?: number;
}

export interface CdreOptions {
  /** Below this many reports nothing is threshold-mined (a sample too small to calibrate on). ≥1. */
  readonly minReports: number;
  /** A metric failing at least this fraction of reports proposes a LOWER bar. (0,1]. */
  readonly failureRateForLowering: number;
  /** Percentile of observed scores to propose as the lowered bar. [0,1]. */
  readonly loweringPercentile: number;
  /** A metric passing everywhere by at least this many points proposes a RAISED bar. >0. */
  readonly raiseMarginPoints: number;
  /** A rejection reason recurring at least this many times is systemic. ≥1. */
  readonly recurringRejectionCount: number;
}

export const DEFAULT_CDRE_OPTIONS: CdreOptions = Object.freeze({
  minReports: 3,
  failureRateForLowering: 0.8,
  loweringPercentile: 0.5,
  raiseMarginPoints: 10,
  recurringRejectionCount: 3,
});

/** Everything CDRE observes. All optional but reports — mining degrades gracefully. */
export interface CdreInputs {
  readonly reports: readonly GdosReport[];
  readonly history?: readonly DesignDecision[];
  readonly coverage?: CoverageMatrix;
}

/** Which gate owns each ≥-cutoff metric. Info-density metrics are absent by design (see header). */
const THRESHOLD_GATE_BY_METRIC: Readonly<Record<string, ThresholdGate>> = {
  curiosity: 'emotional',
  confidence: 'emotional',
  surprise: 'emotional',
  mastery: 'emotional',
  shareability: 'streamability',
  clipPotential: 'streamability',
  reactionDensity: 'streamability',
  replayValue: 'streamability',
};

function proposalId(index: number): string {
  let digits = String(index);
  while (digits.length < 4) digits = `0${digits}`;
  return `cdre-${digits}`;
}

/** Deterministic percentile over ascending-sorted scores. */
function percentile(sortedAscending: readonly number[], p: number): number {
  const n = sortedAscending.length;
  if (n === 0) return 0;
  const idx = Math.max(0, Math.min(n - 1, Math.floor(p * (n - 1))));
  return sortedAscending[idx];
}

interface MetricObservation {
  readonly scores: number[];
  readonly thresholds: number[];
  failures: number;
}

/** Collect every ≥-cutoff metric's scores and thresholds across the reports. */
function observe(reports: readonly GdosReport[]): Map<string, MetricObservation> {
  const byMetric = new Map<string, MetricObservation>();
  for (const report of reports) {
    for (const gate of report.gates) {
      for (const s of gate.scores) {
        if (THRESHOLD_GATE_BY_METRIC[s.metric] === undefined) continue;
        let obs = byMetric.get(s.metric);
        if (obs === undefined) {
          obs = { scores: [], thresholds: [], failures: 0 };
          byMetric.set(s.metric, obs);
        }
        obs.scores.push(s.score);
        obs.thresholds.push(s.threshold);
        if (!s.pass) obs.failures++;
      }
    }
  }
  return byMetric;
}

function thresholdIntent(metric: string, direction: 'lower' | 'raise', evidence: readonly string[]): IntentRepositoryFields {
  const lowering = direction === 'lower';
  return {
    whyItExists: `CDRE (REQ-052) observed that the "${metric}" bar is ${lowering ? 'above' : 'below'} everything the current content produces.`,
    problemItSolves: lowering
      ? `A gate that rejects every level teaches the pipeline nothing. Either the bar is miscalibrated or the content is bad; this proposal offers the recalibration for a human/GDOS decision. Evidence: ${evidence.join(' | ')}`
      : `A gate that passes everything with room to spare is not a gate. Raising it to the weakest observed score keeps all current content while restoring discriminating power. Evidence: ${evidence.join(' | ')}`,
    emotionTargeted: `Preserves the §6 emotional/streamability target "${metric}" as a MEANINGFUL bar rather than a formality.`,
    misconceptionCreated: lowering
      ? 'Lowering a bar can rationalize weak content. This proposal is inert until explicitly ACCEPTED, and CDRE cannot tell a miscalibrated bar from bad content — the acceptor must.'
      : 'Raising to the weakest observed score is calibration to the present corpus, not to an absolute standard; a future weaker (but legitimate) level would now fail.',
    whyAlternativesRejected: 'Auto-applying the change was rejected (dm-0033: an apply is an explicit, ledgered act, never a silent one). Mining only the lowering direction was rejected: a one-way ratchet toward easier gates is exactly the Goodhart failure dm-0031 exists to prevent.',
  };
}

/**
 * Mine observations into proposals. PURE and deterministic: same inputs ⇒
 * identical proposals, in a fixed emission order (threshold-adjustment,
 * estimator-unmeasurable, coverage-gap, recurring-rejection). Every proposal
 * comes back as PROPOSED — mining never accepts its own work.
 */
export function mine(inputs: CdreInputs, options: CdreOptions = DEFAULT_CDRE_OPTIONS): readonly CdreProposal[] {
  const proposals: CdreProposal[] = [];
  const emit = (p: Omit<CdreProposal, 'id'>): void => {
    proposals.push({ id: proposalId(proposals.length + 1), ...p });
  };

  const reports = inputs.reports;
  const observed = observe(reports);

  // Fixed metric order so proposals are deterministic regardless of report order.
  const metrics = Object.keys(THRESHOLD_GATE_BY_METRIC).sort();

  if (reports.length >= options.minReports) {
    for (const metric of metrics) {
      const obs = observed.get(metric);
      if (obs === undefined || obs.scores.length === 0) continue;
      const gate = THRESHOLD_GATE_BY_METRIC[metric];
      const current = obs.thresholds[0];
      // A metric whose threshold moved between reports was scored under different
      // profiles; cross-profile scores are not comparable (dm-0031), so skip it.
      if (obs.thresholds.some((t) => t !== current)) continue;

      const sorted = [...obs.scores].sort((a, b) => a - b);
      const failureRate = obs.failures / obs.scores.length;

      // An estimator that never fires is an evidence problem, not a bar problem.
      if (sorted[sorted.length - 1] === 0) {
        emit({
          kind: 'estimator-unmeasurable',
          status: 'PROPOSED',
          summary: `"${metric}" scored 0 in all ${obs.scores.length} reports — its evidence source never fires`,
          evidence: [`${obs.scores.length} reports, every ${metric} score exactly 0`],
          intent: {
            whyItExists: `CDRE (REQ-052) found the "${metric}" estimator produces no signal on the current evidence.`,
            problemItSolves: 'Distinguishes a dead estimator from a strict bar: no threshold change can fix a score that is always 0. Directs review at the estimator\'s evidence source (dm-0036).',
            emotionTargeted: `The §6 metric "${metric}" is currently unmeasured, so the emotion it guards is ungated.`,
            misconceptionCreated: 'A 0 score may be CORRECT (the evidence genuinely shows none of that quality). This flags it for review; it does not assert a defect.',
            whyAlternativesRejected: 'Proposing a threshold of 0 was rejected: it would make the gate vacuously pass and hide the missing signal.',
          },
        });
        continue;
      }

      if (failureRate >= options.failureRateForLowering) {
        const proposed = percentile(sorted, options.loweringPercentile);
        if (proposed < current) {
          const evidence = [
            `${obs.failures}/${obs.scores.length} reports failed "${metric}" (rate ${failureRate.toFixed(2)} ≥ ${options.failureRateForLowering})`,
            `observed scores ${sorted[0].toFixed(1)}..${sorted[sorted.length - 1].toFixed(1)}; p${options.loweringPercentile} = ${proposed.toFixed(1)} vs threshold ${current}`,
          ];
          emit({
            kind: 'threshold-adjustment',
            status: 'PROPOSED',
            summary: `lower "${metric}" threshold ${current} → ${proposed.toFixed(1)} (fails ${obs.failures}/${obs.scores.length})`,
            evidence,
            intent: thresholdIntent(metric, 'lower', evidence),
            target: { gate, metric },
            currentThreshold: current,
            proposedThreshold: proposed,
          });
        }
        continue;
      }

      if (obs.failures === 0) {
        const weakest = sorted[0];
        if (weakest - current >= options.raiseMarginPoints) {
          const evidence = [
            `"${metric}" passed all ${obs.scores.length} reports; weakest score ${weakest.toFixed(1)} exceeds threshold ${current} by ${(weakest - current).toFixed(1)} ≥ ${options.raiseMarginPoints}`,
          ];
          emit({
            kind: 'threshold-adjustment',
            status: 'PROPOSED',
            summary: `raise "${metric}" threshold ${current} → ${weakest.toFixed(1)} (bar sits below all observed content)`,
            evidence,
            intent: thresholdIntent(metric, 'raise', evidence),
            target: { gate, metric },
            currentThreshold: current,
            proposedThreshold: weakest,
          });
        }
      }
    }
  }

  // Dead regions of the design space (REQ-041).
  if (inputs.coverage !== undefined) {
    const cov = inputs.coverage;
    const axes: readonly [string, readonly string[], readonly string[]][] = [
      ['mechanic', MECHANIC_AXIS, cov.mechanicsCovered],
      ['environment', ENVIRONMENT_AXIS, cov.environmentsCovered],
      ['emotion', EMOTION_ARC, cov.emotionsCovered],
      ['optimizationStyle', OPTIMIZATION_STYLE_AXIS, cov.optimizationStylesCovered],
      ['playerType', PLAYER_TYPE_AXIS, cov.playerTypesCovered],
    ];
    for (const [axisName, all, covered] of axes) {
      const missing = all.filter((v) => !covered.includes(v));
      if (missing.length === 0) continue;
      emit({
        kind: 'coverage-gap',
        status: 'PROPOSED',
        summary: `design-space axis "${axisName}" has ${missing.length} unexercised value(s): ${missing.join(', ')}`,
        evidence: [`${covered.length}/${all.length} values covered across ${cov.totalCells} cells`],
        intent: {
          whyItExists: `CDRE (REQ-052) found dead regions on the "${axisName}" axis of the REQ-041 design-space matrix.`,
          problemItSolves: 'Surfaces design space the campaign has never explored, so the next content proposal can target it rather than repeat covered ground (REQ-053 novelty).',
          emotionTargeted: 'Renewed Uncertainty — unexplored regions are where genuinely new experiences live.',
          misconceptionCreated: 'A gap is not automatically a defect: some axis values (e.g. a mechanic reserved for a late chapter) are unexercised on purpose. This is an observation, not an instruction.',
          whyAlternativesRejected: 'Auto-generating content to fill gaps was rejected: content generation is hard-gated behind M2 and must originate from GDOS (REQ-050), not from a coverage counter.',
        },
      });
    }
  }

  // Systemic rejection patterns (from the decision record, not the reports).
  if (inputs.history !== undefined) {
    const counts = new Map<string, number>();
    for (const d of inputs.history) {
      if (d.verdict !== 'fail') continue;
      for (const f of d.findings) counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    const recurring = [...counts.entries()]
      .filter(([, n]) => n >= options.recurringRejectionCount)
      .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1));
    for (const [reason, n] of recurring) {
      emit({
        kind: 'recurring-rejection',
        status: 'PROPOSED',
        summary: `rejection reason recurred ${n}× — a systemic design problem, not a calibration one: "${reason}"`,
        evidence: [`${n} failing decisions cite this finding`],
        intent: {
          whyItExists: `CDRE (REQ-052) found one rejection reason dominating the decision record (${n} occurrences).`,
          problemItSolves: 'Separates a process defect from a threshold defect: when the same finding kills concept after concept, the fix belongs upstream in how concepts are designed, not in the bar that catches them.',
          emotionTargeted: 'N/A (process improvement — the subject of REQ-052).',
          misconceptionCreated: 'A frequent reason may simply be the most common way weak content fails; recurrence indicates where to look, not what is wrong.',
          whyAlternativesRejected: 'Relaxing the gate that produces the reason was rejected: it would suppress the symptom and admit the very content the Kill Switch exists to stop (REQ-020).',
        },
      });
    }
  }

  return proposals;
}

export type ApplyResult =
  | { readonly ok: true; readonly value: ScoringProfile }
  | { readonly ok: false; readonly errors: readonly SchemaError[] };

/**
 * Apply an ACCEPTED threshold proposal, producing a NEW profile version.
 * Pure: the input profile is untouched. The result is round-tripped through
 * parseProfile, so an evolved profile is valid by construction or the apply
 * fails loudly. profileId is versioned (never the schema version): the
 * calibration changed, the format did not.
 */
export function apply(profile: ScoringProfile, proposal: CdreProposal): ApplyResult {
  const errors: SchemaError[] = [];
  if (proposal.status !== 'ACCEPTED') {
    errors.push({ path: '/status', message: `only an ACCEPTED proposal may be applied (got ${proposal.status}); a proposal is inert until explicitly accepted (dm-0033)` });
  }
  if (proposal.kind !== 'threshold-adjustment') {
    errors.push({ path: '/kind', message: `only threshold-adjustment proposals are applicable to a profile; "${proposal.kind}" is a finding for the design process` });
  }
  if (proposal.target === undefined || proposal.proposedThreshold === undefined) {
    errors.push({ path: '/target', message: 'a threshold-adjustment proposal must carry a target and a proposedThreshold' });
  }
  if (errors.length > 0) return { ok: false, errors };

  const target = proposal.target as ThresholdTarget;
  const next = proposal.proposedThreshold as number;

  const gateThresholds = target.gate === 'emotional' ? profile.emotional.thresholds : profile.streamability.thresholds;
  if (!(target.metric in gateThresholds)) {
    return { ok: false, errors: [{ path: `/target/metric`, message: `"${target.metric}" is not a threshold of the ${target.gate} gate` }] };
  }

  const evolved = {
    ...profile,
    profileId: `${profile.profileId}+${proposal.id}`,
    emotional: {
      ...profile.emotional,
      thresholds: target.gate === 'emotional'
        ? { ...profile.emotional.thresholds, [target.metric]: next }
        : { ...profile.emotional.thresholds },
    },
    streamability: {
      ...profile.streamability,
      thresholds: target.gate === 'streamability'
        ? { ...profile.streamability.thresholds, [target.metric]: next }
        : { ...profile.streamability.thresholds },
    },
    infoDensity: { ...profile.infoDensity },
    novelty: { ...profile.novelty },
  };

  // Validate by construction: an evolved profile must survive its own parser.
  return parseProfile(JSON.parse(JSON.stringify(evolved)) as unknown);
}
