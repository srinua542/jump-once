/**
 * Pipeline — the REQ-090 eight-phase level manufacturing pipeline
 * (P7/S7.7; dm-0060/dm-0064). REQ-061 (info-density regulation) applied via
 * the AI-Council gate.
 *
 * GDOS alignment: Section 10 — Concept → Structural Prototyping → Kinetic
 * Simulation → AI Council Eval → Targeted Revision → Optimization Layering →
 * Sign-off/Intent → Campaign Integration.
 *
 * manufactureLevel drives a concept through the eight phases as a staged pure
 * fold, emitting either an accepted PipelineProduct (a LevelRecord-ready
 * bundle) or a typed PipelineRejection (phase + reason + findings). "Deleted"
 * means no product is persisted — only the rejection record (dm-0059). Every
 * phase engine is a finished, separately-tested module (no placeholder
 * phases, dm-0054); this file only composes them.
 *
 * Phase mapping:
 *   1 Concept              validateConcept — lifecycle blocking (no Exhausted/
 *                          Retired mechanic enters, REQ-082).
 *   2 Structural Prototyping generateCandidate — parse-proven geometry.
 *   3 Kinetic Simulation   solvable (S4.2) AND jump-necessary (S7.2, the
 *                          REQ-012 counterfactual) AND softlock-free (S4.3).
 *                          The entity-exploit heuristic is RECORDED but not a
 *                          hard gate: it provably misfires on every well-formed
 *                          one-jump pit (the canonical ONE_GAP fixture included),
 *                          because a pit's spikes are the fail-state, not an
 *                          engageable hazard; jump-necessity is the sufficient
 *                          load-bearing-challenge check the exploit proxy could
 *                          not provide (dm-0041/dm-0064).
 *   4 AI Council Eval      evaluateLevel → GdosReport.pass. This gate IS the
 *                          REQ-061 info-density regulation point (the
 *                          info-density gate lives inside judgeLevel).
 *   5 Targeted Revision    on a phase-3 or phase-4 failure, breed a mutated
 *                          candidate and retry, up to profile.pipeline.revisionBudget.
 *   6 Optimization Layering computeOptimizationWindow — reject a flat layout
 *                          with no Discovery→WR spread (REQ-102).
 *   7 Sign-off/Intent      verifyIntent (REQ-091).
 *   8 Campaign Integration assemble the LevelRecord-ready product + provenance.
 *
 * Pure function of (concept, options, profile): threaded core/Rng, deterministic
 * audits/eval under fixed seeds. Consumes evaluation only through public seams
 * (dm-0057). Lives in src/gen/.
 */

import type { EntityKind } from '../components/Behavior';
import type { LevelDefinition } from '../components/Level';
import type { RngState } from '../core/Rng';
import type { ArchetypeRun, EvidenceBundle } from '../eval/gdos/Evidence';
import type { GdosReport } from '../eval/gdos/Report';
import { evaluateLevel, type EvaluateOptions } from '../eval/Evaluate';
import { auditSolvability } from '../eval/local/Solvability';
import { auditJumpRelevance } from '../eval/local/Counterfactual';
import { auditExploit } from '../eval/local/Exploit';
import { detectSoftlock } from '../eval/local/Softlock';
import { computeOptimizationWindow } from '../eval/local/Optimization';
import type { MechanicLifecycleEntry } from '../eval/gdos/DesignMemory';
import type { NoveltyDescriptor } from '../eval/gdos/Novelty';
import { buildDescriptor, noveltyDivergence } from '../eval/gdos/Novelty';
import { validateConcept, type LevelConcept } from './Concept';
import { verifyIntent } from './IntentGate';
import { generateCandidate, mutateCandidate, type Candidate } from './Generator';
import type { GenProfile } from './GenProfile';

export type PipelinePhase =
  | 'concept'
  | 'structural-prototyping'
  | 'kinetic-simulation'
  | 'ai-council'
  | 'optimization-layering'
  | 'sign-off'
  | 'campaign-integration';

export interface PipelineOptions {
  /** Seed threaded through generation, revision, and the audits/eval. */
  readonly seed: number;
  /** Evaluation calibration for phase 4 (the ScoringProfile + agent budget). */
  readonly evalOptions: EvaluateOptions;
  /** Lifecycle registry for the phase-1 blocking check (REQ-082). */
  readonly lifecycle: readonly MechanicLifecycleEntry[];
  /** Prior-level descriptors, for the product's novelty provenance (may be empty). */
  readonly corpus: readonly NoveltyDescriptor[];
}

/** The accepted manufacture: everything a caller needs to build a campaign LevelRecord. */
export interface PipelineProduct {
  readonly concept: LevelConcept;
  readonly def: LevelDefinition;
  readonly evidence: EvidenceBundle;
  readonly report: GdosReport;
  /** A representative run for the campaign record: the first completing archetype, else the first run. */
  readonly run: ArchetypeRun;
  /** The mechanics the level exercises (the concept's declared set). */
  readonly mechanicsExercised: ReadonlySet<EntityKind>;
  readonly provenance: {
    readonly intentSentence: string;
    readonly seed: number;
    /** Targeted-revision attempts spent before this candidate passed. */
    readonly revisions: number;
    /** Novelty divergence vs the corpus (null when the corpus is empty). */
    readonly divergence: number | null;
    /** The entity-exploit verdict, recorded as evidence (not a gate — see header). */
    readonly exploitBypassed: readonly string[];
  };
}

export interface PipelineRejection {
  readonly phase: PipelinePhase;
  readonly reason: string;
  readonly findings: readonly string[];
}

export type PipelineOutcome =
  | { readonly accepted: PipelineProduct }
  | { readonly rejected: PipelineRejection };

/** A phase-3/4 gate reading for one candidate. */
interface GateReading {
  readonly evidence: EvidenceBundle;
  readonly report: GdosReport;
  /** null ⇒ passed both sim and council; otherwise the failing phase + why. */
  readonly failure: { readonly phase: 'kinetic-simulation' | 'ai-council'; readonly reason: string; readonly findings: readonly string[] } | null;
  readonly exploitBypassed: readonly string[];
}

/** Phase 3 (Kinetic Simulation) + phase 4 (AI Council) for one candidate. */
function gateCandidate(def: LevelDefinition, options: PipelineOptions): GateReading {
  const solvability = auditSolvability(def);
  const jumpRelevance = auditJumpRelevance(def);
  const softlock = detectSoftlock(def);
  const exploit = auditExploit(def);
  const simFindings: string[] = [];
  if (solvability.classification !== 'solvable') simFindings.push(`solvability: ${solvability.classification}`);
  if (jumpRelevance.classification !== 'jump-necessary') simFindings.push(`jump-relevance: ${jumpRelevance.classification} (the one jump is not load-bearing — REQ-012)`);
  if (softlock.hasSoftlock) simFindings.push('softlock: a reachable trapped state exists');

  // Evidence + council are computed regardless so the reading always carries a report.
  const { evidence, report } = evaluateLevel(def, options.evalOptions);
  const exploitBypassed = exploit.hasExploit ? exploit.bypassedHazardIds : [];

  if (simFindings.length > 0) {
    return { evidence, report, exploitBypassed, failure: { phase: 'kinetic-simulation', reason: 'the level failed a kinetic-simulation audit', findings: simFindings } };
  }
  if (!report.pass) {
    const findings = report.gates.filter((g) => !g.pass).map((g) => `${g.gate}: ${g.findings.join('; ') || 'below threshold'}`);
    return { evidence, report, exploitBypassed, failure: { phase: 'ai-council', reason: 'the level failed the AI-Council GDOS evaluation', findings } };
  }
  return { evidence, report, exploitBypassed, failure: null };
}

/** Pick the campaign-record run: first completing archetype, else the first run. */
function representativeRun(evidence: EvidenceBundle): ArchetypeRun {
  return evidence.runs.find((r) => r.outcome === 'completed') ?? evidence.runs[0];
}

/**
 * Manufacture a level from a concept through the eight phases. Deterministic:
 * same (concept, options, profile) ⇒ identical outcome.
 */
export function manufactureLevel(concept: LevelConcept, options: PipelineOptions, profile: GenProfile): PipelineOutcome {
  // Phase 1 — Concept (lifecycle blocking, REQ-082).
  const conceptCheck = validateConcept(concept, options.lifecycle);
  if (!conceptCheck.ok) {
    return { rejected: { phase: 'concept', reason: 'the concept is structurally invalid or names a blocked mechanic', findings: conceptCheck.errors.map((e) => `${e.path}: ${e.message}`) } };
  }

  // Phase 2 — Structural Prototyping (parse-proven geometry).
  const seedGen = generateCandidate(concept, options.seed, profile);
  if (!seedGen.ok) {
    return { rejected: { phase: 'structural-prototyping', reason: 'no schema-valid geometry fits the concept', findings: seedGen.errors.map((e) => `${e.path}: ${e.message}`) } };
  }

  // Phases 3–5 — Kinetic Simulation + AI Council, with bounded Targeted Revision.
  let candidate: Candidate = seedGen.candidate;
  let rng: RngState = seedGen.rng;
  let reading = gateCandidate(candidate.def, options);
  let revisions = 0;
  while (reading.failure !== null && revisions < profile.pipeline.revisionBudget) {
    revisions++;
    // Targeted revision: breed a variant. Mutate the incumbent; the seed pool
    // has one member, so mutate is the operator (combine needs two parents).
    const revised = mutateCandidate(candidate, rng, profile);
    if (!revised.ok) continue; // a clamped mutation may fail to build; spend the attempt, keep the incumbent
    rng = revised.rng;
    const revisedReading = gateCandidate(revised.candidate.def, options);
    // Accept the revision only if it clears the gate; otherwise keep exploring from it.
    candidate = revised.candidate;
    reading = revisedReading;
  }
  if (reading.failure !== null) {
    return { rejected: { phase: reading.failure.phase, reason: `${reading.failure.reason} (after ${revisions} revision${revisions === 1 ? '' : 's'})`, findings: reading.failure.findings } };
  }

  // Phase 6 — Optimization Layering (a flat layout has no room for mastery).
  const optimization = computeOptimizationWindow(candidate.def);
  if (optimization.applicable && optimization.rejected) {
    return { rejected: { phase: 'optimization-layering', reason: 'the layout is too flat — no Discovery→World-Record spread for skill to express (REQ-102)', findings: [`delta ${optimization.deltaSeconds ?? 0}s`] } };
  }

  // Phase 7 — Sign-off / Intent (REQ-091).
  const intent = verifyIntent(concept, profile);
  if (!intent.pass) {
    return { rejected: { phase: 'sign-off', reason: 'the level cannot state its lesson in one rigorous sentence (REQ-091)', findings: intent.findings.map((f) => f.message) } };
  }

  // Phase 8 — Campaign Integration (assemble the LevelRecord-ready product).
  const descriptor: NoveltyDescriptor = buildDescriptor(reading.evidence);
  const { divergence } = noveltyDivergence(descriptor, options.corpus, options.evalOptions.profile);
  return {
    accepted: {
      concept,
      def: candidate.def,
      evidence: reading.evidence,
      report: reading.report,
      run: representativeRun(reading.evidence),
      mechanicsExercised: new Set(concept.mechanics),
      provenance: {
        intentSentence: concept.intentSentence,
        seed: options.seed,
        revisions,
        divergence,
        exploitBypassed: reading.exploitBypassed,
      },
    },
  };
}
