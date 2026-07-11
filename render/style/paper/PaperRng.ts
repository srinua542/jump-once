/**
 * PaperRng — the seeded generator behind every Paper Collage jitter/wear/
 * grain decision (S9.2, bible §4). A direct, faithful port of the reference
 * engine's RNG()/hashSeed() (src/assets/paper-asset-library.html) — same
 * constants, same bit operations, so a numeric seed produces byte-identical
 * output to the reference sheet.
 *
 * `Math.random` is forbidden everywhere in render/ (dm-0003, RenderIsolation
 * scan): every draw call in render/style/paper/ threads an `RngFn` obtained
 * from `createRng(seed)`, where `seed` is itself derived from stable
 * identity (kind name, tile coordinates, grid position) via `hashSeed` —
 * never wall-clock, never a counter that varies run-to-run.
 */

/** A seeded pseudo-random generator: call it repeatedly for a `[0, 1)` stream. */
export type RngFn = () => number;

/** Mulberry32 — the reference engine's exact generator, ported bit-for-bit. */
export function createRng(seed: number): RngFn {
  let a = (seed >>> 0) || 1;
  return function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-ish string hash folded onto a base seed — ported verbatim from hashSeed(). */
export function hashSeed(base: number, str: string): number {
  let s = base >>> 0;
  for (let i = 0; i < str.length; i++) {
    s = (Math.imul(s, 31) + str.charCodeAt(i)) >>> 0;
  }
  return s >>> 0;
}
