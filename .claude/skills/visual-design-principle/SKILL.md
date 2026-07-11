---
name: visual-design-principle
description: Govern every Jump Once visual, art, asset, rendering, or UI decision. Use whenever making choices about how anything looks or is drawn — the Visual Grammar, structural-category signatures, palette/accent colour, silhouettes, sprites, tiles, decor, animation, particles, the renderer, StylePacks/asset swapping, canvas/WebGL, DPR/responsive scaling, caching, or on-screen failure feedback. Trigger phrases include "how should this look", "what colour is danger", "add a sprite/asset", "the renderer", "swap the art style", "visual grammar", "which structural category", "draw the entity", "the paper style", "particle/animation", "art direction".
---

# Jump Once Visual Design Principles

Every pixel Jump Once draws is governed by one committed art direction — **Paper Collage** (cut
paper, dry ink, printed matter) — expressed through a **strict, data-driven Visual Grammar**
(REQ-070/071). Consult this skill before any visual, asset, rendering, or UI decision, even a
one-object one. The full canon is `docs/visual_design_bible.md`; the working source of pixels and
the procedural engine is `src/assets/paper-asset-library.html`, with reference art in
`src/assets/environment/`. This skill is the decision layer over those.

## The mandate above all others: the art style is swappable

**Nothing in gameplay, simulation, or logic ever names or assumes the art style.** The renderer
consumes an abstract **StylePack** (asset provider) seam; Paper Collage is StylePack #1, and a
completely different art style is a new StylePack dropped in with **zero** changes to gameplay,
physics, level data, or the evaluation pipeline. Before writing any visual code, verify it goes
*through* the StylePack seam. If a colour, sprite, or texture is reachable from simulation/logic,
the design is wrong — move it behind the seam.

- Simulation emits *what* is on screen: structural category, `behavior.kind`, state, transform.
  The StylePack decides *how* it looks.
- Rendering is strictly one-way: it reads sim state and NEVER feeds back (`interpolationAlpha` is
  read-only — the determinism axiom, dm-0004). Real time may drive interpolation only, never a
  tick or a replay-checked value.
- Keep the *grammar* (the six categories below) stable across StylePacks; let a new pack
  reinterpret the *materials* (colours, textures, procedural tricks).

## The Visual Grammar — six structural categories (REQ-071)

Every gameplay object belongs to exactly one category, and each category has one fixed,
non-overlapping signature across palette · silhouette · motion · audio. **Mixing signatures is
prohibited (REQ-070).** In Paper Collage:

1. **Safe** — ink `#232019` on cream; solid clean-edged slab; static. What you stand on.
2. **Danger** — terracotta `#cd5b33`; sharp silhouette (triangles, teeth, beams); kinetic. Kills;
   also the goal (separated from hazards by silhouette, not colour).
3. **Interactive** — dusty teal `#8fb5ac`; the eye motif + dashed zone ring; responds to
   proximity/press. Zones, triggers, watchers, plates.
4. **Temporary** — faded pink `#e0a3a9`; cracked/crumbling fills, spring pads; collapse/bob/crack.
   Soft & breakable.
5. **Optimization** — motion glyphs (chevrons, `↔` arrows); directional sweep. Rewards fast
   routing (conveyors, launches). *Accent still open — see the two open reconciliations.*
6. **Secret** — lavender `#a998c9`; **dashed outline** ("the idea of a thing"); reveal/rule-change.
   Exits, altered rules, hidden or fake geometry.

Non-category material (environment/decor, never a gameplay signal): CREAM (paper ground), AGED
BEIGE (printed matter), WASHED BLUE (cold/slippery). Pure white only in eyes and tiny highlights.

**Two open reconciliations** (not yet decided — do not silently pick one; raise them):
Optimization has no dedicated accent yet (motion-glyph only), and Danger currently doubles as the
goal. Both are flagged for P9 execution-plan resolution in the bible.

## Eight first principles (binding while Paper Collage is active)

1. **Silhouette first** — every object reads as a pure black shape; texture never rescues a bad
   silhouette. 2. **Gameplay is ink, decor is paper.** 3. **Function gets the accent** (colour =
   behaviour, never decoration). 4. **Negative space is a material** — cutting decor is usually
   the improvement. 5. **Jitter the shape, never the hitbox** — colliders stay clean rectangles at
   exact grid positions; only the drawn polygon wobbles (this is *why* the art is swappable over
   unchanged physics). 6. **Imperfect, not sloppy** — jitter ≤ ±2px, wear ≤ ~15%. 7. **Absence
   has a costume** — vanished/rule-only things are dashed outlines. 8. **Same function, same
   shape, everywhere** — the vocabulary never gets synonyms.

## Procedural & determinism rules

- Generate art from a **seeded RNG hashed off entity identity / grid position** — unique per
  object, identical on every reload and death. `Math.random` stays forbidden (the axiom); visual
  RNG is a derived seeded generator, same discipline as the sim clock/RNG (dm-0003/dm-0004).
- **States are frames, not filters:** open/closed, on/off, intact/cracking are separately cached
  bitmaps swapped by key — never runtime tinting of one bitmap.

## Performance & memory rules (the render-layer contract)

- **Generate never per-frame** — procedural drawing happens only at asset creation, level load,
  and appearance change; the frame loop is `drawImage()` of cached canvases plus kinetic entities.
- **Cache by key** (`kind:state:size`), pad ~6px for jitter; **merge solid tile runs**; **one
  background bitmap per level** (camera = source-rect crop); keep the dynamic list tiny; cap DPR
  (2 gameplay / 1.5 sheets); scope caches to the level and clear on transition.
- No `shadowBlur`/`filter`/`save-restore` churn in the hot loop; reset `setLineDash([])` after
  dashed passes; integer-align blits.
- **Simplicity discipline (dm-0077):** grain is ONE shared background layer, never per-asset
  (gameplay sprites are clean un-grained ink — bold silhouettes); keep the decor set small (~6–10,
  currently 8) and get variety from placement, not new asset types; cache a bitmap only for
  *meaningful gameplay states*, using a runtime transform (flip / live glyph) for mere direction;
  favour the calm end of the jitter range (subdivision ~14px, jitter ~±1px). Readability over
  decorative richness, always.

## Accessibility & fairness (REQ-016, and level-design-principle §"responsibly")

- Never rely on colour *alone* — every category is separable by silhouette and motion too, so
  colour-blind and muted play still read. Failure information is always visually present on screen
  (Danger = terracotta + sharp shape, the moment it matters).

## Review output

When reviewing a visual/asset/render change, be concise and check, in order:
1. Does it go through the StylePack seam, with zero style reachable from sim/logic?
2. Correct structural category and its exact signature — no mixed signatures?
3. Silhouette test: threshold to black — still unmistakable? Colour-blind separable?
4. Determinism: seeded-from-identity, no `Math.random`, states-as-frames, render never feeds sim?
5. Performance: nothing generated per-frame; cached-by-key; hot loop is blits only?
Verdict: Keep / Improve / Reject, with the specific fix that preserves the direction.

## Phase boundary

Rendering code is gated to **P9**, and P9's execution-plan section must be authored first via the
REQ-P02 adversarial review. Use this skill for visual *decisions, review, and canon* until P9's
plan opens implementation. Do not scaffold a renderer ahead of that plan.
