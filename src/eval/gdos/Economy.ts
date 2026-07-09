/**
 * Economy — the Economy of Mechanics metric (P5/S5.1, REQ-042; dm-0034).
 *
 * GDOS alignment: Section 5 (Economy of Mechanics = Depth ÷ Mechanic Count;
 * maximize it; exhaust variations of existing mechanics before introducing a
 * new one).
 *
 * Made computable via the design-space coverage cells (dm-0034): a mechanic's
 * DEPTH is the number of distinct covered cells it participates in — i.e. how
 * many varied contexts (environment × emotion × optimization × player type)
 * the campaign wrings out of it. Economy = totalDistinctCells ÷ mechanicCount.
 * A higher economy means each mechanic yields more design; "exhaust variations
 * before adding a mechanic" becomes the comparison `higherEconomy`.
 *
 * Whitelist math only (÷, comparisons). Lives in src/eval/gdos/.
 */

import type { EntityKind } from '../../components/Behavior';
import type { CoverageMatrix } from './DesignSpace';

export interface EconomyReport {
  /** Distinct mechanics that appear in any covered cell. */
  readonly mechanicCount: number;
  /** Total distinct covered cells (the numerator, "Depth"). */
  readonly totalDepth: number;
  /** Depth ÷ mechanic count. 0 when no mechanics are covered. */
  readonly economy: number;
  /** Per-mechanic depth: distinct cells that mechanic participates in. */
  readonly perMechanic: Readonly<Record<string, number>>;
}

/**
 * Compute Economy of Mechanics from a coverage matrix (REQ-042). Depth is the
 * distinct-cell count; mechanic count is the distinct mechanics those cells
 * span; economy is their ratio (0 when nothing is covered).
 */
export function economyOfMechanics(matrix: CoverageMatrix): EconomyReport {
  const perMechanic: Record<string, number> = {};
  for (const key of matrix.cells) {
    const mechanic = key.slice(0, key.indexOf('|'));
    perMechanic[mechanic] = (perMechanic[mechanic] ?? 0) + 1;
  }
  const mechanicCount = Object.keys(perMechanic).length;
  const totalDepth = matrix.totalCells;
  const economy = mechanicCount === 0 ? 0 : totalDepth / mechanicCount;
  return { mechanicCount, totalDepth, economy, perMechanic };
}

/**
 * The subtraction-minded comparison behind "exhaust variations before adding a
 * mechanic" (REQ-042): given the current design and two candidate directions —
 * one that DEEPENS existing mechanics, one that ADDS a new mechanic — prefer
 * whichever yields the higher Economy of Mechanics. Returns the winning report
 * and which direction it was. Ties favor deepening (fewer mechanics is the
 * subtractive default).
 */
export type EconomyDirection = 'deepen' | 'addMechanic';

export interface EconomyComparison {
  readonly winner: EconomyDirection;
  readonly deepenEconomy: number;
  readonly addMechanicEconomy: number;
}

export function preferByEconomy(deepen: CoverageMatrix, addMechanic: CoverageMatrix): EconomyComparison {
  const d = economyOfMechanics(deepen).economy;
  const a = economyOfMechanics(addMechanic).economy;
  return { winner: a > d ? 'addMechanic' : 'deepen', deepenEconomy: d, addMechanicEconomy: a };
}

/** Which mechanic yields the most design (highest depth) — the one to keep exhausting. */
export function deepestMechanic(report: EconomyReport): EntityKind | undefined {
  let best: string | undefined;
  let bestDepth = -1;
  for (const [mechanic, depth] of Object.entries(report.perMechanic)) {
    if (depth > bestDepth) { bestDepth = depth; best = mechanic; }
  }
  return best as EntityKind | undefined;
}
