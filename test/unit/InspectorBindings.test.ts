/**
 * S9.9 — render/tooling/InspectorBindings: UI commands dispatching straight
 * to P8's Inspector (tools/debug/Inspector.ts, unmodified) — one command,
 * one Inspector method call, zero new mutation logic.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { InputFrame } from '../../src/core/State';
import { buildGridLevel } from '../helpers/GridLevel';
import { startPlaytest } from '../../tools/level_editor/Playtest';
import { createInspector } from '../../tools/debug/Inspector';
import { applyInspectorCommand } from '../../render/tooling/InspectorBindings';

const LEVEL = buildGridLevel('inspector-bindings-runway', ['S....G', '######']);

function right(): InputFrame {
  return { moveAxis: 1, jumpPressed: false, resetPressed: false };
}

test('pause/resume UI commands gate feedInput exactly like calling Inspector directly', () => {
  const inspector = createInspector(startPlaytest(LEVEL, 7));
  applyInspectorCommand(inspector, { kind: 'pause' });
  assert.equal(inspector.isPaused(), true);
  const whilePaused = applyInspectorCommand(inspector, { kind: 'feedInput', frame: right() });
  assert.equal(whilePaused.tick, 0, 'paused: feedInput UI command is a no-op, same as the raw Inspector');

  applyInspectorCommand(inspector, { kind: 'resume' });
  assert.equal(inspector.isPaused(), false);
  const afterResume = applyInspectorCommand(inspector, { kind: 'feedInput', frame: right() });
  assert.equal(afterResume.tick, 1);
});

test('stepFrame UI command advances exactly one tick with neutral input', () => {
  const inspector = createInspector(startPlaytest(LEVEL, 7));
  const stepped = applyInspectorCommand(inspector, { kind: 'stepFrame' });
  assert.equal(stepped.tick, 1);
  assert.equal(stepped.input.moveAxis, 0);
});

test('setVariable UI command commits through the real Inspector.setVariable (dm-0070 preserved)', () => {
  const inspector = createInspector(startPlaytest(LEVEL, 7));
  const before = inspector.currentState();
  const after = applyInspectorCommand(inspector, { kind: 'setVariable', patch: { attemptCount: 9 } });
  assert.equal(after.world.attemptCount, 9);
  assert.notEqual(after, before);
});

test('reload UI command discards runtime progress', () => {
  const inspector = createInspector(startPlaytest(LEVEL, 7));
  applyInspectorCommand(inspector, { kind: 'feedInput', frame: right() });
  const reloaded = applyInspectorCommand(inspector, { kind: 'reload' });
  assert.equal(reloaded.tick, 0);
  assert.deepEqual(reloaded.world.playerPosition, LEVEL.constraints.spawn);
});
