/**
 * GdosFixtures — hand-built EvidenceBundles + verdicts for the P5 gate tests
 * (S5.1–S5.4). Not a test file.
 *
 * The whole point of the EvidenceBundle seam (dm-0031) is that gates are pure
 * functions of assembled evidence, so these fixtures build bundles directly —
 * no sim runs — with exactly the evidence a case needs. A few end-to-end tests
 * (GdosEvaluate) prove the real assembler path separately.
 *
 * Every level is minted through the REAL parseLevel gate, so gates see exactly
 * the shape production levels have. All fixtures are unit scaffolding, not
 * campaign content (the M2 gate is unaffected).
 */

import type { LevelDefinition } from '../../src/components/Level';
import type { EmotionalKeyframe } from '../../src/components/Gdos';
import { parseLevel } from '../../src/schema/Parse';
import { TAPE_SCHEMA_VERSION, type ReplayTape } from '../../src/schema/TapeIO';
import type { ArchetypeName } from '../../src/eval/Archetypes';
import type { SolvabilityVerdict } from '../../src/eval/local/Solvability';
import type { SoftlockVerdict } from '../../src/eval/local/Softlock';
import type { ExploitVerdict } from '../../src/eval/local/Exploit';
import type { OptimizationVerdict, TierTimes } from '../../src/eval/local/Optimization';
import { assembleEvidence, type ArchetypeRun, type DeathEvent, type EvidenceBundle } from '../../src/eval/gdos/Evidence';
import { DEFAULT_PROFILE, type EmotionalThresholds, type InfoDensityProfile, type ScoringProfile, type StreamabilityThresholds } from '../../src/eval/gdos/Profile';

export interface FixtureEntity {
  readonly kind: string;
  readonly x: number;
  readonly y: number;
}

const DEFAULT_CURVE: readonly EmotionalKeyframe[] = [
  { at: 0, curiosity: 60, confidence: 70, surprise: 40, mastery: 10 },
  { at: 1, curiosity: 50, confidence: 60, surprise: 95, mastery: 90 },
];

function behaviorFor(kind: string): Record<string, unknown> {
  switch (kind) {
    case 'spike':
    case 'iceSurface':
    case 'pressurePlate':
    case 'proximityZone':
      return { kind };
    case 'spring':
      return { kind, launchVelocity: { x: 0, y: -12 } };
    case 'conveyor':
      return { kind, surfaceVelocityX: 3 };
    case 'gravityZone':
      return { kind, gravityScale: -1 };
    case 'collapsingFloor':
      return { kind, collapseDelaySeconds: 0.5 };
    case 'movingHazard':
      return { kind, waypoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }], speed: 2, mode: 'looping' };
    case 'movingPlatform':
      return { kind, waypoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }], speed: 2, mode: 'looping' };
    case 'door':
      return { kind, initiallyOpen: false };
    default:
      throw new Error(`GdosFixtures: unsupported entity kind "${kind}"`);
  }
}

export interface LevelOpts {
  readonly id?: string;
  readonly width?: number;
  readonly height?: number;
  readonly entities?: readonly FixtureEntity[];
  readonly curve?: readonly EmotionalKeyframe[];
}

/** Build a validated LevelDefinition with arbitrary entities + emotional curve. */
export function makeLevel(opts: LevelOpts = {}): LevelDefinition {
  const id = opts.id ?? 'gdos-fixture';
  const width = opts.width ?? 12;
  const height = opts.height ?? 6;
  const tiles: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      tiles.push(row === height - 1 ? 1 : 0); // solid floor on the bottom row
    }
  }
  const entities = (opts.entities ?? []).map((e, i) => ({
    id: `${e.kind}-${i}`,
    transform: { position: { x: e.x, y: e.y }, facing: 1 as const },
    collider: { halfExtents: { x: 0.5, y: 0.5 }, offset: { x: 0, y: 0 } },
    behavior: behaviorFor(e.kind),
  }));
  const raw = {
    schemaVersion: 1,
    levelId: id,
    title: `P5 scaffolding: ${id}`,
    gdos: {
      targetKgNode: `kg:test/${id}`,
      difficultyVectors: { executionPrecision: 0, readingComplexity: 0, timingStrictness: 0, routeAmbiguity: 0 },
      emotionalBudgetCurve: [...(opts.curve ?? DEFAULT_CURVE)],
      creatorMomentFrame: { tickWindow: [0, 1], description: 'n/a (unit fixture)' },
    },
    tilemap: { width, height, tileSize: 1, tiles },
    entities,
    triggers: [],
    constraints: {
      spawn: { x: 0.5, y: height - 1.5 },
      goal: { position: { x: width - 0.5, y: height - 1.5 }, halfExtents: { x: 0.5, y: 0.5 } },
      parTimeTiersSeconds: [30, 10],
    },
  };
  const result = parseLevel(raw);
  if (!result.ok) throw new Error(`GdosFixtures.makeLevel failed the schema gate: ${JSON.stringify(result.errors)}`);
  return result.value;
}

export function emptyTape(levelId: string): ReplayTape {
  return { schemaVersion: TAPE_SCHEMA_VERSION, levelId, seed: 1, frames: [] };
}

export function run(archetype: ArchetypeName, outcome: 'completed' | 'timeout', attempts: number, ticksElapsed: number, levelId = 'gdos-fixture'): ArchetypeRun {
  return { archetype, outcome, attempts, ticksElapsed, tape: emptyTape(levelId) };
}

export function solvable(): SolvabilityVerdict {
  return { classification: 'solvable', method: 'archetype', nodesExplored: 0 };
}

export function noSoftlock(): SoftlockVerdict {
  return { hasSoftlock: false, trappedRegions: [], trappedCount: 0, exhaustive: true, nodesExplored: 1 };
}

export function noExploit(): ExploitVerdict {
  return { hasExploit: false, applicable: false, bypassedHazardIds: [], nodesExplored: 0 };
}

/** An optimization verdict with a chosen delta (applicable, not rejected). */
export function optWindow(deltaSeconds: number): OptimizationVerdict {
  const tiers: TierTimes = {
    discovery: 2 + deltaSeconds,
    good: 2 + deltaSeconds * 0.75,
    fast: 2 + deltaSeconds * 0.5,
    expert: 2 + deltaSeconds * 0.25,
    worldRecord: 2,
  };
  return {
    applicable: true,
    tiers,
    deltaSeconds,
    rejected: false,
    worldRecordSource: 'archetype',
    completions: [],
  };
}

/** An inapplicable optimization verdict (no archetype cleared). */
export function optInapplicable(): OptimizationVerdict {
  return { applicable: false, rejected: false, completions: [] };
}

export interface BundleOpts {
  readonly def?: LevelDefinition;
  readonly runs?: readonly ArchetypeRun[];
  readonly deaths?: readonly DeathEvent[];
  readonly lookbackTicks?: number;
  readonly solvability?: SolvabilityVerdict;
  readonly softlock?: SoftlockVerdict;
  readonly exploit?: ExploitVerdict;
  readonly optimization?: OptimizationVerdict;
}

/** DEFAULT_PROFILE with a new id and optional threshold overrides (for the calibration-external tests). */
export function profileWith(overrides: {
  readonly profileId?: string;
  readonly emotional?: Partial<EmotionalThresholds>;
  readonly streamability?: Partial<StreamabilityThresholds>;
  readonly infoDensity?: Partial<InfoDensityProfile>;
}): ScoringProfile {
  return {
    schemaVersion: DEFAULT_PROFILE.schemaVersion,
    profileId: overrides.profileId ?? 'gdos-test-profile',
    emotional: {
      ...DEFAULT_PROFILE.emotional,
      thresholds: { ...DEFAULT_PROFILE.emotional.thresholds, ...(overrides.emotional ?? {}) },
    },
    streamability: {
      ...DEFAULT_PROFILE.streamability,
      thresholds: { ...DEFAULT_PROFILE.streamability.thresholds, ...(overrides.streamability ?? {}) },
    },
    infoDensity: { ...DEFAULT_PROFILE.infoDensity, ...(overrides.infoDensity ?? {}) },
  };
}

export function makeBundle(opts: BundleOpts = {}): EvidenceBundle {
  const def = opts.def ?? makeLevel();
  return assembleEvidence({
    def,
    runs: opts.runs ?? [run('firstTime', 'completed', 0, 100, def.levelId)],
    deaths: opts.deaths ?? [],
    lookbackTicks: opts.lookbackTicks ?? 30,
    solvability: opts.solvability ?? solvable(),
    softlock: opts.softlock ?? noSoftlock(),
    exploit: opts.exploit ?? noExploit(),
    optimization: opts.optimization ?? optWindow(4),
  });
}
