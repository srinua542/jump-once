/**
 * Rng — deterministic, seedable pseudo-random number generator.
 *
 * GDOS alignment: Section 15 (automated agent simulations must be reproducible),
 * Section 2 / Principle 5 (Surprise Through Context, Never Randomness — any
 * stochastic tooling used at DESIGN time must be perfectly replayable so a
 * generated level is a pure function of its seed; there is no wall-clock or
 * Math.random entropy anywhere in the pipeline).
 *
 * Implementation: mulberry32. Small, fast, good enough distribution for design
 * tooling and agent simulation. The generator state is carried explicitly as a
 * value so it can live inside the immutable game/simulation state tree — we never
 * rely on hidden global generator state.
 *
 * Every mutating call returns BOTH the drawn value and the next generator state.
 * Callers thread the state forward; they never mutate in place.
 */

export interface RngState {
  /** 32-bit unsigned integer seed/cursor. */
  readonly seed: number;
}

export function createRng(seed: number): RngState {
  // Force to uint32 so behaviour is identical across platforms.
  return { seed: seed >>> 0 };
}

interface RngDraw {
  /** Uniform float in [0, 1). */
  readonly value: number;
  /** Advanced generator state to thread into the next draw. */
  readonly next: RngState;
}

/** Draw a uniform float in [0, 1) and advance the generator. */
export function nextFloat(state: RngState): RngDraw {
  let t = (state.seed + 0x6d2b79f5) >>> 0;
  const advanced = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, next: { seed: advanced } };
}

/** Draw an integer in [minInclusive, maxExclusive) and advance the generator. */
export function nextInt(
  state: RngState,
  minInclusive: number,
  maxExclusive: number,
): { value: number; next: RngState } {
  if (maxExclusive <= minInclusive) {
    return { value: minInclusive, next: state };
  }
  const draw = nextFloat(state);
  const span = maxExclusive - minInclusive;
  return {
    value: minInclusive + Math.floor(draw.value * span),
    next: draw.next,
  };
}
