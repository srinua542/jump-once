/**
 * S7.6 — the REQ-091 single-sentence intent gate (dm-0063): a rigorous lesson
 * passes; empty / multi-sentence / too-short / too-long / lesson-free
 * sentences are each denied with a distinct typed reason; the length band is
 * GenProfile calibration.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LESSON_CONNECTIVES, verifyIntent, type IntentDenialReason } from '../../src/gen/IntentGate';
import { DEFAULT_GEN_PROFILE } from '../../src/gen/GenProfile';
import { conceptWith, genProfileWith } from '../helpers/GenFixtures';

const P = DEFAULT_GEN_PROFILE;

function verdict(sentence: string, profile = P): ReturnType<typeof verifyIntent> {
  return verifyIntent(conceptWith({ intentSentence: sentence }), profile);
}

test('a rigorous single-sentence lesson passes', () => {
  const v = verdict('Commit the jump only after reading the full gap, because the pit punishes a habitual early press.');
  assert.ok(v.pass, JSON.stringify(v.findings));
  assert.deepEqual(v.reasons, []);
  assert.deepEqual(v.findings, []);
});

test('each failure mode is denied with a distinct typed reason', () => {
  const cases: { sentence: string; reason: IntentDenialReason; profile?: typeof P }[] = [
    { sentence: '   ', reason: 'empty' },
    { sentence: 'Jump early because the floor falls. Then run to the exit before it collapses.', reason: 'not-one-sentence' },
    { sentence: 'Wait, then jump because timing matters', reason: 'not-one-sentence' }, // no terminator
    { sentence: 'Jump because timing.', reason: 'too-short' },
    { sentence: 'The player must carefully observe the moving hazard and count its full cycle and then decide precisely where exactly along the very narrow ledge to commit the single irreversible jump so that they cleanly clear the sweeping beam because mistiming it means instant death here today right now.', reason: 'too-long' },
    { sentence: 'The player jumps across the wide central pit to the platform.', reason: 'no-lesson' },
  ];
  for (const c of cases) {
    const v = verdict(c.sentence, c.profile ?? P);
    assert.equal(v.pass, false, `expected denial for "${c.sentence}"`);
    assert.ok(v.reasons.includes(c.reason), `expected reason ${c.reason} for "${c.sentence}", got ${JSON.stringify(v.reasons)}`);
    assert.equal(v.findings.length, v.reasons.length);
    assert.ok(v.findings.every((f) => f.path === '/intentSentence'));
  }
});

test('empty short-circuits: it is the sole reason, not cascaded', () => {
  const v = verdict('');
  assert.deepEqual(v.reasons, ['empty']);
});

test('the connective grammar is what makes a sentence a lesson', () => {
  // Same clause, one with a connective and one without.
  assert.ok(verdict('Save the jump until the spikes retract, then cross the gap safely.').pass);
  assert.equal(verdict('Save the jump for the spikes and cross the gap safely afterward.').reasons.includes('no-lesson'), true);
  // Every declared connective is accepted.
  for (const c of LESSON_CONNECTIVES) {
    const v = verdict(`The player must delay the single jump ${c} the moving hazard clears the narrow ledge.`);
    assert.ok(!v.reasons.includes('no-lesson'), `connective "${c}" was not recognized`);
  }
});

test('two-profile: the word band is calibration', () => {
  const sentence = 'Jump only when the plate glows.'; // 6 words
  assert.ok(verdict(sentence, P).pass, JSON.stringify(verdict(sentence, P).findings));
  const strict = genProfileWith({ profileId: 'verbose', intent: { minWords: 10, maxWords: 40 } });
  assert.ok(verdict(sentence, strict).reasons.includes('too-short'));
  const terse = genProfileWith({ profileId: 'terse', intent: { minWords: 1, maxWords: 4 } });
  assert.ok(verdict(sentence, terse).reasons.includes('too-long'));
});
