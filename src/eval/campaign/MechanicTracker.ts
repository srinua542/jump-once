/**
 * MechanicTracker — REQ-031 mechanicsIntroduced/mechanicsMastered, the
 * REQ-041 P6 share (P6/S6.3, dm-0045/dm-0050).
 *
 * GDOS alignment: Section 5 (the design-space coverage matrix, consumed here
 * as data), Section 4 (macro state variables: mechanics introduced/mastered).
 *
 * Design (dm-0045): `CoverageMatrix` is supplied by the caller — this module
 * never imports or calls `DesignSpace.coverageMatrix()` itself, so the
 * design-space axes never drift between P5's computation and a P6 shadow
 * computation. The caller is expected to pass the CUMULATIVE matrix over
 * every level processed so far in the campaign, so `mechanicsCovered` is
 * already the complete "introduced" picture at each fold step.
 *
 * Design (dm-0050): "mastered" needs a routing-confidence signal, but
 * `LevelRecord` carries only one `ArchetypeRun` (no reliable archetype
 * identity to anchor an "exploration archetype" check against). Instead,
 * `masteryRoutingConfidenceThreshold` gates a real ratio computed purely from
 * `CoverageMatrix.cells`' canonical `"mechanic|environment|emotion|
 * optimizationStyle|playerType"` keys: of a mechanic's distinct exercised
 * cells, the fraction sitting at the top optimization tier (`'worldRecord'`,
 * `OPTIMIZATION_STYLE_AXIS`'s last entry). A mechanic is mastered only when
 * BOTH its knowledge confidence and its top-tier ratio clear their profiled
 * thresholds — pure per-mechanic knowledge cannot substitute for design-space
 * breadth at the top tier, and vice versa.
 *
 * Whitelist math only (counting, division). Pure: returns new sets, never
 * mutates its inputs (dm-0043).
 */

import type { CoverageMatrix } from '../gdos/DesignSpace';
import type { EntityKind } from '../../components/Behavior';
import type { CampaignProfile } from './CampaignProfile';

const TOP_OPTIMIZATION_TIER = 'worldRecord';

export interface MechanicTrackResult {
  readonly mechanicsIntroduced: ReadonlySet<EntityKind>;
  readonly mechanicsMastered: ReadonlySet<EntityKind>;
}

/** Of `mechanic`'s distinct exercised coverage cells, the fraction at the top optimization tier. 0 if the mechanic has no exercised cells. */
function topTierRatio(mechanic: EntityKind, coverageMatrix: CoverageMatrix): number {
  let total = 0;
  let topTier = 0;
  for (const key of coverageMatrix.cells) {
    const mechanicSegment = key.slice(0, key.indexOf('|'));
    if (mechanicSegment !== mechanic) continue;
    total++;
    const optimizationStyleSegment = key.split('|')[3];
    if (optimizationStyleSegment === TOP_OPTIMIZATION_TIER) topTier++;
  }
  return total === 0 ? 0 : topTier / total;
}

/**
 * Introduced: every mechanic the (cumulative) coverage matrix has touched.
 * Mastered: introduced, AND knowledgeState clears masteryConfidenceThreshold,
 * AND the mechanic's top-tier coverage ratio clears masteryRoutingConfidenceThreshold.
 */
export function trackMechanics(
  coverageMatrix: CoverageMatrix,
  knowledgeState: Readonly<Record<string, number>>,
  profile: CampaignProfile,
): MechanicTrackResult {
  const introduced = new Set<EntityKind>(coverageMatrix.mechanicsCovered);
  const mastered = new Set<EntityKind>();
  for (const mechanic of introduced) {
    const confidence = knowledgeState[mechanic] ?? 0;
    if (confidence < profile.mastery.masteryConfidenceThreshold) continue;
    if (topTierRatio(mechanic, coverageMatrix) < profile.mastery.masteryRoutingConfidenceThreshold) continue;
    mastered.add(mechanic);
  }
  return { mechanicsIntroduced: Object.freeze(introduced), mechanicsMastered: Object.freeze(mastered) };
}
