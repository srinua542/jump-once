/**
 * PaperStylePack — StylePack #1, "Paper Collage" (S9.2, dm-0075/dm-0076).
 * The concrete realization of `render/style/StylePack.ts`'s asset-provider
 * seam, built from the ported reference-engine primitives in this
 * directory (PaperRng, Geometry, PaperBlocks, PaperTiles, KindDraw).
 *
 * Two roles this pack draws with a convention the scene compiler (S9.3)
 * must follow:
 *  - `role: 'terrain'`: `state` is `"${mask}:${variant}"` — a 4-neighbour
 *    autotile mask (0-15, `PaperTiles.TILE_BITS`) and a small position-hashed
 *    variant (0-2). The caller computes both; this pack only draws them.
 *  - every other bound role (the twelve `EntityKind`s, `goal`, `player`):
 *    `state` is the gameplay state string (`'on'`/`'off'`, `'open'`/
 *    `'closed'`, a pose, `'default'` for stateless kinds/roles).
 *
 * Cache identity (dm-0090): entities/terrain/player/goal are VOCABULARY
 * (bible principle 8 — "same function, same shape, everywhere"), not
 * per-instance decor, so `identitySeed` is deliberately IGNORED here — the
 * cache key is `role:state:T` alone. This is what dm-0078's fix already
 * established for entity bases (seeded by kind alone) and this port
 * generalizes it to every role this pack draws: two spikes anywhere in the
 * world share one cached bitmap. (`identitySeed` remains part of the
 * `VisualRequest` contract for a future pack/role — e.g. per-placement decor
 * — that legitimately wants per-instance variation; this pack simply has no
 * such role yet, per S9.2's scope, dm-0091.)
 *
 * Sizing/anchor/pad conventions are ported verbatim from the reference
 * engine's `PaperAssets` facade: entities and terrain tiles get a 6px pad
 * on every side (bitmap = T+12 square, anchor at (6,6)); `player` and
 * `goal` are NOT padded (their own jitter overshoot was already accounted
 * for in the reference's fixed proportions) and use their own w/h/anchor
 * formulas, exactly as `PaperAssets.player`/`PaperAssets.flag` did.
 */

import { ENTITY_KINDS, type EntityKind } from '../../../src/components/Behavior';
import type { GrammarCategoryId } from '../../grammar/Grammar';
import type { Raster2D } from '../Raster2D';
import type { CachedVisual, MotionSpec, StylePack, SynthPatch, VisualRequest, VisualRole } from '../StylePack';
import { drawFlag, drawKind, drawPlayer, KindDraw } from './KindDraw';
import { createRng } from './PaperRng';
import { maskAt, paintTile, TILE_BITS } from './PaperTiles';
import { INK, LAVENDER, PINK, TEAL, TERRA } from './Palette';

export { maskAt, TILE_BITS };

const ENTITY_KIND_SET: ReadonlySet<string> = new Set(ENTITY_KINDS);

const PALETTE_ACCENT: Readonly<Record<GrammarCategoryId, string | null>> = Object.freeze({
  safe: INK,
  danger: TERRA,
  interactive: TEAL,
  temporary: PINK,
  optimization: null, // dm-0084: achromatic — ink/cream motion glyphs, never an accent colour.
  secret: LAVENDER,
});

const MOTION_SPEC: Readonly<Record<GrammarCategoryId, MotionSpec>> = Object.freeze({
  safe: Object.freeze({ motionClass: 'static', amplitudePx: 0, periodTicks: 1 }),
  danger: Object.freeze({ motionClass: 'kinetic', amplitudePx: 3, periodTicks: 24 }),
  interactive: Object.freeze({ motionClass: 'responsive', amplitudePx: 2, periodTicks: 40 }),
  temporary: Object.freeze({ motionClass: 'collapse', amplitudePx: 4, periodTicks: 36 }),
  optimization: Object.freeze({ motionClass: 'sweep', amplitudePx: 5, periodTicks: 20 }),
  secret: Object.freeze({ motionClass: 'reveal', amplitudePx: 2, periodTicks: 90 }),
});

const AUDIO_PATCH: Readonly<Record<GrammarCategoryId, SynthPatch>> = Object.freeze({
  safe: Object.freeze({ waveform: 'sine', freqStartHz: 220, freqEndHz: 220, gainPeak: 0.15, attackSeconds: 0, releaseSeconds: 0.05, durationSeconds: 0.08 }),
  danger: Object.freeze({ waveform: 'square', freqStartHz: 400, freqEndHz: 120, gainPeak: 0.7, attackSeconds: 0, releaseSeconds: 0.18, durationSeconds: 0.28 }),
  interactive: Object.freeze({ waveform: 'triangle', freqStartHz: 500, freqEndHz: 650, gainPeak: 0.35, attackSeconds: 0.01, releaseSeconds: 0.1, durationSeconds: 0.18 }),
  temporary: Object.freeze({ waveform: 'sawtooth', freqStartHz: 320, freqEndHz: 140, gainPeak: 0.5, attackSeconds: 0, releaseSeconds: 0.16, durationSeconds: 0.26 }),
  optimization: Object.freeze({ waveform: 'sine', freqStartHz: 300, freqEndHz: 900, gainPeak: 0.3, attackSeconds: 0, releaseSeconds: 0.07, durationSeconds: 0.14 }),
  secret: Object.freeze({ waveform: 'noise', freqStartHz: 90, freqEndHz: 90, gainPeak: 0.22, attackSeconds: 0.03, releaseSeconds: 0.35, durationSeconds: 0.45 }),
});

/** Parse a terrain request's `"${mask}:${variant}"` state. Returns null if malformed. */
function parseTerrainState(state: string): { mask: number; variant: number } | null {
  const match = /^(\d+):(\d+)$/.exec(state);
  if (match === null) return null;
  const mask = Number(match[1]);
  const variant = Number(match[2]);
  if (!Number.isInteger(mask) || mask < 0 || mask > 15) return null;
  if (!Number.isInteger(variant) || variant < 0) return null;
  return { mask, variant };
}

/** Does this role's rasterization actually depend on `state`? (drives cache-key normalization.) */
function stateMatters(role: VisualRole): boolean {
  if (role === 'terrain') return true;
  /* dm-0098: player pose (idle/prejump/air) genuinely changes drawPlayer's
     output — unlike goal, which is state-invariant (always the one flag). */
  if (role === 'player') return true;
  if (role === 'goal') return false;
  if (ENTITY_KIND_SET.has(role)) return KindDraw[role as EntityKind].overlay !== undefined;
  return false;
}

export function createPaperStylePack(): StylePack {
  const cache = new Map<string, CachedVisual>();

  function cachedVisual(role: VisualRole, state: string, T: number): CachedVisual {
    const effectiveState = stateMatters(role) ? state : 'default';
    const key = `${role}:${effectiveState}:${T}`;
    const existing = cache.get(key);
    if (existing !== undefined) return existing;

    let fresh: CachedVisual;
    if (role === 'player') {
      const w = T * 0.8;
      const h = T * 0.9;
      fresh = { bitmap: { id: key, widthPx: w, heightPx: h }, anchorX: w / 2, anchorY: h - 2, padPx: 0 };
    } else if (role === 'goal') {
      const w = T;
      const h = T + 16;
      fresh = { bitmap: { id: key, widthPx: w, heightPx: h }, anchorX: w * 0.3, anchorY: h - 4, padPx: 0 };
    } else {
      const size = T + 12;
      fresh = { bitmap: { id: key, widthPx: size, heightPx: size }, anchorX: 6, anchorY: 6, padPx: 6 };
    }
    cache.set(key, fresh);
    return fresh;
  }

  return {
    packId: 'paper-collage-v1',

    visual(request: VisualRequest): CachedVisual {
      return cachedVisual(request.role, request.state, request.widthPx);
    },

    rasterize(request: VisualRequest, device: Raster2D): void {
      const T = request.widthPx;
      const { role, state } = request;

      if (role === 'terrain') {
        const parsed = parseTerrainState(state);
        const mask = parsed?.mask ?? 15;
        const variant = parsed?.variant ?? 0;
        paintTile(device, mask, T, 6, 6, variant, INK);
        return;
      }

      if (role === 'player') {
        const w = T * 0.8;
        const h = T * 0.9;
        drawPlayer(device, w / 2, h - 2, createRng(300 + state.length), state, T / 58);
        return;
      }

      if (role === 'goal') {
        const w = T;
        const h = T + 16;
        drawFlag(device, w * 0.3, h - 4, createRng(306), T / 64);
        return;
      }

      /* Every remaining bound role is a grammar EntityKind. */
      device.save();
      device.translate(6, 6);
      drawKind(device, role as EntityKind, T, state);
      device.restore();
    },

    paletteAccent(category: GrammarCategoryId): string | null {
      return PALETTE_ACCENT[category];
    },

    motionSpec(category: GrammarCategoryId): MotionSpec {
      return MOTION_SPEC[category];
    },

    audioPatch(category: GrammarCategoryId): SynthPatch {
      return AUDIO_PATCH[category];
    },
  };
}

/** The stable default instance — analogous to DEFAULT_GRAMMAR/DEFAULT_STYLE_PROFILE. */
export const PAPER_STYLE_PACK: StylePack = createPaperStylePack();
