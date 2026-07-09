/**
 * Judge — judgeLevel, the single seam the P10 pipeline reads (P5, dm-0031).
 *
 * GDOS alignment: Section 6/7 — one call turns an assembled EvidenceBundle
 * into a full GdosReport (every gate's scores + verdicts + emitted decisions)
 * under a given ScoringProfile. Pure over the bundle; runs no sims and no
 * audits (evidence arrives assembled).
 *
 * As S5.5–S5.8 land, their gates/curation are appended here; today it runs the
 * emotional (S5.2), streamability (S5.3), and info-density (S5.4) gates.
 *
 * Whitelist math only (none here). Lives in src/eval/gdos/.
 */

import type { EvidenceBundle } from './Evidence';
import { DEFAULT_PROFILE, type ScoringProfile } from './Profile';
import { gdosReport, type GdosReport } from './Report';
import { scoreEmotional } from './Emotional';
import { scoreStreamability } from './Streamability';
import { scoreInfoDensity } from './InfoDensity';

/** Produce a level's full GDOS report from its evidence under a profile. */
export function judgeLevel(bundle: EvidenceBundle, profile: ScoringProfile = DEFAULT_PROFILE): GdosReport {
  const gates = [
    scoreEmotional(bundle, profile),
    scoreStreamability(bundle, profile),
    scoreInfoDensity(bundle, profile),
  ];
  return gdosReport(bundle.def.levelId, profile.profileId, gates);
}
