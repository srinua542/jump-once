# Jump Once — PRD Requirements Backlog

**Purpose.** This is the persistent implementation backlog mandated by the Autonomous Implementation Directive. Every requirement is derived directly from `prd.md` (or from the `/jump-once-protocol` engineering skill, prefixed `REQ-P`). Each lives in exactly one of four states and may not advance to **Verified** until it is implemented, tested, reviewed against the PRD, and confirmed against its acceptance criteria.

**States:** `NOT_STARTED` · `IN_PROGRESS` · `COMPLETED` (built + tested) · `VERIFIED` (built + tested + audited against PRD acceptance criteria).

**Traceability rule.** Every source module must trace back to at least one REQ id via the Project Knowledge Graph `gdos_alignment` / functional summary. Every REQ must map to at least one phase in [IRD.md](IRD.md).

**Legend for Phase column** — see [IRD.md](IRD.md) for full phase definitions.

---

## §1 Mission & Product Vision

| ID | Requirement | PRD | Phase | State |
|----|-------------|-----|-------|-------|
| REQ-001 | 2D puzzle-platformer targeting premium web portals (Poki, CrazyGames); retention decided in first 30s. | §1 | P9,P11 | NOT_STARTED |
| REQ-002 | Eliminate operational friction: no long loads, no complex progression, no text-heavy tutorials. | §1 | P9,P10 | NOT_STARTED |
| REQ-003 | Prioritize continuous kinetic momentum and instant gameplay iteration. | §1 | P3,P10 | IN_PROGRESS |
| REQ-004 | Single unchanging structural constraint: exactly one jump per level. | §1 | P3 | VERIFIED |
| REQ-005 | Depth via level design (Level Devil–style subversion), not expanded power sets; logical fairness; deterministic rules. | §1 | P10 | NOT_STARTED |

## §2 Core Philosophy & Axiomatic Constraints

| ID | Requirement | PRD | Phase | State |
|----|-------------|-----|-------|-------|
| REQ-010 | Exactly one jump per level, invariant across the entire campaign. | §2 | P3 | VERIFIED |
| REQ-011 | Exclude upgrades, power-ups, double/wall jumps, jump-refreshing lives, temporary exceptions. | §2 | P3 | VERIFIED |
| REQ-012 | Every challenge isolates/amplifies/tests the one-jump constraint; omit anything that does not. | §2 | P5,P10 | NOT_STARTED |
| REQ-013 | Understandable within seconds; difficulty from player decisions and spatial puzzles. | §2 | P10 | NOT_STARTED |
| REQ-014 | The structural puzzle *is* the level layout itself. | §2 | P2,P10 | IN_PROGRESS |
| REQ-015 | Deliberate six-phase emotional arc: Curiosity, Confidence, Surprise/Betrayal, Realization, Mastery, Renewed Uncertainty. | §2 | P5,P10 | NOT_STARTED |
| REQ-016 | No arbitrary trolling/random penalties; failure information always visually present on screen. | §2 | P5,P9,P10 | NOT_STARTED |

## §3 Creative Director & First-Party Quality Review

| ID | Requirement | PRD | Phase | State |
|----|-------------|-----|-------|-------|
| REQ-020 | Operate as Creative Director; ruthless curation; a "Kill Switch" for any non-elevating concept. | §3 | P5 | NOT_STARTED |
| REQ-021 | First-Party Quality Review gate (Self-Explanation, Hours of Interest, Inevitable Polish) before approving any mechanic/system/chapter. | §3 | P5 | NOT_STARTED |
| REQ-022 | Subtractive Removal Engine: mandatory subtraction pass at every milestone across six pruning questions. | §3 | P5,P11 | NOT_STARTED |

## §4 Campaign Intelligence & Player Behavior Modeling

| ID | Requirement | PRD | Phase | State |
|----|-------------|-----|-------|-------|
| REQ-030 | Campaign Intelligence: macro-level Game Director modeling the global campaign state. | §4 | P6 | NOT_STARTED |
| REQ-031 | Ten macro state variables tracked continuously (knowledge, behavior, emotional, skill curve, mechanics introduced, mechanics mastered, optimization depth, curiosity trend, chapter health, retention prediction). | §4 | P6 | NOT_STARTED |
| REQ-032 | Player Behavior Model: hesitation, platform-checking, commitment speed, panic cycles, drop-off, retry cadence; design adapts to these signatures. | §4 | P6,P8 | NOT_STARTED |

## §5 Game Design Intelligence & Economy of Mechanics

| ID | Requirement | PRD | Phase | State |
|----|-------------|-----|-------|-------|
| REQ-040 | Model the entire design space mathematically & conceptually before designing any content. | §5 | P5 | NOT_STARTED |
| REQ-041 | Formal multi-dimensional design-space matrix: Mechanic × Environment × Emotion × Optimization Style × Player Type, with enumerated axes; track coverage. | §5 | P5,P6 | NOT_STARTED |
| REQ-042 | Economy of Mechanics metric (Depth ÷ Mechanic Count); maximize; exhaust variations before introducing a new mechanic. | §5 | P5 | NOT_STARTED |

## §6 Game Design Operating System (GDOS)

| ID | Requirement | PRD | Phase | State |
|----|-------------|-----|-------|-------|
| REQ-050 | All creative decisions originate from GDOS; no gameplay content created independently of it. | §6 | P5,P10 | NOT_STARTED |
| REQ-051 | Persistent Design Memory: version control for creative intent; record every accepted/rejected idea; parse history before proposing to prevent regression/repetition. | §6 | P0,P5 | IN_PROGRESS |
| REQ-052 | Continuous Design Research Engine (CDRE): self-improving loop that improves the design process itself and feeds validated discoveries back into GDOS. | §6 | P5 | NOT_STARTED |
| REQ-053 | Novelty Search: algorithmic metric targeting layout divergence. | §6 | P5,P7 | NOT_STARTED |
| REQ-054 | Emergent Fun Discovery search: probe physics edge cases; flag high-value kinetic anchors for future layouts. | §6 | P5,P7 | NOT_STARTED |
| REQ-055 | Mathematically enforced emotional thresholds as quality gates: Curiosity ≥90, Confidence ≥90, Surprise ≥95, Mastery ≥95. | §6 | P5 | NOT_STARTED |
| REQ-056 | Global Streamability Matrix gates: Shareability ≥85, Clip Potential ≥90, Reaction Density ≥95, Replay Value ≥90. | §6 | P5 | NOT_STARTED |

## §7 Procedural Design Assistant (PDA) & Information Density

| ID | Requirement | PRD | Phase | State |
|----|-------------|-----|-------|-------|
| REQ-060 | PDA: standalone discovery tool that searches conceptual/structural/systemic opportunities (not raw geometry). | §7 | P7 | NOT_STARTED |
| REQ-061 | Information Density Score (IDS) formula computed per screen; regulate against max (overwhelm) and min (boring) thresholds. | §7 | P5,P7 | NOT_STARTED |

## §8 Visual Grammar & Language Consistency

| ID | Requirement | PRD | Phase | State |
|----|-------------|-----|-------|-------|
| REQ-070 | Strict, unyielding Visual Grammar; standardized UX signatures; mixing signatures strictly prohibited. | §8 | P9 | NOT_STARTED |
| REQ-071 | Six structural categories, each with fixed palette/silhouette/motion/audio signature (Safe, Danger, Interactive, Temporary, Optimization, Secret). | §8 | P9 | NOT_STARTED |

## §9 Production Workflow & Mechanic Lifecycle

| ID | Requirement | PRD | Phase | State |
|----|-------------|-----|-------|-------|
| REQ-080 | Execute the sequential production pipeline in strict order; lock foundational systems/schema/tools before campaign content. | §9 | P0–P11 | IN_PROGRESS |
| REQ-081 | Creativity & Iteration loop: generate → variations → GDOS eval → mutate/combine → compare to memory → select hybrid → improve → repeat to diminishing returns. | §9 | P5,P7 | NOT_STARTED |
| REQ-082 | 9-stage mechanic lifecycle tracking (Introduction→…→Retirement); block reuse of exhausted mechanics; prune/convert on Retirement. | §9 | P5,P7 | NOT_STARTED |
| REQ-083 | Strict chapter generation architecture: define 7 framework items (Theme, Learning Goal, Mental Model, Misconceptions, Subversion, Optimization, Final Exam) before any level generation. | §9 | P10 | NOT_STARTED |

## §10 Level Production Pipeline & Intent Verification

| ID | Requirement | PRD | Phase | State |
|----|-------------|-----|-------|-------|
| REQ-090 | 8-phase level manufacturing pipeline (Concept → Structural Prototyping → Kinetic Simulation → AI Council Eval → Targeted Revision → Optimization Layering → Sign-off/Intent → Campaign Integration). | §10 | P7,P10 | NOT_STARTED |
| REQ-091 | Single-Sentence Intent Verification gate; layouts that cannot state their lesson in one rigorous sentence are denied compile and deleted. | §10 | P7,P10 | NOT_STARTED |

## §11 Dual-Path Architecture & Optimization Space

| ID | Requirement | PRD | Phase | State |
|----|-------------|-----|-------|-------|
| REQ-100 | Dual-Path axiom: every level supports Discovery Path and Mastery Path in one physical space. | §11 | P10 | NOT_STARTED |
| REQ-101 | Optimization Space Model: five routing tiers (Discovery, Good, Fast, Expert, World Record). | §11 | P4,P10 | NOT_STARTED |
| REQ-102 | Optimization delta metric (Time_Discovery − Time_WorldRecord); reject layouts with zero/minimal delta. | §11 | P4,P10 | NOT_STARTED |

## §12 20 Core Principles & Design Intent Repository

| ID | Requirement | PRD | Phase | State |
|----|-------------|-----|-------|-------|
| REQ-110 | The 20 Core Design Principles serve as the operational compass whenever multiple implementations exist. | §12 | P0–P11 | NOT_STARTED |
| REQ-111 | Design Intent Repository: every accepted decision permanently records why it exists, problem solved, emotion targeted, misconception created, why alternatives were rejected. | §12 | P0,P5 | IN_PROGRESS |

## §13 Data-Driven System Architecture

| ID | Requirement | PRD | Phase | State |
|----|-------------|-----|-------|-------|
| REQ-120 | Strictly data-driven: no gameplay behaviors, asset relationships, geometries, or mechanical values hardcoded in core scripts; all as runtime-parsed structured payloads. | §13 | P1,P2 | VERIFIED |
| REQ-121 | Core engine is a deterministic state processor reading external configuration; pacing/paths/curves/hazards edited via data only. | §13 | P1,P2 | VERIFIED |
| REQ-122 | Level Definition Schema: full serialization incl. GDOS metadata (target KG node, difficulty vectors, emotional budget curves, creator-moment frame), tilemaps, entities, constraints, triggers. | §13 | P2 | VERIFIED |

## §14 Internal Production Tools & Developer Environment

| ID | Requirement | PRD | Phase | State |
|----|-------------|-----|-------|-------|
| REQ-130 | Visual Level Editor: tile painting, grid-snapped object placement, hierarchical grouping, multi-step undo/redo, live in-editor playtest. | §14 | P8 | NOT_STARTED |
| REQ-131 | Visual debug overlays (hitboxes, triggers, movement paths, simulated jump arcs, surface normals, physics states) + runtime inspection (pause, frame-step, variable manipulation, instant reload). | §14 | P8 | NOT_STARTED |
| REQ-132 | Automated profiling: frame rate, memory allocations, scene load times, asset delivery speeds. | §14 | P8,P11 | NOT_STARTED |
| REQ-133 | Telemetry: death-coordinate heatmaps, input recording for failure analysis, statistical difficulty spikes, fed back into GDOS for design-debt evaluation. | §14 | P8 | NOT_STARTED |

## §15 Multi-Layer Evaluation & Curriculum Validation

| ID | Requirement | PRD | Phase | State |
|----|-------------|-----|-------|-------|
| REQ-140 | Two isolated validation passes: Local Spatial Verification and Macro Curriculum Validation. | §15 | P4 | NOT_STARTED |
| REQ-141 | Local: five agent archetypes (First-Time, Cautious, Experienced, Expert Speedrunner, Curious Explorer); Solvability audit (exactly one jump), Softlock detection, Exploit filtration, Optimization windows. | §15 | P4 | IN_PROGRESS |
| REQ-142 | Macro: curriculum progress arc; four criteria — Cognitive Structural Mapping, Cross-Chapter Degradation Analysis, Curiosity Progression Curves, Graduation Assessment Verification. | §15 | P4,P6 | NOT_STARTED |

## §16 Gameplay Systems & Modular Components

| ID | Requirement | PRD | Phase | State |
|----|-------------|-----|-------|-------|
| REQ-150 | Player Character Controller: instant horizontal accel/decel; single jump with anticipation frames, squash-and-stretch, particle burst, camera tracking; jump state locks (horizontal-only) until scene reload. | §16 | P3,P9 | IN_PROGRESS |
| REQ-151 | Environmental elements: static geometry, moving platforms (linear/looping/triggered), collapsing floors, frictionless ice. | §16 | P3 | VERIFIED |
| REQ-152 | Hazards & triggers: static spikes, timed laser arrays, moving hazards (instant defeat on intersection); pressure plates, proximity zones, mechanical doors that modify layout dynamically. | §16 | P3 | VERIFIED |
| REQ-153 | Kinetic modifiers: directional launch springs, gravity-inverting zones, conveyors — alter velocity/inertia without consuming the single jump. | §16 | P3 | VERIFIED |
| REQ-154 | Components fully decoupled/modular; complex puzzles emerge from layering simple systems. | §16 | P3 | VERIFIED |

## §17 Performance Optimization & Technical Guardrails

| ID | Requirement | PRD | Phase | State |
|----|-------------|-----|-------|-------|
| REQ-160 | Zero-allocation runtime loop; preallocate all structural arrays/state objects upfront. | §17 | P3,P11 | IN_PROGRESS |
| REQ-161 | Global object-pooling framework for particles, visual impacts, projectiles. | §17 | P9,P11 | NOT_STARTED |
| REQ-162 | Render batching for static geometry/background; spatial partitioning (quadtree) so collision evaluates only the player's neighborhood. | §17 | P3,P9,P11 | IN_PROGRESS |
| REQ-163 | Async asset delivery; continuous performance monitoring with automatic scale-back of non-critical visuals below target fps. | §17 | P9,P11 | NOT_STARTED |

## §18 Shipping, Automation & Release

| ID | Requirement | PRD | Phase | State |
|----|-------------|-----|-------|-------|
| REQ-170 | Interface with WebGL/WebAudio; integrate platform SDKs (Poki, CrazyGames) for ad placement + loading-progress lifecycle hooks. | §18 | P9,P11 | NOT_STARTED |
| REQ-171 | Responsive UI scaling across resolutions, aspect ratios, and fullscreen transitions. | §18 | P9,P11 | NOT_STARTED |
| REQ-172 | Fully automated build pipeline: compile optimized client builds, asset optimization passes, run the validation test suite, package deployment-ready artifacts. | §18 | P11 | NOT_STARTED |
| REQ-173 | Completion bar: polished, definitive premium-indie quality; complete only when all systems/tools/data/docs are shipped-verified. | §18 | P11 | NOT_STARTED |

## Protocol Requirements (from `/jump-once-protocol` skill + Directive)

| ID | Requirement | Source | Phase | State |
|----|-------------|--------|-------|-------|
| REQ-P01 | Maintain a persistent PRD-derived backlog with the four-state model; nothing marked Completed until implemented+tested+reviewed+verified. | Directive | P0 | VERIFIED |
| REQ-P02 | Produce a per-phase execution plan before coding and a verification report after each phase. | Directive | P0–P11 | IN_PROGRESS |
| REQ-P03 | Maintain the Project Knowledge Graph; update immediately on any structural code change. | Skill | P0–P11 | IN_PROGRESS |
| REQ-P04 | Write `/meta/handoff_latest.json` on every session end. | Skill | P0–P11 | IN_PROGRESS |
| REQ-P05 | Maintain the persistent Design Memory ledger of accepted/rejected decisions. | Skill/§6 | P0 | VERIFIED |
| REQ-P06 | Run the Reboot Lifecycle (read handoff → parse PKG → run tests) at every session start. | Skill | P0–P11 | IN_PROGRESS |
| REQ-P07 | Perform a full PRD compliance audit at every milestone. | Directive | P0–P11 | NOT_STARTED |
| REQ-P08 | Uphold cognitive invariants: zero-assumption execution, idempotency, no debt/placeholders, preserve design intent. | Skill | P0–P11 | IN_PROGRESS |
| REQ-P09 | Enforce architectural isolation: data/logic decoupling, system isolation, encapsulated geometry (per directory_structure). | Skill | P0–P11 | IN_PROGRESS |
| REQ-P10 | Enforce state-management invariants: single source of truth in StateManager, immutability baseline, no global/leaked state. | Skill | P1 | VERIFIED |

---

## Rollup (P3 VERIFIED — `docs/verification/P3.md`; milestone M1 — Simulatable Game CLOSED with P2 ✓ + P3 ✓)

| State | Count |
|-------|------:|
| NOT_STARTED | 40 |
| IN_PROGRESS | 14 |
| COMPLETED | 0 |
| VERIFIED | 13 |
| **Total** | **67** |

**VERIFIED at M0:** REQ-P01, REQ-P05, REQ-P10 (see `docs/verification/P1.md` §4 for the per-REQ rationale). **VERIFIED at P2 close:** REQ-120, REQ-121 (P1,P2 spans now fully covered — runtime-parsed data drives the engine, proven by the file→parse→instantiate→replay integration test), REQ-122 (P2-scoped, fully delivered; see `docs/verification/P2.md` §3). REQ-014 (P2,P10) and REQ-154 (P3) correctly remain `IN_PROGRESS` — their remaining phase scope is unbuilt. See [IRD.md](IRD.md) for phase gating and [execution_plan.md](execution_plan.md) for the active-phase plan.
