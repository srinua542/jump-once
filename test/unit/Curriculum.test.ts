/**
 * S4.6 — Macro Curriculum Validation, the four §15 criteria (REQ-140/142).
 *
 *  - a well-formed chapter passes all four criteria and is healthy;
 *  - each criterion fails independently on a targeted defect:
 *      · Cognitive Structural Mapping — an orphan mechanic requirement;
 *      · Cross-Chapter Degradation — a difficulty spike;
 *      · Curiosity Progression — a flatlined curiosity curve;
 *      · Graduation Assessment — a finale that is not a capstone;
 *  - a locally-broken level (unsolvable / softlocked / exploitable) fails the
 *    chapter-health precondition;
 *  - determinism: identical verdict across two validations.
 *
 * The input is assembled data (the minimal chapter contract, dm-0029), so
 * this pass runs no simulation — it is pure over the verdict sequence.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_CURRICULUM_OPTIONS,
  validateCurriculum,
  type CurriculumLevel,
} from '../../src/eval/macro/Curriculum';

/** A healthy 4-level chapter: gradual teaching, rising difficulty, sustained
 *  curiosity, a combining finale. */
function healthyChapter(): CurriculumLevel[] {
  return [
    { levelId: 'c1', solvable: true, hasSoftlock: false, hasExploit: false, difficulty: 2, requiredMechanics: ['jump'], introducedMechanics: ['jump'], curiosity: 60 },
    { levelId: 'c2', solvable: true, hasSoftlock: false, hasExploit: false, difficulty: 3, requiredMechanics: ['jump', 'spike'], introducedMechanics: ['spike'], curiosity: 55 },
    { levelId: 'c3', solvable: true, hasSoftlock: false, hasExploit: false, difficulty: 4, requiredMechanics: ['jump', 'movingPlatform'], introducedMechanics: ['movingPlatform'], curiosity: 65 },
    { levelId: 'c4', solvable: true, hasSoftlock: false, hasExploit: false, difficulty: 6, requiredMechanics: ['spike', 'movingPlatform'], introducedMechanics: [], curiosity: 70 },
  ];
}

test('a well-formed chapter is healthy and passes all four macro criteria', () => {
  const v = validateCurriculum(healthyChapter());
  assert.equal(v.chapterHealthy, true);
  assert.equal(v.cognitiveStructuralMapping.pass, true);
  assert.equal(v.crossChapterDegradation.pass, true);
  assert.equal(v.curiosityProgression.pass, true);
  assert.equal(v.graduationAssessment.pass, true);
  assert.equal(v.overallPass, true);
});

test('Cognitive Structural Mapping fails on an orphan mechanic requirement', () => {
  const chapter = healthyChapter();
  // c2 now requires 'laser', never introduced anywhere.
  chapter[1] = { ...chapter[1], requiredMechanics: ['jump', 'laser'] };
  const v = validateCurriculum(chapter);
  assert.equal(v.cognitiveStructuralMapping.pass, false);
  assert.ok(v.cognitiveStructuralMapping.findings.some((f) => f.includes('laser')));
  assert.equal(v.overallPass, false);
});

test('Cognitive Structural Mapping fails when a level dumps too many new mechanics', () => {
  const chapter = healthyChapter();
  chapter[0] = { ...chapter[0], requiredMechanics: ['jump', 'spike', 'ice'], introducedMechanics: ['jump', 'spike', 'ice'] };
  const v = validateCurriculum(chapter);
  assert.equal(v.cognitiveStructuralMapping.pass, false, 'introducing 3 > maxNewConceptsPerLevel should fail');
});

test('Cross-Chapter Degradation fails on a difficulty spike', () => {
  const chapter = healthyChapter();
  chapter[2] = { ...chapter[2], difficulty: 100 }; // 100 vs previous 3 → spike
  const v = validateCurriculum(chapter);
  assert.equal(v.crossChapterDegradation.pass, false);
  assert.equal(v.overallPass, false);
});

test('Curiosity Progression fails on a flatlined curiosity curve', () => {
  const chapter = healthyChapter();
  chapter[2] = { ...chapter[2], curiosity: 0 };
  const v = validateCurriculum(chapter);
  assert.equal(v.curiosityProgression.pass, false);
});

test('Graduation Assessment fails when the finale is not a capstone', () => {
  const chapter = healthyChapter();
  // Finale requires only one mechanic — no combination of prior learning.
  chapter[3] = { ...chapter[3], requiredMechanics: ['jump'] };
  const v = validateCurriculum(chapter);
  assert.equal(v.graduationAssessment.pass, false);
});

test('a locally-broken level fails the chapter-health precondition and the overall gate', () => {
  const chapter = healthyChapter();
  chapter[1] = { ...chapter[1], hasSoftlock: true };
  const v = validateCurriculum(chapter);
  assert.equal(v.chapterHealthy, false);
  assert.equal(v.overallPass, false);
});

test('determinism: the verdict is identical across two validations', () => {
  assert.deepEqual(validateCurriculum(healthyChapter()), validateCurriculum(healthyChapter()));
  assert.ok(DEFAULT_CURRICULUM_OPTIONS.minGraduationMechanics >= 2);
});
