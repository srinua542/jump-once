/**
 * Main — the single client entry module (S11.2, REQ-170/171/174/163 real
 * bindings; dm-0121). This is the one file `tools/build/bundle.js` (S11.3)
 * starts resolving from. It assembles every real browser binding
 * (Canvas2D/WebGL2, WebAudio, fetch, PokiSDK, rAF, fullscreen/resize) onto
 * the pure seams the rest of `render/` already consumes, and drives the
 * per-frame loop: `FrameLoop → GameShell.advanceFrame → Batcher/GlRenderer
 * → AudioExecutor → QualityController`.
 *
 * Rasterization resolution vs. live viewport size: `GameShell`'s
 * `tileSizePx` (the pixel size every sprite is RASTERIZED at, cached by
 * key — dm-0080) is fixed once per level load from a constant reference
 * scale (`REFERENCE_PIXELS_PER_WORLD_UNIT`), deliberately independent of
 * the live canvas size — re-rasterizing on every resize would defeat the
 * atlas cache. `WebGl2Device`'s shader rescales each quad's on-screen SIZE
 * by the ratio of the live canvas's pixels-per-world-unit to that
 * reference (`Gl2Projection.referencePixelsPerWorldUnit`); only the quad's
 * ORIGIN uses the live ratio directly.
 *
 * Level sequencing: loads `content/data/validation-report.json`'s
 * `perLevel` (already the canonical chapter/slot-ordered level list —
 * REQ-142/084's own evidence record, not re-derived here) to build an
 * ordered play sequence, fetches each `content/data/levels/<levelId>.json`
 * on demand, and advances when `WorldState.runState` reaches `'completed'`.
 * Deliberately minimal — no menu, no save/progression UI (REQ-002 "no
 * complex progression") — this proves the real end-to-end pipeline plays
 * the real campaign, not a content-browsing product surface.
 *
 * Unlike the single-purpose binding files beside it, `Main.ts` is the one
 * place allowed to COMPOSE them (exactly as `GameShell`/`AgentHarness`
 * compose pure systems elsewhere) — it contains no gameplay rules of its
 * own (no physics, no scoring, no GDOS), only wiring.
 */

import type { LevelDefinition } from '../../src/components/Level';
import type { InputFrame } from '../../src/core/State';
import { parseLevel } from '../../src/schema/Parse';
import { createAudioExecutor } from '../audio/AudioExecutor';
import { createAtlas, DEFAULT_ATLAS_PROFILE } from '../gl/Atlas';
import { buildBatches } from '../gl/Batcher';
import { drawBatches } from '../gl/GlRenderer';
import { DEFAULT_GRAMMAR } from '../grammar/Grammar';
import { createQualityController, currentTier, reportFrameTime } from '../quality/QualityController';
import { DEFAULT_QUALITY_PROFILE } from '../quality/QualityProfile';
import { applyTier } from '../quality/QualityTier';
import { createGameShell, type GameShell } from '../shell/GameShell';
import { startFrameLoop } from '../shell/FrameLoop';
import { applyKeyDown, applyKeyUp, deriveInputFrame, NEUTRAL_KEY_STATE, shouldPreventDefault, type KeyState } from '../shell/InputCapture';
import { createPortalLifecycle } from '../shell/PortalLifecycle';
import { NullPortalSdk, type PortalSdk } from '../shell/PortalSdk';
import { computeViewport } from '../shell/ViewportModel';
import type { Viewport } from '../scene/SceneCompiler';
import { PAPER_STYLE_PACK } from '../style/paper/PaperStylePack';
import { rasterizeToPixelData } from './Canvas2D';
import { applyViewportToCanvas, createFullscreenBinding } from './Fullscreen';
import type { FetchOutcome } from '../assets/AssetFetcher';
import { createHttpAssetFetcher } from './HttpAssetFetcher';
import { createPokiPortalSdk } from './PokiPortalSdk';
import { createRafScheduler } from './RafScheduler';
import { createWebAudioDevice } from './WebAudioDevice';
import { createWebGl2Device } from './WebGl2Device';

/** World-units visible across the viewport's full width — a fixed game-design constant, never resize-dependent. */
const VIEWPORT_HALF_WIDTH = 6;
const VIEWPORT_HALF_HEIGHT = VIEWPORT_HALF_WIDTH * 0.6;
/** Rasterization reference: pixels-per-world-unit bitmaps are cached at, chosen for crisp output at a typical desktop canvas width. */
const REFERENCE_PIXELS_PER_WORLD_UNIT = 1280 / (VIEWPORT_HALF_WIDTH * 2);

interface ValidationReportLevel {
  readonly levelId: string;
}

async function fetchJson<T>(fetcher: { fetch(url: string): Promise<FetchOutcome> }, url: string): Promise<T> {
  const outcome = await fetcher.fetch(url);
  if (!outcome.ok) throw new Error(`Main: failed to fetch ${url}: ${outcome.error ?? 'unknown error'}`);
  const response = await fetch(url);
  return (await response.json()) as T;
}

async function loadCampaignSequence(fetcher: { fetch(url: string): Promise<FetchOutcome> }): Promise<readonly string[]> {
  const report = await fetchJson<{ perLevel: readonly ValidationReportLevel[] }>(fetcher, 'content/data/validation-report.json');
  return report.perLevel.map((entry) => entry.levelId);
}

async function loadLevel(fetcher: { fetch(url: string): Promise<FetchOutcome> }, levelId: string): Promise<LevelDefinition> {
  const raw = await fetchJson<unknown>(fetcher, `content/data/levels/${levelId}.json`);
  const result = parseLevel(raw);
  if (!result.ok) throw new Error(`Main: level ${levelId} failed schema validation: ${JSON.stringify(result.errors)}`);
  return result.value;
}

/** tileSizePx: the fixed rasterization resolution for one level, from the reference scale and this level's own world-unit tile size. */
function referenceTileSizePx(def: LevelDefinition): number {
  return Math.round(REFERENCE_PIXELS_PER_WORLD_UNIT * def.tilemap.tileSize);
}

export async function main(): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.id = 'jump-once-canvas';
  document.body.appendChild(canvas);

  const gl = canvas.getContext('webgl2');
  if (gl === null) throw new Error('Main: WebGL2 unavailable');
  const glDevice = createWebGl2Device(gl);
  const atlas = createAtlas(DEFAULT_ATLAS_PROFILE);

  const audioCtx = new AudioContext();
  const audioDevice = createWebAudioDevice(audioCtx);
  const audioExecutor = createAudioExecutor(audioDevice);

  const fetcher = createHttpAssetFetcher();
  const sdk: PortalSdk = window.PokiSDK !== undefined ? createPokiPortalSdk() : NullPortalSdk;
  const lifecycle = createPortalLifecycle(sdk, audioExecutor);

  const fullscreen = createFullscreenBinding((VIEWPORT_HALF_WIDTH * 2) / (VIEWPORT_HALF_HEIGHT * 2));
  function resizeCanvas(): void {
    applyViewportToCanvas(canvas, computeViewport(fullscreen.currentInput()));
  }
  resizeCanvas();
  fullscreen.onChange(resizeCanvas);

  const sequence = await loadCampaignSequence(fetcher);
  if (sequence.length === 0) throw new Error('Main: campaign sequence is empty');

  async function loadShellFor(levelId: string): Promise<GameShell> {
    const def = await loadLevel(fetcher, levelId);
    return createGameShell({ def, seed: 1, grammar: DEFAULT_GRAMMAR, pack: PAPER_STYLE_PACK, tileSizePx: referenceTileSizePx(def) }, lifecycle);
  }

  let sequenceIndex = 0;
  let shell = await loadShellFor(sequence[sequenceIndex]);

  await lifecycle.boot();
  lifecycle.reportLoadingFinished();

  let keyState: KeyState = NEUTRAL_KEY_STATE;
  window.addEventListener('keydown', (event) => {
    if (shouldPreventDefault(event.code)) event.preventDefault();
    keyState = applyKeyDown(keyState, event.code);
  });
  window.addEventListener('keyup', (event) => {
    keyState = applyKeyUp(keyState, event.code);
  });
  let previousKeyState: KeyState = NEUTRAL_KEY_STATE;

  const skipButton = document.createElement('button');
  skipButton.id = 'jump-once-rewarded-skip';
  skipButton.textContent = 'Skip (watch ad)';
  skipButton.style.display = 'none';
  document.body.appendChild(skipButton);
  let skipRequested = false;
  skipButton.addEventListener('click', () => {
    skipRequested = true;
  });

  let quality = createQualityController(DEFAULT_QUALITY_PROFILE);
  let advancing = false;

  async function advanceToNextLevel(): Promise<void> {
    if (advancing) return;
    advancing = true;
    try {
      sequenceIndex = (sequenceIndex + 1) % sequence.length;
      shell = await loadShellFor(sequence[sequenceIndex]);
    } finally {
      advancing = false;
    }
  }

  const rafScheduler = createRafScheduler();
  startFrameLoop(rafScheduler, (realDeltaSeconds) => {
    const input: InputFrame = deriveInputFrame(previousKeyState, keyState);
    previousKeyState = keyState;

    const viewport: Viewport = { halfWidth: VIEWPORT_HALF_WIDTH, halfHeight: VIEWPORT_HALF_HEIGHT };
    const frame = shell.advanceFrame(realDeltaSeconds, input, viewport);

    quality = reportFrameTime(DEFAULT_QUALITY_PROFILE, quality, realDeltaSeconds * 1000);
    const drawList = applyTier(frame.drawList, currentTier(DEFAULT_QUALITY_PROFILE, quality));

    const camera = shell.currentState().world.playerPosition;
    glDevice.setProjection({
      cameraX: camera.x,
      cameraY: camera.y,
      viewportHalfWidth: viewport.halfWidth,
      viewportHalfHeight: viewport.halfHeight,
      canvasWidthPx: canvas.width,
      canvasHeightPx: canvas.height,
      atlasPageSizePx: DEFAULT_ATLAS_PROFILE.pageSizePx,
      referencePixelsPerWorldUnit: REFERENCE_PIXELS_PER_WORLD_UNIT,
    });
    const batches = buildBatches(drawList, PAPER_STYLE_PACK, atlas, glDevice, rasterizeToPixelData);
    drawBatches(
      batches,
      glDevice,
      (page) => atlas.pageTexture(page),
      (page, device) => atlas.ensureBuffer(page, device),
    );

    audioExecutor.scheduleCues(frame.audioCues, PAPER_STYLE_PACK);

    const world = shell.currentState().world;
    skipButton.style.display = world.runState === 'playing' ? 'block' : 'none';
    if (skipRequested) {
      skipRequested = false;
      void lifecycle.requestRewardedSkip().then((granted) => {
        if (granted) void advanceToNextLevel();
      });
    }
    if (world.runState === 'completed') {
      void advanceToNextLevel();
    }
  });
}
