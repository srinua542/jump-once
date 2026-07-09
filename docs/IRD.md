# Jump Once — Implementation Roadmap (IRD)

> The PRD answers **"What must be built?"**
> This IRD answers **"In what order must it be built, and why that order?"**

This roadmap sequences every requirement in [requirements_backlog.md](requirements_backlog.md) into twelve dependency-ordered phases. It is a living document: phase states update as work lands, and the PKG (`meta/project_knowledge_graph.json`) is the machine-readable mirror of what actually exists.

---

## 1. Sequencing principle

Two orderings govern this project and they must be reconciled:

1. **The PRD production workflow (§9)** — the *authoritative* creative pipeline:
   `Understand Vision → Build GDOS → Construct Curriculum → Explore Design Space → Build Mechanic Library → Build Evaluation & Tooling → Evolve Lifecycles → Generate Chapters → Generate Levels → Validate → Optimize/Liquidate Debt → Ship.`

2. **Hard engineering dependencies** — you cannot build a physics-based solvability validator before a physics engine exists, and you cannot score a level's emotional/streamability metrics (§6) before a serialized level exists to score (§13).

### Documented reconciliation (not a simplification)

The PRD's single non-negotiable ordering constraint is stated in §9 and the Directive: **no campaign content may be generated until the GDOS, the validation framework, and the production tools are operational.** This IRD honors that constraint absolutely — all content generation is Phase 10, strictly after GDOS (P5), validation (P4), and tools (P8).

However, §6's GDOS *quality gates* (emotional thresholds, streamability, IDS) are functions that take a **level asset** as input. Those cannot execute before the **Level Definition Schema (§13, REQ-122)** and the **deterministic physics/mechanic library (§16)** exist. Therefore this IRD splits GDOS delivery:

- The GDOS **governance substrate** — Design Memory, the Design Intent Repository, the four-state ledger — is stood up first (Phase 0), because it records decisions from the very first commit.
- The GDOS **scoring engine** — the gates that evaluate level assets — lands in Phase 5, after the schema (P2) and mechanics/physics (P3) give it something real to evaluate.

This is a merge of interlocking requirements as the Directive permits ("merge into a single implementation while preserving the complete intent"), not a reinterpretation. The intent of §6 is fully preserved; only its executable gates are scheduled where their inputs exist.

---

## 2. Phase dependency DAG

```
P0 Governance & Protocol Infrastructure
   │  (backlog, IRD, PKG, design memory, handoff, reboot lifecycle)
   ▼
P1 Deterministic Core Architecture ──────────────┐
   │  (engine loop, StateManager, clock, rng)     │
   ▼                                              │
P2 Data Models & Level Definition Schema          │
   │  (§13 level schema, entity/component data)    │
   ▼                                              │
P3 Mechanic Library & Deterministic Physics ◄─────┘
   │  (§16 player one-jump lock, platforms, hazards, kinetic mods)
   ├───────────────┬───────────────────────────┐
   ▼               ▼                           ▼
P4 Evaluation &   P5 GDOS Scoring Engine      (P3 also feeds P8)
   Validation      (§6 gates, §5 economy,
   (§15 solvability, IDS, novelty, CDRE,
    softlock,       fun-search, §3 kill switch)
    optimization    │
    windows,        ▼
    curriculum)   P6 Campaign Intelligence
   │  │            (§4 macro state, player models)
   │  │              │
   │  └──────┬───────┘
   ▼         ▼
P7 PDA & Procedural Generation + Mechanic Lifecycle
   │  (§7 PDA, §9 lifecycle, §10 level pipeline, intent gate)
   │
   ▼
P8 Internal Production Tools ◄─── (depends on P2,P3; consumes P4 sim)
   │  (§14 level editor, debug overlays, profiling, telemetry)
   ▼
P9 Rendering, Audio & Visual Grammar
   │  (§8 visual grammar, §17 batching/pooling, §18 WebGL/WebAudio)
   ▼
P10 Content Generation (chapters & levels)
   │  (§9 chapter arch, §10 pipeline, §11 dual-path — routed through P4–P7)
   ▼
P11 Optimization, Build Pipeline & Ship
      (§17 perf guardrails, §18 automated build, SDK, release audit)
```

**Cross-cutting (all phases):** REQ-110 (20 principles), REQ-P01–P10 (protocol invariants), REQ-022 (subtraction pass at every milestone), REQ-P07 (milestone compliance audit).

---

## 3. Phase definitions

Each phase lists its owned requirements, its **entry gate** (what must be true to begin), and its **exit gate** (what must be true — and verified — to advance). No phase may begin until every predecessor's exit gate is `VERIFIED`.

### P0 — Governance & Protocol Infrastructure  *(Session 1 — active)*
- **Owns:** REQ-P01, REQ-P02, REQ-P03, REQ-P04, REQ-P05, REQ-P06, REQ-051(substrate), REQ-111(substrate), REQ-080(scaffold).
- **Entry:** PRD present.
- **Deliverables:** toolchain + build/test harness; directory structure; `docs/` (backlog, IRD, task_slices, execution_plan); `meta/` (PKG, design_memory_ledger, handoff).
- **Exit:** all governance docs exist and are internally consistent; PKG parses; `npm test` harness runs; handoff written.

### P1 — Deterministic Core Architecture  *(Session 1 — VERIFIED, M0 closed)*
- **Owns:** REQ-120, REQ-121, REQ-P08, REQ-P09, REQ-P10.
- **Entry:** P0 governance exists.
- **Deliverables:** `Vec2`, `Rng`, `Clock`, `State`, `System`, `StateManager`, `Engine` (Read→Process→Emit loop); unit tests proving determinism, immutability, fixed-step, idempotency; one integration replay test.
- **Exit:** deterministic replay test green (same seed+inputs → identical state hash); immutability enforced under freeze; verification report filed.

### P2 — Data Models & Level Definition Schema
- **Owns:** REQ-122, REQ-014, and completes REQ-120/121.
- **Deliverables:** typed, serialized Level Definition Schema (tilemap, entities, constraints, triggers + GDOS metadata: KG node, difficulty vectors, emotional budget curve, creator-moment frame); loader/validator; schema round-trip tests.
- **Exit:** a hand-authored sample level parses, validates, and round-trips losslessly; schema documented.

### P3 — Mechanic Library & Deterministic Physics
- **Owns:** REQ-004, REQ-010, REQ-011, REQ-150, REQ-151, REQ-152, REQ-153, REQ-154, REQ-003; partial REQ-160/162.
- **Deliverables:** deterministic physics system; player controller with the single-jump lock (anticipation/lock/horizontal-only-until-reload); platforms (static/moving/collapsing/ice), hazards (spikes/lasers/moving), triggers (plates/proximity/doors), kinetic modifiers (springs/gravity/conveyors), all data-driven and decoupled.
- **Exit:** single-jump invariant holds under fuzzed input (never >1 jump); each component has isolated tests; deterministic trajectory reproducible.

### P4 — Evaluation & Validation Framework
- **Owns:** REQ-140, REQ-141, REQ-142, REQ-101, REQ-102.
- **Deliverables:** five agent-archetype solvers; Solvability audit (exactly-one-jump), Softlock detection, Exploit filtration, Optimization-window/five-tier routing + delta metric; Macro Curriculum Validation (4 criteria).
- **Exit:** solver correctly classifies known-solvable and known-unsolvable fixtures; optimization delta computed on fixtures.

### P5 — GDOS Scoring Engine
- **Owns:** REQ-050, REQ-052, REQ-053, REQ-054, REQ-055, REQ-056, REQ-061, REQ-040, REQ-041, REQ-042, REQ-020, REQ-021, REQ-022, REQ-012, REQ-015, REQ-016; completes REQ-051/111.
- **Deliverables:** emotional-threshold gates, streamability matrix, IDS regulator, economy-of-mechanics metric, novelty search, emergent-fun search, CDRE loop, Kill Switch + First-Party filter, subtractive removal engine, design-space coverage tracker.
- **Exit:** gates reject fixtures below threshold and pass fixtures above; every gate traces to a PRD score; Design Memory records each decision with full Intent Repository fields.

### P6 — Campaign Intelligence
- **Owns:** REQ-030, REQ-031, REQ-032; contributes REQ-142.
- **Deliverables:** ten macro state variables as a data model; player knowledge/behavior models; retention/curiosity/chapter-health analytics fed by telemetry (P8) and validation (P4).
- **Exit:** macro state updates deterministically from a fixture campaign; flags a synthetic difficulty spike.

### P7 — PDA & Procedural Generation + Mechanic Lifecycle
- **Owns:** REQ-060, REQ-081, REQ-082, REQ-090, REQ-091, REQ-053/054(applied).
- **Deliverables:** PDA opportunity search; creativity/iteration loop; 9-stage lifecycle tracker; 8-phase level manufacturing pipeline incl. single-sentence intent gate.
- **Exit:** pipeline produces a schema-valid level that passes P4 solvability and P5 gates, or is correctly rejected+deleted with a logged reason.

### P8 — Internal Production Tools
- **Owns:** REQ-130, REQ-131, REQ-132, REQ-133; contributes REQ-032.
- **Deliverables:** visual level editor (paint/snap/group/undo-redo/live playtest); debug overlays (hitboxes/triggers/paths/jump-arcs/normals/states); profiling; telemetry (death heatmaps/input recording/spike detection) → GDOS.
- **Exit:** a level can be authored, playtested, and exported through the editor; telemetry round-trips into Campaign Intelligence.

### P9 — Rendering, Audio & Visual Grammar
- **Owns:** REQ-070, REQ-071, REQ-161, REQ-162, REQ-163, REQ-170, REQ-171, REQ-016(visual), REQ-001, REQ-002.
- **Deliverables:** WebGL renderer with batching + object pooling + spatial partitioning; WebAudio; the six-category visual grammar as a data-driven style system; responsive scaling; SDK-ready lifecycle hooks.
- **Exit:** a level renders at target fps with the correct visual signatures; dynamic quality scale-back verified under synthetic load.

### P10 — Content Generation
- **Owns:** REQ-005, REQ-013, REQ-083, REQ-100, REQ-050(applied), REQ-015(applied).
- **Deliverables:** chapters authored via the §9 7-step architecture; levels via the §10 pipeline; every level dual-path and routed through GDOS + validation; full campaign.
- **Exit:** every shipped level is `VERIFIED` by P4+P5; macro curriculum validation passes for each chapter.

### P11 — Optimization, Build Pipeline & Ship
- **Owns:** REQ-160, REQ-161, REQ-162, REQ-163, REQ-172, REQ-173, REQ-132(release), REQ-022(final), REQ-P07(final).
- **Deliverables:** zero-allocation audit of the runtime loop; automated build pipeline (compile + asset opt + run validation suite + package); final compliance audit against the entire PRD.
- **Exit:** production build passes the full automated validation suite; every REQ is `VERIFIED`.

---

## 4. Milestones & gates

| Milestone | Phases | Gate |
|-----------|--------|------|
| **M0 — Foundation Locked** | P0, P1 | Deterministic core verified; governance operational. |
| **M1 — Simulatable Game** | P2, P3 | A data-defined level is playable & physically deterministic with the one-jump lock. |
| **M2 — Design Intelligence Operational** | P4, P5, P6 | GDOS gates + validation + Campaign Intelligence can judge a level end-to-end. *(This is the Directive's hard gate: content generation is forbidden until M2 is VERIFIED.)* |
| **M3 — Production Capable** | P7, P8 | Levels can be generated/authored and validated through the full pipeline. |
| **M4 — Presentable** | P9 | The game renders and sounds correct under the visual grammar at target fps. |
| **M5 — Content Complete** | P10 | Full campaign generated and verified. |
| **M6 — Shippable** | P11 | Automated build green; full PRD compliance audit passes. |

Each milestone triggers a mandatory **Subtractive Removal pass (REQ-022)** and a **compliance audit (REQ-P07)** before the next milestone begins.

---

## 5. Current status (Session 4)

- **M0 — Foundation Locked: VERIFIED.** See `docs/verification/P1.md`.
- **P0, P1:** VERIFIED (see M0 report).
- **P2 — Data Models & Level Definition Schema: VERIFIED.** See `docs/verification/P2.md`. 118/118 at close; REQ-120/121/122 VERIFIED per dm-0008.
- **P3 — Mechanic Library & Deterministic Physics: VERIFIED.** See `docs/verification/P3.md`. All nine slices (S3.1–S3.9, restructured at phase start via adversarial review — dm-0016–dm-0021) landed: deterministic physics core (symplectic Euler + swept axis-separated collision, no tunneling), deterministic quadtree, the player controller, the run lifecycle (goal/defeat/instant reload), **the single-jump lock axiom** (fuzz-proven never >1 jump per life), the full §16 mechanic library (moving platforms + carry, collapsing floors, ice, spikes/lasers/moving hazards, plates/proximity/doors, springs/gravity zones/conveyors), all data-driven and layering-tested. 186/186 tests green. REQ-004/010/011/151/152/153/154 flipped VERIFIED per dm-0008.
- **M1 — Simulatable Game: CLOSED (VERIFIED).** P2 ✓ + P3 ✓ — a data-defined level is playable and physically deterministic with the one-jump lock.
- **P4 — Evaluation & Validation Framework: VERIFIED.** See `docs/verification/P4.md`. All seven slices (S4.1–S4.7, section authored before code via adversarial review — dm-0022–dm-0029) landed: the replay-tape format (`src/schema/TapeIO.ts`), five data-parameterized agent archetypes driving the sim headlessly (`src/eval/`), the Local Spatial Verification pass (bounded deterministic solvability search treating exactly-one-jump as ground truth, softlock/dead-zone detection, exploit filtration, five-tier optimization routing + delta), and the isolated Macro Curriculum Validation pass (four §15 criteria). 241/241 tests green (incl. the dm-0030 WR-anchor refinement). REQ-140/141 flipped VERIFIED per dm-0008; REQ-142/101/102 correctly stay IN_PROGRESS (P6/P10 remainder).
- **Active milestone:** M2 — Design Intelligence Operational (P4 ✓, P5, P6). **P5 — GDOS Scoring Engine is the next phase** (entry condition P4-VERIFIED satisfied); its execution-plan section must be authored before S5.1 code (REQ-P02). The content-generation hard gate stays closed until M2 is fully VERIFIED (P5 + P6 remain).
- **All later phases (P5–P11):** still NOT_STARTED and correctly gated.

See [task_slices.md](task_slices.md) for the session-sized work units and [execution_plan.md](execution_plan.md) for the detailed plan of the active phases.
