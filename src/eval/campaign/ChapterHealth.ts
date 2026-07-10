/**
 * ChapterHealth — REQ-142 P6 share: elevating a chapter's four macro
 * criteria to a running campaign trajectory (P6/S6.4, dm-0046/dm-0051).
 *
 * GDOS alignment: Section 15 (the macro curriculum criteria, computed here as
 * a per-chapter TREND rather than a one-shot verdict).
 *
 * Design (dm-0046): the four criteria (cognitiveStructuralMapping,
 * crossChapterDegradation, curiosityProgression, graduationAssessment) plus
 * chapterHealthy come straight from `MacroVerdict` — P4's own macro-curriculum
 * pass already computed them correctly for this chapter; this module never
 * re-derives them from raw level records (dm-0046: consume P4 output as data).
 *
 * Design (dm-0051): `score` is a STRUCTURAL aggregation — MacroVerdict always
 * has exactly five boolean components by its own type shape, so counting how
 * many pass needs no calibration weight. `trend` DOES need calibration (how
 * much score movement counts as a genuine trend vs. noise), so it reads
 * `profile.chapterHealthCalibration.trendFlatTolerance`. `alerts` is always
 * `[]` here — spike detection needs the rolling EMA baseline across every
 * chapter processed so far, which only `CampaignDirector` (S6.5) accumulates;
 * ChapterHealth reports one chapter's own score and trend, nothing more.
 *
 * Whitelist math only (`Math.abs`, comparisons, +, ÷). Pure: returns a new
 * record, touches nothing external (dm-0043).
 */

import type { MacroVerdict } from '../macro/Curriculum';
import type { CampaignProfile } from './CampaignProfile';
import type { ChapterHealthReport, TrendDirection } from './CampaignState';

/** Count of {chapterHealthy, the four criteria} that pass, out of 5, as a percentage. */
function chapterScore(macroVerdict: MacroVerdict): number {
  const components = [
    macroVerdict.chapterHealthy,
    macroVerdict.cognitiveStructuralMapping.pass,
    macroVerdict.crossChapterDegradation.pass,
    macroVerdict.curiosityProgression.pass,
    macroVerdict.graduationAssessment.pass,
  ];
  const passing = components.filter((c) => c).length;
  return (passing / components.length) * 100;
}

/** Rising if `current` clears `prior` by more than `tolerance`, falling if it drops by more, flat otherwise (or if there is no prior chapter). */
function computeTrend(current: number, prior: number | undefined, tolerance: number): TrendDirection {
  if (prior === undefined) return 'flat';
  const delta = current - prior;
  if (Math.abs(delta) <= tolerance) return 'flat';
  return delta > 0 ? 'rising' : 'falling';
}

/**
 * Elevate one chapter's MacroVerdict to a ChapterHealthReport, trended
 * against the prior chapter's report (undefined for the campaign's first
 * chapter — trend reports 'flat').
 */
export function aggregateChapterHealth(
  macroVerdict: MacroVerdict,
  priorChapterHealth: ChapterHealthReport | undefined,
  profile: CampaignProfile,
): ChapterHealthReport {
  const score = chapterScore(macroVerdict);
  return {
    score,
    cognitiveStructuralMapping: macroVerdict.cognitiveStructuralMapping,
    crossChapterDegradation: macroVerdict.crossChapterDegradation,
    curiosityProgression: macroVerdict.curiosityProgression,
    graduationAssessment: macroVerdict.graduationAssessment,
    trend: computeTrend(score, priorChapterHealth?.score, profile.chapterHealthCalibration.trendFlatTolerance),
    alerts: [],
  };
}
