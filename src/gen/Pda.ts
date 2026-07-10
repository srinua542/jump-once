/**
 * Pda — the Procedural Design Assistant (P7/S7.3, REQ-060; dm-0058).
 *
 * GDOS alignment: Section 7 — a standalone discovery tool that searches
 * CONCEPTUAL, STRUCTURAL, and SYSTEMIC opportunities, never raw geometry.
 *
 * Design (dm-0058): discoverOpportunities is a deterministic data-fusion pass
 * over five signals the M2 stack already produces, all consumed by reference
 * (dm-0045/dm-0046) and all optional-degrading like CdreInputs:
 *
 *  - CoverageMatrix → CONCEPTUAL gaps, one level FINER than CDRE's axis-value
 *    mining (which owns "value never exercised"): pairs of individually
 *    covered values that have never met — a covered mechanic that has never
 *    targeted a covered emotion phase, or never been exercised at a covered
 *    optimization style.
 *  - CampaignReport → SYSTEMIC opportunities: live alerts, plus chapters
 *    whose health sits below the profiled bar (REQ-054's sibling signal from
 *    P6).
 *  - EmergentFunReport(s) → STRUCTURAL opportunities: flagged kinetic anchors
 *    are physics moments no layout exploits yet (REQ-054 applied).
 *  - CdreProposals → echoed findings (coverage-gap/recurring-rejection),
 *    ranked last: they are process observations, already typed by CDRE.
 *  - Lifecycle registry + Design Memory → mandatory FILTERS, never sources:
 *    isBlocked drops Exhausted/Retired mechanics (REQ-082); a REJECTED prior
 *    decision mentioning both halves of a pair drops the pair (REQ-051 —
 *    never re-propose what design memory rejected).
 *
 * Ranking is a fixed, documented priority — systemic (live player pain),
 * conceptual (design-space debt), structural (unexploited fun), CDRE echoes —
 * deterministic within each group (axis order / input order / sorted keys).
 * The emission cap and the weak-chapter bar come from GenProfile (dm-0057);
 * everything dropped is COUNTED in the report (no silent caps).
 *
 * Suggested archetypes come from a declared, frozen mapping derived from
 * /level-design-principle's archetype→signal table — a starting vocabulary
 * for the concept stage, not a quality claim.
 *
 * Pure and deterministic: same (inputs, profile) ⇒ identical report. No
 * geometry, no sim, no search, no I/O. Lives in src/gen/ (dm-0057).
 */

import type { EntityKind } from '../components/Behavior';
import {
  EMOTION_ARC,
  MECHANIC_AXIS,
  OPTIMIZATION_STYLE_AXIS,
  type CoverageMatrix,
  type EmotionPhase,
  type OptimizationStyle,
} from '../eval/gdos/DesignSpace';
import { findPriorArt, type LedgerDocument, type MechanicLifecycleEntry } from '../eval/gdos/DesignMemory';
import type { CdreProposal } from '../eval/gdos/Cdre';
import type { CampaignReport } from '../eval/campaign/CampaignState';
import type { EmergentFunReport } from '../eval/EmergentFun';
import type { LevelArchetype } from './Concept';
import type { GenProfile } from './GenProfile';
import { isBlocked } from './Lifecycle';

export type OpportunityKind = 'conceptual' | 'structural' | 'systemic';

/** One ranked, typed opportunity — a gap signal with provenance, never geometry and never a quality claim. */
export interface DesignOpportunity {
  readonly kind: OpportunityKind;
  /** Candidate level archetypes for the concept stage, from the declared /level-design-principle mapping (may be empty). */
  readonly suggestedArchetypes: readonly LevelArchetype[];
  /** The mechanics the opportunity concerns (empty when it is not mechanic-specific). */
  readonly mechanics: readonly EntityKind[];
  /** One-line human-readable rationale. Non-empty by construction. */
  readonly rationale: string;
  /** Machine-readable provenance: which input signals produced it. */
  readonly sourceSignals: readonly string[];
}

/** Everything the PDA observes. All optional — discovery degrades gracefully (dm-0058). */
export interface PdaInputs {
  readonly coverageMatrix?: CoverageMatrix;
  readonly campaignReport?: CampaignReport;
  /** Per-level emergent-fun probes, labeled by level. */
  readonly emergentFun?: readonly { readonly levelId: string; readonly report: EmergentFunReport }[];
  readonly cdreProposals?: readonly CdreProposal[];
  /** The ledger's lifecycle registry (REQ-082 blocking filter). */
  readonly lifecycle?: readonly MechanicLifecycleEntry[];
  /** The design memory document (REQ-051 rejected-prior-art filter). */
  readonly designMemory?: LedgerDocument;
}

/** What was considered and what was dropped — the no-silent-caps ledger of one discovery pass. */
export interface PdaReport {
  readonly opportunities: readonly DesignOpportunity[];
  /** Candidate opportunities generated before any filter. */
  readonly consideredSignals: number;
  readonly dropped: {
    /** Candidates dropped because their mechanic is Exhausted/Retired (REQ-082). */
    readonly blockedMechanic: number;
    /** Candidates dropped because a REJECTED ledger decision covers them (REQ-051). */
    readonly rejectedPriorArt: number;
    /** Candidates dropped by the profile's maxOpportunities cap. */
    readonly overCap: number;
  };
}

/** /level-design-principle: which archetypes serve each emotion-phase gap. */
const ARCHETYPES_BY_EMOTION: Readonly<Record<EmotionPhase, readonly LevelArchetype[]>> = Object.freeze({
  curiosity: ['observation', 'environmentalReading'],
  confidence: ['planning', 'execution'],
  surpriseBetrayal: ['assumption', 'psychologicalPressure'],
  realization: ['prediction', 'reverseThinking'],
  mastery: ['execution', 'timing'],
  renewedUncertainty: ['reverseThinking', 'choice'],
});

/** /level-design-principle: which archetypes serve each optimization-style gap. */
const ARCHETYPES_BY_OPT_STYLE: Readonly<Record<OptimizationStyle, readonly LevelArchetype[]>> = Object.freeze({
  discovery: ['observation', 'choice'],
  good: ['planning'],
  fast: ['timing', 'execution'],
  expert: ['execution', 'physics'],
  worldRecord: ['execution', 'physics'],
});

/** Kinetic anchors are momentum/physics moments; spike alerts and weak chapters are legibility problems. */
const STRUCTURAL_ARCHETYPES: readonly LevelArchetype[] = Object.freeze(['physics', 'timing']);
const SYSTEMIC_ARCHETYPES: readonly LevelArchetype[] = Object.freeze(['planning', 'observation']);

/** A REJECTED decision mentioning BOTH terms blocks the pair (REQ-051 via the store's own query). */
function rejectedPriorArtCovers(doc: LedgerDocument, termA: string, termB: string): boolean {
  return findPriorArt(doc, [termA]).some(
    (d) => d.status === 'REJECTED' && findPriorArt({ ...doc, decisions: [d] }, [termB]).length > 0,
  );
}

/**
 * One deterministic discovery pass. Same (inputs, profile) ⇒ identical
 * report; absent inputs simply contribute nothing.
 */
export function discoverOpportunities(inputs: PdaInputs, profile: GenProfile): PdaReport {
  const lifecycle = inputs.lifecycle ?? [];
  let considered = 0;
  let blockedMechanic = 0;
  let rejectedPriorArt = 0;

  const systemic: DesignOpportunity[] = [];
  const conceptual: DesignOpportunity[] = [];
  const structural: DesignOpportunity[] = [];
  const echoes: DesignOpportunity[] = [];

  // ── SYSTEMIC: campaign alerts, then weak chapters (sorted for determinism).
  if (inputs.campaignReport !== undefined) {
    const alertedChapters = new Set<string>();
    for (const alert of inputs.campaignReport.alerts) {
      considered++;
      alertedChapters.add(alert.chapterId);
      systemic.push({
        kind: 'systemic',
        suggestedArchetypes: SYSTEMIC_ARCHETYPES,
        mechanics: [],
        rationale: `campaign alert (${alert.kind}) at chapter "${alert.chapterId}": ${alert.reason}`,
        sourceSignals: [`alert:${alert.chapterId}`, ...alert.findings],
      });
    }
    for (const chapterId of Object.keys(inputs.campaignReport.chapterHealthMap).sort()) {
      if (alertedChapters.has(chapterId)) continue;
      const health = inputs.campaignReport.chapterHealthMap[chapterId];
      if (health.score >= profile.pda.weakChapterHealthScore) continue;
      considered++;
      systemic.push({
        kind: 'systemic',
        suggestedArchetypes: SYSTEMIC_ARCHETYPES,
        mechanics: [],
        rationale: `chapter "${chapterId}" health ${health.score} sits below the weak-chapter bar ${profile.pda.weakChapterHealthScore}`,
        sourceSignals: [`chapter-health:${chapterId}`],
      });
    }
  }

  // ── CONCEPTUAL: covered-value pairs that never met (finer than CDRE's axis mining).
  if (inputs.coverageMatrix !== undefined) {
    const matrix = inputs.coverageMatrix;
    const mechanicEmotion = new Set<string>();
    const mechanicOptStyle = new Set<string>();
    for (const key of matrix.cells) {
      const [m, , emo, opt] = key.split('|');
      mechanicEmotion.add(`${m}|${emo}`);
      mechanicOptStyle.add(`${m}|${opt}`);
    }
    const mechanics = MECHANIC_AXIS.filter((m) => matrix.mechanicsCovered.includes(m));
    const emotions = EMOTION_ARC.filter((e) => matrix.emotionsCovered.includes(e));
    const optStyles = OPTIMIZATION_STYLE_AXIS.filter((o) => matrix.optimizationStylesCovered.includes(o));
    for (const m of mechanics) {
      for (const emo of emotions) {
        if (mechanicEmotion.has(`${m}|${emo}`)) continue;
        considered++;
        if (isBlocked(lifecycle, m)) { blockedMechanic++; continue; }
        if (inputs.designMemory !== undefined && rejectedPriorArtCovers(inputs.designMemory, m, emo)) { rejectedPriorArt++; continue; }
        conceptual.push({
          kind: 'conceptual',
          suggestedArchetypes: ARCHETYPES_BY_EMOTION[emo],
          mechanics: [m],
          rationale: `covered mechanic "${m}" has never targeted the covered emotion phase "${emo}"`,
          sourceSignals: [`coverage-pair:${m}|${emo}`],
        });
      }
      for (const opt of optStyles) {
        if (mechanicOptStyle.has(`${m}|${opt}`)) continue;
        considered++;
        if (isBlocked(lifecycle, m)) { blockedMechanic++; continue; }
        if (inputs.designMemory !== undefined && rejectedPriorArtCovers(inputs.designMemory, m, opt)) { rejectedPriorArt++; continue; }
        conceptual.push({
          kind: 'conceptual',
          suggestedArchetypes: ARCHETYPES_BY_OPT_STYLE[opt],
          mechanics: [m],
          rationale: `covered mechanic "${m}" has never been exercised at the covered optimization style "${opt}"`,
          sourceSignals: [`coverage-pair:${m}|${opt}`],
        });
      }
    }
  }

  // ── STRUCTURAL: flagged kinetic anchors, in input order (REQ-054 applied).
  if (inputs.emergentFun !== undefined) {
    for (const probe of inputs.emergentFun) {
      if (probe.report.anchors.length === 0) continue;
      considered++;
      structural.push({
        kind: 'structural',
        suggestedArchetypes: STRUCTURAL_ARCHETYPES,
        mechanics: [],
        rationale: `level "${probe.levelId}" exposes ${probe.report.anchors.length} kinetic anchor(s)${probe.report.exhaustive ? '' : ' (probe truncated — there may be more)'} no layout exploits yet`,
        sourceSignals: [`emergent-fun:${probe.levelId}`],
      });
    }
  }

  // ── CDRE echoes: already-typed process findings, ranked last, never re-judged.
  if (inputs.cdreProposals !== undefined) {
    for (const proposal of inputs.cdreProposals) {
      if (proposal.status === 'REJECTED') continue;
      if (proposal.kind !== 'coverage-gap' && proposal.kind !== 'recurring-rejection') continue;
      considered++;
      echoes.push({
        kind: proposal.kind === 'coverage-gap' ? 'conceptual' : 'systemic',
        suggestedArchetypes: [],
        mechanics: [],
        rationale: `CDRE ${proposal.kind} finding: ${proposal.summary}`,
        sourceSignals: [`cdre:${proposal.id}`, ...proposal.evidence],
      });
    }
  }

  const ranked = [...systemic, ...conceptual, ...structural, ...echoes];
  const kept = ranked.slice(0, profile.pda.maxOpportunities);
  return {
    opportunities: kept,
    consideredSignals: considered,
    dropped: {
      blockedMechanic,
      rejectedPriorArt,
      overCap: ranked.length - kept.length,
    },
  };
}
