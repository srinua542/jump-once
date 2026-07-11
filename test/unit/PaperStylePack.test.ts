/**
 * S9.2 — PaperStylePack: StylePack #1, "Paper Collage" (dm-0075/dm-0078/
 * dm-0080/dm-0084/dm-0085/dm-0090/dm-0091). Structural tests only (no pixel
 * inspection, per the project's fake-over-canvas culture) — command-trace
 * equality via the shared `createTraceRecorder`.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_GRAMMAR } from '../../render/grammar/Grammar';
import { createTraceRecorder } from '../../render/style/Raster2D';
import { validatePack, type VisualRequest } from '../../render/style/StylePack';
import { KindDraw } from '../../render/style/paper/KindDraw';
import { PAPER_STYLE_PACK, maskAt } from '../../render/style/paper/PaperStylePack';
import { createRng, hashSeed } from '../../render/style/paper/PaperRng';
import { GOAL_ACCENT, TERRA } from '../../render/style/paper/Palette';

function req(overrides: Partial<VisualRequest> & Pick<VisualRequest, 'role'>): VisualRequest {
  return { state: 'default', widthPx: 64, heightPx: 64, identitySeed: 1, ...overrides };
}

test('PAPER_STYLE_PACK fully satisfies the default grammar (the S9.1 x S9.2 integration proof)', () => {
  const issues = validatePack(PAPER_STYLE_PACK, DEFAULT_GRAMMAR);
  assert.deepEqual(issues, [], `unexpected validatePack issues: ${JSON.stringify(issues)}`);
});

test('dm-0084: optimization is achromatic; danger is chromatic', () => {
  assert.equal(PAPER_STYLE_PACK.paletteAccent('optimization'), null);
  assert.notEqual(PAPER_STYLE_PACK.paletteAccent('danger'), null);
});

test('dm-0085: the goal rasterizes with GOAL_ACCENT (teal), never TERRA', () => {
  const recorder = createTraceRecorder();
  PAPER_STYLE_PACK.rasterize(req({ role: 'goal', widthPx: 64, heightPx: 80 }), recorder.device);
  const trace = recorder.trace().join('\n');
  assert.ok(trace.includes(JSON.stringify(GOAL_ACCENT)), 'expected the goal pennant fill to use GOAL_ACCENT');
  assert.ok(!trace.includes(JSON.stringify(TERRA)), 'the goal must never use TERRA — that is Danger\'s signature (REQ-070)');
});

test('cache-by-key: visual() returns the identical bitmap handle for a repeated request', () => {
  const a = PAPER_STYLE_PACK.visual(req({ role: 'spike' }));
  const b = PAPER_STYLE_PACK.visual(req({ role: 'spike' }));
  assert.equal(a.bitmap.id, b.bitmap.id);
  assert.equal(a, b, 'expected the exact same cached CachedVisual object, not just an equal id');
});

test('dm-0090/dm-0091: identitySeed is ignored for kind-uniform roles — different seeds still cache-hit and rasterize identically', () => {
  const first = PAPER_STYLE_PACK.visual(req({ role: 'door', state: 'open', identitySeed: 1 }));
  const second = PAPER_STYLE_PACK.visual(req({ role: 'door', state: 'open', identitySeed: 999999 }));
  assert.equal(first.bitmap.id, second.bitmap.id);

  const rA = createTraceRecorder();
  const rB = createTraceRecorder();
  PAPER_STYLE_PACK.rasterize(req({ role: 'door', state: 'open', identitySeed: 1 }), rA.device);
  PAPER_STYLE_PACK.rasterize(req({ role: 'door', state: 'open', identitySeed: 999999 }), rB.device);
  assert.deepEqual(rA.trace(), rB.trace());
});

test('dm-0078: an entity\'s BASE geometry is byte-identical across every state — the laser on/off regression, pinned', () => {
  for (const [kind, states] of [
    ['laser', ['on', 'off']],
    ['door', ['open', 'closed']],
    ['collapsingFloor', ['intact', 'cracking']],
    ['spring', ['idle', 'launch']],
    ['pressurePlate', ['idle', 'pressed']],
    ['gravityZone', ['normal', 'invert']],
  ] as const) {
    const baseOnly = createTraceRecorder();
    KindDraw[kind].base(baseOnly.device, 64, createRng(hashSeed(900, kind)));
    const expectedBase = baseOnly.trace();

    for (const state of states) {
      const full = createTraceRecorder();
      PAPER_STYLE_PACK.rasterize(req({ role: kind, state, widthPx: 64, heightPx: 64 }), full.device);
      const trace = full.trace();
      /* The rasterize() call wraps drawKind in a save/translate(6,6)/…/restore
         pad; the base trace itself starts right after that translate. */
      assert.deepEqual(
        trace.slice(2, 2 + expectedBase.length),
        expectedBase,
        `${kind}@${state}: base geometry diverged from the kind-seeded-only base — dm-0078 regression`,
      );
    }
  }
});

test('terrain: a fully-solid interior tile (mask=15) has NO exposed-edge highlight and NO jitter divergence from a straight square', () => {
  const recorder = createTraceRecorder();
  PAPER_STYLE_PACK.rasterize(req({ role: 'terrain', state: '15:0', widthPx: 80, heightPx: 80 }), recorder.device);
  const trace = recorder.trace().join('\n');
  assert.ok(!trace.includes('setStrokeStyle'), 'a fully-internal tile must carry no exposed-edge highlight stroke (dm-0080: clean solid interior)');
  assert.ok(!trace.includes('setGlobalAlpha'), 'a fully-internal tile must carry no wear/grain alpha work (dm-0080)');
});

test('terrain: an isolated tile (mask=0, every side exposed) DOES draw the exposed-edge highlight', () => {
  const recorder = createTraceRecorder();
  PAPER_STYLE_PACK.rasterize(req({ role: 'terrain', state: '0:0', widthPx: 80, heightPx: 80 }), recorder.device);
  const trace = recorder.trace().join('\n');
  assert.ok(trace.includes('setStrokeStyle'), 'a fully-exposed tile must draw the torn top-edge highlight');
});

test('terrain: two different position-hashed variants of the same mask draw different jitter (variety without re-authoring)', () => {
  const a = createTraceRecorder();
  const b = createTraceRecorder();
  PAPER_STYLE_PACK.rasterize(req({ role: 'terrain', state: '5:0', widthPx: 80, heightPx: 80 }), a.device);
  PAPER_STYLE_PACK.rasterize(req({ role: 'terrain', state: '5:1', widthPx: 80, heightPx: 80 }), b.device);
  assert.notDeepEqual(a.trace(), b.trace());
});

test('maskAt: 4-neighbour mask matches the TILE_BITS convention (N=1,E=2,S=4,W=8)', () => {
  /* A 3x3 all-solid grid; out-of-bounds is NOT solid here (unlike the
     terrain-frame convention) so the edge cells are exercised too. */
  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < 3 && y < 3;
  assert.equal(maskAt(solid, 1, 1), 15, 'the fully-surrounded center cell must be mask 15 (center)');
  assert.equal(maskAt(solid, 1, 0), 14, 'top row: north neighbour is outside the grid (not solid) -> E|S|W = 2|4|8 = 14 (TILE_NAMES.top)');
});

test('maskAt: out-of-bounds-counts-as-solid convention (terrain frame) yields a flush outer edge', () => {
  const tiles = [1, 1, 1, 1];
  const width = 2;
  const height = 2;
  const solid = (x: number, y: number): boolean => (x < 0 || y < 0 || x >= width || y >= height) ? true : tiles[y * width + x] === 1;
  /* Every cell in a fully-solid 2x2 map, under out-of-bounds-is-solid, is mask 15 — flush on every side. */
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      assert.equal(maskAt(solid, x, y), 15, `cell (${x},${y}) should read fully-internal under the out-of-bounds-solid convention`);
    }
  }
});

test('rasterize() is deterministic and issues at least one draw command for every bound role', () => {
  for (const role of Object.keys(DEFAULT_GRAMMAR.bindings)) {
    const a = createTraceRecorder();
    const b = createTraceRecorder();
    const request = req({ role: role as VisualRequest['role'], state: role === 'terrain' ? '15:0' : 'default' });
    PAPER_STYLE_PACK.rasterize(request, a.device);
    PAPER_STYLE_PACK.rasterize(request, b.device);
    assert.ok(a.trace().length > 0, `${role} issued zero draw commands`);
    assert.deepEqual(a.trace(), b.trace(), `${role} rasterize() is not deterministic`);
  }
});
