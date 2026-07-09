/**
 * GridLevel — build a validated LevelDefinition from an ASCII grid, for
 * evaluation-framework tests (P4). Not a test file.
 *
 * Every fixture is unit scaffolding, NOT campaign content (the M2 content
 * gate is unaffected): the grids are tiny, in-code, and exist only to
 * exercise the harness and audits. Each is run through the REAL parseLevel
 * gate so the evaluators consume exactly the shape production levels have.
 *
 * Legend (tileSize 1; cell (col,row) centers at (col+0.5, row+0.5), y-down):
 *   '#' solid tile      '.' empty tile
 *   'S' spawn (empty)   'G' goal region center (empty)
 *   'x' spike entity on an empty tile (lethal)
 */

import type { LevelDefinition } from '../../src/components/Level';
import { parseLevel } from '../../src/schema/Parse';

export function buildGridLevel(
  levelId: string,
  rows: readonly string[],
  parTimeTiersSeconds: readonly number[] = [30, 10],
): LevelDefinition {
  const height = rows.length;
  if (height === 0) throw new Error(`${levelId}: empty grid`);
  const width = rows[0].length;
  const tiles: number[] = [];
  const entities: unknown[] = [];
  let spawn: { x: number; y: number } | undefined;
  let goal: { x: number; y: number } | undefined;

  for (let row = 0; row < height; row++) {
    if (rows[row].length !== width) throw new Error(`${levelId}: row ${row} width ${rows[row].length} ≠ ${width}`);
    for (let col = 0; col < width; col++) {
      const ch = rows[row][col];
      tiles.push(ch === '#' ? 1 : 0);
      const center = { x: col + 0.5, y: row + 0.5 };
      if (ch === 'S') spawn = center;
      else if (ch === 'G') goal = center;
      else if (ch === 'x') {
        entities.push({
          id: `spike-${col}-${row}`,
          transform: { position: center, facing: 1 },
          collider: { halfExtents: { x: 0.5, y: 0.5 }, offset: { x: 0, y: 0 } },
          behavior: { kind: 'spike' },
        });
      }
    }
  }
  if (!spawn) throw new Error(`${levelId}: no 'S' spawn cell`);
  if (!goal) throw new Error(`${levelId}: no 'G' goal cell`);

  const raw = {
    schemaVersion: 1,
    levelId,
    title: `P4 scaffolding: ${levelId}`,
    gdos: {
      targetKgNode: `kg:test/${levelId}`,
      difficultyVectors: { executionPrecision: 0, readingComplexity: 0, timingStrictness: 0, routeAmbiguity: 0 },
      emotionalBudgetCurve: [
        { at: 0, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
        { at: 1, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
      ],
      creatorMomentFrame: { tickWindow: [0, 1], description: 'n/a (unit fixture)' },
    },
    tilemap: { width, height, tileSize: 1, tiles },
    entities,
    triggers: [],
    constraints: {
      spawn,
      goal: { position: goal, halfExtents: { x: 0.5, y: 0.5 } },
      parTimeTiersSeconds: [...parTimeTiersSeconds],
    },
  };

  const result = parseLevel(raw);
  if (!result.ok) {
    throw new Error(`${levelId} failed the schema gate: ${JSON.stringify(result.errors)}`);
  }
  return result.value;
}
