/**
 * Curriculum — Macro Curriculum Validation, the SECOND (macro) validation
 * pass (P4/S4.6, REQ-140, REQ-142).
 *
 * GDOS alignment: Section 15 (the two isolated passes — Local Spatial
 * Verification and Macro Curriculum Validation; this is the macro pass, which
 * audits a chapter's progress ARC across its levels).
 *
 * Isolation is structural (REQ-140): this module is PURE DATA LOGIC over an
 * ordered sequence of per-level signals. It never runs a simulation, never
 * imports the harness, the search, or anything under src/{core,systems,
 * entities,schema}. The caller assembles each CurriculumLevel from the LOCAL
 * verdicts (Solvability/Softlock/Exploit/Optimization) plus authored GDOS
 * metadata; the macro pass consumes those verdicts as data. The seam between
 * the two passes is this input type — enforced by an import-isolation scan.
 *
 * Chapter input shape (open question #2, resolved as dm-0029): no chapter
 * schema exists yet (content is gated until M2). This module defines the
 * MINIMAL ordered-verdict-sequence input it needs; when P6/P10 authors the
 * real chapter manifest it must adopt or version this contract.
 *
 * The four §15 macro criteria, each a pure predicate over the sequence:
 *  1. Cognitive Structural Mapping — every mechanic a level REQUIRES was
 *     INTRODUCED at or before that level (no orphan requirement), and no
 *     level dumps more than `maxNewConceptsPerLevel` new mechanics at once.
 *  2. Cross-Chapter Degradation Analysis — the difficulty arc does not spike
 *     (a level harder than its predecessor by more than `maxSpikeRatio`) nor
 *     degrade (end easier than it began beyond `degradationTolerance`).
 *  3. Curiosity Progression Curves — curiosity stays above `curiosityFloor`
 *     throughout (never flatlines) and does not fall monotonically to nothing.
 *  4. Graduation Assessment Verification — the final level is a capstone: it
 *     requires at least `minGraduationMechanics` mechanics, all introduced in
 *     EARLIER levels (it combines prior learning rather than teaching anew).
 *
 * Whitelist math only; deterministic. Lives in src/eval/macro/ (dm-0022).
 */

/**
 * One level's macro-relevant signals, assembled by the caller from the local
 * verdicts + authored metadata. The minimal chapter-manifest contract.
 */
export interface CurriculumLevel {
  readonly levelId: string;
  /** From the Solvability audit — an unsolvable level breaks the chapter. */
  readonly solvable: boolean;
  /** From Softlock detection. */
  readonly hasSoftlock: boolean;
  /** From Exploit filtration. */
  readonly hasExploit: boolean;
  /** A scalar difficulty proxy (e.g., the Discovery-tier seconds). Non-negative. */
  readonly difficulty: number;
  /** Mechanics the level requires the player to use (from its entity kinds). */
  readonly requiredMechanics: readonly string[];
  /** Mechanics first TAUGHT at this level (a subset of requiredMechanics, by convention). */
  readonly introducedMechanics: readonly string[];
  /** Curiosity signal in [0, 100] (from the GDOS emotional-budget curve / novelty). */
  readonly curiosity: number;
}

export interface CurriculumOptions {
  readonly maxNewConceptsPerLevel: number;
  readonly maxSpikeRatio: number;
  readonly degradationTolerance: number;
  readonly curiosityFloor: number;
  readonly minGraduationMechanics: number;
}

export const DEFAULT_CURRICULUM_OPTIONS: CurriculumOptions = Object.freeze({
  maxNewConceptsPerLevel: 2,
  maxSpikeRatio: 2.5,
  degradationTolerance: 0.5,
  curiosityFloor: 1,
  minGraduationMechanics: 2,
});

export interface CriterionResult {
  readonly pass: boolean;
  /** Human-readable evidence for a failure (empty when passing). */
  readonly findings: readonly string[];
}

export interface MacroVerdict {
  /** Precondition: every level is locally healthy (solvable, no softlock, no exploit). */
  readonly chapterHealthy: boolean;
  readonly cognitiveStructuralMapping: CriterionResult;
  readonly crossChapterDegradation: CriterionResult;
  readonly curiosityProgression: CriterionResult;
  readonly graduationAssessment: CriterionResult;
  /** True iff the chapter is healthy AND all four criteria pass. */
  readonly overallPass: boolean;
}

function checkHealth(chapter: readonly CurriculumLevel[]): boolean {
  for (const level of chapter) {
    if (!level.solvable || level.hasSoftlock || level.hasExploit) return false;
  }
  return true;
}

function checkCognitiveMapping(chapter: readonly CurriculumLevel[], options: CurriculumOptions): CriterionResult {
  const findings: string[] = [];
  const introducedSoFar = new Set<string>();
  for (const level of chapter) {
    if (level.introducedMechanics.length > options.maxNewConceptsPerLevel) {
      findings.push(`${level.levelId}: introduces ${level.introducedMechanics.length} new mechanics (> ${options.maxNewConceptsPerLevel}) — cognitive overload`);
    }
    for (const m of level.introducedMechanics) introducedSoFar.add(m);
    for (const req of level.requiredMechanics) {
      if (!introducedSoFar.has(req)) {
        findings.push(`${level.levelId}: requires "${req}" which was never introduced at or before it — orphan requirement`);
      }
    }
  }
  return { pass: findings.length === 0, findings };
}

function checkDegradation(chapter: readonly CurriculumLevel[], options: CurriculumOptions): CriterionResult {
  const findings: string[] = [];
  for (let i = 1; i < chapter.length; i++) {
    const prev = chapter[i - 1].difficulty;
    const cur = chapter[i].difficulty;
    if (prev > 0 && cur > prev * options.maxSpikeRatio) {
      findings.push(`${chapter[i].levelId}: difficulty ${cur} spikes > ${options.maxSpikeRatio}× the previous ${prev}`);
    }
  }
  if (chapter.length >= 2) {
    const first = chapter[0].difficulty;
    const last = chapter[chapter.length - 1].difficulty;
    if (last < first * options.degradationTolerance) {
      findings.push(`chapter ends easier (${last}) than it began (${first}) beyond tolerance — curriculum degrades`);
    }
  }
  return { pass: findings.length === 0, findings };
}

function checkCuriosity(chapter: readonly CurriculumLevel[], options: CurriculumOptions): CriterionResult {
  const findings: string[] = [];
  for (const level of chapter) {
    if (level.curiosity < options.curiosityFloor) {
      findings.push(`${level.levelId}: curiosity ${level.curiosity} is below the floor ${options.curiosityFloor} — the arc flatlines`);
    }
  }
  // A strictly-decreasing curiosity curve that never recovers is a dead arc.
  if (chapter.length >= 2) {
    let strictlyFalling = true;
    for (let i = 1; i < chapter.length; i++) {
      if (chapter[i].curiosity >= chapter[i - 1].curiosity) { strictlyFalling = false; break; }
    }
    if (strictlyFalling) {
      findings.push('curiosity falls monotonically across the whole chapter — no re-engagement');
    }
  }
  return { pass: findings.length === 0, findings };
}

function checkGraduation(chapter: readonly CurriculumLevel[], options: CurriculumOptions): CriterionResult {
  const findings: string[] = [];
  if (chapter.length === 0) {
    return { pass: false, findings: ['empty chapter has no graduation level'] };
  }
  const introducedBeforeLast = new Set<string>();
  for (let i = 0; i < chapter.length - 1; i++) {
    for (const m of chapter[i].introducedMechanics) introducedBeforeLast.add(m);
  }
  const last = chapter[chapter.length - 1];
  if (last.requiredMechanics.length < options.minGraduationMechanics) {
    findings.push(`${last.levelId}: the finale requires only ${last.requiredMechanics.length} mechanic(s) (< ${options.minGraduationMechanics}) — not a capstone`);
  }
  const noveltyInFinale = last.requiredMechanics.filter((m) => !introducedBeforeLast.has(m));
  const combinesPrior = last.requiredMechanics.some((m) => introducedBeforeLast.has(m));
  if (!combinesPrior && chapter.length > 1) {
    findings.push(`${last.levelId}: the finale combines none of the chapter's earlier mechanics`);
  }
  if (noveltyInFinale.length > 0 && chapter.length > 1) {
    findings.push(`${last.levelId}: the finale teaches new mechanics (${noveltyInFinale.join(', ')}) instead of assessing learned ones`);
  }
  return { pass: findings.length === 0, findings };
}

/**
 * Validate a chapter's macro curriculum arc. Deterministic and pure: same
 * (chapter, options) ⇒ identical verdict; no simulation is run.
 */
export function validateCurriculum(
  chapter: readonly CurriculumLevel[],
  options: CurriculumOptions = DEFAULT_CURRICULUM_OPTIONS,
): MacroVerdict {
  const chapterHealthy = checkHealth(chapter);
  const cognitiveStructuralMapping = checkCognitiveMapping(chapter, options);
  const crossChapterDegradation = checkDegradation(chapter, options);
  const curiosityProgression = checkCuriosity(chapter, options);
  const graduationAssessment = checkGraduation(chapter, options);

  const overallPass =
    chapterHealthy &&
    cognitiveStructuralMapping.pass &&
    crossChapterDegradation.pass &&
    curiosityProgression.pass &&
    graduationAssessment.pass;

  return {
    chapterHealthy,
    cognitiveStructuralMapping,
    crossChapterDegradation,
    curiosityProgression,
    graduationAssessment,
    overallPass,
  };
}
