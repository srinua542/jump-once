/**
 * AudioExecutor — schedules derived cues through `PatchCompiler`, gated by
 * mute state (S9.6). Poki's documented ad-break requirement: "audio and
 * keyboard input disabled during commercialBreaks" — `muteForBreak()` both
 * silences the master gain AND stops `scheduleCues` from issuing any new
 * device calls at all (not merely playing them silently), so a break costs
 * zero audio-graph churn, not just zero audible sound.
 */

import type { StylePack } from '../style/StylePack';
import type { AudioDevice } from './AudioDevice';
import type { AudioCue } from './CueDerivation';
import { compilePatch } from './PatchCompiler';

export interface AudioExecutor {
  readonly muted: boolean;
  scheduleCues(cues: readonly AudioCue[], pack: StylePack): void;
  muteForBreak(): void;
  resume(): void;
}

export function createAudioExecutor(device: AudioDevice): AudioExecutor {
  let muted = false;
  return {
    get muted() {
      return muted;
    },
    scheduleCues(cues, pack) {
      if (muted) return;
      for (const cue of cues) compilePatch(pack.audioPatch(cue.category), device);
    },
    muteForBreak() {
      muted = true;
      device.setMasterGain(0);
    },
    resume() {
      muted = false;
      device.setMasterGain(1);
    },
  };
}
