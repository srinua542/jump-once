/**
 * TapeIO — the canonical replay-tape format and its serializer/parser.
 *
 * GDOS alignment: Section 13 (every stage fully serialized), Section 15
 * (validation agents replay levels deterministically).
 *
 * Ownership (dm-0023): replay-tape serialization was an open question since
 * P2 (open question #5); it is owned HERE, at P4/S4.1, because the agent
 * harness is the first producer of tapes. P8's input recorder and P9's save
 * layer consume this format later; they do not redefine it.
 *
 * A tape is the complete input side of a run: one InputFrame per simulation
 * tick, plus the (levelId, seed) pair that anchors it. The determinism
 * contract (dm-0003/dm-0004/dm-0019) makes a tape a full reproduction recipe:
 * same (level, seed, frames) ⇒ bit-identical final state on any JS engine.
 *
 * Canonical form — the dm-0010/dm-0014 discipline applied verbatim:
 *  - Fixed key order at every level: schemaVersion, levelId, seed, frames;
 *    each frame: moveAxis, jumpPressed, resetPressed. Two-space indentation,
 *    no trailing newline.
 *  - Strict parse: unknown/extra keys are rejected at every path; any
 *    schemaVersion other than TAPE_SCHEMA_VERSION is hard-rejected
 *    (migrations are written only when v2 exists).
 *  - seed must be an integer in [0, 2^32) — the normalized uint32 form the
 *    core Rng derives from any input seed (createRng forces `>>> 0`).
 *  - parse never throws on bad input; it returns Result-typed,
 *    path-qualified errors (same SchemaError shape as the level parser).
 *  - serialize(parse(serialize(t))) === serialize(t), byte-identically.
 *
 * This lives in src/schema/ (dm-0013): definition-time I/O, never called
 * from the engine loop, never imports from src/systems/.
 */

import type { InputFrame } from '../core/State';
import type { SchemaError } from './Parse';

/** Bump only with a written migration policy decision (dm-0010). */
export const TAPE_SCHEMA_VERSION = 1;

/** A serialized replay: the full input side of one deterministic run. */
export interface ReplayTape {
  /** Must equal TAPE_SCHEMA_VERSION; anything else is rejected at parse. */
  readonly schemaVersion: number;
  /** The levelId of the LevelDefinition this tape was recorded against. Non-empty. */
  readonly levelId: string;
  /** The simulation seed the run was created with, normalized to uint32. */
  readonly seed: number;
  /** One frame per simulation tick, in tick order: frames[i] drove tick i+1. */
  readonly frames: readonly InputFrame[];
}

export type TapeParseResult =
  | { readonly ok: true; readonly value: ReplayTape }
  | { readonly ok: false; readonly errors: readonly SchemaError[] };

const ROOT_KEYS = ['schemaVersion', 'levelId', 'seed', 'frames'] as const;
const FRAME_KEYS = ['moveAxis', 'jumpPressed', 'resetPressed'] as const;

/**
 * Serialize a tape into its canonical byte form. Assumes a well-formed tape
 * (the harness only builds well-formed ones); parseTape is the gate for
 * untrusted input.
 */
export function serializeTape(tape: ReplayTape): string {
  const canonical = {
    schemaVersion: tape.schemaVersion,
    levelId: tape.levelId,
    seed: tape.seed,
    frames: tape.frames.map((f) => ({
      moveAxis: f.moveAxis,
      jumpPressed: f.jumpPressed,
      resetPressed: f.resetPressed,
    })),
  };
  return JSON.stringify(canonical, null, 2);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pushUnknownKeys(
  v: Record<string, unknown>,
  path: string,
  allowed: readonly string[],
  errors: SchemaError[],
): void {
  for (const key of Object.keys(v)) {
    if (!allowed.includes(key)) {
      errors.push({ path: `${path}/${key}`, message: `unknown key "${key}" (tape schema v${TAPE_SCHEMA_VERSION} is strict)` });
    }
  }
}

function parseFrame(raw: unknown, path: string, errors: SchemaError[]): InputFrame | undefined {
  if (!isRecord(raw)) {
    errors.push({ path, message: 'expected a frame object' });
    return undefined;
  }
  pushUnknownKeys(raw, path, FRAME_KEYS, errors);

  const moveAxis = raw['moveAxis'];
  if (moveAxis !== -1 && moveAxis !== 0 && moveAxis !== 1) {
    errors.push({ path: `${path}/moveAxis`, message: 'expected -1, 0, or 1' });
  }
  const jumpPressed = raw['jumpPressed'];
  if (typeof jumpPressed !== 'boolean') {
    errors.push({ path: `${path}/jumpPressed`, message: 'expected a boolean' });
  }
  const resetPressed = raw['resetPressed'];
  if (typeof resetPressed !== 'boolean') {
    errors.push({ path: `${path}/resetPressed`, message: 'expected a boolean' });
  }
  if (errors.length > 0) return undefined;
  return {
    moveAxis: moveAxis as -1 | 0 | 1,
    jumpPressed: jumpPressed as boolean,
    resetPressed: resetPressed as boolean,
  };
}

/** The only construction path from untrusted input to a typed ReplayTape. */
export function parseTape(raw: unknown): TapeParseResult {
  const errors: SchemaError[] = [];

  if (!isRecord(raw)) {
    return { ok: false, errors: [{ path: '', message: 'expected a tape object at the root' }] };
  }
  pushUnknownKeys(raw, '', ROOT_KEYS, errors);

  const version = raw['schemaVersion'];
  if (version !== TAPE_SCHEMA_VERSION) {
    errors.push({ path: '/schemaVersion', message: `expected ${TAPE_SCHEMA_VERSION}, got ${JSON.stringify(version)} (no migrations exist for other versions)` });
  }

  const levelId = raw['levelId'];
  if (typeof levelId !== 'string' || levelId.length === 0) {
    errors.push({ path: '/levelId', message: 'expected a non-empty string' });
  }

  const seed = raw['seed'];
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    errors.push({ path: '/seed', message: 'expected an integer in [0, 2^32) — the normalized uint32 seed' });
  }

  const rawFrames = raw['frames'];
  const frames: InputFrame[] = [];
  if (!Array.isArray(rawFrames)) {
    errors.push({ path: '/frames', message: 'expected an array of input frames' });
  } else {
    for (let i = 0; i < rawFrames.length; i++) {
      const frameErrors: SchemaError[] = [];
      const frame = parseFrame(rawFrames[i], `/frames/${i}`, frameErrors);
      errors.push(...frameErrors);
      if (frame !== undefined) frames.push(frame);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      schemaVersion: TAPE_SCHEMA_VERSION,
      levelId: levelId as string,
      seed: seed as number,
      frames,
    },
  };
}

/** Parse from tape text; malformed JSON is a Result error, never a throw. */
export function parseTapeText(text: string): TapeParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ path: '', message: `malformed JSON: ${e instanceof Error ? e.message : String(e)}` }] };
  }
  return parseTape(raw);
}
