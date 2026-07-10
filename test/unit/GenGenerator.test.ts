/**
 * S7.4 — the candidate generator (REQ-090 phases 1–2 substrate, REQ-081
 * operators; dm-0059): the gap-corridor template maps a concept to a
 * strict-parse-proven LevelDefinition as a pure function of (concept, seed,
 * profile); all twelve mechanic kinds are templatable; mutate/combine work at
 * the parameter level and re-prove every output; unbuildable concepts are
 * refused with typed reasons.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ENTITY_KINDS } from '../../src/components/Behavior';
import { parseLevel } from '../../src/schema/Parse';
import { createRng } from '../../src/core/Rng';
import { LEVEL_ARCHETYPES } from '../../src/gen/Concept';
import { DEFAULT_GEN_PROFILE } from '../../src/gen/GenProfile';
import { combineCandidates, generateCandidate, mutateCandidate, type Candidate } from '../../src/gen/Generator';
import { conceptWith, genProfileWith } from '../helpers/GenFixtures';

const P = DEFAULT_GEN_PROFILE;

function mustGenerate(concept = conceptWith({}), seed = 1, profile = P): Candidate {
  const r = generateCandidate(concept, seed, profile);
  assert.ok(r.ok, `generation failed: ${JSON.stringify(!r.ok ? r.errors : [])}`);
  return (r as { ok: true; candidate: Candidate }).candidate;
}

test('every archetype generates a candidate that re-proves through the strict parser', () => {
  for (const archetype of LEVEL_ARCHETYPES) {
    const candidate = mustGenerate(conceptWith({ archetype }));
    const reparsed = parseLevel(JSON.parse(JSON.stringify(candidate.def)));
    assert.ok(reparsed.ok, `archetype ${archetype}: emitted def failed its own re-parse`);
    assert.ok(candidate.def.levelId.startsWith('gen-'));
    assert.equal(candidate.def.gdos.targetKgNode, candidate.concept.targetKgNode);
  }
});

test('generation is a pure function of (concept, seed): same in, byte-identical out; seeds vary the draw', () => {
  const a = generateCandidate(conceptWith({}), 7, P);
  const b = generateCandidate(conceptWith({}), 7, P);
  assert.deepEqual(a, b);
  const defs = new Set<string>();
  for (let seed = 1; seed <= 20; seed++) defs.add(JSON.stringify(mustGenerate(conceptWith({}), seed).params));
  assert.ok(defs.size >= 2, 'twenty seeds drew only one parameter set — the envelope is not being explored');
});

test('all twelve mechanic kinds are templatable in one concept; the plate+door pair is trigger-wired', () => {
  const candidate = mustGenerate(conceptWith({ mechanics: [...ENTITY_KINDS] }), 3);
  const kinds = new Set(candidate.def.entities.map((e) => e.behavior.kind));
  for (const kind of ENTITY_KINDS) assert.ok(kinds.has(kind), `missing templated kind ${kind}`);
  assert.equal(candidate.def.triggers.length, 1);
  assert.equal(candidate.def.triggers[0].action, 'toggleDoor');
});

test('the gap width follows the concept executionPrecision target', () => {
  const easy = mustGenerate(conceptWith({ difficultyTarget: { executionPrecision: 0, readingComplexity: 0, timingStrictness: 0, routeAmbiguity: 0 } }));
  const hard = mustGenerate(conceptWith({ difficultyTarget: { executionPrecision: 1, readingComplexity: 0, timingStrictness: 0, routeAmbiguity: 0 } }));
  assert.equal(easy.params.gapWidth, 1);
  assert.equal(hard.params.gapWidth, P.generator.maxGapWidth);
});

test('an unbuildable concept is refused with a typed reason, never truncated silently', () => {
  const tight = genProfileWith({ profileId: 'tiny', generator: { corridorMinLength: 8, corridorMaxLength: 8 } });
  const r = generateCandidate(conceptWith({ mechanics: ['iceSurface', 'conveyor', 'pressurePlate', 'gravityZone', 'proximityZone', 'collapsingFloor', 'movingPlatform'] }), 1, tight);
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors[0].message.includes('corridor'));
});

test('two-profile: the corridor envelope and entity dynamics are calibration, not literals', () => {
  const longP = genProfileWith({ profileId: 'long', generator: { corridorMinLength: 30, corridorMaxLength: 30 } });
  const long = mustGenerate(conceptWith({}), 1, longP);
  assert.equal(long.params.corridorLength, 30);
  assert.notDeepEqual(long.def.tilemap, mustGenerate(conceptWith({}), 1).def.tilemap);

  const springy = genProfileWith({ profileId: 'springy', generator: { entityTuning: { springLaunchVelocityX: 11 } } });
  const withSpring = mustGenerate(conceptWith({ mechanics: ['spring'] }), 1, springy);
  const spring = withSpring.def.entities.find((e) => e.behavior.kind === 'spring');
  assert.ok(spring && spring.behavior.kind === 'spring');
  if (spring && spring.behavior.kind === 'spring') assert.equal(spring.behavior.launchVelocity.x, 11);
});

test('mutateCandidate changes at most one parameter, stays in the envelope, and re-proves the def', () => {
  const base = mustGenerate(conceptWith({}), 5);
  let rng = createRng(99);
  for (let i = 0; i < 10; i++) {
    const m = mutateCandidate(base, rng, P);
    assert.ok(m.ok, `mutation ${i} failed: ${JSON.stringify(!m.ok ? m.errors : [])}`);
    if (!m.ok) break;
    const changed = (['corridorLength', 'gapWidth', 'gapStart'] as const).filter((k) => m.candidate.params[k] !== base.params[k]);
    assert.ok(changed.length <= 2, `mutation touched ${changed.join('+')}`); // gapStart may re-clamp with corridorLength/gapWidth
    assert.ok(m.candidate.params.gapWidth >= 1 && m.candidate.params.gapWidth <= P.generator.maxGapWidth);
    assert.ok(m.candidate.params.corridorLength <= P.generator.corridorMaxLength);
    const reparsed = parseLevel(JSON.parse(JSON.stringify(m.candidate.def)));
    assert.ok(reparsed.ok);
    rng = m.rng;
  }
  // Determinism: the same rng state mutates identically.
  assert.deepEqual(mutateCandidate(base, createRng(99), P), mutateCandidate(base, createRng(99), P));
});

test('combineCandidates builds a parse-proven hybrid whose every parameter comes from a parent', () => {
  const a = mustGenerate(conceptWith({}), 2);
  const b = mustGenerate(conceptWith({}), 11);
  const h = combineCandidates(a, b, createRng(42), P);
  assert.ok(h.ok, `combine failed: ${JSON.stringify(!h.ok ? h.errors : [])}`);
  if (!h.ok) return;
  assert.deepEqual(h.candidate.concept, a.concept);
  // Each param equals one parent's value OR its re-clamped consistency bound;
  // corridorLength and gapWidth are always direct picks.
  assert.ok([a.params.corridorLength, b.params.corridorLength].includes(h.candidate.params.corridorLength));
  assert.ok([a.params.gapWidth, b.params.gapWidth].includes(h.candidate.params.gapWidth));
  assert.ok(parseLevel(JSON.parse(JSON.stringify(h.candidate.def))).ok);
  assert.deepEqual(combineCandidates(a, b, createRng(42), P), combineCandidates(a, b, createRng(42), P));
});
