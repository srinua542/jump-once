/**
 * Palette — the Paper Collage material colours (S9.2). Ported verbatim from
 * the reference engine's constants (src/assets/paper-asset-library.html).
 * These are StylePack #1's MATERIALS (dm-0083): nothing outside
 * render/style/paper/ may reference a hex here — that is exactly what the
 * grammar/pack split (render/grammar/Grammar.ts stays colour-free) exists to
 * prevent. A future StylePack picks entirely different materials with zero
 * change to Grammar.ts or any gameplay/data.
 *
 * These six map 1:1 onto PaperStylePack.paletteAccent()'s per-category
 * table (dm-0084: OPTIMIZATION is deliberately absent — no accent, achromatic
 * ink/cream motion glyphs instead; dm-0085: GOAL_ACCENT is TEAL, not the
 * reference sheet's original terracotta flag — see PaperStylePack.ts and
 * KindDraw.ts's `goal` entry for the recolour).
 */

export const INK = '#232019';
export const CREAM = '#ece5d4';
export const TEAL = '#8fb5ac';
export const TEAL_DARK = '#6f9c93';
export const PINK = '#e0a3a9';
export const TERRA = '#cd5b33';
export const BEIGE = '#d8c49c';
export const LAVENDER = '#a998c9';
export const WASHED_BLUE = '#9fbfca';

/** dm-0085: the goal's pennant is TEAL (Interactive), never TERRA (Danger). */
export const GOAL_ACCENT = TEAL;
