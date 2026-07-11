/**
 * ViewportModel — pure window/DPR/fullscreen → canvas-size math (S9.8,
 * REQ-171 responsive scaling). Fits the game's fixed world aspect ratio
 * inside whatever window size it's given, letterboxing the excess axis;
 * caps the effective device-pixel-ratio per the bible §5 performance
 * contract (2 for gameplay surfaces). `fullscreen` is tracked as a pure
 * input bit (open question 5, P9 plan) — this shell only REACTS to a
 * fullscreen state change, it never requests one; render/platform/ (not
 * yet built) is where an actual `requestFullscreen()` call would live, if
 * ever added.
 */

/** Bible §5: cap the device-pixel-ratio for gameplay surfaces at 2. */
export const GAMEPLAY_DPR_CAP = 2;

export interface ViewportInput {
  readonly windowWidthPx: number;
  readonly windowHeightPx: number;
  readonly devicePixelRatio: number;
  /** The game world's fixed target aspect ratio (width / height). Strictly positive. */
  readonly worldAspectRatio: number;
  readonly fullscreen: boolean;
}

export interface ViewportOutput {
  /** Physical canvas backing-store size, post-DPR-cap. */
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  /** CSS display size, letterboxed to fit the window. */
  readonly cssWidthPx: number;
  readonly cssHeightPx: number;
  /** Letterbox offset within the window (centers the canvas). */
  readonly offsetXPx: number;
  readonly offsetYPx: number;
  readonly effectiveDpr: number;
  readonly fullscreen: boolean;
}

export function computeViewport(input: ViewportInput): ViewportOutput {
  const effectiveDpr = Math.min(GAMEPLAY_DPR_CAP, Math.max(1, input.devicePixelRatio));
  const windowAspect = input.windowWidthPx / input.windowHeightPx;

  let cssWidthPx: number;
  let cssHeightPx: number;
  if (windowAspect > input.worldAspectRatio) {
    /* window is wider than the world wants — letterbox left/right */
    cssHeightPx = input.windowHeightPx;
    cssWidthPx = cssHeightPx * input.worldAspectRatio;
  } else {
    /* window is taller (or equal) — letterbox top/bottom */
    cssWidthPx = input.windowWidthPx;
    cssHeightPx = cssWidthPx / input.worldAspectRatio;
  }

  return {
    canvasWidthPx: Math.round(cssWidthPx * effectiveDpr),
    canvasHeightPx: Math.round(cssHeightPx * effectiveDpr),
    cssWidthPx,
    cssHeightPx,
    offsetXPx: (input.windowWidthPx - cssWidthPx) / 2,
    offsetYPx: (input.windowHeightPx - cssHeightPx) / 2,
    effectiveDpr,
    fullscreen: input.fullscreen,
  };
}
