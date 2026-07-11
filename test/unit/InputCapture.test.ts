/**
 * S9.8 — InputCapture: pure key-state -> InputFrame mapping (REQ-171).
 * Prevent-default flagging for space/arrows; key-to-role mapping; edge-
 * triggered jump/reset matching P1's InputFrame contract.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyKeyDown,
  applyKeyUp,
  deriveInputFrame,
  NEUTRAL_KEY_STATE,
  shouldPreventDefault,
} from '../../render/shell/InputCapture';

test('shouldPreventDefault flags space and arrow keys, nothing else', () => {
  for (const code of ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    assert.equal(shouldPreventDefault(code), true, `expected ${code} to be prevented`);
  }
  for (const code of ['KeyA', 'KeyR', 'Enter', 'Escape', 'Tab']) {
    assert.equal(shouldPreventDefault(code), false, `expected ${code} to NOT be prevented`);
  }
});

test('applyKeyDown/applyKeyUp toggle the correct KeyState field for every alias, and ignore unknown codes', () => {
  let state = NEUTRAL_KEY_STATE;
  state = applyKeyDown(state, 'ArrowLeft');
  assert.equal(state.left, true);
  state = applyKeyUp(state, 'ArrowLeft');
  assert.equal(state.left, false);

  state = applyKeyDown(state, 'KeyD');
  assert.equal(state.right, true);

  state = applyKeyDown(state, 'Space');
  assert.equal(state.jump, true);
  state = applyKeyDown(state, 'ArrowUp'); // still jump — a second jump-mapped key held
  assert.equal(state.jump, true);

  state = applyKeyDown(state, 'KeyR');
  assert.equal(state.reset, true);

  const untouched = applyKeyDown(NEUTRAL_KEY_STATE, 'Escape');
  assert.deepEqual(untouched, NEUTRAL_KEY_STATE);
});

test('deriveInputFrame computes moveAxis from left/right, cancelling when both are held', () => {
  const leftOnly = applyKeyDown(NEUTRAL_KEY_STATE, 'ArrowLeft');
  const rightOnly = applyKeyDown(NEUTRAL_KEY_STATE, 'ArrowRight');
  const both = applyKeyDown(leftOnly, 'ArrowRight');
  assert.equal(deriveInputFrame(NEUTRAL_KEY_STATE, leftOnly).moveAxis, -1);
  assert.equal(deriveInputFrame(NEUTRAL_KEY_STATE, rightOnly).moveAxis, 1);
  assert.equal(deriveInputFrame(NEUTRAL_KEY_STATE, both).moveAxis, 0);
});

test('jumpPressed/resetPressed are edge-triggered: true only on the frame newly pressed, false while held', () => {
  const idle = NEUTRAL_KEY_STATE;
  const justPressed = applyKeyDown(idle, 'Space');
  const stillHeld = justPressed; // same object — holding, not a new press

  assert.equal(deriveInputFrame(idle, justPressed).jumpPressed, true, 'the transition into pressed must fire the edge');
  assert.equal(deriveInputFrame(justPressed, stillHeld).jumpPressed, false, 'continuing to hold must not re-fire');

  const released = applyKeyUp(justPressed, 'Space');
  assert.equal(deriveInputFrame(justPressed, released).jumpPressed, false);

  const pressedAgain = applyKeyDown(released, 'Space');
  assert.equal(deriveInputFrame(released, pressedAgain).jumpPressed, true, 'a fresh press after release must fire again');
});
