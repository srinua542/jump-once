/**
 * Novelty — the layout-divergence metric (P5/S5.5, REQ-053; dm-0038).
 *
 * GDOS alignment: Section 6 (Novelty Search: algorithmic metric targeting
 * layout divergence — reject levels that repeat what the campaign already
 * has). P7's generator applies it; P5 owns the metric.
 *
 * Corpus-parameterized by construction (P5 plan finding 8): content is
 * hard-gated, so there is NO global level registry — the metric is a pure
 * function (candidate, corpus[]) → divergence, where the corpus is whatever
 * level set the caller legitimately has (unit fixtures now; the campaign
 * at P10).
 *
 * Descriptor (dm-0038 — resolves P5 open question 4):
 *  - mechanicHistogram: fraction of the level's entities per EntityKind, in
 *    ENTITY_KINDS order (fixed length; zeros when entity-free).
 *  - geometrySignature: the tilemap partitioned into a GEOMETRY_BANDS ×
 *    GEOMETRY_BANDS grid of regions; solid-tile fraction per region, row-major
 *    (fixed length; resolution-independent).
 *  - trajectoryShape: the fastest completing run's tape bucketed into
 *    TRAJECTORY_BUCKETS spans — mean moveAxis per span — plus the normalized
 *    first-jump position and hasJump/hasTrajectory flags. Captures HOW the
 *    level is played, not just what it contains.
 * Distance = weighted mean of the three components' normalized Euclidean
 * distances; the weights are ScoringProfile calibration (dm-0031). Divergence
 * of a candidate against a corpus = distance to the NEAREST corpus member
 * (novelty is distance from the closest thing that already exists);
 * null when the corpus is empty — nothing exists to diverge from.
 *
 * PURE gdos module (dm-0037): no sim, no search; reads the bundle only.
 * Whitelist math (sqrt/min/max/floor). Lives in src/eval/gdos/.
 */

import { ENTITY_KINDS } from '../../components/Behavior';
import { TILE_KIND_BY_ID } from '../../components/Tilemap';
import type { EvidenceBundle } from './Evidence';
import type { ScoringProfile } from './Profile';

/** Geometry signature resolution: bands per axis (fixed — part of the descriptor definition, not calibration). */
export const GEOMETRY_BANDS = 4;
/** Trajectory shape resolution: moveAxis buckets (fixed — descriptor definition). */
export const TRAJECTORY_BUCKETS = 8;

/** A level's fixed-length novelty descriptor. All components in [-1, 1]. */
export interface NoveltyDescriptor {
  /** Entity-kind fractions in ENTITY_KINDS order; sums to 1 (or all 0 when entity-free). */
  readonly mechanicHistogram: readonly number[];
  /** Solid-tile fraction per GEOMETRY_BANDS×GEOMETRY_BANDS region, row-major. */
  readonly geometrySignature: readonly number[];
  /** [TRAJECTORY_BUCKETS mean moveAxis values, firstJumpPosition (0..1), hasJump (0/1), hasTrajectory (0/1)]. */
  readonly trajectoryShape: readonly number[];
}

/** The fastest completing run's tape frames, or null if nothing completed. */
function fastestCompletionFrames(bundle: EvidenceBundle): readonly { moveAxis: number; jumpPressed: boolean }[] | null {
  let best: EvidenceBundle['runs'][number] | null = null;
  for (const r of bundle.runs) {
    if (r.outcome !== 'completed') continue;
    if (best === null || r.ticksElapsed < best.ticksElapsed) best = r;
  }
  return best === null ? null : best.tape.frames;
}

/** Build a level's novelty descriptor from its evidence. Pure. */
export function buildDescriptor(bundle: EvidenceBundle): NoveltyDescriptor {
  // Mechanic histogram.
  const counts = new Map<string, number>();
  for (const e of bundle.def.entities) counts.set(e.behavior.kind, (counts.get(e.behavior.kind) ?? 0) + 1);
  const total = bundle.def.entities.length;
  const mechanicHistogram = ENTITY_KINDS.map((k) => (total === 0 ? 0 : (counts.get(k) ?? 0) / total));

  // Geometry signature: solid fraction per region.
  const { width, height, tiles } = bundle.def.tilemap;
  const solidCount = new Array<number>(GEOMETRY_BANDS * GEOMETRY_BANDS).fill(0);
  const cellCount = new Array<number>(GEOMETRY_BANDS * GEOMETRY_BANDS).fill(0);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const bx = Math.min(GEOMETRY_BANDS - 1, Math.floor((col * GEOMETRY_BANDS) / width));
      const by = Math.min(GEOMETRY_BANDS - 1, Math.floor((row * GEOMETRY_BANDS) / height));
      const region = by * GEOMETRY_BANDS + bx;
      cellCount[region]++;
      if (TILE_KIND_BY_ID[tiles[row * width + col]] === 'solid') solidCount[region]++;
    }
  }
  const geometrySignature = solidCount.map((s, i) => (cellCount[i] === 0 ? 0 : s / cellCount[i]));

  // Trajectory shape from the fastest completion.
  const frames = fastestCompletionFrames(bundle);
  const trajectoryShape: number[] = [];
  if (frames === null || frames.length === 0) {
    for (let i = 0; i < TRAJECTORY_BUCKETS; i++) trajectoryShape.push(0);
    trajectoryShape.push(0, 0, 0); // jumpPos, hasJump, hasTrajectory
  } else {
    for (let b = 0; b < TRAJECTORY_BUCKETS; b++) {
      const start = Math.floor((b * frames.length) / TRAJECTORY_BUCKETS);
      const end = Math.max(start + 1, Math.floor(((b + 1) * frames.length) / TRAJECTORY_BUCKETS));
      let sum = 0;
      for (let i = start; i < end && i < frames.length; i++) sum += frames[i].moveAxis;
      trajectoryShape.push(sum / Math.max(1, Math.min(end, frames.length) - start));
    }
    let jumpIndex = -1;
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].jumpPressed) { jumpIndex = i; break; }
    }
    trajectoryShape.push(jumpIndex < 0 ? 0 : jumpIndex / frames.length);
    trajectoryShape.push(jumpIndex < 0 ? 0 : 1);
    trajectoryShape.push(1);
  }

  return { mechanicHistogram, geometrySignature, trajectoryShape };
}

/** Normalized Euclidean distance between two equal-length vectors (÷ by length so components stay comparable). */
function vectorDistance(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum / a.length);
}

/** Weighted descriptor distance under the profile's novelty weights (dm-0031: calibration is data). */
export function descriptorDistance(a: NoveltyDescriptor, b: NoveltyDescriptor, profile: ScoringProfile): number {
  const w = profile.novelty;
  const total = w.histogramWeight + w.geometryWeight + w.trajectoryWeight;
  return (
    (w.histogramWeight * vectorDistance(a.mechanicHistogram, b.mechanicHistogram) +
      w.geometryWeight * vectorDistance(a.geometrySignature, b.geometrySignature) +
      w.trajectoryWeight * vectorDistance(a.trajectoryShape, b.trajectoryShape)) /
    total
  );
}

export interface NoveltyResult {
  /** Distance to the nearest corpus member; null when the corpus is empty. */
  readonly divergence: number | null;
  /** Index of the nearest corpus member (-1 when the corpus is empty). */
  readonly nearestIndex: number;
}

/** Novelty of a candidate against a corpus: distance to the nearest existing descriptor. */
export function noveltyDivergence(
  candidate: NoveltyDescriptor,
  corpus: readonly NoveltyDescriptor[],
  profile: ScoringProfile,
): NoveltyResult {
  if (corpus.length === 0) return { divergence: null, nearestIndex: -1 };
  let best = Number.POSITIVE_INFINITY;
  let nearestIndex = -1;
  for (let i = 0; i < corpus.length; i++) {
    const d = descriptorDistance(candidate, corpus[i], profile);
    if (d < best) { best = d; nearestIndex = i; }
  }
  return { divergence: best, nearestIndex };
}
