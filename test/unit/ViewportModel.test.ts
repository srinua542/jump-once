/**
 * S9.8 — ViewportModel: pure window/DPR/fullscreen letterbox math
 * (REQ-171). Letterbox axis selection, DPR cap [1,2], fullscreen passthrough.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeViewport, GAMEPLAY_DPR_CAP } from '../../render/shell/ViewportModel';

test('a window wider than the world aspect letterboxes left/right (full height, centered)', () => {
  const out = computeViewport({ windowWidthPx: 1600, windowHeightPx: 900, devicePixelRatio: 1, worldAspectRatio: 4 / 3, fullscreen: false });
  assert.equal(out.cssHeightPx, 900);
  assert.ok(Math.abs(out.cssWidthPx - 900 * (4 / 3)) < 1e-9);
  assert.ok(out.offsetXPx > 0);
  assert.equal(out.offsetYPx, 0);
});

test('a window taller than the world aspect letterboxes top/bottom (full width, centered)', () => {
  const out = computeViewport({ windowWidthPx: 800, windowHeightPx: 1400, devicePixelRatio: 1, worldAspectRatio: 4 / 3, fullscreen: false });
  assert.equal(out.cssWidthPx, 800);
  assert.ok(Math.abs(out.cssHeightPx - 800 / (4 / 3)) < 1e-9);
  assert.equal(out.offsetXPx, 0);
  assert.ok(out.offsetYPx > 0);
});

test('a window matching the world aspect exactly has zero letterbox offset', () => {
  const out = computeViewport({ windowWidthPx: 1200, windowHeightPx: 900, devicePixelRatio: 1, worldAspectRatio: 4 / 3, fullscreen: false });
  assert.ok(Math.abs(out.offsetXPx) < 1e-9);
  assert.ok(Math.abs(out.offsetYPx) < 1e-9);
});

test('devicePixelRatio is capped at GAMEPLAY_DPR_CAP (2) and floored at 1', () => {
  const high = computeViewport({ windowWidthPx: 800, windowHeightPx: 600, devicePixelRatio: 4, worldAspectRatio: 4 / 3, fullscreen: false });
  assert.equal(high.effectiveDpr, GAMEPLAY_DPR_CAP);

  const low = computeViewport({ windowWidthPx: 800, windowHeightPx: 600, devicePixelRatio: 0.5, worldAspectRatio: 4 / 3, fullscreen: false });
  assert.equal(low.effectiveDpr, 1);

  const normal = computeViewport({ windowWidthPx: 800, windowHeightPx: 600, devicePixelRatio: 1.5, worldAspectRatio: 4 / 3, fullscreen: false });
  assert.equal(normal.effectiveDpr, 1.5);
});

test('canvas backing-store size is the CSS size scaled by the effective DPR, rounded', () => {
  const out = computeViewport({ windowWidthPx: 1000, windowHeightPx: 1000, devicePixelRatio: 2, worldAspectRatio: 1, fullscreen: false });
  assert.equal(out.canvasWidthPx, Math.round(out.cssWidthPx * 2));
  assert.equal(out.canvasHeightPx, Math.round(out.cssHeightPx * 2));
});

test('fullscreen is a pure passthrough input bit — never influences the letterbox math itself', () => {
  const windowed = computeViewport({ windowWidthPx: 1000, windowHeightPx: 800, devicePixelRatio: 1, worldAspectRatio: 4 / 3, fullscreen: false });
  const fullscreen = computeViewport({ windowWidthPx: 1000, windowHeightPx: 800, devicePixelRatio: 1, worldAspectRatio: 4 / 3, fullscreen: true });
  assert.equal(fullscreen.fullscreen, true);
  assert.equal(windowed.cssWidthPx, fullscreen.cssWidthPx);
  assert.equal(windowed.cssHeightPx, fullscreen.cssHeightPx);
});
