/**
 * S9.1 — StylePack seam (dm-0076/dm-0083): validatePack enforces the
 * pack-side half of REQ-070's mixing prohibition (accent uniqueness,
 * achromatic optimization per dm-0084, motion-class uniqueness, audio-patch
 * distinctness, danger requiring a chromatic accent per REQ-016) plus the
 * bible §5 cache-by-key contract ("generate never per-frame").
 *
 * A hand-rolled FakeStylePack stands in for StylePack #1 (the real
 * PaperStylePack port lands at S9.2) — exactly the project's established
 * fake-over-mocking-framework culture (ToolsIsolation/GenIsolation sibling
 * tests use the same pattern of hand-rolled test doubles).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_GRAMMAR, type GrammarCategoryId } from '../../render/grammar/Grammar';
import {
  packSatisfiesGrammar,
  validatePack,
  type CachedVisual,
  type MotionSpec,
  type StylePack,
  type SynthPatch,
  type VisualRequest,
} from '../../render/style/StylePack';

const ACCENTS: Record<GrammarCategoryId, string | null> = {
  safe: '#232019',
  danger: '#cd5b33',
  interactive: '#8fb5ac',
  temporary: '#e0a3a9',
  optimization: null,
  secret: '#a998c9',
};

const MOTIONS: Record<GrammarCategoryId, MotionSpec> = {
  safe: { motionClass: 'static', amplitudePx: 0, periodTicks: 1 },
  danger: { motionClass: 'kinetic', amplitudePx: 4, periodTicks: 30 },
  interactive: { motionClass: 'responsive', amplitudePx: 2, periodTicks: 20 },
  temporary: { motionClass: 'collapse', amplitudePx: 6, periodTicks: 40 },
  optimization: { motionClass: 'sweep', amplitudePx: 3, periodTicks: 24 },
  secret: { motionClass: 'reveal', amplitudePx: 1, periodTicks: 60 },
};

const PATCHES: Record<GrammarCategoryId, SynthPatch> = {
  safe: { waveform: 'sine', freqStartHz: 200, freqEndHz: 200, gainPeak: 0.2, attackSeconds: 0, releaseSeconds: 0.05, durationSeconds: 0.1 },
  danger: { waveform: 'square', freqStartHz: 400, freqEndHz: 100, gainPeak: 0.8, attackSeconds: 0, releaseSeconds: 0.2, durationSeconds: 0.3 },
  interactive: { waveform: 'triangle', freqStartHz: 500, freqEndHz: 600, gainPeak: 0.4, attackSeconds: 0.01, releaseSeconds: 0.1, durationSeconds: 0.2 },
  temporary: { waveform: 'sawtooth', freqStartHz: 300, freqEndHz: 150, gainPeak: 0.5, attackSeconds: 0, releaseSeconds: 0.15, durationSeconds: 0.25 },
  optimization: { waveform: 'sine', freqStartHz: 600, freqEndHz: 900, gainPeak: 0.3, attackSeconds: 0, releaseSeconds: 0.08, durationSeconds: 0.15 },
  secret: { waveform: 'noise', freqStartHz: 100, freqEndHz: 100, gainPeak: 0.25, attackSeconds: 0.02, releaseSeconds: 0.3, durationSeconds: 0.4 },
};

function makeFakePack(overrides: Partial<{
  accents: Record<GrammarCategoryId, string | null>;
  motions: Record<GrammarCategoryId, MotionSpec>;
  patches: Record<GrammarCategoryId, SynthPatch>;
  cacheBroken: boolean;
}> = {}): StylePack {
  const accents = overrides.accents ?? ACCENTS;
  const motions = overrides.motions ?? MOTIONS;
  const patches = overrides.patches ?? PATCHES;
  const cache = new Map<string, CachedVisual>();
  let counter = 0;
  return {
    packId: 'fake-pack-v1',
    visual(request: VisualRequest): CachedVisual {
      const key = `${request.role}:${request.state}:${request.widthPx}x${request.heightPx}:${request.identitySeed}`;
      if (overrides.cacheBroken) {
        counter += 1;
        return { bitmap: { id: `${key}#${counter}`, widthPx: request.widthPx, heightPx: request.heightPx }, anchorX: 0, anchorY: 0, padPx: 6 };
      }
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      const fresh: CachedVisual = { bitmap: { id: key, widthPx: request.widthPx, heightPx: request.heightPx }, anchorX: 0, anchorY: 0, padPx: 6 };
      cache.set(key, fresh);
      return fresh;
    },
    paletteAccent(category: GrammarCategoryId): string | null {
      return accents[category];
    },
    motionSpec(category: GrammarCategoryId): MotionSpec {
      return motions[category];
    },
    audioPatch(category: GrammarCategoryId): SynthPatch {
      return patches[category];
    },
  };
}

test('a complete, non-overlapping pack validates cleanly against the default grammar', () => {
  const issues = validatePack(makeFakePack(), DEFAULT_GRAMMAR);
  assert.deepEqual(issues, []);
  assert.equal(packSatisfiesGrammar(makeFakePack(), DEFAULT_GRAMMAR), true);
});

test('dm-0084: optimization must be achromatic — a chromatic optimization accent is rejected', () => {
  const issues = validatePack(makeFakePack({ accents: { ...ACCENTS, optimization: '#ff00ff' } }), DEFAULT_GRAMMAR);
  assert.ok(issues.some((i) => i.path === '/optimization/paletteAccent'));
});

test('REQ-016: danger requires a chromatic accent — a null danger accent is rejected', () => {
  const issues = validatePack(makeFakePack({ accents: { ...ACCENTS, danger: null } }), DEFAULT_GRAMMAR);
  assert.ok(issues.some((i) => i.path === '/danger/paletteAccent'));
});

test('REQ-070: two categories sharing an accent is rejected (mixing signatures)', () => {
  const issues = validatePack(makeFakePack({ accents: { ...ACCENTS, secret: ACCENTS.danger } }), DEFAULT_GRAMMAR);
  assert.ok(issues.some((i) => i.path === '/secret/paletteAccent' && /already used by "danger"/.test(i.message)));
});

test('an invalid accent format (not #rrggbb) is rejected', () => {
  const issues = validatePack(makeFakePack({ accents: { ...ACCENTS, secret: 'purple' } }), DEFAULT_GRAMMAR);
  assert.ok(issues.some((i) => i.path === '/secret/paletteAccent'));
});

test('two categories sharing a motion class is rejected (mixing signatures)', () => {
  const issues = validatePack(makeFakePack({ motions: { ...MOTIONS, secret: MOTIONS.danger } }), DEFAULT_GRAMMAR);
  assert.ok(issues.some((i) => i.path === '/secret/motionSpec/motionClass'));
});

test('an invalid motion spec (negative amplitude, non-integer period) is rejected', () => {
  const badAmplitude = validatePack(
    makeFakePack({ motions: { ...MOTIONS, danger: { ...MOTIONS.danger, amplitudePx: -1 } } }),
    DEFAULT_GRAMMAR,
  );
  assert.ok(badAmplitude.some((i) => i.path === '/danger/motionSpec/amplitudePx'));

  const badPeriod = validatePack(
    makeFakePack({ motions: { ...MOTIONS, danger: { ...MOTIONS.danger, periodTicks: 1.5 } } }),
    DEFAULT_GRAMMAR,
  );
  assert.ok(badPeriod.some((i) => i.path === '/danger/motionSpec/periodTicks'));
});

test('two categories sharing an identical audio patch is rejected (REQ-071 signature distinctness)', () => {
  const issues = validatePack(makeFakePack({ patches: { ...PATCHES, secret: PATCHES.danger } }), DEFAULT_GRAMMAR);
  assert.ok(issues.some((i) => i.path === '/secret/audioPatch'));
});

test('an invalid audio patch (bad waveform, non-positive frequency/gain/duration) is rejected', () => {
  const issues = validatePack(
    makeFakePack({
      patches: {
        ...PATCHES,
        danger: { waveform: 'bogus' as SynthPatch['waveform'], freqStartHz: -1, freqEndHz: 0, gainPeak: 2, attackSeconds: -1, releaseSeconds: -1, durationSeconds: 0 },
      },
    }),
    DEFAULT_GRAMMAR,
  );
  assert.ok(issues.some((i) => i.path === '/danger/audioPatch/waveform'));
  assert.ok(issues.some((i) => i.path === '/danger/audioPatch/freqStartHz'));
  assert.ok(issues.some((i) => i.path === '/danger/audioPatch/freqEndHz'));
  assert.ok(issues.some((i) => i.path === '/danger/audioPatch/gainPeak'));
  assert.ok(issues.some((i) => i.path === '/danger/audioPatch/attackSeconds'));
  assert.ok(issues.some((i) => i.path === '/danger/audioPatch/releaseSeconds'));
  assert.ok(issues.some((i) => i.path === '/danger/audioPatch/durationSeconds'));
});

test('cache-by-key contract: a pack returning a fresh handle per call fails validation (bible §5)', () => {
  const issues = validatePack(makeFakePack({ cacheBroken: true }), DEFAULT_GRAMMAR);
  assert.ok(issues.some((i) => /generate never per-frame/.test(i.message)));
});

test('an invalid visual (empty bitmap id, non-finite anchor, negative pad) is rejected', () => {
  const pack: StylePack = {
    ...makeFakePack(),
    visual(): CachedVisual {
      return { bitmap: { id: '', widthPx: 0, heightPx: -1 }, anchorX: Number.NaN, anchorY: 0, padPx: -1 };
    },
  };
  const issues = validatePack(pack, DEFAULT_GRAMMAR);
  assert.ok(issues.some((i) => i.path.endsWith('/bitmap/id')));
  assert.ok(issues.some((i) => i.path.endsWith('/bitmap/widthPx')));
  assert.ok(issues.some((i) => i.path.endsWith('/bitmap/heightPx')));
  assert.ok(issues.some((i) => i.path.endsWith('/anchorX')));
  assert.ok(issues.some((i) => i.path.endsWith('/padPx')));
});

test('every role the grammar binds, plus the reserved player role, is probed', () => {
  const requested: string[] = [];
  const base = makeFakePack();
  const pack: StylePack = {
    ...base,
    visual(request: VisualRequest): CachedVisual {
      requested.push(request.role);
      return base.visual(request);
    },
  };
  validatePack(pack, DEFAULT_GRAMMAR);
  for (const role of Object.keys(DEFAULT_GRAMMAR.bindings)) {
    assert.ok(requested.includes(role), `role "${role}" was never probed`);
  }
  assert.ok(requested.includes('player'), 'the reserved player role was never probed');
});

test('a missing packId is rejected', () => {
  const pack: StylePack = { ...makeFakePack(), packId: '' };
  const issues = validatePack(pack, DEFAULT_GRAMMAR);
  assert.ok(issues.some((i) => i.path === '/packId'));
});
