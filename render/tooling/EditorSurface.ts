/**
 * EditorSurface — REQ-130 P9 share: painting a `LevelDraft` (the P8
 * plain-data authoring state, `tools/level_editor/EditorState.ts`) into a
 * scene, and mapping raw editor input into P8's `EditorCommand`/undo/redo
 * unchanged.
 *
 * `render/tooling/` is the ONLY `render/` area permitted to import `tools/`
 * (dm-0081). Zero P8 modification: `EditorCommand`'s union, `applyCommand`,
 * `undo`, `redo` and `snapToGrid` are consumed verbatim — this module only
 * decides WHICH command a raw pointer/key event produces, never how it is
 * applied.
 *
 * Entities and terrain are drawn through the SAME `StylePack`/`DrawList`
 * pipeline the shipped game itself uses (`render/scene/SceneCompiler.ts`'s
 * `isSolidTile`/`terrainMask`/`terrainVariant`/`visualItem`, reused verbatim
 * rather than re-derived — a `LevelDraft.tilemap`/`EntityDraft` is
 * structurally identical to `WorldState.level.tilemap`/`EntityDef` apart from
 * the yet-unminted id brands, dm-0013): what the editor shows is exactly
 * what the shipped scene compiler would draw. `grid` and `selection` have no
 * grammar signature at all — they are editor-only UI chrome, not gameplay
 * meaning, so they are a separate, StylePack-free primitive list.
 */

import type { Vec2 } from '../../src/core/Vec2';
import type { EditorCommand, EntityDraft, LevelDraft } from '../../tools/level_editor/EditorState';
import { resolveCategory, type VisualGrammar } from '../grammar/Grammar';
import type { StylePack, VisualRequest } from '../style/StylePack';
import type { DrawItem, DrawList } from '../scene/DrawList';
import { isSolidTile, terrainMask, terrainVariant, visualItem } from '../scene/SceneCompiler';

export interface GridLine {
  readonly axis: 'vertical' | 'horizontal';
  /** World-space coordinate the line runs along (x for vertical, y for horizontal). */
  readonly at: number;
}

export interface SelectionMarker {
  readonly entityId: string;
  readonly cx: number;
  readonly cy: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

export interface EditorScene {
  /** Terrain + entities, through the real StylePack/Grammar pipeline — WYSIWYG with the shipped renderer. */
  readonly drawList: DrawList;
  readonly grid: readonly GridLine[];
  readonly selection: readonly SelectionMarker[];
}

/** Compile a `LevelDraft` into a paintable scene: real terrain+entity visuals, plus editor-only grid/selection chrome. */
export function compileEditorScene(
  draft: LevelDraft,
  grammar: VisualGrammar,
  pack: StylePack,
  tileSizePx: number,
  selectedEntityIds: readonly string[],
): EditorScene {
  const items: DrawItem[] = [];
  const { width, height, tileSize } = draft.tilemap;
  const terrainCategory = resolveCategory(grammar, 'terrain');

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (!isSolidTile(draft.tilemap, col, row)) continue;
      const mask = terrainMask(draft.tilemap, col, row);
      const variant = terrainVariant(col, row);
      const request: VisualRequest = { role: 'terrain', state: `${mask}:${variant}`, widthPx: tileSizePx, heightPx: tileSizePx, identitySeed: 0 };
      items.push(visualItem(pack, request, col * tileSize, row * tileSize, terrainCategory));
    }
  }

  for (const entity of draft.entities) {
    const category = resolveCategory(grammar, entity.behavior.kind);
    const request: VisualRequest = { role: entity.behavior.kind, state: 'default', widthPx: tileSizePx, heightPx: tileSizePx, identitySeed: 0 };
    items.push(visualItem(pack, request, entity.transform.position.x, entity.transform.position.y, category));
  }

  const grid: GridLine[] = [];
  for (let col = 0; col <= width; col++) grid.push({ axis: 'vertical', at: col * tileSize });
  for (let row = 0; row <= height; row++) grid.push({ axis: 'horizontal', at: row * tileSize });

  const selectedIds = new Set(selectedEntityIds);
  const selection: SelectionMarker[] = draft.entities
    .filter((e) => selectedIds.has(e.id))
    .map((e) => ({
      entityId: e.id,
      cx: e.transform.position.x + e.collider.offset.x,
      cy: e.transform.position.y + e.collider.offset.y,
      halfWidth: e.collider.halfExtents.x,
      halfHeight: e.collider.halfExtents.y,
    }));

  return { drawList: items, grid, selection };
}

export type EditorTool =
  | { readonly kind: 'paintTile'; readonly tileId: number }
  | { readonly kind: 'placeEntity'; readonly template: EntityDraft };

export type EditorInputEvent =
  | { readonly kind: 'pointerDown'; readonly world: Vec2; readonly tool: EditorTool }
  | { readonly kind: 'key'; readonly code: string; readonly ctrlOrCmd: boolean };

export type EditorAction =
  | { readonly kind: 'command'; readonly command: EditorCommand }
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' }
  | { readonly kind: 'none' };

/** Map a raw pointer/key event into exactly one P8 `EditorCommand` (or undo/redo/none) — never applies it. */
export function mapEditorInput(event: EditorInputEvent, draft: LevelDraft): EditorAction {
  if (event.kind === 'key') {
    if (event.ctrlOrCmd && event.code === 'KeyZ') return { kind: 'undo' };
    if (event.ctrlOrCmd && event.code === 'KeyY') return { kind: 'redo' };
    return { kind: 'none' };
  }

  if (event.tool.kind === 'paintTile') {
    const { width, height, tileSize } = draft.tilemap;
    const col = Math.floor(event.world.x / tileSize);
    const row = Math.floor(event.world.y / tileSize);
    if (col < 0 || row < 0 || col >= width || row >= height) return { kind: 'none' };
    return { kind: 'command', command: { kind: 'paintTile', index: row * width + col, tileId: event.tool.tileId } };
  }

  const entity: EntityDraft = {
    ...event.tool.template,
    transform: { ...event.tool.template.transform, position: event.world },
  };
  return { kind: 'command', command: { kind: 'placeEntity', entity } };
}
