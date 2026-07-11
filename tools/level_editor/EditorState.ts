/**
 * EditorState — REQ-130 P8 share: the visual level editor's draft-authoring
 * state model (paint/place/group/undo-redo/export). This is the pure-logic
 * half of REQ-130; painting these commands to a screen and turning mouse/
 * keyboard into them is P9's presentation share (dm-0065) — nothing here
 * touches a canvas, the DOM, or WebGL.
 *
 * Design (docs/execution_plan.md §P8, design summary point 1):
 *  - A `LevelDraft` mirrors the raw JSON shape `parseLevel` accepts, using
 *    plain `string` ids instead of the branded `EntityId`/`TriggerId` —
 *    those brands are minted ONLY by the schema validator (dm-0013), so an
 *    in-progress draft is, by construction, unvalidated data until export.
 *    Every other field type (`GdosMetadata`, `TilemapDef`, `ConstraintsDef`,
 *    `AabbDef`, `TransformDef`, `BehaviorDef`) carries no id brands and is
 *    reused directly from `src/components/` — no duplicated shape exists.
 *  - `groups` is editor-only authoring metadata with no schema representation
 *    (hierarchical grouping is a manipulation convenience, not gameplay data)
 *    and is dropped at export — `exportDraft` never emits it.
 *  - Undo/redo is FULL-SNAPSHOT based, not hand-rolled command inverses: each
 *    `applyCommand` pushes the prior `LevelDraft` onto history; `undo`/`redo`
 *    pop it back. This makes "undo restores the exact prior draft" true by
 *    construction (deep-equal, not merely functionally equivalent) — the
 *    same "correct by construction over hand-derived inverse logic" choice
 *    dm-0016 made for kinematics.
 *  - `exportDraft` is a thin call into the EXISTING P2 `parseLevel` (the
 *    sanctioned, only construction path from untrusted data to a real
 *    `LevelDefinition`, dm-0013) — a draft is only ever "real" once it
 *    round-trips the strict parser; zero new validation logic here.
 *
 * tools/ isolation (dm-0066): this file imports only `src/components/` (pure
 * data types) and `src/schema/Parse` (the public parse seam) — no engine, no
 * eval/, no gen/.
 */

import type { Vec2 } from '../../src/core/Vec2';
import type { TransformDef } from '../../src/components/Transform';
import type { AabbDef } from '../../src/components/Collider';
import type { BehaviorDef } from '../../src/components/Behavior';
import type { TriggerActionKind } from '../../src/components/Trigger';
import type { GdosMetadata } from '../../src/components/Gdos';
import type { TilemapDef } from '../../src/components/Tilemap';
import type { ConstraintsDef } from '../../src/components/Level';
import { LEVEL_SCHEMA_VERSION } from '../../src/components/Level';
import { parseLevel, type ParseResult } from '../../src/schema/Parse';

/** One authored entity in a draft — plain `string` id, never a branded `EntityId` (minted only at export). */
export interface EntityDraft {
  readonly id: string;
  readonly transform: TransformDef;
  readonly collider: AabbDef;
  readonly behavior: BehaviorDef;
}

/** One wiring record in a draft — plain `string` ids, never branded (minted only at export). */
export interface TriggerDraft {
  readonly id: string;
  readonly source: string;
  readonly targets: readonly string[];
  readonly action: TriggerActionKind;
  readonly once: boolean;
}

/**
 * The draft's working payload: the raw shape `parseLevel` accepts, plus
 * editor-only `groups` (no schema representation — dropped at export).
 */
export interface LevelDraft {
  readonly schemaVersion: number;
  readonly levelId: string;
  readonly title: string;
  readonly gdos: GdosMetadata;
  readonly tilemap: TilemapDef;
  readonly entities: readonly EntityDraft[];
  readonly triggers: readonly TriggerDraft[];
  readonly constraints: ConstraintsDef;
  /** groupId -> member entity ids. Editor-only; never exported (no schema field for it). */
  readonly groups: Readonly<Record<string, readonly string[]>>;
}

export type EditorCommand =
  | { readonly kind: 'paintTile'; readonly index: number; readonly tileId: number }
  | { readonly kind: 'placeEntity'; readonly entity: EntityDraft }
  | { readonly kind: 'groupEntities'; readonly groupId: string; readonly entityIds: readonly string[] }
  | { readonly kind: 'ungroup'; readonly groupId: string };

interface EditorHistory {
  /** Drafts before each applied command, most recent last. */
  readonly past: readonly LevelDraft[];
  /** Drafts available for redo, most recently undone first. */
  readonly future: readonly LevelDraft[];
}

export interface EditorDraft {
  readonly present: LevelDraft;
  readonly history: EditorHistory;
}

/** Snap a world position to the nearest tile-grid intersection (grid-snapped placement, REQ-130). */
export function snapToGrid(position: Vec2, tileSize: number): Vec2 {
  return {
    x: Math.round(position.x / tileSize) * tileSize,
    y: Math.round(position.y / tileSize) * tileSize,
  };
}

function paintTile(draft: LevelDraft, index: number, tileId: number): LevelDraft {
  if (index < 0 || index >= draft.tilemap.tiles.length) {
    throw new Error(`paintTile: index ${index} out of bounds for a ${draft.tilemap.tiles.length}-tile map`);
  }
  const tiles = draft.tilemap.tiles.slice();
  tiles[index] = tileId;
  return { ...draft, tilemap: { ...draft.tilemap, tiles } };
}

function placeEntity(draft: LevelDraft, entity: EntityDraft): LevelDraft {
  const snapped: EntityDraft = {
    ...entity,
    transform: { ...entity.transform, position: snapToGrid(entity.transform.position, draft.tilemap.tileSize) },
  };
  return { ...draft, entities: [...draft.entities, snapped] };
}

function groupEntities(draft: LevelDraft, groupId: string, entityIds: readonly string[]): LevelDraft {
  return { ...draft, groups: { ...draft.groups, [groupId]: [...entityIds] } };
}

function ungroup(draft: LevelDraft, groupId: string): LevelDraft {
  if (!(groupId in draft.groups)) return draft;
  const groups = { ...draft.groups };
  delete groups[groupId];
  return { ...draft, groups };
}

function transform(draft: LevelDraft, command: EditorCommand): LevelDraft {
  switch (command.kind) {
    case 'paintTile':
      return paintTile(draft, command.index, command.tileId);
    case 'placeEntity':
      return placeEntity(draft, command.entity);
    case 'groupEntities':
      return groupEntities(draft, command.groupId, command.entityIds);
    case 'ungroup':
      return ungroup(draft, command.groupId);
  }
}

/** Apply one command, pushing the prior draft onto undo history and clearing redo (a fresh edit invalidates it). */
export function applyCommand(editor: EditorDraft, command: EditorCommand): EditorDraft {
  const nextPresent = transform(editor.present, command);
  return {
    present: nextPresent,
    history: { past: [...editor.history.past, editor.present], future: [] },
  };
}

/** Restore the immediately prior draft. A no-op (same reference) if there is nothing to undo. */
export function undo(editor: EditorDraft): EditorDraft {
  const { past, future } = editor.history;
  if (past.length === 0) return editor;
  const previous = past[past.length - 1];
  return {
    present: previous,
    history: { past: past.slice(0, -1), future: [editor.present, ...future] },
  };
}

/** Re-apply the most recently undone draft. A no-op (same reference) if there is nothing to redo. */
export function redo(editor: EditorDraft): EditorDraft {
  const { past, future } = editor.history;
  if (future.length === 0) return editor;
  const next = future[0];
  return {
    present: next,
    history: { past: [...past, editor.present], future: future.slice(1) },
  };
}

/**
 * A minimal, exportable starting draft: a 3x3 solid-bordered room (tileSize 1)
 * with an empty interior, spawn and goal on opposite empty cells, one par
 * tier, and a single-keyframe GDOS block — every field the strict parser
 * requires, nothing more.
 */
export function createBlankDraft(levelId: string, title: string): EditorDraft {
  const width = 3;
  const height = 3;
  const tiles: number[] = [
    1, 1, 1,
    1, 0, 1,
    1, 1, 1,
  ];
  return {
    present: {
      schemaVersion: LEVEL_SCHEMA_VERSION,
      levelId,
      title,
      gdos: {
        targetKgNode: `kg:editor/${levelId}`,
        difficultyVectors: { executionPrecision: 0, readingComplexity: 0, timingStrictness: 0, routeAmbiguity: 0 },
        emotionalBudgetCurve: [{ at: 0, curiosity: 0, confidence: 0, surprise: 0, mastery: 0 }],
        creatorMomentFrame: { tickWindow: [0, 1], description: 'new draft (editor scaffold)' },
      },
      tilemap: { width, height, tileSize: 1, tiles },
      entities: [],
      triggers: [],
      constraints: {
        spawn: { x: 1.5, y: 1.5 },
        goal: { position: { x: 1.5, y: 1.5 }, halfExtents: { x: 0.5, y: 0.5 } },
        parTimeTiersSeconds: [1],
      },
      groups: {},
    },
    history: { past: [], future: [] },
  };
}

/**
 * The only path from a draft to a real `LevelDefinition`: strict-parse it
 * (dm-0013). `groups` (editor-only) is never emitted — the raw shape handed
 * to `parseLevel` carries exactly the schema's fields.
 */
export function exportDraft(draft: LevelDraft): ParseResult {
  const { groups: _groups, ...raw } = draft;
  return parseLevel(raw);
}
