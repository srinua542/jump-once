/**
 * S9.4 — Atlas + Batcher + GlRenderer: the WebGL2 executor pipeline
 * (REQ-161 pooling covered separately in Pool.test.ts; REQ-162 batching;
 * REQ-170 WebGL share). All against `createTraceGl2Device` — a pure
 * in-memory recorder, never a real GPU.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { LevelDefinition } from '../../src/components/Level';
import { createClock } from '../../src/core/Clock';
import { createRng } from '../../src/core/Rng';
import { NEUTRAL_INPUT } from '../../src/core/State';
import { instantiateWorld, type JumpOnceState } from '../../src/entities/World';
import { parseLevel } from '../../src/schema/Parse';
import { DEFAULT_GRAMMAR } from '../../render/grammar/Grammar';
import { createAtlas, DEFAULT_ATLAS_PROFILE } from '../../render/gl/Atlas';
import { buildBatches } from '../../render/gl/Batcher';
import { createTraceGl2Device, fakePixelData } from '../../render/gl/Gl2Device';
import { drawBatches, packInstanceFloats, FLOATS_PER_INSTANCE } from '../../render/gl/GlRenderer';
import { createCamera } from '../../render/scene/Camera';
import { compileScene, type Viewport } from '../../render/scene/SceneCompiler';
import { PAPER_STYLE_PACK } from '../../render/style/paper/PaperStylePack';

function gdosFixture(id: string): unknown {
  return {
    targetKgNode: `kg:test/${id}`,
    difficultyVectors: { executionPrecision: 0, readingComplexity: 0, timingStrictness: 0, routeAmbiguity: 0 },
    emotionalBudgetCurve: [
      { at: 0, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
      { at: 1, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
    ],
    creatorMomentFrame: { tickWindow: [0, 1], description: 'n/a (unit fixture)' },
  };
}

/** A wide, mostly-open room: many center-mask floor/ceiling tiles share ONE bitmap (mask 15, one variant set) — the batching win. */
function buildWideLevel(): LevelDefinition {
  const width = 30;
  const height = 8;
  const tiles: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const border = row === 0 || row === height - 1 || col === 0 || col === width - 1;
      tiles.push(border ? 1 : 0);
    }
  }
  const raw = {
    schemaVersion: 1,
    levelId: 'gl-executor-fixture',
    title: 'S9.4 executor fixture',
    gdos: gdosFixture('gl-executor-fixture'),
    tilemap: { width, height, tileSize: 1, tiles },
    entities: [
      { id: 'spike-1', transform: { position: { x: 5.5, y: 3.5 }, facing: 1 }, collider: { halfExtents: { x: 0.5, y: 0.5 }, offset: { x: 0, y: 0 } }, behavior: { kind: 'spike' } },
      { id: 'spike-2', transform: { position: { x: 8.5, y: 3.5 }, facing: 1 }, collider: { halfExtents: { x: 0.5, y: 0.5 }, offset: { x: 0, y: 0 } }, behavior: { kind: 'spike' } },
    ],
    triggers: [],
    constraints: {
      spawn: { x: 1.5, y: 3.5 },
      goal: { position: { x: 28.5, y: 3.5 }, halfExtents: { x: 0.5, y: 0.5 } },
      parTimeTiersSeconds: [30, 10],
    },
  };
  const result = parseLevel(raw);
  if (!result.ok) throw new Error(`fixture failed schema gate: ${JSON.stringify(result.errors)}`);
  return result.value;
}

function makeDrawList(level: LevelDefinition) {
  const state: JumpOnceState = { tick: 0, clock: createClock(), rng: createRng(1), input: NEUTRAL_INPUT, world: instantiateWorld(level) };
  const viewport: Viewport = { halfWidth: 15, halfHeight: 4 };
  const camera = createCamera(15, 4);
  return compileScene(state, state, 0, DEFAULT_GRAMMAR, PAPER_STYLE_PACK, camera, viewport, 1);
}

const rasterizeToPixels = (_pack: unknown, _request: unknown, width: number, height: number) => fakePixelData(width, height);

test('atlas uploads a given bitmap id exactly once, even when requested many times', () => {
  const level = buildWideLevel();
  const drawList = makeDrawList(level);
  /* the wide open floor/ceiling produces many mask-15/mask-14/etc tiles —
     several distinct bitmap ids, each requested many times over. */
  const atlas = createAtlas();
  const { device, trace } = createTraceGl2Device();
  for (const item of drawList) {
    atlas.ensureRegion(item.bitmap.id, item.bitmap.widthPx, item.bitmap.heightPx, () => rasterizeToPixels(PAPER_STYLE_PACK, item.request, item.bitmap.widthPx, item.bitmap.heightPx), device);
  }
  const uniqueBitmapIds = new Set(drawList.map((i) => i.bitmap.id));
  const uploadCalls = trace().filter((line) => line.startsWith('uploadTextureRegion'));
  assert.equal(uploadCalls.length, uniqueBitmapIds.size, `expected exactly one upload per distinct bitmap id (${uniqueBitmapIds.size}), got ${uploadCalls.length}`);
  assert.ok(drawList.length > uniqueBitmapIds.size, 'the fixture must actually exercise reuse (more draw items than distinct bitmaps)');
});

test('atlas regions fit within page bounds and do not overlap', () => {
  const level = buildWideLevel();
  const drawList = makeDrawList(level);
  const atlas = createAtlas({ pageSizePx: 64 }); // tiny pages to force multiple pages/shelves
  const { device } = createTraceGl2Device();
  const regions = drawList.map((item) =>
    atlas.ensureRegion(item.bitmap.id, item.bitmap.widthPx, item.bitmap.heightPx, () => rasterizeToPixels(PAPER_STYLE_PACK, item.request, item.bitmap.widthPx, item.bitmap.heightPx), device),
  );
  for (const r of regions) {
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= 64 && r.y + r.height <= 64, `region out of page bounds: ${JSON.stringify(r)}`);
  }
  /* Dedupe by bitmap id first: repeat requests for the SAME id correctly
     return the identical cached region (same page/x/y) — that is not an
     overlap, it's cache reuse. Only DISTINCT bitmap ids may never overlap. */
  const distinctById = new Map<string, (typeof regions)[number]>();
  drawList.forEach((item, i) => distinctById.set(item.bitmap.id, regions[i]));
  const distinctRegions = [...distinctById.values()];

  const byPage = new Map<number, typeof regions>();
  for (const r of distinctRegions) byPage.set(r.page, [...(byPage.get(r.page) ?? []), r]);
  for (const [, pageRegions] of byPage) {
    for (let i = 0; i < pageRegions.length; i++) {
      for (let j = i + 1; j < pageRegions.length; j++) {
        const a = pageRegions[i];
        const b = pageRegions[j];
        const overlap = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
        assert.ok(!overlap, `distinct-bitmap regions overlap on the same page: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
      }
    }
  }
  assert.ok(distinctRegions.length > 1, 'the fixture must exercise more than one distinct bitmap to make this check meaningful');
  assert.ok(atlas.pageCount >= 1);
});

test('batching: many same-bitmap terrain tiles collapse into ONE draw call (REQ-162)', () => {
  const level = buildWideLevel();
  const drawList = makeDrawList(level);
  const atlas = createAtlas();
  const { device, trace } = createTraceGl2Device();
  const batches = buildBatches(drawList, PAPER_STYLE_PACK, atlas, device, rasterizeToPixels);

  const totalInstances = batches.reduce((sum, b) => sum + b.instances.length, 0);
  assert.equal(totalInstances, drawList.length, 'every draw item must land in exactly one batch instance');
  assert.ok(batches.length < drawList.length, `expected fewer batches (${batches.length}) than draw items (${drawList.length}) — that IS the batching win`);

  drawBatches(batches, device, (page) => atlas.pageTexture(page));
  const drawCalls = trace().filter((line) => line.startsWith('drawInstanced'));
  assert.equal(drawCalls.length, batches.length, 'exactly one drawInstanced call per batch (per atlas page)');
});

test('instance floats carry the correct per-instance world position and atlas UV rect', () => {
  const level = buildWideLevel();
  const drawList = makeDrawList(level);
  const atlas = createAtlas();
  const { device } = createTraceGl2Device();
  const batches = buildBatches(drawList, PAPER_STYLE_PACK, atlas, device, rasterizeToPixels);
  const batch = batches[0];
  const floats = packInstanceFloats(batch);
  assert.equal(floats.length, batch.instances.length * FLOATS_PER_INSTANCE);
  /* Float32Array is 32-bit precision — compare via Math.fround, not strict
     equality against the source (64-bit) numbers. */
  batch.instances.forEach((instance, i) => {
    const base = i * FLOATS_PER_INSTANCE;
    assert.equal(floats[base + 0], Math.fround(instance.worldX));
    assert.equal(floats[base + 1], Math.fround(instance.worldY));
    assert.equal(floats[base + 2], Math.fround(instance.regionX));
    assert.equal(floats[base + 3], Math.fround(instance.regionY));
    assert.equal(floats[base + 4], Math.fround(instance.regionW));
    assert.equal(floats[base + 5], Math.fround(instance.regionH));
  });
});

test('a batch whose page has no texture is skipped defensively, never throws', () => {
  const { device } = createTraceGl2Device();
  assert.doesNotThrow(() => drawBatches([{ page: 99, instances: [] }], device, () => null));
});

test('DEFAULT_ATLAS_PROFILE.pageSizePx is data, not a literal buried in Atlas.ts logic — a smaller custom page size is honored', () => {
  assert.ok(DEFAULT_ATLAS_PROFILE.pageSizePx > 0);
  const level = buildWideLevel();
  const drawList = makeDrawList(level);
  const smallPage = createAtlas({ pageSizePx: 20 });
  const { device } = createTraceGl2Device();
  let touchedMultiplePages = false;
  for (const item of drawList) {
    smallPage.ensureRegion(item.bitmap.id, item.bitmap.widthPx, item.bitmap.heightPx, () => fakePixelData(item.bitmap.widthPx, item.bitmap.heightPx), device);
    if (smallPage.pageCount > 1) touchedMultiplePages = true;
  }
  assert.ok(touchedMultiplePages, 'a page size of 20 should force multiple pages given several distinct ~13px terrain/entity bitmaps');
});
