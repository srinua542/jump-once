/**
 * Lifecycle — the REQ-082 mechanic lifecycle TRACKER (P7/S7.1, dm-0055).
 *
 * GDOS alignment: Section 9 — every mechanic moves through nine stages,
 * Introduction → Retirement; exhausted mechanics are blocked from reuse;
 * Retirement prunes or converts.
 *
 * The registry SCHEMA (MechanicLifecycleEntry, the nine LIFECYCLE_STAGES,
 * parse/serialize/upsert) lives in the Design Memory store — the ledger is
 * the single source of truth (dm-0055). This module is the pure stage logic
 * over those records, split CDRE-style (dm-0033) into observation and act:
 *
 *  - assessStage(entry, evidence, profile): ADVISORY — climbs the stage
 *    ladder from the entry's current stage as far as the observable evidence
 *    supports, contiguously (a later stage is never recommended over an unmet
 *    earlier one — the level-design chapter arc teaches in order). Never
 *    recommends Retirement: retiring is an explicit designer act.
 *  - advanceStage(entry, to, date, evidence, disposition?): the explicit,
 *    validated act — forward-only, evidence-backed, disposition exactly when
 *    Retiring. Returns a new entry; persisting it goes through the store's
 *    setMechanicEntry, which re-validates (a bad advance cannot corrupt the
 *    ledger).
 *  - isBlocked(mechanics, mechanic): REQ-082's reuse block — true at
 *    Exhaustion or Retirement. A mechanic absent from the registry is fresh,
 *    not blocked.
 *
 * Every threshold reaches this module through a parsed GenProfile (dm-0057);
 * zero calibration literals. Pure over its inputs: no sim, no search, no I/O,
 * no clock (dates are parameters, dm-0032). Whitelist math (none needed).
 * Lives in src/gen/ — nothing outside gen/ imports gen/.
 */

import {
  LIFECYCLE_STAGES,
  type LifecycleStage,
  type MechanicLifecycleEntry,
  type RetirementDisposition,
  type StageTransition,
} from '../eval/gdos/DesignMemory';
import type { EntityKind } from '../components/Behavior';
import type { SchemaError } from '../schema/Parse';
import type { GenProfile } from './GenProfile';

/**
 * The observable facts a stage assessment reads — all caller-supplied,
 * consumed by reference (dm-0045/dm-0046 pattern): usage from the coverage
 * matrix, mastery from Campaign Intelligence, novelty from the P5 metric.
 */
export interface LifecycleEvidence {
  /** Levels that have exercised the mechanic. ≥0. */
  readonly levelsUsed: number;
  /** A level teaches the mechanic in isolation (the chapter arc's step 1). */
  readonly isolatedLevelExists: boolean;
  /** A level combines the mechanic with at least one other. */
  readonly combinedLevelExists: boolean;
  /** A level subverts the expectation the mechanic established. */
  readonly subversionLevelExists: boolean;
  /** Campaign Intelligence reports the mechanic mastered (CampaignState.mechanicsMastered). */
  readonly masteredInCampaign: boolean;
  /** noveltyDivergence of the mechanic's recent candidate configurations, oldest → newest. */
  readonly recentNoveltyDivergences: readonly number[];
}

/** The evidence identity: nothing observed yet. */
export const ZERO_LIFECYCLE_EVIDENCE: LifecycleEvidence = Object.freeze({
  levelsUsed: 0,
  isolatedLevelExists: false,
  combinedLevelExists: false,
  subversionLevelExists: false,
  masteredInCampaign: false,
  recentNoveltyDivergences: Object.freeze([]) as readonly number[],
}) as LifecycleEvidence;

/** An advisory reading — never a mutation (dm-0055 propose/apply split). */
export interface StageAssessment {
  /** The furthest stage the evidence supports, never behind the entry's current stage, never Retirement. */
  readonly recommendedStage: LifecycleStage;
  /** One line per ladder step consulted: what was met, and what stopped the climb. */
  readonly reasons: readonly string[];
}

export type AdvanceResult =
  | { readonly ok: true; readonly value: MechanicLifecycleEntry }
  | { readonly ok: false; readonly errors: readonly SchemaError[] };

/** A fresh registry entry: Introduction, no history. */
export function createEntry(mechanic: EntityKind): MechanicLifecycleEntry {
  return { mechanic, stage: 'Introduction', history: [] };
}

/** Canonical position of a stage in the forward order. */
export function stageIndexOf(stage: LifecycleStage): number {
  return LIFECYCLE_STAGES.indexOf(stage);
}

/** The two stages REQ-082 blocks from new-concept selection. */
const BLOCKING_STAGES: ReadonlySet<LifecycleStage> = new Set(['Exhaustion', 'Retirement']);

/**
 * True when the mechanic must not be selected for a new concept (REQ-082):
 * its entry sits at Exhaustion or Retirement. Absent from the registry =
 * never used = fresh, not blocked.
 */
export function isBlocked(mechanics: readonly MechanicLifecycleEntry[], mechanic: EntityKind): boolean {
  const entry = mechanics.find((m) => m.mechanic === mechanic);
  return entry !== undefined && BLOCKING_STAGES.has(entry.stage);
}

/** True when the last profile.lifecycle.exhaustionConsecutiveLowNovelty samples all sit below the saturation threshold. */
function noveltyExhausted(evidence: LifecycleEvidence, profile: GenProfile): boolean {
  const n = profile.lifecycle.exhaustionConsecutiveLowNovelty;
  const samples = evidence.recentNoveltyDivergences;
  if (samples.length < n) return false;
  for (let i = samples.length - n; i < samples.length; i++) {
    if (samples[i] >= profile.lifecycle.saturationNoveltyThreshold) return false;
  }
  return true;
}

/**
 * Climb the ladder from Introduction as far as the evidence supports,
 * contiguously; the recommendation never falls behind the entry's current
 * stage (a designer may have advanced on evidence this reading lacks) and
 * never reaches Retirement (an explicit act, not an inference).
 */
export function assessStage(entry: MechanicLifecycleEntry, evidence: LifecycleEvidence, profile: GenProfile): StageAssessment {
  const lastNovelty = evidence.recentNoveltyDivergences.length === 0
    ? undefined
    : evidence.recentNoveltyDivergences[evidence.recentNoveltyDivergences.length - 1];
  const ladder: { readonly to: LifecycleStage; readonly met: boolean; readonly why: string }[] = [
    { to: 'Isolation', met: evidence.isolatedLevelExists, why: 'a level teaches the mechanic in isolation' },
    { to: 'Development', met: evidence.levelsUsed >= profile.lifecycle.developmentMinLevels, why: `used by >= ${profile.lifecycle.developmentMinLevels} levels (developmentMinLevels)` },
    { to: 'Combination', met: evidence.combinedLevelExists, why: 'a level combines the mechanic with another' },
    { to: 'Subversion', met: evidence.subversionLevelExists, why: 'a level subverts the established expectation' },
    { to: 'Mastery', met: evidence.masteredInCampaign, why: 'Campaign Intelligence reports the mechanic mastered' },
    { to: 'Saturation', met: lastNovelty !== undefined && lastNovelty < profile.lifecycle.saturationNoveltyThreshold, why: `latest configuration divergence below ${profile.lifecycle.saturationNoveltyThreshold} (saturationNoveltyThreshold)` },
    { to: 'Exhaustion', met: noveltyExhausted(evidence, profile), why: `${profile.lifecycle.exhaustionConsecutiveLowNovelty} consecutive low-novelty configurations (exhaustionConsecutiveLowNovelty)` },
  ];
  const reasons: string[] = [];
  let supported: LifecycleStage = 'Introduction';
  for (const step of ladder) {
    if (!step.met) {
      reasons.push(`unmet for ${step.to}: ${step.why}`);
      break;
    }
    supported = step.to;
    reasons.push(`met for ${step.to}: ${step.why}`);
  }
  if (stageIndexOf(entry.stage) >= stageIndexOf(supported)) {
    reasons.push(`entry already at "${entry.stage}" — a recommendation never moves backward`);
    return { recommendedStage: entry.stage, reasons };
  }
  return { recommendedStage: supported, reasons };
}

/**
 * The explicit, validated advance (dm-0055): forward-only, evidence-backed,
 * dated, disposition exactly when Retiring. Returns a NEW entry whose history
 * chains by construction (the transition departs the entry's current stage).
 */
export function advanceStage(
  entry: MechanicLifecycleEntry,
  to: LifecycleStage,
  date: string,
  evidence: string,
  disposition?: RetirementDisposition,
): AdvanceResult {
  const errors: SchemaError[] = [];
  if (stageIndexOf(to) <= stageIndexOf(entry.stage)) {
    errors.push({ path: '/to', message: `transitions are forward-only (dm-0055): "${entry.stage}" → "${to}" does not advance` });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.push({ path: '/date', message: `date must be YYYY-MM-DD (got "${date}")` });
  }
  if (evidence.length === 0) {
    errors.push({ path: '/evidence', message: 'an advance must carry non-empty evidence' });
  }
  if ((to === 'Retirement') !== (disposition !== undefined)) {
    errors.push({
      path: '/disposition',
      message: to === 'Retirement'
        ? 'retiring requires a prune|convert disposition (REQ-082)'
        : 'disposition is only valid when advancing to Retirement',
    });
  }
  if (errors.length > 0) return { ok: false, errors };
  const transition: StageTransition = { from: entry.stage, to, date, evidence };
  const history = [...entry.history, transition];
  return {
    ok: true,
    value: disposition === undefined
      ? { mechanic: entry.mechanic, stage: to, history }
      : { mechanic: entry.mechanic, stage: to, disposition, history },
  };
}
