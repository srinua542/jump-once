/**
 * DesignSpace — the formal multi-dimensional design-space matrix and coverage
 * tracker (P5/S5.1, REQ-040/041; dm-0034).
 *
 * GDOS alignment: Section 5 (model the entire design space mathematically
 * before designing content; the Mechanic × Environment × Emotion ×
 * Optimization-Style × Player-Type matrix with enumerated axes and coverage).
 *
 * Why axes are DERIVED, not hand-listed (dm-0034): the five axis NAMES are
 * fixed by REQ-041 but their VALUES must never drift from the sim. So:
 *   - Mechanic axis      = the P3 entity-kind registry (ENTITY_KINDS).
 *   - Environment axis   = the environmental-modifier kinds + a 'baseline'
 *                          value for modifier-free levels; every modifier kind
 *                          is asserted (lockstep test) to be a real EntityKind.
 *   - Emotion axis       = the REQ-015 six-phase arc (this gives REQ-015 its
 *                          P5 semantics). The authored emotional-budget curve
 *                          measures four of the six phases; the other two are
 *                          legitimately shown as coverage gaps here.
 *   - Optimization Style = the five REQ-101 routing tiers (mirrors TierTimes).
 *   - Player Type        = the five archetypes (Object.keys(ARCHETYPES)).
 * A level "exercises" a cell when its evidence touches that axis-value tuple;
 * coverage is the union of exercised cells across a level set.
 *
 * Whitelist math only (comparisons, +, ÷). Lives in src/eval/gdos/; imports
 * the registries as data (allowed — eval consumes the sim's contracts) and the
 * verdict types only.
 */

import { ENTITY_KINDS, type EntityKind } from '../../components/Behavior';
import { ARCHETYPES, type ArchetypeName } from '../Archetypes';
import type { EvidenceBundle } from './Evidence';

/** The six-phase emotional arc (REQ-015) — the Emotion axis. */
export type EmotionPhase =
  | 'curiosity'
  | 'confidence'
  | 'surpriseBetrayal'
  | 'realization'
  | 'mastery'
  | 'renewedUncertainty';

export const EMOTION_ARC: readonly EmotionPhase[] = Object.freeze([
  'curiosity',
  'confidence',
  'surpriseBetrayal',
  'realization',
  'mastery',
  'renewedUncertainty',
]);

/**
 * Environmental-modifier kinds (dm-0034) plus 'baseline'. Each modifier is a
 * real EntityKind (lockstep-tested); 'baseline' is the modifier-free
 * environment so plain levels still occupy a coverage cell.
 */
export const ENVIRONMENT_MODIFIER_KINDS: readonly EntityKind[] = Object.freeze([
  'iceSurface',
  'conveyor',
  'gravityZone',
  'collapsingFloor',
]);

export type EnvironmentValue = EntityKind | 'baseline';

export const ENVIRONMENT_AXIS: readonly EnvironmentValue[] = Object.freeze([
  'baseline',
  ...ENVIRONMENT_MODIFIER_KINDS,
]);

/** The five REQ-101 optimization tiers — the Optimization-Style axis. */
export type OptimizationStyle = 'discovery' | 'good' | 'fast' | 'expert' | 'worldRecord';

export const OPTIMIZATION_STYLE_AXIS: readonly OptimizationStyle[] = Object.freeze([
  'discovery',
  'good',
  'fast',
  'expert',
  'worldRecord',
]);

/** The Mechanic axis = the entity-kind registry, verbatim. */
export const MECHANIC_AXIS: readonly EntityKind[] = ENTITY_KINDS;

/** The Player-Type axis = the archetype registry keys, verbatim. */
export const PLAYER_TYPE_AXIS: readonly ArchetypeName[] = Object.freeze(
  Object.keys(ARCHETYPES) as ArchetypeName[],
);

/** One design-space cell: a value on each of the five axes. */
export interface DesignCell {
  readonly mechanic: EntityKind;
  readonly environment: EnvironmentValue;
  readonly emotion: EmotionPhase;
  readonly optimizationStyle: OptimizationStyle;
  readonly playerType: ArchetypeName;
}

/** Canonical string key for a cell (stable, order-fixed). */
export function cellKey(c: DesignCell): string {
  return `${c.mechanic}|${c.environment}|${c.emotion}|${c.optimizationStyle}|${c.playerType}`;
}

/** Map an emotional-budget curve field name to its arc phase. */
const CURVE_EMOTION: Readonly<Record<'curiosity' | 'confidence' | 'surprise' | 'mastery', EmotionPhase>> = {
  curiosity: 'curiosity',
  confidence: 'confidence',
  surprise: 'surpriseBetrayal',
  mastery: 'mastery',
};

/** Distinct entity kinds present in a level (the mechanics it uses). */
function mechanicsOf(bundle: EvidenceBundle): EntityKind[] {
  const seen = new Set<EntityKind>();
  for (const e of bundle.def.entities) seen.add(e.behavior.kind);
  return [...seen];
}

/** Environment values a level occupies: its modifier kinds, or 'baseline'. */
function environmentsOf(mechanics: readonly EntityKind[]): EnvironmentValue[] {
  const envs: EnvironmentValue[] = [];
  for (const m of ENVIRONMENT_MODIFIER_KINDS) if (mechanics.includes(m)) envs.push(m);
  if (envs.length === 0) envs.push('baseline');
  return envs;
}

/**
 * Emotion phases a level exercises: at each keyframe, the arc phase with the
 * highest budget is that moment's dominant emotion; the union across keyframes
 * is what the level delivers. Ties resolve to arc order (deterministic).
 */
function emotionsOf(bundle: EvidenceBundle): EmotionPhase[] {
  const fields: readonly ('curiosity' | 'confidence' | 'surprise' | 'mastery')[] = ['curiosity', 'confidence', 'surprise', 'mastery'];
  const dominant = new Set<EmotionPhase>();
  for (const kf of bundle.def.gdos.emotionalBudgetCurve) {
    let bestField = fields[0];
    let bestVal = kf[fields[0]];
    for (const f of fields) {
      if (kf[f] > bestVal) { bestVal = kf[f]; bestField = f; }
    }
    dominant.add(CURVE_EMOTION[bestField]);
  }
  return [...dominant];
}

/** Optimization tiers a level exercises: all five when it has a real window, none otherwise. */
function optimizationStylesOf(bundle: EvidenceBundle): OptimizationStyle[] {
  if (bundle.optimization.applicable && !bundle.optimization.rejected) {
    return [...OPTIMIZATION_STYLE_AXIS];
  }
  return [];
}

/** Player types a level serves: the archetypes that actually completed it. */
function playerTypesOf(bundle: EvidenceBundle): ArchetypeName[] {
  const out: ArchetypeName[] = [];
  for (const r of bundle.runs) if (r.outcome === 'completed') out.push(r.archetype);
  return out;
}

/** The set of design cells one level exercises (canonical keys). */
export function extractCoverage(bundle: EvidenceBundle): Set<string> {
  const mechanics = mechanicsOf(bundle);
  const environments = environmentsOf(mechanics);
  const emotions = emotionsOf(bundle);
  const optStyles = optimizationStylesOf(bundle);
  const playerTypes = playerTypesOf(bundle);
  const cells = new Set<string>();
  for (const mechanic of mechanics) {
    for (const environment of environments) {
      for (const emotion of emotions) {
        for (const optimizationStyle of optStyles) {
          for (const playerType of playerTypes) {
            cells.add(cellKey({ mechanic, environment, emotion, optimizationStyle, playerType }));
          }
        }
      }
    }
  }
  return cells;
}

/** Per-axis coverage counts and the total distinct cells a level set exercises. */
export interface CoverageMatrix {
  /** Distinct exercised cell keys across the whole level set. */
  readonly cells: ReadonlySet<string>;
  readonly totalCells: number;
  /** Distinct values touched on each axis. */
  readonly mechanicsCovered: readonly EntityKind[];
  readonly environmentsCovered: readonly EnvironmentValue[];
  readonly emotionsCovered: readonly EmotionPhase[];
  readonly optimizationStylesCovered: readonly OptimizationStyle[];
  readonly playerTypesCovered: readonly ArchetypeName[];
}

/** Aggregate coverage over a set of levels' evidence. */
export function coverageMatrix(bundles: readonly EvidenceBundle[]): CoverageMatrix {
  const cells = new Set<string>();
  for (const b of bundles) for (const c of extractCoverage(b)) cells.add(c);
  const mechanics = new Set<EntityKind>();
  const environments = new Set<EnvironmentValue>();
  const emotions = new Set<EmotionPhase>();
  const optStyles = new Set<OptimizationStyle>();
  const playerTypes = new Set<ArchetypeName>();
  for (const key of cells) {
    const [m, e, emo, opt, pt] = key.split('|');
    mechanics.add(m as EntityKind);
    environments.add(e as EnvironmentValue);
    emotions.add(emo as EmotionPhase);
    optStyles.add(opt as OptimizationStyle);
    playerTypes.add(pt as ArchetypeName);
  }
  return {
    cells,
    totalCells: cells.size,
    mechanicsCovered: [...mechanics],
    environmentsCovered: [...environments],
    emotionsCovered: [...emotions],
    optimizationStylesCovered: [...optStyles],
    playerTypesCovered: [...playerTypes],
  };
}
