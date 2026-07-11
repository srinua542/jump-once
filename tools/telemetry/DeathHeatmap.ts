/**
 * DeathHeatmap — REQ-133 (part 2): death-coordinate heatmaps by deterministic
 * replay, and the telemetry→ArchetypeRun adapter that feeds live captures into
 * the existing Campaign Intelligence (REQ-032 P8 share).
 *
 * Design (docs/execution_plan.md §P8, design summary point 7; dm-0068/dm-0069):
 *  - `deriveDeathHeatmap` RECOVERS death coordinates by replaying each captured
 *    record through the existing, verified `replayObserved` (P4/AgentHarness —
 *    the same CANONICAL_PIPELINE drive, a public seam) and sampling the player
 *    position at every tick the run is `defeated`. No live position stream is
 *    logged (dm-0068): the P1 replay guarantee is the single source of truth,
 *    so there is no second, unverified path to diverge from it. Positions bin
 *    by `floor(pos / binWorldSize)` from the calibrated TelemetryProfile — zero
 *    numeric literals.
 *  - `toArchetypeRun` is the dm-0044 substitution point: it adapts a live
 *    `TelemetryRecord` into the `ArchetypeRun` shape `analyzeTape` and
 *    `processCampaign` already consume, by supplying only the archetype LABEL a
 *    live human capture lacks. This is the entire REQ-032 P8 share — no new
 *    behavior-signal or spike-detection logic; difficulty-spike detection stays
 *    P6's `processCampaign` (dm-0069), fed by these adapted runs.
 *
 * tools/ isolation (dm-0066): reaches src/eval/ only through the AgentHarness
 * public seam (`replayObserved`) — never an eval/local or eval/gdos internal.
 * No rendering, no wall clock.
 */

import type { LevelDefinition } from '../../src/components/Level';
import type { ArchetypeName } from '../../src/eval/Archetypes';
import type { ArchetypeRun } from '../../src/eval/gdos/Evidence';
import { replayObserved } from '../../src/eval/AgentHarness';
import type { TelemetryRecord } from './Capture';
import type { TelemetryProfile } from './TelemetryProfile';

/**
 * Adapt a live telemetry record into the ArchetypeRun `analyzeTape`/
 * `processCampaign` consume (dm-0044). The caller supplies the archetype label
 * a human capture has no intrinsic value for; every other field is the
 * captured record's own.
 */
export function toArchetypeRun(record: TelemetryRecord, archetype: ArchetypeName): ArchetypeRun {
  return {
    archetype,
    outcome: record.outcome,
    attempts: record.attempts,
    ticksElapsed: record.ticksElapsed,
    tape: record.tape,
  };
}

/** One heatmap bin: how many deaths fell in the cell at (binX, binY). */
export interface HeatmapCell {
  readonly binX: number;
  readonly binY: number;
  readonly deaths: number;
}

export interface HeatmapReport {
  /** The bin edge length used, echoed from the profile for provenance. */
  readonly binWorldSize: number;
  readonly totalDeaths: number;
  /** Cells with ≥1 death, sorted by (binY, binX) for deterministic output. */
  readonly cells: readonly HeatmapCell[];
}

/**
 * Replay each captured record through the verified engine and bin every
 * `defeated`-tick player position into a heatmap. Records for other levels are
 * ignored (a heatmap is per-level); all `records` are expected to target `def`.
 */
export function deriveDeathHeatmap(
  def: LevelDefinition,
  records: readonly TelemetryRecord[],
  profile: TelemetryProfile,
): HeatmapReport {
  const binWorldSize = profile.heatmap.binWorldSize;
  const tally = new Map<string, HeatmapCell>();
  let totalDeaths = 0;

  for (const record of records) {
    if (record.levelId !== def.levelId) continue;
    const observations = replayObserved(def, record.seed, record.tape.frames);
    for (const obs of observations) {
      if (obs.runState !== 'defeated') continue;
      totalDeaths += 1;
      const binX = Math.floor(obs.playerPosition.x / binWorldSize);
      const binY = Math.floor(obs.playerPosition.y / binWorldSize);
      const key = `${binX}|${binY}`;
      const prior = tally.get(key);
      tally.set(key, { binX, binY, deaths: (prior?.deaths ?? 0) + 1 });
    }
  }

  const cells = [...tally.values()].sort((a, b) => (a.binY - b.binY) || (a.binX - b.binX));
  return { binWorldSize, totalDeaths, cells };
}
