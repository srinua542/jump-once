/**
 * Evidence — the EvidenceBundle: everything the GDOS scoring engine judges a
 * level from, assembled exactly ONCE (P5/S5.1, dm-0031).
 *
 * GDOS alignment: Section 6/7/15 — the scoring gates read a level's evidence;
 * the four P4 local verdicts ARE that evidence (the P4→P5 handoff rule:
 * "P5 consumes verdicts; it never re-runs the audits").
 *
 * Design (dm-0031):
 *  - A single immutable bundle serves every gate, so eight gates never
 *    re-run archetype sims or diverge on evidence. assembleEvidence is a PURE
 *    combiner: it takes the already-computed verdicts + archetype runs +
 *    death observations and freezes them into one record. It does NOT run the
 *    audits — that is the top-level src/eval/ assembler's job (evaluateLevel),
 *    which keeps this directory free of audit-function imports.
 *  - This file imports the verdict types with `import type` ONLY. They compile
 *    away, so gdos never gains a runtime dependency on the local audit pass —
 *    the scan-testable "no re-auditing" discipline (dm-0031, EvalIsolation).
 *
 * Whitelist math elsewhere; this file only constructs frozen records.
 */

import type { Vec2 } from '../../core/Vec2';
import type { EntityKind } from '../../components/Behavior';
import type { LevelDefinition } from '../../components/Level';
import type { ReplayTape } from '../../schema/TapeIO';
import type { ArchetypeName } from '../Archetypes';
import type { SolvabilityVerdict } from '../local/Solvability';
import type { SoftlockVerdict } from '../local/Softlock';
import type { ExploitVerdict } from '../local/Exploit';
import type { OptimizationVerdict } from '../local/Optimization';

/** One archetype's headless run distilled for scoring. */
export interface ArchetypeRun {
  readonly archetype: ArchetypeName;
  readonly outcome: 'completed' | 'timeout';
  /** Scene reloads (deaths) before the run stopped. ≥0. */
  readonly attempts: number;
  /** Simulation ticks the run consumed. ≥0. */
  readonly ticksElapsed: number;
  /** The full reproduction recipe (dm-0023). */
  readonly tape: ReplayTape;
}

/**
 * One death observed while replaying a run, with the lookback snapshot the
 * REQ-016 fairness check needs: where the player and the killing hazard were
 * `lookbackTicks` before the death. A death with no attributable killer within
 * the fairness radius (a pit/fall death) leaves killerId undefined.
 */
export interface DeathEvent {
  /** The game tick the player was defeated. */
  readonly tick: number;
  /** Player center at the moment of defeat. */
  readonly playerPosition: Vec2;
  /** Nearest lethal entity's id, if one lay within the fairness radius. */
  readonly killerId?: string;
  readonly killerKind?: EntityKind;
  /** Player center `lookbackTicks` before the death (clamped to the life's start). */
  readonly playerPositionAtLookback: Vec2;
  /** The killer's center at that same lookback tick (present iff killerId is). */
  readonly killerPositionAtLookback?: Vec2;
}

/** The one bundle every gate reads. Assembled once, immutable. */
export interface EvidenceBundle {
  readonly def: LevelDefinition;
  /** One entry per archetype that was run (non-empty). */
  readonly runs: readonly ArchetypeRun[];
  /** Every death observed across the runs (may be empty). */
  readonly deaths: readonly DeathEvent[];
  /** Provenance: how many ticks before each death the killer-visibility snapshot was taken. ≥0. */
  readonly lookbackTicks: number;
  readonly solvability: SolvabilityVerdict;
  readonly softlock: SoftlockVerdict;
  readonly exploit: ExploitVerdict;
  readonly optimization: OptimizationVerdict;
}

/** The parts an assembler hands to the pure combiner. */
export interface EvidenceParts {
  readonly def: LevelDefinition;
  readonly runs: readonly ArchetypeRun[];
  readonly deaths: readonly DeathEvent[];
  readonly lookbackTicks: number;
  readonly solvability: SolvabilityVerdict;
  readonly softlock: SoftlockVerdict;
  readonly exploit: ExploitVerdict;
  readonly optimization: OptimizationVerdict;
}

/**
 * Freeze the parts into the one immutable EvidenceBundle. Pure: no sims run
 * here. Throws only on a structural contract violation (empty runs) — a
 * programmer error, not untrusted input (untrusted input is parsed upstream).
 */
export function assembleEvidence(parts: EvidenceParts): EvidenceBundle {
  if (parts.runs.length === 0) {
    throw new Error('assembleEvidence: runs must be non-empty (a bundle needs at least one archetype run)');
  }
  if (!Number.isInteger(parts.lookbackTicks) || parts.lookbackTicks < 0) {
    throw new Error(`assembleEvidence: lookbackTicks must be a non-negative integer, got ${parts.lookbackTicks}`);
  }
  return Object.freeze({
    def: parts.def,
    runs: parts.runs,
    deaths: parts.deaths,
    lookbackTicks: parts.lookbackTicks,
    solvability: parts.solvability,
    softlock: parts.softlock,
    exploit: parts.exploit,
    optimization: parts.optimization,
  });
}
