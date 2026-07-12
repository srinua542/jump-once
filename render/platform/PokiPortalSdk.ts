/**
 * PokiPortalSdk — the real PokiSDK script-tag global binding for the
 * `PortalSdk` seam (render/shell/PortalSdk.ts, S11.2, dm-0086/dm-0120/
 * dm-0121). Poki's SDK loads exclusively via a CDN `<script>` tag
 * (`https://game-cdn.poki.com/scripts/v2/poki-sdk.js`, server-pushed
 * updates — dm-0120: NEVER bundled), which installs a global `PokiSDK`
 * object before `createPokiPortalSdk()` is ever called (render/platform/
 * Main.ts's construction order enforces this — the script tag precedes the
 * client bundle in the generated `index.html`, S11.3). Construction only:
 * each `PortalSdk` method forwards 1:1 to the same-named `PokiSDK` method;
 * the one guard (missing-global check) is a fail-fast precondition on an
 * external resource, not gameplay branching.
 */

import type { PortalSdk, RewardedBreakOptions } from '../shell/PortalSdk';

interface PokiSdkGlobal {
  init(): Promise<void>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(onStart?: () => void): Promise<void>;
  rewardedBreak(options?: RewardedBreakOptions): Promise<boolean>;
}

declare global {
  interface Window {
    PokiSDK?: PokiSdkGlobal;
  }
}

export function createPokiPortalSdk(): PortalSdk {
  const sdk = window.PokiSDK;
  if (sdk === undefined) {
    throw new Error('PokiPortalSdk: window.PokiSDK is not present — the Poki CDN <script> tag must load before createPokiPortalSdk() is called');
  }
  return {
    init: () => sdk.init(),
    gameLoadingFinished: () => sdk.gameLoadingFinished(),
    gameplayStart: () => sdk.gameplayStart(),
    gameplayStop: () => sdk.gameplayStop(),
    commercialBreak: (onStart) => sdk.commercialBreak(onStart),
    rewardedBreak: (options) => sdk.rewardedBreak(options),
  };
}
