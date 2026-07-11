/**
 * StylePack — the art-style-agnostic asset-provider seam (S9.1, dm-0076/dm-0083).
 *
 * The one architectural mandate of the visual design bible §0: nothing in
 * gameplay, simulation, or logic ever names the art style. The renderer asks
 * a StylePack for visuals/materials by (role, state, size, identitySeed);
 * the pack answers with cached bitmap handles and per-category signature
 * materials. "Paper Collage" is StylePack #1 (render/style/paper/, S9.2);
 * a completely different art style is a new pack dropped in with zero
 * changes to gameplay, physics, level data, or the evaluation pipeline.
 *
 * The pack-side half of REQ-070's mixing prohibition lives in validatePack
 * (the grammar-side half is parseGrammar's total single-valued bindings):
 *  - palette accents are unique across categories (no two categories share
 *    a colour), and optimization's accent is structurally null — its palette
 *    signature IS achromatic motion glyphs (dm-0084);
 *  - danger MUST have a chromatic accent (REQ-016: failure information is
 *    a visible colour class, never absence);
 *  - motion classes are unique across the six categories (bible §1: static /
 *    kinetic / responsive / collapse / sweep / reveal);
 *  - audio patches are pairwise distinct (REQ-071's audio signature channel).
 *
 * Cache-by-key is a SEAM CONTRACT, not a pack courtesy: visual() must return
 * the same bitmap handle for the same request (bible §5 "generate never
 * per-frame") — validatePack probes it. Bitmaps are opaque handles here;
 * the atlas/executor (S9.4) maps them to texture regions, and only
 * render/platform/ ever touches a real canvas.
 *
 * Audio signatures are procedural synthesis patches as DATA (dm-0083):
 * waveform + envelopes + duration, compiled to a node graph by the audio
 * executor (S9.6). Zero binary audio assets in P9.
 */

import type { GrammarCategoryId, RenderableRole, VisualGrammar } from '../grammar/Grammar';
import { GRAMMAR_CATEGORY_IDS } from '../grammar/Grammar';

/** Opaque handle to a pack-cached raster. The atlas resolves it to a texture region. */
export interface BitmapHandle {
  /** Pack-unique, stable for a given (role, state, size) — the cache key surfaced. */
  readonly id: string;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface CachedVisual {
  readonly bitmap: BitmapHandle;
  /** Anchor inside the bitmap, px from top-left, where the entity's transform position lands. */
  readonly anchorX: number;
  readonly anchorY: number;
  /** Jitter/overshoot padding baked around the content (bible §5: ~6px in Paper Collage). */
  readonly padPx: number;
}

/** What the scene compiler can request a visual for: any bound role, or the reserved avatar. */
export type VisualRole = RenderableRole | 'player';

export interface VisualRequest {
  readonly role: VisualRole;
  /**
   * Meaningful gameplay state only (dm-0077): open/closed, on/off,
   * intact/cracking, idle/pressed — never mere direction (that is a runtime
   * transform). 'default' for stateless kinds.
   */
  readonly state: string;
  /** Content size in px at DPR 1; the pack pads around this. Strictly positive. */
  readonly widthPx: number;
  readonly heightPx: number;
  /**
   * Seeded off entity identity / grid position by the caller (bible §4) —
   * NEVER Math.random. Same identity ⇒ same seed ⇒ identical visual on every
   * reload and death.
   */
  readonly identitySeed: number;
}

export type Waveform = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise';

/** A procedural audio signature: pure data, compiled by the S9.6 executor. */
export interface SynthPatch {
  readonly waveform: Waveform;
  /** Start/end of the frequency envelope, Hz. Strictly positive. */
  readonly freqStartHz: number;
  readonly freqEndHz: number;
  /** Peak of the gain envelope, in (0, 1]. */
  readonly gainPeak: number;
  /** Attack/release of the gain envelope, seconds. ≥ 0. */
  readonly attackSeconds: number;
  readonly releaseSeconds: number;
  /** Total scheduled duration, seconds. Strictly positive. */
  readonly durationSeconds: number;
}

/** The six motion signatures of bible §1 — one per category, no sharing. */
export type MotionClass = 'static' | 'kinetic' | 'responsive' | 'collapse' | 'sweep' | 'reveal';

export interface MotionSpec {
  readonly motionClass: MotionClass;
  /** Idle/active animation displacement, px at DPR 1. ≥ 0 (static ⇒ 0). */
  readonly amplitudePx: number;
  /** Animation period in fixed simulation ticks (never wall-clock). ≥ 1 integer. */
  readonly periodTicks: number;
}

/**
 * The asset-provider seam. Implementations own a level-scoped raster cache
 * behind visual() and draw only through an injected raster device — never a
 * browser global (RenderIsolation confines those to render/platform/).
 */
export interface StylePack {
  /** Stable pack identity, stamped onto scene provenance. Non-empty. */
  readonly packId: string;
  /** Cached visual for a bound role (or the reserved player). Same request ⇒ same handle. */
  visual(request: VisualRequest): CachedVisual;
  /** CSS hex accent (`#rrggbb`) for a category, or null for achromatic (optimization). */
  paletteAccent(category: GrammarCategoryId): string | null;
  motionSpec(category: GrammarCategoryId): MotionSpec;
  audioPatch(category: GrammarCategoryId): SynthPatch;
}

export interface PackValidationIssue {
  readonly path: string;
  readonly message: string;
}

const HEX_PATTERN = /^#[0-9a-f]{6}$/;
const MOTION_CLASSES: readonly MotionClass[] = ['static', 'kinetic', 'responsive', 'collapse', 'sweep', 'reveal'];
const WAVEFORMS: readonly Waveform[] = ['sine', 'square', 'triangle', 'sawtooth', 'noise'];

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function checkPatch(patch: SynthPatch, path: string, issues: PackValidationIssue[]): void {
  if (!WAVEFORMS.includes(patch.waveform)) {
    issues.push({ path: `${path}/waveform`, message: `expected one of [${WAVEFORMS.join(', ')}] (got ${JSON.stringify(patch.waveform)})` });
  }
  if (!isFiniteNumber(patch.freqStartHz) || patch.freqStartHz <= 0) issues.push({ path: `${path}/freqStartHz`, message: 'expected a finite number > 0' });
  if (!isFiniteNumber(patch.freqEndHz) || patch.freqEndHz <= 0) issues.push({ path: `${path}/freqEndHz`, message: 'expected a finite number > 0' });
  if (!isFiniteNumber(patch.gainPeak) || patch.gainPeak <= 0 || patch.gainPeak > 1) issues.push({ path: `${path}/gainPeak`, message: 'expected a finite number in (0, 1]' });
  if (!isFiniteNumber(patch.attackSeconds) || patch.attackSeconds < 0) issues.push({ path: `${path}/attackSeconds`, message: 'expected a finite number ≥ 0' });
  if (!isFiniteNumber(patch.releaseSeconds) || patch.releaseSeconds < 0) issues.push({ path: `${path}/releaseSeconds`, message: 'expected a finite number ≥ 0' });
  if (!isFiniteNumber(patch.durationSeconds) || patch.durationSeconds <= 0) issues.push({ path: `${path}/durationSeconds`, message: 'expected a finite number > 0' });
}

function checkMotion(spec: MotionSpec, path: string, issues: PackValidationIssue[]): void {
  if (!MOTION_CLASSES.includes(spec.motionClass)) {
    issues.push({ path: `${path}/motionClass`, message: `expected one of [${MOTION_CLASSES.join(', ')}] (got ${JSON.stringify(spec.motionClass)})` });
  }
  if (!isFiniteNumber(spec.amplitudePx) || spec.amplitudePx < 0) issues.push({ path: `${path}/amplitudePx`, message: 'expected a finite number ≥ 0' });
  if (!Number.isInteger(spec.periodTicks) || spec.periodTicks < 1) issues.push({ path: `${path}/periodTicks`, message: 'expected an integer ≥ 1' });
}

function checkVisual(visual: CachedVisual, path: string, issues: PackValidationIssue[]): void {
  if (typeof visual.bitmap.id !== 'string' || visual.bitmap.id.length === 0) issues.push({ path: `${path}/bitmap/id`, message: 'expected a non-empty string' });
  if (!isFiniteNumber(visual.bitmap.widthPx) || visual.bitmap.widthPx <= 0) issues.push({ path: `${path}/bitmap/widthPx`, message: 'expected a finite number > 0' });
  if (!isFiniteNumber(visual.bitmap.heightPx) || visual.bitmap.heightPx <= 0) issues.push({ path: `${path}/bitmap/heightPx`, message: 'expected a finite number > 0' });
  if (!isFiniteNumber(visual.anchorX)) issues.push({ path: `${path}/anchorX`, message: 'expected a finite number' });
  if (!isFiniteNumber(visual.anchorY)) issues.push({ path: `${path}/anchorY`, message: 'expected a finite number' });
  if (!isFiniteNumber(visual.padPx) || visual.padPx < 0) issues.push({ path: `${path}/padPx`, message: 'expected a finite number ≥ 0' });
}

/** A deterministic probe request per role — validation-only, small and stateless. */
function probeRequest(role: VisualRole): VisualRequest {
  return { role, state: 'default', widthPx: 32, heightPx: 32, identitySeed: 1 };
}

/**
 * Validate a pack against a grammar. Returns [] when the pack is a complete,
 * non-overlapping realization of every category signature. Empty on success;
 * never throws.
 */
export function validatePack(pack: StylePack, grammar: VisualGrammar): readonly PackValidationIssue[] {
  const issues: PackValidationIssue[] = [];

  if (typeof pack.packId !== 'string' || pack.packId.length === 0) {
    issues.push({ path: '/packId', message: 'expected a non-empty string' });
  }

  const accents = new Map<GrammarCategoryId, string | null>();
  for (const category of GRAMMAR_CATEGORY_IDS) {
    const path = `/${category}`;

    const accent = pack.paletteAccent(category);
    if (accent !== null && (typeof accent !== 'string' || !HEX_PATTERN.test(accent.toLowerCase()))) {
      issues.push({ path: `${path}/paletteAccent`, message: `expected null or "#rrggbb" (got ${JSON.stringify(accent)})` });
    } else {
      accents.set(category, accent === null ? null : accent.toLowerCase());
    }

    checkMotion(pack.motionSpec(category), `${path}/motionSpec`, issues);
    checkPatch(pack.audioPatch(category), `${path}/audioPatch`, issues);
  }

  /* dm-0084: optimization's palette signature is the ABSENCE of chroma. */
  if (accents.get('optimization') !== null && accents.has('optimization')) {
    issues.push({ path: '/optimization/paletteAccent', message: 'optimization is achromatic (dm-0084): its palette signature is ink/cream motion glyphs, never an accent colour' });
  }
  /* REQ-016: danger is a visible colour class. */
  if (accents.get('danger') === null) {
    issues.push({ path: '/danger/paletteAccent', message: 'danger requires a chromatic accent (REQ-016): failure information is a visible colour class' });
  }
  /* REQ-070: no two categories share an accent. */
  const seenAccents = new Map<string, GrammarCategoryId>();
  for (const [category, accent] of accents) {
    if (accent === null) continue;
    const holder = seenAccents.get(accent);
    if (holder !== undefined) {
      issues.push({ path: `/${category}/paletteAccent`, message: `accent ${accent} already used by "${holder}" — mixing signatures is prohibited (REQ-070)` });
    } else {
      seenAccents.set(accent, category);
    }
  }
  /* Bible §1: one motion class per category, no sharing. */
  const seenMotion = new Map<MotionClass, GrammarCategoryId>();
  for (const category of GRAMMAR_CATEGORY_IDS) {
    const spec = pack.motionSpec(category);
    if (!MOTION_CLASSES.includes(spec.motionClass)) continue;
    const holder = seenMotion.get(spec.motionClass);
    if (holder !== undefined) {
      issues.push({ path: `/${category}/motionSpec/motionClass`, message: `motion class "${spec.motionClass}" already used by "${holder}" — mixing signatures is prohibited (REQ-070)` });
    } else {
      seenMotion.set(spec.motionClass, category);
    }
  }
  /* REQ-071: audio signatures pairwise distinct. */
  const seenPatches = new Map<string, GrammarCategoryId>();
  for (const category of GRAMMAR_CATEGORY_IDS) {
    const key = JSON.stringify(pack.audioPatch(category));
    const holder = seenPatches.get(key);
    if (holder !== undefined) {
      issues.push({ path: `/${category}/audioPatch`, message: `audio patch identical to "${holder}" — each category carries a distinct audio signature (REQ-071)` });
    } else {
      seenPatches.set(key, category);
    }
  }

  /* Every role the grammar binds (plus the reserved player) yields a valid,
     CACHED visual — probed from the grammar's own bindings so a pack is
     validated against the grammar it will serve. */
  const boundRoles = Object.keys(grammar.bindings) as readonly RenderableRole[];
  const probeRoles: readonly VisualRole[] = [...boundRoles, 'player'];
  for (const role of probeRoles) {
    const path = `/visual/${role}`;
    const first = pack.visual(probeRequest(role));
    checkVisual(first, path, issues);
    const second = pack.visual(probeRequest(role));
    if (first.bitmap.id !== second.bitmap.id) {
      issues.push({ path, message: 'same request returned different bitmap handles — visual() must be cache-by-key (bible §5: generate never per-frame)' });
    }
  }

  return issues;
}

/** Convenience predicate over validatePack. */
export function packSatisfiesGrammar(pack: StylePack, grammar: VisualGrammar): boolean {
  return validatePack(pack, grammar).length === 0;
}
