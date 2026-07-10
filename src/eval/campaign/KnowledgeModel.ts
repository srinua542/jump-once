/**
 * KnowledgeModel — per-mechanic knowledge confidence, the `knowledgeState`
 * REQ-031 macro variable (P6/S6.3, dm-0050).
 *
 * GDOS alignment: Section 4 (macro state variable: knowledge).
 *
 * Design (dm-0050): confidence moves toward a pass/fail target by an EMA
 * (the same technique as ChapterHealthProfile's rolling baseline, dm-0048,
 * applied one layer down): a level that both passed its GDOS gates and was
 * completed (not timed out) pulls every mechanic it exercises toward 1;
 * anything else pulls toward 0. The rate is `profile.mastery.
 * knowledgeLearningRate`, never a literal (dm-0031's zero-calibration-
 * literals discipline, carried into P6 by dm-0045).
 *
 * Pure: returns a new record, never mutates `knowledgeState` (dm-0043).
 */

import type { LevelRecord } from './CampaignState';
import type { CampaignProfile } from './CampaignProfile';

/**
 * Update per-mechanic confidence from one level record. Only mechanics in
 * `record.mechanicsExercised` move; every other key is carried over unchanged.
 */
export function updateKnowledge(
  knowledgeState: Readonly<Record<string, number>>,
  record: LevelRecord,
  profile: CampaignProfile,
): Readonly<Record<string, number>> {
  const target = record.report.pass && record.run.outcome === 'completed' ? 1 : 0;
  const rate = profile.mastery.knowledgeLearningRate;
  const next: Record<string, number> = { ...knowledgeState };
  for (const mechanic of record.mechanicsExercised) {
    const current = next[mechanic] ?? 0;
    next[mechanic] = current + rate * (target - current);
  }
  return Object.freeze(next);
}
