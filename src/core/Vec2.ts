/**
 * Vec2 — encapsulated 2D geometry primitive.
 *
 * GDOS alignment: Section 13 (Data-Driven Architecture — encapsulated geometry),
 * Section 16 (deterministic physics vectors).
 *
 * Invariants:
 *  - A Vec2 is an immutable plain data record. Operations never mutate their
 *    operands; they return new records. This upholds the StateManager immutability
 *    baseline so the runtime loop can be a pure state processor.
 *  - No system logic lives here — only the closed algebra of 2D vectors.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export const ZERO: Vec2 = vec2(0, 0);

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

/** Component-wise multiply-add: a + b * s. Common in integration steps. */
export function addScaled(a: Vec2, b: Vec2, s: number): Vec2 {
  return { x: a.x + b.x * s, y: a.y + b.y * s };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function lengthSq(a: Vec2): number {
  return a.x * a.x + a.y * a.y;
}

export function length(a: Vec2): number {
  return Math.sqrt(a.x * a.x + a.y * a.y);
}

export function normalize(a: Vec2): Vec2 {
  const len = length(a);
  if (len === 0) return ZERO;
  return { x: a.x / len, y: a.y / len };
}

export function equals(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Structural clone. Safe because Vec2 is flat; kept explicit for intent. */
export function clone(a: Vec2): Vec2 {
  return { x: a.x, y: a.y };
}
