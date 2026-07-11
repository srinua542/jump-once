# Jump Once — Visual Design Bible

**Status:** Design canon (art-direction input to phase **P9 — Rendering, Audio & Visual Grammar**).
This document is *not* the P9 execution plan. It records the **art direction** the project has
committed to; P9's execution-plan section (authored separately, via the REQ-P02 adversarial
review) decides the module topology, the render surface, and the concrete APIs that realise it.

**Source of truth for the look:** `src/assets/paper-asset-library.html` — a self-contained art
bible *and* a working procedural asset engine (the `PaperAssets` facade + `KindDraw`/`DecorDraw`
tables). `src/assets/environment/` holds the reference sheet backing it. When this document and
the kit disagree on a value, the kit is authoritative for pixels and this document is
authoritative for *rules and intent*.

Governing requirements: **REQ-070** (strict Visual Grammar; no mixing signatures), **REQ-071**
(six structural categories, each with a fixed palette/silhouette/motion/audio signature),
**REQ-001/002** (responsive scaling, visual signatures), **REQ-016** (failure information always
visually present), **REQ-150** (visual sub-clauses — squash/stretch, particle burst, camera).
All are owned or shared by P9.

---

## 0 · The one architectural mandate: the art style is swappable

The single most important implementation rule, and the reason this is written before any P9 code:

> **Nothing in gameplay, simulation, or logic ever references the art style.** The renderer
> consumes an abstract **StylePack** (a.k.a. asset provider) seam. "Paper Collage" is
> **StylePack #1**. A completely different art style — neon vector, pixel art, hand-painted —
> is a *new StylePack*, dropped in with **zero changes to gameplay, physics, level data, or the
> evaluation pipeline.**

This is not a nice-to-have; it is REQ-070/071's own words: the Visual Grammar is delivered "as a
**data-driven style system**." Concretely, the mandate means:

- Gameplay/simulation code (`src/core`, `src/systems`, `src/gen`, `src/eval`, `tools/`) stays
  **headless and style-blind** — it emits *what* is on screen (kind, state, structural category,
  transform), never *how* it looks.
- A StylePack maps `(structuralCategory, behavior.kind, state)` → a visual descriptor / cached
  bitmap. Swapping the pack swaps every pixel; the level JSON, hitboxes, and tapes are untouched.
- The renderer reads simulation state **one-way**: rendering NEVER feeds back into the sim
  (`interpolationAlpha` is read-only — the dm-0004 determinism axiom, extended to the render
  layer). Real time (`requestAnimationFrame`) may drive interpolation but must never influence a
  simulation tick or a replay-checked value.
- **Where the StylePack interface, the render surface, and the render↔tools import direction
  live is a P9-planning decision** (the handoff's open architecture questions). This document
  fixes the *contract's shape*, not its address.

Everything below is the content of StylePack #1. Read it as "what Paper Collage decides," not as
"what every StylePack must be" — a future pack keeps the *grammar* (section 1) and is free to
reinterpret the *materials* (sections 2–5).

---

## 1 · The Visual Grammar — six structural categories (REQ-071)

REQ-071 fixes six structural categories. Every StylePack must give each one an unmistakable,
non-overlapping signature across **palette · silhouette · motion · audio**. Mixing signatures is
prohibited (REQ-070). Paper Collage realises the six as follows.

| # | Category (REQ-071) | Paper accent | Silhouette signature | Motion | Meaning |
|---|---|---|---|---|---|
| 1 | **Safe** | Ink `#232019` on cream | Solid, clean-edged slab/block | Static | Anything you can stand on; the structural ground. |
| 2 | **Danger** | Terracotta `#cd5b33` | Sharp — triangles, teeth, beams, spiked balls | Kinetic (laser phase, hazard sweep) | Kills. Also the goal/flag (terracotta = "the thing you commit toward"). |
| 3 | **Interactive** | Dusty teal `#8fb5ac` | The **eye** motif + dashed zone ring; pressure plates | Responds to proximity/press | Logic: zones, triggers, watchers, plates. |
| 4 | **Temporary** | Faded pink `#e0a3a9` | Cracked / crumbling fills; spring pads | Collapse, bob, crack | Soft & breakable: collapsing floors, springs, pads. |
| 5 | **Optimization** | *(open — see below)* | Motion glyphs: chevrons, `↔` arrows on conveyors/platforms | Directional sweep | Elements that reward skilled/fast routing (conveyors, launches). |
| 6 | **Secret** | Lavender `#a998c9` | **Dashed outline** — "the idea of a thing" | Reveal / rule-change | Exits, altered rules, hidden or fake geometry, gravity flips. |

**Two open reconciliations for P9 planning** (flagged here rather than papered over — this is
exactly the kind of gap the adversarial-plan discipline exists to surface):

1. **Optimization has no dedicated paper accent yet.** The kit expresses optimization through
   *motion glyphs* (conveyor chevrons in terracotta, the `↔` platform arrows) rather than a fill
   colour. Terracotta risks colliding with Danger. P9 planning must decide: a dedicated accent,
   or formalise "Optimization = a motion/glyph signature layered on a Safe/Interactive body."
2. **Danger currently doubles as the goal.** Terracotta marks both "kills you" and "the flag."
   The kit distinguishes them by silhouette (spikes vs. pennant), but REQ-070 forbids signature
   mixing. P9 must confirm silhouette is sufficient separation, or split the goal's signature.

Supporting colours that are **not** gameplay categories (they are environment/decor material):
CREAM `#ece5d4` (paper ground, door openings, eyes), AGED BEIGE `#d8c49c` (printed matter:
newsprint, graph paper, tape), WASHED BLUE `#9fbfca` (cold/slippery — ice surfaces, winter
levels). Pure white exists only in the player's eyes and tiny highlights.

---

## 2 · First principles (the eight non-negotiables of Paper Collage)

Verbatim intent from the kit's Design Bible. A future StylePack may drop these; while Paper
Collage is the active pack, they are binding.

1. **Silhouette first.** Every gameplay object must read as a pure black shape. Threshold the
   frame to two colours — if you can't tell spike from platform from player, the design failed.
   No texture rescues a bad silhouette.
2. **Gameplay is ink, decor is paper.** Everything you can touch is charcoal ink (plus one
   restrained functional accent). Everything you can't touch is tinted paper behind it.
3. **Function gets the accent.** Colour marks behaviour, not beauty (the section-1 table). An
   accent that doesn't mean something is noise.
4. **Negative space is a material.** Large open cream areas are deliberate composition. Cutting
   a decor piece is usually the improvement.
5. **Jitter the shape, never the hitbox.** Colliders stay clean rectangles at exact grid
   positions; only the *drawn* polygon wobbles. Rough edges are a costume the physics never
   wears. (This is what makes the art layer safely swappable over unchanged physics.)
6. **Imperfect, not sloppy.** Vertex jitter ≤ ±2px; wear erases ≤ ~15% of a fill. Past that it
   looks broken, not printed. The kit was tuned toward the calm end of this range in the dm-0077
   simplification (edge subdivision ~14px, jitter ~±1px) — readability first, texture second.
7. **Absence has a costume too.** Things that vanish, haven't happened, or exist only as rules
   (zones, fake platforms, collapsed floors) are drawn as **dashed outlines**.
8. **Same function, same shape, everywhere.** A spike is always triangles; a plate is always a
   terracotta dome; an eye always means "this watches you." The vocabulary never gets synonyms.

---

## 3 · Composition & layering

- **Fixed layer order, composed bottom-up:** paper ground → soft tinted stains → oversized
  collage pieces → symbols/splatters/grain → tiles → static entities → dynamic entities →
  labels/UI. Nothing draws out of its layer.
- **Tiny library, infinite screens.** Reuse a **small decor set (~6–10, currently 8)** everywhere;
  the hand-assembled feel comes from randomising position/scale/rotation/opacity/tint **per
  placement**, never from authoring new art. Adding decor *types* is almost never the answer —
  vary placement instead (dm-0077).
- **Decor obeys a no-fly zone:** nothing decorative within half a tile of a walkable surface or
  hazard; decor contrast stays below gameplay contrast (tints/low alpha, never full ink).
- **One or two accents per level**, chosen up front; stains and torn paper tint from that pair.
- **Detail clusters in odd numbers**, placed just above the intended route to lead the eye.

---

## 4 · Procedural ink & determinism

The kit generates art procedurally from a **seeded RNG hashed off entity identity / grid
position** — so every object is unique yet **identical on every reload and every death**. This
dovetails with the project's determinism axiom: the *visual* seed is derived, not random, exactly
as the *simulation* RNG is threaded through state (dm-0003/dm-0004).

- **Rough polygon:** walk each edge in ~9px steps, offset every step by ±jitter — one helper
  gives every rect/triangle/slab its cut-paper edge.
- **Wear:** `destination-out` erase of low-alpha specks + thin scratches (erasing reads as
  missing ink; painting dirt reads wrong).
- **Grain is ONE shared layer, not per-asset (dm-0077).** 1px specks, half dark/half near-white,
  4–7% alpha, applied **once** to the composed background — this is the shared paper texture that
  unifies every surface into one paper stock. Gameplay sprites are drawn as **clean, un-grained
  ink** so their silhouettes stay bold; per-object grain is forbidden (it softens silhouettes and
  multiplies work for no readability gain).
- **Splatter:** offset droplets by `rnd()·rnd()·radius` (squaring clusters them like flicked ink).
- **States are frames, not filters:** door open/closed, laser on/off, floor intact/cracking are
  **separately cached bitmaps** swapped by key — never runtime tinting of one bitmap.
- **`Math.random` is still forbidden** everywhere (the axiom). Visual RNG is a seeded generator
  keyed off identity, same discipline as the sim.

---

## 5 · Performance & memory habits (the render-layer contract)

These are the load-bearing rules that let a paper-textured game hit frame budget; they also frame
REQ-161/162/163 (object pooling, render batching, async asset delivery, fps scale-back).

- **Generate never per-frame.** Procedural drawing happens at exactly three moments: asset
  creation, level load, and appearance change. The frame loop is *only* `drawImage()` of cached
  canvases plus the handful of kinetic entities.
- **Cache by key, pad for jitter.** One `Map` keyed `kind:state:size`; render with ~6px padding
  so wobble/overshoot survive, blit with that offset baked in.
- **Merge before you draw.** Collapse solid tile runs into one bitmap per run.
- **One background bitmap per level.** Compose the whole collage once at world size; the camera
  is a `drawImage` source-rect crop — scrolling costs the same as standing still.
- **Keep the dynamic list tiny.** Split static/dynamic at load; only genuinely kinetic kinds tick.
- **Cache only meaningful gameplay states (dm-0077).** Cache a separate bitmap only for states the
  player must distinguish (open/closed, on/off, intact/cracking, idle/pressed). Pure *direction* or
  mirroring is a runtime transform (flip / a live glyph sweep), not a second cached canvas — e.g.
  the conveyor caches one body and shows direction via its animated chevrons.
- **Cap the pixel ratio** (DPR 2 gameplay / 1.5 for large sheets). Scope all `w·h·4·DPR²` canvas
  budgeting to the level; clear the level-scoped cache on transition.
- **Avoid slow paths in the hot loop:** no `shadowBlur`, no `filter`, no `save/restore` churn;
  reset `setLineDash([])` after every dashed pass; keep blits integer-aligned.

---

## 6 · How this maps to the P9 requirements

| Requirement | What this bible fixes | What P9 planning still decides |
|---|---|---|
| REQ-070/071 | The six-category grammar + Paper Collage as its first realisation (§1) | Optimization accent; Danger/goal split; audio signatures per category |
| REQ-001/002 | Responsive scaling via DPR cap + world-size background crop (§5) | Concrete scaling breakpoints, canvas vs. WebGL surface |
| REQ-161/162/163 | Cache-by-key, tile-run merge, one-bg-bitmap, static/dynamic split, fps discipline (§5) | Object-pool framework, quadtree render-side batching, async delivery + auto scale-back |
| REQ-016 | Failure information is a *visible* on-screen class (Danger = terracotta + sharp silhouette) | Death/feedback presentation |
| REQ-150 | Squash/stretch, particle burst, camera are render-side; sim exposes the state to animate from | The animation curves themselves |
| REQ-130/131 | Debug overlays + editor are plain-data descriptors (P8) the renderer draws | The StylePack render of those descriptors |

**Boundary reminder:** P9 is the first phase with a rendering surface. `tools/` and `src/` are
headless today and stay so; the StylePack/renderer is a *new* surface that consumes tools/ and
sim state as plain data. It does not retrofit rendering into `tools/` (dm-0065), and the
one-way import rule (nothing in `src/` imports `tools/`, dm-0066) constrains where it can live —
resolved at P9 planning.
