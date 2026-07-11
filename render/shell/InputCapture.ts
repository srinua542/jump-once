/**
 * InputCapture — pure key-state → `InputFrame` mapping (S9.8). `InputFrame`
 * is edge-triggered for jump/reset (P1's `State.ts`: "true only on the
 * frame newly pressed"), so this module tracks the PREVIOUS key state to
 * derive that edge — the only state it carries; everything else is a pure
 * function. The actual `KeyboardEvent` listener binding is
 * render/platform/'s job (not yet built); this module only decides WHAT a
 * given key code means and WHETHER the browser's default action for it
 * must be prevented (REQ-171's "no page-scroll-on-spacebar" requirement).
 */

import type { InputFrame } from '../../src/core/State';

export interface KeyState {
  readonly left: boolean;
  readonly right: boolean;
  readonly jump: boolean;
  readonly reset: boolean;
}

export const NEUTRAL_KEY_STATE: KeyState = Object.freeze({ left: false, right: false, jump: false, reset: false });

/** Key codes whose default browser action (page scroll) must be prevented when the game has focus. */
const PREVENT_DEFAULT_CODES: ReadonlySet<string> = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

export function shouldPreventDefault(code: string): boolean {
  return PREVENT_DEFAULT_CODES.has(code);
}

export function applyKeyDown(state: KeyState, code: string): KeyState {
  switch (code) {
    case 'ArrowLeft':
    case 'KeyA':
      return { ...state, left: true };
    case 'ArrowRight':
    case 'KeyD':
      return { ...state, right: true };
    case 'Space':
    case 'ArrowUp':
    case 'KeyW':
      return { ...state, jump: true };
    case 'KeyR':
      return { ...state, reset: true };
    default:
      return state;
  }
}

export function applyKeyUp(state: KeyState, code: string): KeyState {
  switch (code) {
    case 'ArrowLeft':
    case 'KeyA':
      return { ...state, left: false };
    case 'ArrowRight':
    case 'KeyD':
      return { ...state, right: false };
    case 'Space':
    case 'ArrowUp':
    case 'KeyW':
      return { ...state, jump: false };
    case 'KeyR':
      return { ...state, reset: false };
    default:
      return state;
  }
}

/** Derive one InputFrame from the transition previous -> current KeyState. jump/reset are edge-triggered. */
export function deriveInputFrame(previous: KeyState, current: KeyState): InputFrame {
  const axis = (current.right ? 1 : 0) - (current.left ? 1 : 0);
  return {
    moveAxis: axis as -1 | 0 | 1,
    jumpPressed: current.jump && !previous.jump,
    resetPressed: current.reset && !previous.reset,
  };
}
