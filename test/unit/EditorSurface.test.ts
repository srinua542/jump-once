/**
 * S9.9 — render/tooling/EditorSurface: painting a P8 LevelDraft
 * (tools/level_editor/EditorState.ts, unmodified) into a scene through the
 * SAME StylePack/DrawList pipeline the shipped game uses, plus editor-only
 * grid/selection chrome; and mapping raw input into P8's EditorCommand
 * (fed straight into P8's own applyCommand/undo/redo, never re-implemented).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyCommand, createBlankDraft, type EntityDraft } from '../../tools/level_editor/EditorState';
import { DEFAULT_GRAMMAR } from '../../render/grammar/Grammar';
import { PAPER_STYLE_PACK } from '../../render/style/paper/PaperStylePack';
import { compileEditorScene, mapEditorInput } from '../../render/tooling/EditorSurface';

function spike(id: string, x: number, y: number): EntityDraft {
  return {
    id,
    transform: { position: { x, y }, facing: 1 },
    collider: { halfExtents: { x: 0.5, y: 0.5 }, offset: { x: 0, y: 0 } },
    behavior: { kind: 'spike' },
  };
}

test('compileEditorScene draws one terrain DrawItem per solid tile in a blank draft (the 3x3 solid border)', () => {
  const editor = createBlankDraft('surface-blank', 'Blank');
  const scene = compileEditorScene(editor.present, DEFAULT_GRAMMAR, PAPER_STYLE_PACK, 32, []);
  const solidCount = editor.present.tilemap.tiles.filter((t) => t === 1).length;
  assert.equal(scene.drawList.length, solidCount);
  assert.equal(solidCount, 8, 'a blank 3x3 draft has 8 solid border tiles and 1 empty interior cell');
});

test('compileEditorScene draws one DrawItem per placed entity, resolved through the real grammar category', () => {
  const editor = createBlankDraft('surface-entity', 'Entity');
  const withSpike = applyCommand(editor, { kind: 'placeEntity', entity: spike('e1', 1, 1) });
  const scene = compileEditorScene(withSpike.present, DEFAULT_GRAMMAR, PAPER_STYLE_PACK, 32, []);
  const solidCount = withSpike.present.tilemap.tiles.filter((t) => t === 1).length;
  assert.equal(scene.drawList.length, solidCount + 1);
  const spikeItem = scene.drawList.find((i) => i.request.role === 'spike');
  assert.ok(spikeItem);
  assert.equal(spikeItem!.category, 'danger', 'spike resolves to the danger category via the real grammar (DEFAULT_GRAMMAR)');
});

test('compileEditorScene grid has (width+1) vertical and (height+1) horizontal lines', () => {
  const editor = createBlankDraft('surface-grid', 'Grid');
  const scene = compileEditorScene(editor.present, DEFAULT_GRAMMAR, PAPER_STYLE_PACK, 32, []);
  const vertical = scene.grid.filter((g) => g.axis === 'vertical');
  const horizontal = scene.grid.filter((g) => g.axis === 'horizontal');
  assert.equal(vertical.length, editor.present.tilemap.width + 1);
  assert.equal(horizontal.length, editor.present.tilemap.height + 1);
});

test('compileEditorScene selection includes only the requested entity ids', () => {
  const editor = createBlankDraft('surface-selection', 'Selection');
  const withEntities = applyCommand(
    applyCommand(editor, { kind: 'placeEntity', entity: spike('a', 1, 1) }),
    { kind: 'placeEntity', entity: spike('b', 1, 1) },
  );
  const scene = compileEditorScene(withEntities.present, DEFAULT_GRAMMAR, PAPER_STYLE_PACK, 32, ['a']);
  assert.equal(scene.selection.length, 1);
  assert.equal(scene.selection[0].entityId, 'a');
});

test('mapEditorInput: paintTile inside bounds maps to the exact P8 paintTile command', () => {
  const editor = createBlankDraft('input-paint', 'Paint');
  const action = mapEditorInput({ kind: 'pointerDown', world: { x: 0.5, y: 0.5 }, tool: { kind: 'paintTile', tileId: 1 } }, editor.present);
  assert.deepEqual(action, { kind: 'command', command: { kind: 'paintTile', index: 0, tileId: 1 } });
});

test('mapEditorInput: paintTile outside bounds maps to none, not an out-of-range command', () => {
  const editor = createBlankDraft('input-paint-oob', 'Paint OOB');
  const action = mapEditorInput({ kind: 'pointerDown', world: { x: 99, y: 99 }, tool: { kind: 'paintTile', tileId: 1 } }, editor.present);
  assert.deepEqual(action, { kind: 'none' });
});

test('mapEditorInput: placeEntity produces a placeEntity command that, once applied through P8\'s own applyCommand, lands grid-snapped', () => {
  const editor = createBlankDraft('input-place', 'Place');
  const action = mapEditorInput(
    { kind: 'pointerDown', world: { x: 1.3, y: 1.7 }, tool: { kind: 'placeEntity', template: spike('new-spike', 0, 0) } },
    editor.present,
  );
  assert.equal(action.kind, 'command');
  const applied = applyCommand(editor, action.kind === 'command' ? action.command : { kind: 'ungroup', groupId: 'unreachable' });
  const placed = applied.present.entities.find((e) => e.id === 'new-spike');
  assert.ok(placed);
  assert.deepEqual(placed!.transform.position, { x: 1, y: 2 }, 'P8\'s own placeEntity grid-snaps — untouched by this mapping layer');
});

test('mapEditorInput: ctrl+Z maps to undo, ctrl+Y maps to redo, a plain key maps to none', () => {
  const editor = createBlankDraft('input-keys', 'Keys');
  assert.deepEqual(mapEditorInput({ kind: 'key', code: 'KeyZ', ctrlOrCmd: true }, editor.present), { kind: 'undo' });
  assert.deepEqual(mapEditorInput({ kind: 'key', code: 'KeyY', ctrlOrCmd: true }, editor.present), { kind: 'redo' });
  assert.deepEqual(mapEditorInput({ kind: 'key', code: 'KeyZ', ctrlOrCmd: false }, editor.present), { kind: 'none' });
});
