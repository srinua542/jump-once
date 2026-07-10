/**
 * TapeAnalyzer — derives REQ-032 Player Behavior Model signals from one
 * archetype run (P6/S6.2, dm-0043/dm-0044/dm-0049).
 *
 * GDOS alignment: Section 4 (Player Behavior Model).
 *
 * Design (dm-0043): every signal comes from `run.tape.frames` — frame counts
 * and frame indices only, never wall-clock. Design (dm-0044): `analyzeTape`
 * depends only on `ArchetypeRun`, the P4 harness's own output record — never
 * on P8 telemetry, so P8 can later supply an alternative BehaviorSignals
 * source of the identical shape without touching this module. Design
 * (dm-0049): `platformCheckCount` is an input-pattern proxy (a direction
 * reversal with no jump inside the profiled window) — it never touches level
 * geometry, so this file has no dependency on `LevelDefinition`.
 *
 * `jumpPressed`/`resetPressed` are edge-triggered per InputFrame's own
 * contract ("true only on the frame newly pressed"); this file treats a
 * `moveAxis` change the same way — a "movement edge" — for panic-burst and
 * platform-check detection, so holding a direction for many frames is not
 * itself counted as repeated input.
 *
 * Whitelist math only (no arithmetic beyond counting here). Imports only
 * `ArchetypeRun` (P4/P5 output) and `CampaignProfile` (P6 calibration) as
 * types/values — no sim, no harness, no search (dm-0047).
 */

import type { ArchetypeRun } from '../gdos/Evidence';
import type { InputFrame } from '../../core/State';
import type { BehaviorSignals } from './CampaignState';
import type { CampaignProfile } from './CampaignProfile';

/** True at frame i iff this frame is a "movement edge": moveAxis differs from the previous frame's (or is the first nonzero moveAxis). */
function isMovementEdge(frames: readonly InputFrame[], i: number): boolean {
  const prev = i === 0 ? 0 : frames[i - 1].moveAxis;
  return frames[i].moveAxis !== prev;
}

/** True at frame i iff this frame carries any active input edge: a jump press, a reset press, or a movement edge. */
function isActiveInputEdge(frames: readonly InputFrame[], i: number): boolean {
  return frames[i].jumpPressed || frames[i].resetPressed || isMovementEdge(frames, i);
}

/**
 * Longest run of consecutive no-input frames immediately before a jump-press
 * edge, maximized across every jump edge in the tape, counting only gaps that
 * clear `threshold` (a brief reaction-time pause is not hesitation). 0 if no
 * jump edge has a qualifying gap, or the tape never jumps.
 */
function hesitationFrames(frames: readonly InputFrame[], threshold: number): number {
  let longest = 0;
  for (let i = 0; i < frames.length; i++) {
    if (!frames[i].jumpPressed) continue;
    let gap = 0;
    for (let j = i - 1; j >= 0 && frames[j].moveAxis === 0 && !frames[j].jumpPressed && !frames[j].resetPressed; j--) gap++;
    if (gap >= threshold && gap > longest) longest = gap;
  }
  return longest;
}

/** Frame index of the first jump-press edge; undefined if the tape never jumps. */
function commitmentSpeed(frames: readonly InputFrame[]): number | undefined {
  for (let i = 0; i < frames.length; i++) if (frames[i].jumpPressed) return i;
  return undefined;
}

/**
 * Count of non-overlapping windows of `windowFrames` consecutive frames that
 * contain at least `inputCount` active-input edges. Greedy left-to-right: once
 * a burst window is claimed, scanning resumes after it, so one cluster of
 * rapid inputs is counted once, not once per starting offset within it.
 */
function panicBurstCount(frames: readonly InputFrame[], windowFrames: number, inputCount: number): number {
  let bursts = 0;
  let i = 0;
  while (i < frames.length) {
    let edges = 0;
    const end = Math.min(i + windowFrames, frames.length);
    for (let j = i; j < end; j++) if (isActiveInputEdge(frames, j)) edges++;
    if (edges >= inputCount) {
      bursts++;
      i += windowFrames;
    } else {
      i++;
    }
  }
  return bursts;
}

/**
 * Count of moveAxis direction reversals (a new nonzero direction differing
 * from the last nonzero direction) that have no jump-press edge within the
 * following `windowFrames` frames — "the player backed off instead of
 * committing to a jump" (dm-0049).
 */
function platformCheckCount(frames: readonly InputFrame[], windowFrames: number): number {
  let checks = 0;
  let lastNonzero: -1 | 1 | 0 = 0;
  for (let i = 0; i < frames.length; i++) {
    const dir = frames[i].moveAxis;
    if (dir !== 0 && lastNonzero !== 0 && dir !== lastNonzero) {
      let jumped = false;
      const end = Math.min(i + windowFrames, frames.length);
      for (let j = i; j < end; j++) if (frames[j].jumpPressed) { jumped = true; break; }
      if (!jumped) checks++;
    }
    if (dir !== 0) lastNonzero = dir;
  }
  return checks;
}

/**
 * Derive one run's BehaviorSignals purely from its ArchetypeRun (dm-0044):
 * retryCount and dropOffRate read the harness-authoritative `attempts`/
 * `outcome` fields directly (never re-derived from raw frames, dm-0049);
 * every other signal is computed from `run.tape.frames`.
 */
export function analyzeTape(run: ArchetypeRun, profile: CampaignProfile): BehaviorSignals {
  const frames = run.tape.frames;
  return {
    hesitationFrames: hesitationFrames(frames, profile.behavior.hesitationFrameThreshold),
    retryCount: run.attempts,
    panicBurstCount: panicBurstCount(frames, profile.behavior.panicBurstWindowFrames, profile.behavior.panicBurstInputCount),
    commitmentSpeed: commitmentSpeed(frames),
    platformCheckCount: platformCheckCount(frames, profile.behavior.platformCheckWindowFrames),
    dropOffRate: run.outcome === 'timeout' ? 1 : 0,
  };
}
