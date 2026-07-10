/**
 * S7.4 — the LevelConcept model (dm-0059): the /level-design-principle
 * workflow answers as typed fields, structurally validated at pipeline
 * phase 1 — closed vocabularies, difficulty bounds, mechanic uniqueness,
 * and the REQ-082 lifecycle block. Intent RIGOR belongs to the S7.6 gate.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LEVEL_ARCHETYPES, validateConcept, type LevelArchetype } from '../../src/gen/Concept';
import { advanceStage, createEntry } from '../../src/gen/Lifecycle';
import type { MechanicLifecycleEntry } from '../../src/eval/gdos/DesignMemory';
import { conceptWith } from '../helpers/GenFixtures';

test('the archetype vocabulary is the closed twelve from /level-design-principle', () => {
  assert.equal(LEVEL_ARCHETYPES.length, 12);
  assert.equal(new Set(LEVEL_ARCHETYPES).size, 12);
  assert.ok(LEVEL_ARCHETYPES.includes('assumption'));
  assert.ok(LEVEL_ARCHETYPES.includes('psychologicalPressure'));
});

test('a well-formed concept validates cleanly', () => {
  const v = validateConcept(conceptWith({ mechanics: ['spring', 'conveyor'] }), []);
  assert.ok(v.ok, JSON.stringify(v.errors));
});

test('each structural defect is refused with its path', () => {
  const cases: { concept: Parameters<typeof validateConcept>[0]; path: string }[] = [
    { concept: conceptWith({ archetype: 'memoryTrap' as LevelArchetype }), path: '/archetype' },
    { concept: conceptWith({ intentSentence: '' }), path: '/intentSentence' },
    { concept: conceptWith({ oneJumpDecision: '' }), path: '/oneJumpDecision' },
    { concept: conceptWith({ targetKgNode: '' }), path: '/targetKgNode' },
    { concept: conceptWith({ emotionalPhase: 'boredom' as never }), path: '/emotionalPhase' },
    { concept: conceptWith({ difficultyTarget: { executionPrecision: 1.5, readingComplexity: 0, timingStrictness: 0, routeAmbiguity: 0 } }), path: '/difficultyTarget/executionPrecision' },
    { concept: conceptWith({ mechanics: ['spring', 'spring'] }), path: '/mechanics/1' },
    { concept: conceptWith({ mechanics: ['jetpack' as never] }), path: '/mechanics/0' },
  ];
  for (const c of cases) {
    const v = validateConcept(c.concept, []);
    assert.equal(v.ok, false, `expected rejection at ${c.path}`);
    assert.ok(v.errors.some((e) => e.path === c.path), `expected an error at ${c.path}, got ${JSON.stringify(v.errors.map((e) => e.path))}`);
  }
});

test('a blocked mechanic is refused at the concept boundary (REQ-082)', () => {
  let spring = createEntry('spring');
  const retired = advanceStage(spring, 'Retirement', '2026-07-10', 'exhausted', 'prune');
  assert.ok(retired.ok);
  const lifecycle: MechanicLifecycleEntry[] = retired.ok ? [retired.value] : [];
  const v = validateConcept(conceptWith({ mechanics: ['spring'] }), lifecycle);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.path === '/mechanics/0' && e.message.includes('REQ-082')));
  // The same concept is fine while the mechanic is fresh.
  assert.ok(validateConcept(conceptWith({ mechanics: ['spring'] }), []).ok);
});
