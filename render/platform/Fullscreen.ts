/**
 * Fullscreen — the real window-resize + `document.fullscreenElement`
 * binding feeding `ViewportModel` (render/shell/ViewportModel.ts, S11.2,
 * REQ-171). Construction only: reads `window.innerWidth`/`innerHeight`/
 * `devicePixelRatio` and `document.fullscreenElement`, forwards a change
 * callback on resize/fullscreenchange events, and exposes
 * `requestFullscreen`/`exitFullscreen` as thin forwards to the real DOM
 * calls. `ViewportModel.computeViewport` (pure) does all the actual
 * letterbox/DPR math — this file only supplies its inputs and applies its
 * outputs to the canvas element.
 */

import type { ViewportInput, ViewportOutput } from '../shell/ViewportModel';

export interface FullscreenBinding {
  currentInput(): ViewportInput;
  requestFullscreen(element: HTMLElement): Promise<void>;
  exitFullscreen(): Promise<void>;
  /** Registers a callback fired on resize or fullscreen-state change; returns an unsubscribe function. */
  onChange(callback: () => void): () => void;
}

export function createFullscreenBinding(worldAspectRatio: number): FullscreenBinding {
  return {
    currentInput(): ViewportInput {
      return {
        windowWidthPx: window.innerWidth,
        windowHeightPx: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        worldAspectRatio,
        fullscreen: document.fullscreenElement !== null,
      };
    },
    async requestFullscreen(element: HTMLElement): Promise<void> {
      await element.requestFullscreen();
    },
    async exitFullscreen(): Promise<void> {
      await document.exitFullscreen();
    },
    onChange(callback: () => void): () => void {
      window.addEventListener('resize', callback);
      document.addEventListener('fullscreenchange', callback);
      return () => {
        window.removeEventListener('resize', callback);
        document.removeEventListener('fullscreenchange', callback);
      };
    },
  };
}

/** Apply a computed ViewportOutput to a real canvas element's backing store + CSS size. */
export function applyViewportToCanvas(canvas: HTMLCanvasElement, output: ViewportOutput): void {
  canvas.width = output.canvasWidthPx;
  canvas.height = output.canvasHeightPx;
  canvas.style.width = `${output.cssWidthPx}px`;
  canvas.style.height = `${output.cssHeightPx}px`;
}
