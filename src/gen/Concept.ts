/**
 * Concept — the level-design vocabulary the generation layer speaks
 * (P7/S7.3+S7.4; dm-0059).
 *
 * GDOS alignment: Section 9/10 — concepts precede geometry; the PDA proposes
 * them, the pipeline's phase 1 consumes them.
 *
 * S7.3 shipped the closed archetype list — the twelve level archetypes from
 * /level-design-principle, verbatim (each is a distinct one-jump decision
 * shape, NOT a player archetype — those live in eval/Archetypes.ts). S7.4
 * adds LevelConcept — the pipeline's phase-1 record typing the skill's
 * design-workflow answers — and validateConcept, the structural gate that
 * refuses blocked mechanics (REQ-082) before any geometry exists. The intent
 * sentence lives HERE, not in LevelDefinition (dm-0059: REQ-091 is a
 * manufacture-time gate; persisting the sentence into the shipped schema is
 * P10's decision).
 */

import type { EntityKind } from '../components/Behavior';
import { ENTITY_KINDS } from '../components/Behavior';
import { DIFFICULTY_AXES, type DifficultyAxis } from '../components/Gdos';
import { EMOTION_ARC, type EmotionPhase } from '../eval/gdos/DesignSpace';
import type { MechanicLifecycleEntry } from '../eval/gdos/DesignMemory';
import type { SchemaError } from '../schema/Parse';
import { isBlocked } from './Lifecycle';

/**
 * The twelve level archetypes, in the skill's canonical order. Closed:
 * concept validation and the PDA's suggestion tables both iterate this list.
 */
export const LEVEL_ARCHETYPES = Object.freeze([
  'assumption',
  'observation',
  'planning',
  'timing',
  'physics',
  'resourceManagement',
  'choice',
  'execution',
  'prediction',
  'environmentalReading',
  'reverseThinking',
  'psychologicalPressure',
] as const);

export type LevelArchetype = (typeof LEVEL_ARCHETYPES)[number];

/**
 * The pipeline's phase-1 record: the /level-design-principle design-workflow
 * answers as typed fields, established BEFORE any geometry (§10 step 1).
 */
export interface LevelConcept {
  readonly archetype: LevelArchetype;
  /** The single rigorous sentence stating the level's lesson — the REQ-091 subject, verified at Sign-off (S7.6). */
  readonly intentSentence: string;
  /** What exact decision the one-jump rule makes meaningful here (workflow Q3). */
  readonly oneJumpDecision: string;
  /** Mechanics the level exercises. May be empty (pure-geometry levels are legitimate); blocked mechanics are refused (REQ-082). */
  readonly mechanics: readonly EntityKind[];
  /** Target difficulty vector, one [0,1] value per axis — becomes GdosMetadata.difficultyVectors. */
  readonly difficultyTarget: Readonly<Record<DifficultyAxis, number>>;
  /** The REQ-015 emotional-arc phase this level covers in its chapter. */
  readonly emotionalPhase: EmotionPhase;
  /** Campaign knowledge-graph node — becomes GdosMetadata.targetKgNode. Non-empty. */
  readonly targetKgNode: string;
}

export interface ConceptValidation {
  readonly ok: boolean;
  readonly errors: readonly SchemaError[];
}

/**
 * Structural concept validation (pipeline phase 1): field presence, closed
 * vocabularies, difficulty bounds, mechanic uniqueness, and the REQ-082
 * lifecycle block. Intent-sentence RIGOR is not judged here — that is the
 * Sign-off gate's job (S7.6); phase 1 only refuses the structurally unusable.
 */
export function validateConcept(
  concept: LevelConcept,
  lifecycle: readonly MechanicLifecycleEntry[],
): ConceptValidation {
  const errors: SchemaError[] = [];
  if (!(LEVEL_ARCHETYPES as readonly string[]).includes(concept.archetype)) {
    errors.push({ path: '/archetype', message: `archetype must be one of [${LEVEL_ARCHETYPES.join(', ')}] (got ${JSON.stringify(concept.archetype)})` });
  }
  if (concept.intentSentence.length === 0) {
    errors.push({ path: '/intentSentence', message: 'a concept without a stated lesson cannot enter the pipeline (REQ-091)' });
  }
  if (concept.oneJumpDecision.length === 0) {
    errors.push({ path: '/oneJumpDecision', message: 'the one-jump decision must be stated (workflow Q3)' });
  }
  if (concept.targetKgNode.length === 0) {
    errors.push({ path: '/targetKgNode', message: 'expected a non-empty campaign knowledge-graph node id' });
  }
  if (!(EMOTION_ARC as readonly string[]).includes(concept.emotionalPhase)) {
    errors.push({ path: '/emotionalPhase', message: `emotionalPhase must be one of [${EMOTION_ARC.join(', ')}] (got ${JSON.stringify(concept.emotionalPhase)})` });
  }
  for (const axis of DIFFICULTY_AXES) {
    const v = concept.difficultyTarget[axis];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
      errors.push({ path: `/difficultyTarget/${axis}`, message: `expected a finite number in [0,1], got ${JSON.stringify(v)}` });
    }
  }
  const seen = new Set<string>();
  for (let i = 0; i < concept.mechanics.length; i++) {
    const m = concept.mechanics[i];
    if (!(ENTITY_KINDS as readonly string[]).includes(m)) {
      errors.push({ path: `/mechanics/${i}`, message: `mechanic must be a closed EntityKind (got ${JSON.stringify(m)})` });
      continue;
    }
    if (seen.has(m)) {
      errors.push({ path: `/mechanics/${i}`, message: `duplicate mechanic "${m}"` });
      continue;
    }
    seen.add(m);
    if (isBlocked(lifecycle, m)) {
      errors.push({ path: `/mechanics/${i}`, message: `mechanic "${m}" is Exhausted/Retired — blocked from new concepts (REQ-082)` });
    }
  }
  return { ok: errors.length === 0, errors };
}
