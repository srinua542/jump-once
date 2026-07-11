/**
 * PortalSdk — the typed seam over Poki's documented HTML5 lifecycle (S9.8,
 * dm-0086). Verified 2026-07-11 against sdk.poki.com: the SDK loads
 * exclusively from Poki's CDN (`https://game-cdn.poki.com/scripts/v2/
 * poki-sdk.js`, server-pushed updates — bundling is not the supported
 * path), exposing a `PokiSDK` global with exactly this lifecycle:
 * `init()` → `gameLoadingFinished()` → `gameplayStart()`/`gameplayStop()` →
 * `commercialBreak(onStart?)` / `rewardedBreak(opts?)`. Binding the real
 * CDN global is render/platform/'s job (not yet built, dm-0086's `.rejected
 * @poki/sdk@0.0.4` still holds) — `NullPortalSdk` here is both the
 * dev/test double AND Poki's own recommended local-dev mode: the game is
 * fully functional without the SDK present.
 */

export interface RewardedBreakOptions {
  readonly size?: 'small' | 'medium' | 'large';
}

export interface PortalSdk {
  init(): Promise<void>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  /** Resolves once the break completes (or Poki decides not to show one this time). */
  commercialBreak(onStart?: () => void): Promise<void>;
  /** Resolves true only if the player actually watched the reward through — REQ-174's P9 hook. */
  rewardedBreak(options?: RewardedBreakOptions): Promise<boolean>;
}

export const NullPortalSdk: PortalSdk = Object.freeze({
  async init(): Promise<void> {},
  gameLoadingFinished(): void {},
  gameplayStart(): void {},
  gameplayStop(): void {},
  async commercialBreak(onStart?: () => void): Promise<void> {
    onStart?.();
  },
  async rewardedBreak(): Promise<boolean> {
    return false;
  },
}) as PortalSdk;
