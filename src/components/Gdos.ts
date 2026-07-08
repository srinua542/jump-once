/**
 * GdosMetadata — the PRD §13 GDOS block: the design-intelligence metadata
 * every serialized level must carry.
 *
 * GDOS alignment: Section 13 (Level Definition Schema metadata), Section 6
 * (emotional thresholds — the four metric names), Section 10 (Campaign
 * Knowledge Graph node).
 *
 * Scope seam (dm-0012): these shapes are structurally STABLE but semantically
 * PROVISIONAL. P2 validates structure only (finiteness, [0,100] ranges,
 * strictly increasing keyframes, [0,1] axes); P5 — the block's only consumer —
 * owns semantics and may bump the schema version to extend it. The
 * creator-moment frame is named exactly once in the whole PRD; its minimal
 * shape here is a deliberate placeholder-by-decision.
 *
 * Difficulty axes (dm-0015, provisional): executionPrecision (how tight the
 * required inputs are), readingComplexity (how hard the layout is to parse),
 * timingStrictness (dependence on timed elements), routeAmbiguity (how many
 * plausible routes compete). Each in [0,1].
 *
 * This file is pure data declarations — no function bodies (directory
 * invariant: src/components/ is logic-free).
 */

/** Closed, provisional difficulty-axis set (dm-0015). */
export type DifficultyAxis =
  | 'executionPrecision'
  | 'readingComplexity'
  | 'timingStrictness'
  | 'routeAmbiguity';

/** Closed axis list for programmatic iteration; tests keep it in lockstep with DifficultyAxis. */
export const DIFFICULTY_AXES: readonly DifficultyAxis[] = [
  'executionPrecision',
  'readingComplexity',
  'timingStrictness',
  'routeAmbiguity',
];

/**
 * One point of the emotional budget curve: the §6 metric budgets at a
 * normalized level-progress position.
 */
export interface EmotionalKeyframe {
  /** Normalized level progress in [0, 1]; strictly increasing across the curve. */
  readonly at: number;
  /** §6 Curiosity budget, [0, 100]. */
  readonly curiosity: number;
  /** §6 Confidence budget, [0, 100]. */
  readonly confidence: number;
  /** §6 Surprise budget, [0, 100]. */
  readonly surprise: number;
  /** §6 Mastery budget, [0, 100]. */
  readonly mastery: number;
}

/** The designated creator-moment frame (PRD §13; minimal shape per dm-0012). */
export interface CreatorMomentFrame {
  /** Inclusive simulation-tick window [start, end] the moment is engineered to land in. 0 ≤ start ≤ end. */
  readonly tickWindow: readonly [number, number];
  /** Designer statement of the intended moment. Non-empty. */
  readonly description: string;
}

export interface GdosMetadata {
  /** Target Campaign Knowledge Graph node id (PRD §10 pipeline step 1). Non-empty. */
  readonly targetKgNode: string;
  /** Mathematical difficulty vector: one finite value in [0, 1] per axis. */
  readonly difficultyVectors: Readonly<Record<DifficultyAxis, number>>;
  /** Emotional budget curve; non-empty, `at` strictly increasing. */
  readonly emotionalBudgetCurve: readonly EmotionalKeyframe[];
  readonly creatorMomentFrame: CreatorMomentFrame;
}
