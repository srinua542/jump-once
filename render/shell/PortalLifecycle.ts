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
 *
 * `requestRewardedSkip` (S11.2, REQ-174 runtime share, dm-0121) is the
 * missing wiring P9 built the shell mechanism for but never closed: it
 * wraps `PortalSdk.rewardedBreak` with the IDENTICAL mute/suspend discipline
 * as `requestBreak` (the player must not be able to act on stale input
 * while an ad plays over the level) and — unlike `requestBreak` — surfaces
 * the SDK's own boolean result: `true` only if the player actually watched
 * the reward through (per `PortalSdk.rewardedBreak`'s own contract),
 * `false` on a declined/skipped/failed break. Unlike `commercialBreak`,
 * `rewardedBreak` takes no `onStart` callback (the player already clicked a
 * "watch ad to skip" affordance to trigger it — there is no unannounced
 * natural-pause timing to coordinate, unlike a commercial break). The
 * caller (render/platform/Main.ts) is responsible for actually skipping the
 * level or revealing the `altRouteHint` ONLY when this resolves `true` — no
 * IAP, no currency, matching REQ-174's explicit "no paid currency anywhere"
 * clause; this module never invents a bypass.
 */

import type { AudioExecutor } from '../audio/AudioExecutor';
import type { PortalSdk, RewardedBreakOptions } from './PortalSdk';

export interface PortalLifecycle {
  readonly inputSuspended: boolean;
  boot(): Promise<void>;
  reportLoadingFinished(): void;
  notifyGameplayStart(): void;
  notifyGameplayStop(): void;
  requestBreak(onStart?: () => void): Promise<void>;
  /** Resolves true only if the player watched the reward through — the caller grants the skip/hint only then. */
  requestRewardedSkip(options?: RewardedBreakOptions): Promise<boolean>;
}

export function createPortalLifecycle(sdk: PortalSdk, audio: AudioExecutor): PortalLifecycle {
  let inputSuspended = false;

  async function withSuspendedInputAndMutedAudio<T>(run: () => Promise<T>): Promise<T> {
    inputSuspended = true;
    audio.muteForBreak();
    try {
      return await run();
    } finally {
      audio.resume();
      inputSuspended = false;
    }
  }

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
      await withSuspendedInputAndMutedAudio(() => sdk.commercialBreak(onStart));
    },
    async requestRewardedSkip(options?: RewardedBreakOptions): Promise<boolean> {
      return withSuspendedInputAndMutedAudio(() => sdk.rewardedBreak(options));
    },
  };
}
