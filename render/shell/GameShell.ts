/**
 * GameShell — the per-frame orchestrator (S9.8): `FrameScheduler tick →
 * Clock.advance → N fixed Engine steps → compileScene → (executor/audio
 * draw, done by the caller)`. A pure-per-call wrapper over the
 * already-proven `Engine`/`StateManager` (P1) + `CANONICAL_PIPELINE` (P4,
 * "the only sanctioned engine assembly order") — the same precedent
 * `tools/level_editor/Playtest.ts` set at P8 for an interactive driver,
 * extended here with real-time-driven step counts (via `Engine.tick`'s own
 * `realDeltaSeconds` parameter, never a re-derived clock), camera
 * smoothing, scene compilation, audio-cue derivation, the defeat marker,
 * and Poki lifecycle triggers (gameplayStart on first meaningful input,
 * gameplayStop on leaving `'playing'`, re-armed every life so the pair
 * repeats correctly across reloads).
 *
 * Projection purity (dm-0004/dm-0082): `advanceFrame` returns render-only
 * data; nothing it computes (camera, DrawList, cues) is ever written back
 * into `WorldState`. `realDeltaSeconds` is real time's ONLY door into the
 * sim, exactly as `Clock.advance` already specifies — GameShell does not
 * reimplement or bypass that contract, it calls `Engine.tick` verbatim.
 *
 * Cue/lifecycle derivation is scoped from the state BEFORE this call's
 * `Engine.tick` to the state AFTER it (across however many internal fixed
 * steps that real delta banks) — a documented simplification: if a real
 * frame ever banks more than one fixed step (uncommon at a 60Hz target
 * against a 60Hz+ display), a transition that fires then reverses within
 * that same frame could be missed. Revisit only if real playtesting shows
 * this matters (mirrors dm-0094's culling-precision tradeoff).
 */

import type { LevelDefinition } from '../../src/components/Level';
import { Engine } from '../../src/core/Engine';
import type { InputFrame } from '../../src/core/State';
import { StateManager } from '../../src/core/StateManager';
import { createInitialState, type JumpOnceState, type WorldState } from '../../src/entities/World';
import { CANONICAL_PIPELINE } from '../../src/eval/AgentHarness';
import type { AudioCue } from '../audio/CueDerivation';
import { deriveAudioCues } from '../audio/CueDerivation';
import { deriveDefeatMarker, type DefeatMarker } from '../feel/DefeatMarker';
import type { VisualGrammar } from '../grammar/Grammar';
import { createCamera, updateCamera, DEFAULT_CAMERA_PROFILE, type CameraProfile } from '../scene/Camera';
import type { DrawList } from '../scene/DrawList';
import { compileScene, type Viewport } from '../scene/SceneCompiler';
import type { StylePack } from '../style/StylePack';
import type { PortalLifecycle } from './PortalLifecycle';

export interface GameShellOptions {
  readonly def: LevelDefinition;
  readonly seed: number;
  readonly grammar: VisualGrammar;
  readonly pack: StylePack;
  readonly tileSizePx: number;
  readonly cameraProfile?: CameraProfile;
}

export interface FrameOutput {
  readonly drawList: DrawList;
  readonly audioCues: readonly AudioCue[];
  readonly defeatMarker: DefeatMarker | null;
}

export interface GameShell {
  advanceFrame(realDeltaSeconds: number, input: InputFrame, viewport: Viewport): FrameOutput;
  currentState(): JumpOnceState;
}

function isMeaningfulInput(input: InputFrame): boolean {
  return input.moveAxis !== 0 || input.jumpPressed || input.resetPressed;
}

export function createGameShell(options: GameShellOptions, lifecycle: PortalLifecycle): GameShell {
  const manager = new StateManager<WorldState>(createInitialState(options.def, options.seed));
  const engine = new Engine<WorldState>({ systems: CANONICAL_PIPELINE, stateManager: manager });

  const spawn = manager.getState().world.playerPosition;
  let camera = createCamera(spawn.x, spawn.y);
  let isActivelyPlaying = false;

  function advanceFrame(realDeltaSeconds: number, input: InputFrame, viewport: Viewport): FrameOutput {
    const beforeWorld = manager.getState().world;
    manager.commit({ ...manager.getState(), input });
    const current = engine.tick(realDeltaSeconds);
    const previousForInterpolation = manager.getPreviousState();

    camera = updateCamera(camera, current.world.playerPosition, options.cameraProfile ?? DEFAULT_CAMERA_PROFILE);
    const alpha = engine.interpolationAlpha;

    const drawList = compileScene(current, previousForInterpolation, alpha, options.grammar, options.pack, camera, viewport, options.tileSizePx);
    const audioCues = deriveAudioCues(beforeWorld, current.world, options.grammar);
    const defeatMarker = deriveDefeatMarker(current.world);

    if (!isActivelyPlaying && isMeaningfulInput(input)) {
      isActivelyPlaying = true;
      lifecycle.notifyGameplayStart();
    }
    if (isActivelyPlaying && beforeWorld.runState === 'playing' && current.world.runState !== 'playing') {
      isActivelyPlaying = false;
      lifecycle.notifyGameplayStop();
    }

    return { drawList, audioCues, defeatMarker };
  }

  return {
    advanceFrame,
    currentState: () => manager.getState(),
  };
}
