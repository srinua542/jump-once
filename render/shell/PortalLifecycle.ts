/**
 * PortalLifecycle — orchestrates the Poki SDK lifecycle around the shell's
 * own state (S9.8). Ordering contract (Poki's documented lifecycle):
 * `boot` (init) happens once at startup; `reportLoadingFinished` fires once
 * critical assets are ready (S9.7's `loadCriticalTier`); `notifyGameplayStart`
 * fires on the player's first meaningful input; `notifyGameplayStop` fires
 * on defeat/goal. `requestBreak` wraps `PortalSdk.commercialBreak` with the
 * documented hard requirement — audio AND input disabled during the break —
 * by muting the S9.6 `AudioExecutor` and raising `inputSuspended` before the
 * break starts, and reversing both after it resolves, in every case
 * (including if the break itself rejects — the `finally` guarantees resume).
 */

import type { AudioExecutor } from '../audio/AudioExecutor';
import type { PortalSdk } from './PortalSdk';

export interface PortalLifecycle {
  readonly inputSuspended: boolean;
  boot(): Promise<void>;
  reportLoadingFinished(): void;
  notifyGameplayStart(): void;
  notifyGameplayStop(): void;
  requestBreak(onStart?: () => void): Promise<void>;
}

export function createPortalLifecycle(sdk: PortalSdk, audio: AudioExecutor): PortalLifecycle {
  let inputSuspended = false;
  return {
    get inputSuspended() {
      return inputSuspended;
    },
    async boot(): Promise<void> {
      await sdk.init();
    },
    reportLoadingFinished(): void {
      sdk.gameLoadingFinished();
    },
    notifyGameplayStart(): void {
      sdk.gameplayStart();
    },
    notifyGameplayStop(): void {
      sdk.gameplayStop();
    },
    async requestBreak(onStart?: () => void): Promise<void> {
      inputSuspended = true;
      audio.muteForBreak();
      try {
        await sdk.commercialBreak(onStart);
      } finally {
        audio.resume();
        inputSuspended = false;
      }
    },
  };
}
