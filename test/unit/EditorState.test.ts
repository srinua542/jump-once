/**
 * S8.1 — editor draft/authoring state (REQ-130 P8 share): paint/place/group/
 * undo/redo as pure snapshot-based transitions over a LevelDraft, and export
 * as a thin, gating call into the real parseLevel (dm-0013).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyCommand,
  createBlankDraft,
  exportDraft,
  redo,
  snapToGrid,
  undo,
  type EditorDraft,
} from '../../tools/level_editor/EditorState';

function spike(id: string, x: number, y: number) {
  return {
    id,
    transform: { position: { x, y }, facing: 1 as const },
    collider: { halfExtents: { x: 0.5, y: 0.5 }, offset: { x: 0, y: 0 } },
    behavior: { kind: 'spike' as const },
  };
}

test('createBlankDraft produces a strict-parse-valid level', () => {
  const editor = createBlankDraft('editor-blank', 'Blank Draft');
  const result = exportDraft(editor.present);
  assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.errors));
});

test('paintTile edits exactly the addressed cell and nothing else', () => {
  const editor = createBlankDraft('editor-paint', 'Paint');
  const before = editor.present.tilemap.tiles;
  const after = applyCommand(editor, { kind: 'paintTile', index: 4, tileId: 1 });
  assert.deepEqual(
    after.present.tilemap.tiles,
    before.map((t, i) => (i === 4 ? 1 : t)),
  );
});

test('placeEntity grid-snaps the position and appends the entity', () => {
  const editor = createBlankDraft('editor-place', 'Place');
  const off = spike('spike-1', 1.2, 1.4); // tileSize 1 -> snaps to (1, 1)
  const after = applyCommand(editor, { kind: 'placeEntity', entity: off });
  assert.equal(after.present.entities.length, 1);
  assert.deepEqual(after.present.entities[0].transform.position, { x: 1, y: 1 });
  assert.equal(after.present.entities[0].id, 'spike-1');
});

test('snapToGrid snaps to the nearest tile-size multiple', () => {
  assert.deepEqual(snapToGrid({ x: 2.3, y: 2.6 }, 1), { x: 2, y: 3 });
  assert.deepEqual(snapToGrid({ x: 4.9, y: 0.4 }, 2), { x: 4, y: 0 });
});

test('groupEntities records membership; ungroup removes exactly that group', () => {
  const editor = createBlankDraft('editor-group', 'Group');
  const withEntities = applyCommand(
    applyCommand(editor, { kind: 'placeEntity', entity: spike('a', 1, 1) }),
    { kind: 'placeEntity', entity: spike('b', 1, 1) },
  );
  const grouped = applyCommand(withEntities, { kind: 'groupEntities', groupId: 'g1', entityIds: ['a', 'b'] });
  assert.deepEqual(grouped.present.groups, { g1: ['a', 'b'] });
  const ungrouped = applyCommand(grouped, { kind: 'ungroup', groupId: 'g1' });
  assert.deepEqual(ungrouped.present.groups, {});
});

test('ungrouping a nonexistent group is a no-op, not an error', () => {
  const editor = createBlankDraft('editor-ungroup-noop', 'Ungroup noop');
  const after = applyCommand(editor, { kind: 'ungroup', groupId: 'never-existed' });
  assert.deepEqual(after.present, editor.present);
});

test('groups are editor-only and never appear in the exported LevelDefinition', () => {
  const editor = createBlankDraft('editor-export-groups', 'Export groups');
  const withEntities = applyCommand(editor, { kind: 'placeEntity', entity: spike('a', 1, 1) });
  const grouped = applyCommand(withEntities, { kind: 'groupEntities', groupId: 'g1', entityIds: ['a'] });
  const result = exportDraft(grouped.present);
  assert.equal(result.ok, true);
  assert.ok(result.ok && !('groups' in result.value));
});

test('undo restores the EXACT prior draft (deep-equal, snapshot-based, dm construction)', () => {
  const editor = createBlankDraft('editor-undo', 'Undo');
  const beforePaint = editor.present;
  const painted = applyCommand(editor, { kind: 'paintTile', index: 0, tileId: 0 });
  const undone = undo(painted);
  assert.deepEqual(undone.present, beforePaint);
});

test('redo re-applies an undone command exactly (redo restores)', () => {
  const editor = createBlankDraft('editor-redo', 'Redo');
  const painted = applyCommand(editor, { kind: 'paintTile', index: 0, tileId: 0 });
  const undone = undo(painted);
  const redone = redo(undone);
  assert.deepEqual(redone.present, painted.present);
});

test('multi-step undo/redo round-trips through several commands', () => {
  let editor: EditorDraft = createBlankDraft('editor-multi', 'Multi');
  const snapshots: EditorDraft['present'][] = [editor.present];
  editor = applyCommand(editor, { kind: 'placeEntity', entity: spike('a', 1, 1) });
  snapshots.push(editor.present);
  editor = applyCommand(editor, { kind: 'placeEntity', entity: spike('b', 1, 1) });
  snapshots.push(editor.present);
  editor = applyCommand(editor, { kind: 'groupEntities', groupId: 'g', entityIds: ['a', 'b'] });
  snapshots.push(editor.present);

  editor = undo(editor);
  assert.deepEqual(editor.present, snapshots[2]);
  editor = undo(editor);
  assert.deepEqual(editor.present, snapshots[1]);
  editor = undo(editor);
  assert.deepEqual(editor.present, snapshots[0]);
  // one past the bottom is a no-op
  editor = undo(editor);
  assert.deepEqual(editor.present, snapshots[0]);

  editor = redo(editor);
  editor = redo(editor);
  editor = redo(editor);
  assert.deepEqual(editor.present, snapshots[3]);
  // one past the top is a no-op
  editor = redo(editor);
  assert.deepEqual(editor.present, snapshots[3]);
});

test('a new command after undo clears the redo stack (standard editor semantics)', () => {
  let editor: EditorDraft = createBlankDraft('editor-branch', 'Branch');
  editor = applyCommand(editor, { kind: 'paintTile', index: 0, tileId: 0 });
  editor = undo(editor);
  editor = applyCommand(editor, { kind: 'paintTile', index: 1, tileId: 0 });
  const redone = redo(editor);
  assert.deepEqual(redone.present, editor.present, 'redo after a fresh edit must be a no-op');
});

test('an invalid draft (out-of-range paint index) never exports', () => {
  const editor = createBlankDraft('editor-invalid', 'Invalid');
  assert.throws(() => applyCommand(editor, { kind: 'paintTile', index: 999, tileId: 1 }));
});

test('a duplicate entity id fails export with a path-qualified error, never a throw', () => {
  const editor = createBlankDraft('editor-dup', 'Dup');
  const withDup = applyCommand(
    applyCommand(editor, { kind: 'placeEntity', entity: spike('same', 1, 1) }),
    { kind: 'placeEntity', entity: spike('same', 1, 1) },
  );
  const result = exportDraft(withDup.present);
  assert.equal(result.ok, false);
  assert.ok(result.ok === false && result.errors.some((e) => e.message.includes('duplicate entity id')));
});

test('export is deterministic: the same draft exports byte-identical serialized output twice', () => {
  const editor = createBlankDraft('editor-deterministic', 'Deterministic');
  const a = exportDraft(editor.present);
  const b = exportDraft(editor.present);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.deepEqual(a, b);
});
