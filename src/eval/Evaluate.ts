/**
 * Evaluate — the end-to-end P5 seam: run the P4 audits + archetypes ONCE,
 * assemble the EvidenceBundle, and judge the level (P5/S5.1).
 *
 * GDOS alignment: Section 6/7/15 — this is the single entry point the P10
 * pipeline calls to get a level's GdosReport. It is the ONLY place that both
 * runs the local audits and touches the gdos scoring engine, which is exactly
 * why it lives at the top level of src/eval/ and NOT under src/eval/gdos/:
 * gdos stays free of audit-function imports (dm-0031, scan-enforced), so the
 * gates provably consume verdicts as data rather than re-deriving them.
 *
 * Determinism: the archetype runs and the death-observation replays share the
 * run seed; the audits use their own default options (their own seeds). No
 * Math.random, whitelist math only (a squared-distance killer attribution).
 */

import { FIXED_STEP_SECONDS } from '../core/Clock';
import type { Vec2 } from '../core/Vec2';
import type { LevelDefinition } from '../components/Level';
import type { EntityKind } from '../components/Behavior';
import { ARCHETYPES, archetypePolicy, type ArchetypeName } from './Archetypes';
import {
  DEFAULT_EVAL_BUDGET,
  runAgent,
  replayObserved,
  type EvalBudget,
  type TickObservation,
} from './AgentHarness';
import { auditSolvability } from './local/Solvability';
import { detectSoftlock } from './local/Softlock';
import { auditExploit } from './local/Exploit';
import { computeOptimizationWindow } from './local/Optimization';
import { assembleEvidence, type ArchetypeRun, type DeathEvent, type EvidenceBundle } from './gdos/Evidence';
import { DEFAULT_PROFILE, type ScoringProfile } from './gdos/Profile';
import { judgeLevel } from './gdos/Judge';
import type { GdosReport } from './gdos/Report';

/** Fixed archetype order for deterministic evidence assembly. */
const ARCHETYPE_ORDER: readonly ArchetypeName[] = ['firstTime', 'cautious', 'experienced', 'expertSpeedrunner', 'curiousExplorer'];

export interface EvaluateOptions {
  /** Seed for the archetype runs and their death-observation replays. */
  readonly seed: number;
  /** The scoring profile (also supplies the fairness lookback + radius). */
  readonly profile: ScoringProfile;
  /** Per-archetype run budget. */
  readonly agentBudget: EvalBudget;
}

export const DEFAULT_EVALUATE_OPTIONS: EvaluateOptions = Object.freeze({
  seed: 1,
  profile: DEFAULT_PROFILE,
  agentBudget: DEFAULT_EVAL_BUDGET,
});

function sqDist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

interface Killer {
  readonly id: string;
  readonly kind: EntityKind;
  readonly position: Vec2;
}

/** Nearest lethal entity to the player within the radius, or undefined (a fall). */
function nearestKiller(playerPos: Vec2, obs: TickObservation, maxDistSq: number): Killer | undefined {
  let best: Killer | undefined;
  let bestSq = maxDistSq;
  for (const l of obs.lethals) {
    const d = sqDist(playerPos, l.position);
    if (d <= bestSq) { bestSq = d; best = { id: l.id, kind: l.kind, position: l.position }; }
  }
  return best;
}

/**
 * Extract death events from one archetype's observed replay. A death is a tick
 * whose runState is 'defeated'; the killer is the nearest lethal within the
 * fairness radius; lookback positions come from `lookbackTicks` earlier, never
 * crossing the reload that started the current life.
 */
function extractDeaths(
  observations: readonly TickObservation[],
  lookbackTicks: number,
  radiusWorld: number,
): DeathEvent[] {
  const radiusSq = radiusWorld * radiusWorld;
  const deaths: DeathEvent[] = [];
  let lifeStartIndex = 0;
  for (let j = 0; j < observations.length; j++) {
    const o = observations[j];
    if (o.runState !== 'defeated') continue;
    const killer = nearestKiller(o.playerPosition, o, radiusSq);
    const lbIndex = Math.max(lifeStartIndex, j - lookbackTicks);
    const lb = observations[lbIndex];
    let killerPositionAtLookback: Vec2 | undefined;
    if (killer !== undefined) {
      for (const l of lb.lethals) if (l.id === killer.id) killerPositionAtLookback = l.position;
    }
    deaths.push({
      tick: o.tick,
      playerPosition: o.playerPosition,
      killerId: killer?.id,
      killerKind: killer?.kind,
      playerPositionAtLookback: lb.playerPosition,
      killerPositionAtLookback,
    });
    lifeStartIndex = j + 1; // the next observation begins a fresh life
  }
  return deaths;
}

/**
 * Assemble a level's full EvidenceBundle: run every archetype, run the four
 * local audits, and observe deaths for the fairness check. This is the only
 * function that runs the audits; the gdos gates consume the result as data.
 */
export function assembleLevelEvidence(def: LevelDefinition, options: EvaluateOptions = DEFAULT_EVALUATE_OPTIONS): EvidenceBundle {
  const lookbackTicks = options.profile.infoDensity.fairnessLookbackTicks;
  const radiusWorld = options.profile.infoDensity.fairnessRadiusTiles * def.tilemap.tileSize;

  const runs: ArchetypeRun[] = [];
  const deaths: DeathEvent[] = [];
  for (const name of ARCHETYPE_ORDER) {
    const result = runAgent(def, options.seed, archetypePolicy(ARCHETYPES[name]), options.agentBudget);
    runs.push({
      archetype: name,
      outcome: result.outcome,
      attempts: result.attempts,
      ticksElapsed: result.ticksElapsed,
      tape: result.tape,
    });
    const observations = replayObserved(def, options.seed, result.tape.frames);
    for (const d of extractDeaths(observations, lookbackTicks, radiusWorld)) deaths.push(d);
  }

  return assembleEvidence({
    def,
    runs,
    deaths,
    lookbackTicks,
    solvability: auditSolvability(def),
    softlock: detectSoftlock(def),
    exploit: auditExploit(def),
    optimization: computeOptimizationWindow(def),
  });
}

/** Full P10 seam: assemble evidence and judge the level in one call. */
export function evaluateLevel(def: LevelDefinition, options: EvaluateOptions = DEFAULT_EVALUATE_OPTIONS): { evidence: EvidenceBundle; report: GdosReport } {
  const evidence = assembleLevelEvidence(def, options);
  const report = judgeLevel(evidence, options.profile);
  return { evidence, report };
}

/** Seconds a tick count represents (re-exported for callers building fixtures). */
export const TICK_SECONDS = FIXED_STEP_SECONDS;
