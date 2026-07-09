/**
 * Streamability — the global Streamability Matrix quality gate (P5/S5.3,
 * REQ-056).
 *
 * GDOS alignment: Section 6 (Streamability Matrix gates: Shareability ≥85,
 * Clip Potential ≥90, Reaction Density ≥95, Replay Value ≥90).
 *
 * Honest proxies over the EvidenceBundle; all coefficients/weights from the
 * profile (dm-0031, no calibration literals here):
 *   - Reaction Density ≈ reaction-worthy events per second over a
 *     representative clear: (total deaths + lethal hazards + kinetic elements)
 *     ÷ clear duration, against the profile reference rate.
 *   - Clip Potential ≈ the delivered Surprise (reused from the emotional gate —
 *     one proxy, no divergence) weighted with the count of kinetic elements
 *     that make a clip pop.
 *   - Replay Value ≈ the optimization delta (room to improve) plus route
 *     multiplicity (distinct archetype clear times).
 *   - Shareability ≈ the profile-weighted composite of the other three.
 *
 * Whitelist math only; deterministic; pure over the bundle. src/eval/gdos/.
 */

import { FIXED_STEP_SECONDS } from '../../core/Clock';
import { COLLISION_CLASS_BY_KIND } from '../../components/CollisionClass';
import type { EntityKind } from '../../components/Behavior';
import type { EvidenceBundle } from './Evidence';
import type { ScoringProfile } from './Profile';
import { clamp100 } from './Score';
import { computeEmotionalScores } from './Emotional';
import { gateResult, metricScore, type DesignDecision, type GateResult, type MetricScore } from './Report';

const GATE = 'streamability';

/** Kinds whose motion/impulse makes a moment clip-worthy. */
const KINETIC_KINDS: ReadonlySet<EntityKind> = new Set<EntityKind>([
  'spring', 'gravityZone', 'conveyor', 'movingPlatform', 'movingHazard',
]);

function countBy(bundle: EvidenceBundle, pred: (k: EntityKind) => boolean): number {
  let n = 0;
  for (const e of bundle.def.entities) if (pred(e.behavior.kind)) n++;
  return n;
}

function totalDeaths(bundle: EvidenceBundle): number {
  let n = 0;
  for (const r of bundle.runs) n += r.attempts;
  return n;
}

/** Fastest completing run's ticks; if none complete, the longest run (guards against 0). */
function representativeTicks(bundle: EvidenceBundle): number {
  let fastest: number | null = null;
  let longest = 0;
  for (const r of bundle.runs) {
    if (r.ticksElapsed > longest) longest = r.ticksElapsed;
    if (r.outcome === 'completed' && (fastest === null || r.ticksElapsed < fastest)) fastest = r.ticksElapsed;
  }
  return fastest ?? longest;
}

/** Distinct archetype clear times (route multiplicity). */
function distinctRoutes(bundle: EvidenceBundle): number {
  const times = new Set<number>();
  for (const r of bundle.runs) if (r.outcome === 'completed') times.add(r.ticksElapsed);
  return times.size;
}

function reactionDensityScore(bundle: EvidenceBundle, profile: ScoringProfile, kineticCount: number, hazardCount: number): number {
  const ticks = representativeTicks(bundle);
  const durationSeconds = ticks * FIXED_STEP_SECONDS;
  if (durationSeconds <= 0) return 0;
  const events = totalDeaths(bundle) + hazardCount + kineticCount;
  const density = events / durationSeconds;
  return clamp100((density / profile.streamability.reactionEventReferencePerSecond) * 100);
}

function clipPotentialScore(bundle: EvidenceBundle, profile: ScoringProfile, kineticCount: number): number {
  const surprise = computeEmotionalScores(bundle, profile).surprise;
  return clamp100(profile.streamability.clipSurpriseGain * surprise + profile.streamability.clipKineticGain * kineticCount);
}

function replayValueScore(bundle: EvidenceBundle, profile: ScoringProfile): number {
  const delta = bundle.optimization.applicable && bundle.optimization.deltaSeconds !== undefined ? bundle.optimization.deltaSeconds : 0;
  const routes = distinctRoutes(bundle);
  return clamp100(profile.streamability.replayDeltaGain * delta + profile.streamability.replayRouteGain * routes);
}

function shareabilityScore(profile: ScoringProfile, reaction: number, clip: number, replay: number): number {
  const w = profile.streamability.shareWeights;
  const total = w.reaction + w.clip + w.replay;
  if (total <= 0) return 0;
  return clamp100((w.reaction * reaction + w.clip * clip + w.replay * replay) / total);
}

/** Score a level against the four streamability thresholds (REQ-056). */
export function scoreStreamability(bundle: EvidenceBundle, profile: ScoringProfile): GateResult {
  const kineticCount = countBy(bundle, (k) => KINETIC_KINDS.has(k));
  const hazardCount = countBy(bundle, (k) => COLLISION_CLASS_BY_KIND[k] === 'lethal');

  const reaction = reactionDensityScore(bundle, profile, kineticCount, hazardCount);
  const clip = clipPotentialScore(bundle, profile, kineticCount);
  const replay = replayValueScore(bundle, profile);
  const share = shareabilityScore(profile, reaction, clip, replay);

  const t = profile.streamability.thresholds;
  const scores: MetricScore[] = [
    metricScore('shareability', share, t.shareability),
    metricScore('clipPotential', clip, t.clipPotential),
    metricScore('reactionDensity', reaction, t.reactionDensity),
    metricScore('replayValue', replay, t.replayValue),
  ];

  const findings: string[] = [];
  for (const s of scores) if (!s.pass) findings.push(`${s.metric} ${s.score.toFixed(1)} below threshold ${s.threshold}`);

  const pass = scores.every((s) => s.pass);
  const decision: DesignDecision = {
    source: GATE,
    subject: bundle.def.levelId,
    verdict: pass ? 'pass' : 'fail',
    summary: pass
      ? 'streamability matrix satisfied'
      : `streamability unmet: ${scores.filter((s) => !s.pass).map((s) => s.metric).join(', ')}`,
    findings,
  };
  return gateResult(GATE, scores, findings, [decision]);
}
