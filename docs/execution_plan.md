# Jump Once — Execution Plan

This document holds one section per phase, authored *before* that phase's implementation code (REQ-P02).

- **P0 + P1 (M0 — Foundation Locked): CLOSED.** M0 is VERIFIED, see `docs/verification/P1.md`. Retained below as the historical record.
- **P2 — Data Models & Level Definition Schema: CLOSED — VERIFIED**, see `docs/verification/P2.md`. Checkpoints C2.1–C2.6 all passed (118/118 tests). Retained below as the historical record.
- **P3 — Mechanic Library & Deterministic Physics: CLOSED — VERIFIED**, see `docs/verification/P3.md`. Authored at S3.1 start via adversarial review (dm-0016–dm-0021; table restructured to S3.1–S3.9). All checkpoints C3.1–C3.9 passed (186/186 tests). **Milestone M1 — Simulatable Game CLOSED.**
- **P4 — Evaluation & Validation Framework: CLOSED — VERIFIED**, see `docs/verification/P4.md`. Section authored at S4.1 start per REQ-P02 via the same adversarial review P2/P3 got (dm-0022–dm-0029). All seven slices S4.1–S4.7 ran the nine-stage SDLC loop (archives in `meta/runs/S4.*`); checkpoints C4.1–C4.7 passed (241/241 tests). First of the three M2 pillars.
- **P5 — GDOS Scoring Engine: CLOSED — VERIFIED**, see `docs/verification/P5.md`. Section below authored before S5.1 code per REQ-P02, via a first-principles adversarial review of the original slice table (dm-0031–dm-0035; table restructured — Design Memory moved ahead of the Kill Switch and CDRE). All nine slices S5.1–S5.9 ran the SDLC loop (archives in `meta/runs/S5.*`); checkpoints C5.1–C5.9 passed (336/336 tests). Implementation decisions dm-0036–dm-0042. Second of the three M2 pillars.
- **P6 — Campaign Intelligence: CLOSED — VERIFIED**, see `docs/verification/P6.md`. Section below authored before S6.1 code per REQ-P02, via a first-principles adversarial review (dm-0043–dm-0048; table restructured to six slices S6.1–S6.6). All six slices ran the SDLC loop (archives in `meta/runs/S6.*`); checkpoints C6.1–C6.5 passed (420/420 tests). Implementation decisions dm-0049–dm-0053. Third and final M2 pillar. **Milestone M2 — Design Intelligence Operational is VERIFIED. The content-generation hard gate is OPEN.**
- **P7 — PDA & Procedural Generation + Mechanic Lifecycle: CLOSED — VERIFIED**, see `docs/verification/P7.md`. Section authored before S7.1 code per REQ-P02 via a first-principles adversarial review (dm-0054–dm-0060). All eight slices S7.1–S7.8 ran the SDLC loop (archives in `meta/runs/S7.*`); 498/498 tests green. Implementation decisions dm-0061–dm-0064. First of the two M3 pillars.
- **P8 — Internal Production Tools: CLOSED — VERIFIED**, see `docs/verification/P8.md`. Section below authored before S8.1 code per REQ-P02, via a first-principles adversarial review (dm-0065–dm-0070; table restructured to seven slices S8.1–S8.7). All seven slices ran the SDLC loop (archives in `meta/runs/S8.*`); 560/560 tests green. Implementation decisions dm-0071–dm-0074. Second and final M3 pillar. **Milestone M3 — Production Capable is CLOSED (VERIFIED). The content-authoring gate is fully open; P10 unlocks. Next phase: P9 — Rendering, Audio & Visual Grammar.**

Covers the phases that were in flight: **P0 (Governance & Protocol Infrastructure)** and **P1 (Deterministic Core Architecture)** — together, milestone **M0 — Foundation Locked**. Per the Directive, this plan is written *before* implementation code and defines the work, governing PRD requirements, dependencies, deliverables, validation criteria, and completion checkpoints. A new execution plan will be authored at the start of each subsequent phase.

---

## Governing requirements

| Phase | REQs governing the work |
|-------|--------------------------|
| P0 | REQ-P01, REQ-P02, REQ-P03, REQ-P04, REQ-P05, REQ-P06, REQ-P08, REQ-P09, REQ-051(substrate), REQ-111(substrate), REQ-080(scaffold) |
| P1 | REQ-120, REQ-121, REQ-160(partial), REQ-P08, REQ-P09, REQ-P10 |

---

## P0 — Governance & Protocol Infrastructure

### Work
Stand up the machinery the `/jump-once-protocol` requires *before* any gameplay logic: the four-state PRD backlog, the roadmap, the task slices, this plan, and the machine-readable meta layer (PKG, design memory, handoff). This is the "AI agent protocol setup."

### Dependencies
None beyond the PRD and the skill reference files.

### Deliverables
- `package.json`, `tsconfig.json`, `.npmrc`, `.gitignore` — toolchain (**done**).
- Directory skeleton per `directory_structure.md` (**done**: `src/{core,systems,components,entities}`, `test/{unit,integration}`, `tools/`, `docs/`, `meta/`).
- `docs/requirements_backlog.md`, `docs/IRD.md`, `docs/task_slices.md`, `docs/execution_plan.md`, `docs/session_protocol.md`.
- `meta/project_knowledge_graph.json`, `meta/design_memory_ledger.json`, `meta/handoff_latest.json`.

### Validation criteria
- Every PRD section has ≥1 REQ id and every REQ maps to ≥1 phase. *(traceability)*
- PKG parses as valid JSON and lists every source module that exists.
- Design memory records each Session-1 architectural decision with all five Intent Repository fields.
- Handoff validates against `handoff_schema.md`.

### Checkpoints
- **C0.1** Governance docs cross-reference consistently (backlog ↔ IRD ↔ slices). ✅
- **C0.2** Meta JSON files valid + internally consistent with the docs. ✅
- **C0.3** Handoff written last, capturing the exact resume point. ✅ (written at every session end throughout P0/P1)

---

## P1 — Deterministic Core Architecture

### Work
Build the domain-agnostic deterministic runtime: a pure `Read → Process → Emit` state processor with a single source of truth, fixed-timestep simulation, and seeded determinism. This is the substrate every later system plugs into; it must be provably deterministic and immutable before any gameplay rides on it.

### Design summary (the compact model the code is written from)
1. **State is one immutable tree.** `GameState<TWorld>` holds `tick`, `clock`, `rng`, `input`, and a domain `world`. The core is generic over `TWorld` so it is testable with zero gameplay code present.
2. **Systems are pure step functions.** `System.step(state) => state`. No system holds state between frames or reads another system's internals; all shared state is in the tree.
3. **One mutation point.** `StateManager.commit()` is the only place the current snapshot is swapped; it retains the previous snapshot for render interpolation and can deep-freeze in tests to catch accidental mutation.
4. **Fixed-step determinism.** `Clock` banks variable real delta and emits a whole number of fixed steps; `Rng` is seeded and threaded through state. Same `(seed, input-tape)` ⇒ identical state, bit for bit.

### Dependencies
P0 governance exists; toolchain builds.

### Deliverables
- `src/core/Vec2.ts` (**done**), `src/core/Rng.ts` (**done**), `src/core/Clock.ts` (**done**), `src/core/State.ts` (**done**), `src/systems/System.ts` (**done**), `src/core/StateManager.ts` (**done**).
- `src/core/Engine.ts` — the loop that pulls fixed-step count from `Clock`, threads systems, advances `tick`, commits via `StateManager`. (**done** — S1.7)
- `test/unit/*` — one suite per core module. (**done** — S1.8, 55 unit tests)
- `test/integration/DeterministicReplay.test.ts` — determinism proof. (**done** — S1.9, 5 tests)
- `docs/verification/P1.md` — verification report. (**done** — S1.10)

### Validation criteria
- **Determinism:** two independent runs of the same seed + input tape produce an identical serialized final state. *(REQ-121)*
- **Immutability:** committing under `freezeOnCommit` throws on any in-place mutation attempt; no test mutates a prior snapshot. *(REQ-P10)*
- **Fixed step:** feeding `N × FIXED_STEP_SECONDS` of real time yields exactly `N` simulation steps; sub-step time banks correctly; a huge delta clamps (no spiral of death). *(REQ-121, REQ-160)*
- **Idempotency:** committing the same snapshot twice changes nothing but `previous`. *(REQ-P08)*
- **Isolation:** `src/core` imports nothing from `src/systems`, `src/entities`, or gameplay. *(REQ-P09)*
- **Green build:** `npm test` exits 0 with every core module covered.

### Checkpoints
- **C1.1** ✅ All six leaf/core modules (+ Engine) compile under `strict` with no unused-symbol errors.
- **C1.2** ✅ `Engine.ts` lands and the loop advances `tick` by exactly the Clock's step count.
- **C1.3** ✅ Unit suites green for every `src/core` module (55 tests).
- **C1.4** ✅ Replay integration test proves bit-identical determinism (5 tests).
- **C1.5** ✅ Verification report filed (`docs/verification/P1.md`); the P1 REQs whose *full* Phase-column scope closes at M0 (REQ-P01, REQ-P05, REQ-P10) flipped to `VERIFIED` — REQ-120/121 (span into P2), REQ-160 (owned by P3/P11, not P1), and the cross-cutting REQ-P02/03/04/06/07/08/09 (P0–P11, perpetual per `IRD.md`) correctly remain `IN_PROGRESS`, per the verification report's per-REQ rationale. M0 closes.

---

## Exit condition for M0

M0 — Foundation Locked is complete when:
1. P0 checkpoints C0.1–C0.3 pass.
2. P1 checkpoints C1.1–C1.5 pass.
3. A Subtractive Removal pass (REQ-022) and compliance audit (REQ-P07) are recorded against M0.
4. The handoff snapshot points cleanly at the first P2 slice (S2.1).

Only then does **P2 — Data Models & Level Definition Schema** open.

---

## Risk register (M0)

| Risk | Mitigation |
|------|------------|
| Immutability vs. zero-allocation (§17) tension — deep-copying state each frame conflicts with the zero-allocation loop. | Immutability is the correctness contract now; zero-allocation is a hot-path optimization deferred to P11 and scoped to pooled entities (particles), not the top-level tree. Documented in the design memory ledger (`dm-0004`). |
| Private npm mirror (`npm.shootsta.com`) is broken. | Pinned public registry via project `.npmrc`; recorded in handoff so future sessions don't rediscover it. |
| Node 20.10 cannot strip TypeScript types natively. | Compile with `tsc` to `dist/`, run `node --test` on compiled output; zero extra test-framework dependencies. |

---
---

# P2 — Data Models & Level Definition Schema  *(CLOSED — VERIFIED, `docs/verification/P2.md`; authored at S2.1 start per REQ-P02)*

## Governing requirements

| Phase | REQs governing the work |
|-------|--------------------------|
| P2 | REQ-122, REQ-014 (owned); REQ-120, REQ-121 (completed here — spanned from P1); REQ-154 (component decoupling substrate; full scope closes in P3) |

## Work

Give the deterministic core something real to process: the pure-data component vocabulary (`src/components/`), the serialized Level Definition Schema (PRD §13 — tilemap, entities, constraints, triggers, GDOS metadata), the loader/validator that is the only path from untrusted input to typed data, and the deterministic instantiation that turns a parsed level into the engine's `WorldState`. P2 ends when a hand-authored level file parses, validates, round-trips losslessly, and drives the engine deterministically.

This plan was produced by an adversarial architecture review of the P2 data model (challenges → resolutions). The decisions below are recorded in the design ledger as `dm-0009`–`dm-0012`.

## Design summary (the compact model the code is written from)

1. **Static/dynamic split (dm-0009).** The tilemap holds only permanently-static geometry; the loaded `LevelDefinition` is deep-frozen once and reference-shared by every snapshot — never copied per frame. Everything that can change at runtime (collapsing floors, doors, moving platforms) is an *entity* with runtime state, never a tile. "Modifying the layout" (§16) is an entity state transition.
2. **Stable identity.** Entities carry branded `EntityId` strings; the validator enforces uniqueness and referential integrity (every trigger target resolves). Runtime spawns draw ids from a deterministic counter *inside* `WorldState` (`rt:<serial>` namespace, disjoint from authored ids) so spawning is a pure, replayable state transition.
3. **Entities are records, not classes and not an ECS.** `EntityDef = { id, transform, collider, behavior }` where `behavior` is a closed discriminated union matching the §16 library — `behavior.kind` is the single discriminant (no redundant top-level `kind` field, so an entity/payload mismatch is unrepresentable instead of a validator rule) (moving platform, collapsing floor, ice, spike, laser, moving hazard, plate, proximity zone, door, spring, gravity zone, conveyor). Systems (P3) key on component presence, not entity kind. Sparse-set/archetype ECS machinery is rejected as over-engineering at this entity count; entity classes are rejected as a data/logic-decoupling violation.
4. **Serialization is canonical JSON (dm-0010, hardened by dm-0014).** Finite IEEE doubles round-trip exactly; therefore the validator rejects non-finite numbers and normalizes `-0` to `0`, and `serializeLevel()` emits a fixed field order. Unknown/extra keys are **strictly rejected** at every level of the tree — a lenient parser would re-serialize a future-version file with its fields silently dropped, a "lossless" round-trip that loses data (dm-0014). Round-trip safety is defined precisely: value-level `deepEqual(parse(serialize(v)), v)` plus byte-level idempotence `serialize(parse(serialize(v))) === serialize(v)`. Byte-identity with the hand-authored source file is deliberately not required. The canonical form itself is anchored by a committed golden hash of the serialized sample fixture, so an accidental change to key order or number formatting fails a test instead of invalidating every stored hash downstream.
5. **Versioning is a policy, not a framework (dm-0010).** `schemaVersion: 1` is required at the root; the loader hard-rejects any other value — no best-effort parsing. Migrations are pure `vN → vN+1` functions written only when v2 exists. Zero migration code ships in P2, by decision.
6. **Parse, don't validate — and it lives in `src/schema/` (dm-0013).** `parseLevel(raw: unknown): Result<LevelDefinition, SchemaError[]>` is the only construction path from untrusted input; errors carry JSON-pointer-style paths. Placement: the serializer/validator/loader are *function bodies* and therefore cannot live in logic-free `src/components/` (the S2.1 scan test would fail them), are not per-frame systems (`src/systems/`), and are Jump-Once-specific (not `src/core/`). They get a dedicated `src/schema/` directory (directory contract updated); the schema *types* stay in `src/components/`; `instantiateWorld()` stays in `src/entities/`. The validator is hand-rolled and dependency-free; the drift risk is priced by one failing-fixture test per rejection rule **plus a seeded fuzz test** (mutations of the valid fixture via `src/core/Rng` — wrong types, nulls, truncations, injected keys — must always yield a `Result` error, never a throw or a false accept).
7. **GDOS metadata: structural now, semantic in P5 (dm-0012).** The §13 block is typed structurally minimal but complete — `targetKgNode`, `difficultyVectors` (named-axis record), `emotionalBudgetCurve` (keyframes of the four §6 metrics over normalized level progress), `creatorMomentFrame` (`{tickWindow, description}`). P2 validates structure (finiteness, [0,100] ranges, strictly increasing keyframes); P5 owns semantics (thresholds, scoring). If P5 needs more, that is a schema-version bump plus one migration function.
8. **Data-driven values ≠ data-driven axioms (dm-0011).** The constraints block carries bounds, spawn, goal, and par-time tiers. The single-jump rule is an engine invariant (REQ-004, P3), never a schema parameter — a `maxJumps` field would put the game's identity one typo from falsification.
9. **Coordinate convention** is decided once at S2.2 and ledgered. Recommendation going in: y-down, origin top-left, gravity +y, `tileSize` in world units (matches row-major tilemap authoring and screen space; only P3 physics intuition pays a small, localized tax).

## Dependencies

P0+P1 VERIFIED (satisfied — M0 closed). No external dependencies; the validator and serializer are dependency-free per project discipline.

## Deliverables (one per slice — see `docs/task_slices.md` Phase 2)

- **S2.1** `src/components/*.ts` — the pure-data component vocabulary (`EntityId` brand, `TransformDef`, `AabbDef`, `EntityKind`, per-kind `BehaviorDef` payloads). Logic-free, enforced by an automated scan test.
- **S2.2** Schema root types in `src/components/` (including `levelId` + human-readable title — the editor, Campaign Knowledge Graph, and future chapter manifests all need to name a level stably; and a **closed collision-relevant tile-kind set** — per dm-0009 tiles are only permanently-static geometry, so P2 tile semantics are `empty`/`solid`-class kinds; visual variants are a P9 extension via the versioning path) + `serializeLevel()` canonical serializer in `src/schema/`; `docs/level_schema.md` documenting every field, the coordinate convention, the versioning policy, the axiom boundary, and the tile-semantics scope.
- **S2.3** Loader + structural validator in `src/schema/` — `parseLevel(raw: unknown)`, path-qualified errors, one failing-fixture test per rejection rule, plus the seeded fuzz test.
- **S2.4** Hand-authored sample level fixture in `test/fixtures/` (schema-validation scaffolding, explicitly not P10 content) + round-trip tests + committed golden hash of the canonical serialization; fixture coverage (every entity kind, trigger kind, tile kind, full GDOS block) asserted **programmatically** by iterating the closed kind lists — not by eyeball.
- **S2.5** `WorldState` + `instantiateWorld()` in `src/entities/` + integration test: file → parse → validate → instantiate → deterministic engine replay. This is the evidence that completes REQ-120/121.
- **S2.6** `docs/verification/P2.md` — per-REQ verification report per dm-0008's rule.

## Validation criteria

- **Purity of data:** no function body exists anywhere under `src/components/` (automated scan test). *(REQ-120, REQ-154, directory invariant)*
- **Schema completeness:** tilemap, entities, constraints, triggers, and the full GDOS metadata block are all typed and serialized. *(REQ-122)*
- **Rejection coverage:** every validator rule demonstrably rejects a bad fixture with a path-qualified error — wrong version, non-finite number, **unknown/extra key at any path (strict)**, tilemap length ≠ width×height, **non-positive width/height/tileSize**, unknown tile id, unknown entity/trigger kind, duplicate id, dangling reference, out-of-bounds spawn/goal, malformed GDOS curve — and the seeded fuzz test never produces a throw or a false accept. *(REQ-122)*
- **Round-trip:** value-level lossless and byte-level idempotent, per the definitions above; the canonical form matches the committed golden hash. *(REQ-122)*
- **Data-drivenness proven at runtime:** the engine runs N ticks over a world instantiated from the parsed fixture; the S1.9 replay guarantee extends to (level file, seed, input tape) → bit-identical final state; `state.world.level === def` still holds after N ticks (the definition was referenced, never copied). *(REQ-120, REQ-121)*
- **Green build:** `npm test` exits 0 with every new module covered.

## Checkpoints

- **C2.1** ✅ Component records compile under `strict`; logic-free scan test green.
- **C2.2** ✅ Schema types + canonical serializer land; `docs/level_schema.md` filed; coordinate convention ledgered (dm-0015).
- **C2.3** ✅ Validator rejects every bad fixture and accepts the good one; all rejection paths tested (+300-mutant seeded fuzz).
- **C2.4** ✅ Sample level fixture round-trips (deep-equal + byte-idempotent + golden sha256 anchored).
- **C2.5** ✅ Deterministic instantiation + engine-consumption integration test green ((file, seed, tape) → bit-identical replay).
- **C2.6** ✅ `docs/verification/P2.md` filed; REQ-122/120/121 → VERIFIED, REQ-014/154 correctly stay open per dm-0008; PKG at `s2-e6f2a4`; subtractive pass: 1 dead export removed.

## Risk register (P2)

| Risk | Mitigation |
|------|------------|
| Hand-rolled validator drifts from the types. | One failing-fixture test per rejection rule is an acceptance criterion, not an aspiration; round-trip fixture exercised in CI. |
| GDOS metadata shape proves wrong for P5. | Structural-only validation now; the escape path is a schema-version bump + one migration function — priced and bounded (dm-0012). |
| Logic creeps into `src/components/`. | Automated scan test fails the build on any function body under `src/components/`. |
| Sample fixture mistaken for campaign content (P10 hard gate). | Fixture lives in `test/fixtures/`, documented in-file as validation scaffolding; the M2 content gate is unaffected. |
| Non-finite / `-0` floats enter state via level data and diverge replay hashes. | Loader rejects non-finite and normalizes `-0` at the boundary (dm-0010). |
| Slice renumbering breaks the previous handoff's pick-list. | `task_slices.md`, the pick-list, and the handoff are updated in the same session (this one); S2.1–S2.4 keep their ids, only the verification report moved to S2.6. |

## Open questions (carried into P2 implementation)

1. **Creator-moment frame semantics** — named exactly once in the whole PRD (§13). Typed minimally as `{tickWindow, description}`; confirm intended semantics before P5 consumes it.
2. **Difficulty-vector axes** — never enumerated by the PRD. The axis list is a design decision to make and ledger at S2.2.
3. **Save/progress persistence** — not owned by any P2 REQ (level data ≠ save data); confirm phase ownership (likely P9/P11 SDK territory) before M1 closes.
4. **Moving-platform path representation** — lives in the entity behavior payload (dm-0009); finalize waypoint format (polyline + speed vs. parametric) at S2.2 with P3's integrator in mind.
5. **Replay-tape serialization is unowned** — S2.5's integration test builds its (seed, input-tape) in code, but P4's agent solvers and P8's input recording will both want a serialized replay format, and no REQ clearly owns defining it. Assign ownership (P4 entry seems natural) before P4 planning.

## Exit condition for P2

All six checkpoints C2.1–C2.6 pass; the hand-authored sample level parses, validates, round-trips losslessly, and drives the engine deterministically; the schema is documented; the verification report is filed. Only then does **P3 — Mechanic Library & Deterministic Physics** open (completing milestone M1 requires both).

---
---

# P3 — Mechanic Library & Deterministic Physics  *(CLOSED — VERIFIED, `docs/verification/P3.md`; authored at S3.1 start per REQ-P02)*

> **CLOSED at S3.9.** All nine slices COMPLETED, checkpoints C3.1–C3.9 passed, 186/186 tests green. The single-jump axiom holds under fuzzed input; the full §16 mechanic library is data-driven and layering-tested; every mechanic replays bit-identically. **Milestone M1 — Simulatable Game is CLOSED** (P2 ✓ + P3 ✓). Retained below as the historical record.

## Governing requirements

| Phase | REQs governing the work |
|-------|--------------------------|
| P3 | REQ-004, REQ-010, REQ-011, REQ-150, REQ-151, REQ-152, REQ-153, REQ-154 (owned); REQ-003 (P3 scope: kinetic momentum + instant iteration); REQ-160, REQ-162 (partial — P3 owns the simulation-side share) |

## Work

Turn the data-defined level into a *playable, physically deterministic* game: a physics/collision core, the player controller with the **single-jump lock** (the game's axiom), the full §16 mechanic library (platforms, hazards, triggers, kinetic modifiers), and the run lifecycle (goal, defeat, instant scene reload) — all data-driven over the P2 schema, all pure systems over `WorldState`. P3 closes milestone **M1 — Simulatable Game**.

This plan was produced by an adversarial review of the original P3 slice table (S3.1–S3.8), the same treatment P2 got. The review found two structural gaps (no slice owned the run lifecycle; input-system ownership was undefined), several under-specified dependencies, and five places where a stronger technique than the one implied by the slice text is warranted. Decisions are ledgered as dm-0016–dm-0019. The slice table is restructured to **S3.1–S3.9** (see `docs/task_slices.md`).

## Adversarial review — findings and upgrades over the original slice table

1. **Missing slice: run lifecycle (goal / defeat / scene reload).** No original slice owned goal-reach detection, the defeat state, or scene reload — yet REQ-010/011's acceptance ("jump refreshes *only* on scene reload") is untestable without a reload mechanism, and REQ-003's "instant gameplay iteration" is precisely the defeat→reload loop. **Fix:** new slice S3.4 (run lifecycle) before the jump-lock slice.
2. **Input-system ownership was undefined.** `LevelInstantiation.test.ts` injects `InputFrame`s manually and noted "the input system doesn't exist until P3". **Decision (dm-0019):** the *simulation-side* input contract already exists — `GameState.input: InputFrame` (S1.4); P3's player controller consumes it and nothing else. Live device capture (keyboard/touch → `InputFrame`) is render/SDK territory: P9 (REQ-170/171). Serialized replay tapes are P4's (assigned at P4 planning per the P2 open question). No new P3 slice needed; the boundary is now explicit.
3. **Integration technique upgraded: closed-form tick-parametric kinematics (dm-0016).** Movers (platforms/hazards), timed lasers, and collapse timers are *derived from the tick* (`position = pathPosition(elapsedTicks)`), never incrementally integrated. This eliminates float accumulation drift, makes every entity's state exactly reproducible at any tick, and makes scene reload trivially correct. Only the player (input-coupled) is integrated.
4. **Collision technique upgraded: swept, axis-separated resolution (dm-0017).** The original criterion said "AABB collision"; naive discrete overlap tunnels through thin tiles at spring-launch velocities. Player-vs-tilemap movement is resolved per axis by scanning the swept tile range and clamping to the first solid boundary — correct at any speed, no epsilon nudges (contact snaps exactly to tile edges, which is float-exact). Player-vs-entity lethal/contact checks use the Minkowski-sum swept test where miss = exploit (hazards).
5. **Cross-engine float determinism hardened (dm-0017).** Simulation math is restricted to IEEE-754-exact operations: `+ − × ÷`, `Math.sqrt`, comparisons, `Math.min/max/abs/floor/ceil/trunc`. **Transcendental functions (`Math.sin/cos/tan/pow/exp/hypot/…`) are banned in `src/systems/`** — they are not correctly-rounded and vary across JS engines, which would silently break replay hashes between Node (P4 solvers) and browsers. Waypoint traversal uses arc-length arithmetic, not trig. Semi-implicit (symplectic) Euler is the integrator: velocity first, then position — stable under constant gravity at fixed step.
6. **Jump-lock refresh is correct by construction (dm-0018).** All jump-lock state lives in `WorldState`; scene reload = `instantiateWorld(level)` (pure, already proven deterministic). The "refreshes only on reload" invariant therefore cannot be violated by a forgotten reset — there is no reset code to forget.
7. **Tuning values are data, not literals (dm-0018).** Gravity, run speed, jump velocity, anticipation ticks etc. live in a frozen pure-data record `src/components/Tuning.ts` (logic-free; the S2.1 scan test covers it automatically). They are campaign-global by design — per-level physics would fragment game feel; if GDOS ever demands per-level overrides, that is a schema-version bump (dm-0010 path). No `maxJumps`-like field exists anywhere (dm-0011 holds).
8. **Dependencies tightened.** Environmental elements (riding a moving platform, collapsing on stand) and triggers (plates need the player standing on them) require the *controller and grounding*, not just the physics core — original table under-declared this. New table declares the true edges.
9. **Canonical system pipeline order is fixed data.** With seven systems, composition order is a determinism parameter. The order below is normative; the Engine pipes systems in exactly this order.
10. **Quadtree kept, made deterministic.** REQ-162 names a quadtree; intent is neighborhood-only collision queries. The tilemap needs no partition (the grid *is* one — O(1) lookup); the quadtree covers *entities*: rebuilt per query set as a pure function, fixed insertion order (array order), fixed node capacity and max depth, so structure is replay-identical. Equivalence-vs-brute-force under seeded fuzz is the acceptance test.
11. **REQ-150 visual sub-clauses re-scoped.** Squash-and-stretch, particle burst, camera tracking are render-side; P3 owns the *simulation* share (anticipation ticks, lock machine, instant accel/decel) and exposes the state P9 animates from. Backlog Phase column amended to `P3,P9` so P3's close doesn't falsely verify the visual clauses (dm-0008 discipline).

## Design summary (the compact model the code is written from)

1. **`WorldState` grows physics fields** (expected evolution, `World.ts` header): player `grounded`, `jumpLock` machine state, `runState` (`playing | defeated | completed`), `attemptCount`, `spawnTick` (for elapsed-time derivation), per-entity runtime extras (mover activation tick, collapse first-contact tick, door open flag, plate pressed flag). Everything else about entities is *derived from tick + level data* (dm-0016).
2. **Systems (all pure `step(state) => state`, canonical order):**
   `lifecycle` (reset/defeat/goal → possibly fresh world) → `entityKinematics` (tick-parametric mover/laser/collapse state) → `playerControl` (horizontal intent + jump machine) → `playerPhysics` (gravity-zone sample, symplectic integrate, swept collide vs tiles + solid entities, grounding, platform carry) → `surfaceEffects` (ice/conveyor/spring velocity edits) → `sensors` (plates/proximity → trigger actions → door/platform/floor state) → `hazardsAndGoal` (lethal overlap → defeated; goal overlap → completed).
3. **Solidity is data.** A pure-data table classifies each entity kind as solid / lethal / sensor; door and collapsing-floor solidity additionally depends on their runtime flag. Systems key on this table + component presence, never on entity identity (REQ-154).
4. **Kinetic modifiers never touch the jump machine (REQ-153).** Springs/gravity zones/conveyors edit velocity/inertia only; the property test asserts the lock state is bit-identical before/after any modifier interaction.
5. **Defeat is instant iteration (REQ-003).** `defeated` → next tick the lifecycle system re-instantiates the world (attemptCount+1, same frozen level reference). `resetPressed` does the same from any state. Completion freezes the world (win state consumed by P4/P8).
6. **Determinism assertions ride along every slice.** Each slice's tests include a replay bit-equality assertion over its new mechanics; no `Math.random`, no delta-time, no transcendental calls (scan-testable).

## Dependencies

P2 VERIFIED (satisfied). No external dependencies. Consumes: `WorldState`/`instantiateWorld` (S2.5), behavior payloads (S2.1/S2.2), `TILE_KIND_BY_ID` tilemap semantics, normative y-down coordinate convention (`docs/level_schema.md`), `System` contract (S1.5), `FIXED_STEP_SECONDS` (dm-0003).

## Deliverables (one per slice — see `docs/task_slices.md` Phase 3, restructured)

- **S3.1** Physics & collision core: `src/components/Tuning.ts` (pure-data tuning), `WorldState` physics fields, `src/systems/PlayerPhysics.ts` (symplectic Euler + swept axis-separated tile collision + grounding), no-tunneling property test, trajectory replay test.
- **S3.2** `src/systems/SpatialPartition.ts` (or module folder): deterministic quadtree over entity AABBs; equivalence-vs-brute-force seeded fuzz.
- **S3.3** `src/systems/PlayerControl.ts`: consumes `state.input`; instant horizontal accel/decel; grounded detection consumed from physics; input-boundary decision documented in-code.
- **S3.4** Run lifecycle: goal detection, defeat state, deterministic instant reload (`lifecycle` system); attemptCount; reload-refreshes-everything-by-construction test.
- **S3.5** **Single-jump lock** state machine (the axiom): anticipation ticks → impulse → locked; refresh only via reload; fuzzed-input property test (never >1 jump per life, ever).
- **S3.6** Environmental elements: tick-parametric moving platforms (linear/looping/triggered), platform carry, collapsing floors, frictionless ice.
- **S3.7** Hazards + triggers: spikes, timed lasers (pure function of tick), moving hazards (swept lethal check); plates/proximity/doors executing the closed trigger-action union.
- **S3.8** Kinetic modifiers: springs, gravity zones, conveyors; never-consumes-jump property test.
- **S3.9** `docs/verification/P3.md` — per-REQ verification report (dm-0008); M1 closes here (plus the M1 exit items below).

## Validation criteria

- **The axiom (REQ-004/010/011):** under seeded fuzzed input tapes across all mechanic fixtures, the player never gains a second jump impulse within one life; jump state refreshes only via reload; no upgrade/power-up/exception path exists in code.
- **Determinism (REQ-121 inheritance):** every slice's mechanics replay bit-identically from (level file, seed, input tape); no transcendental function appears under `src/systems/` (grep-able); trajectory goldens stable.
- **No tunneling:** property test launches the player at ≥ spring-magnitude velocities at 1-tile-thick walls/floors from fuzzed positions; the player never crosses a solid tile boundary.
- **Data-driven (REQ-120/154):** no gameplay numeral in system code — values come from `Tuning.ts` or the level payload; solidity/lethality from the data table; systems keyed on component presence.
- **Layering (REQ-154):** integration tests compose ≥3 mechanics (e.g. plate → door → moving platform over spikes with a spring) and assert emergent behavior from data wiring alone.
- **Kinetic modifiers (REQ-153):** lock-state bit-identical across modifier interactions.
- **Quadtree (REQ-162 partial):** neighborhood query results ≡ brute force under seeded fuzz.
- **Zero-allocation (REQ-160 partial):** P3 stance per dm-0004 — immutability is the correctness contract; allocation optimization stays deferred to P11. P3's REQ-160 share is *structural preallocation only* (fixed-size tile-scan without per-tile closures); no premature pooling.
- **Green build:** `npm test` exits 0; every new module covered.

## Checkpoints

- **C3.1** ✅ Physics core lands; no-tunneling (300-case fuzz @1200 u/s) + trajectory replay green.
- **C3.2** ✅ Quadtree equivalence-vs-brute-force fuzz green.
- **C3.3** ✅ Controller consumes real `InputFrame`s; instant accel/decel proven.
- **C3.4** ✅ Lifecycle: defeat→instant reload→fresh world; goal→completed; deterministic across replays.
- **C3.5** ✅ Single-jump lock fuzz property green — the axiom holds (never >1 impulse/life, forward-only).
- **C3.6–C3.8** ✅ Mechanic library complete (platforms+carry/collapse/ice; spikes/lasers/hazards; plates/doors; springs/zones/conveyors), each isolated + layered tests green; kinetic modifiers never consume the jump.
- **C3.9** ✅ `docs/verification/P3.md` filed; REQ-004/010/011/151/152/153/154 flipped VERIFIED per dm-0008; PKG consistent (`s3-b4d8e6`); subtractive pass (0 findings) + transcendental audit recorded; **M1 — Simulatable Game CLOSED.**

## Risk register (P3)

| Risk | Mitigation |
|------|------------|
| Spring velocities tunnel through thin geometry. | Swept axis-separated tile resolution (dm-0017); no-tunneling property test is an acceptance criterion. |
| Float drift diverges long replays. | Closed-form kinematics for everything non-player (dm-0016); transcendental ban (dm-0017); replay assertions per slice. |
| Jump-lock refresh bug (the axiom fails silently). | Lock state lives in `WorldState`; reload re-instantiates — refresh by construction (dm-0018); fuzz property test. |
| System-order nondeterminism as systems accumulate. | Canonical pipeline order is normative in this plan; Engine test asserts the order. |
| Tuning values creep into logic as literals. | `Tuning.ts` is the single source; review + grep for numeric literals in `src/systems/` at C3.9. |
| Trigger cascades (plate→door→platform) create order-dependent behavior. | Triggers fire in authored array order (dm-0015 wiring is first-class data); cascade resolution is single-pass per tick, documented; layering tests pin behavior. |
| Moving-platform carry interacts badly with swept collision. | Carry delta applied from closed-form mover delta *before* player sweep (design summary order); dedicated riding tests incl. platform-into-wall. |

## Open questions (carried into P3 implementation)

1. **Mover mode semantics** — `linear` = ping-pong, `looping` = closed-circuit wrap, `triggered` = dormant until activated then ping-pong. PROVISIONAL (ledgered in dm-0016); P5/GDOS confirm alongside dm-0012's items.
2. **Platform solidity model** — full-solid (not jump-through) in P3; revisit only if GDOS level grammar demands one-way platforms (schema bump).
3. **Defeat→reload latency** — instant (1 tick) per REQ-003; if P5's emotional pacing wants a death beat, that is render-side (P9), not sim-side.
4. **Save-game persistence ownership** (P2 open question, must resolve before M1 close): assigned to **P9** under REQ-171 (SDK lifecycle hooks own session persistence). Recorded here; backlog note at S3.9.
5. **Replay-tape serialization** — still P4's, assign at P4 planning (unchanged).

## Exit condition for P3

All checkpoints C3.1–C3.9 pass; the axiom's fuzz property holds across the full mechanic library; a data-defined level is playable start (spawn) → finish (goal) with defeat/reload loops, deterministically, bit-identical under replay. **M1 — Simulatable Game** closes (requires the M1-scope audit: subtractive pass, compliance audit, save-persistence ownership recorded). Only then does P4 open.

---
---

# P4 — Evaluation & Validation Framework  *(CLOSED — VERIFIED, `docs/verification/P4.md`; authored at S4.1 start per REQ-P02; adversarial review ledgered dm-0022–dm-0029)*

> **CLOSED at S4.7.** All seven slices COMPLETED, checkpoints C4.1–C4.7 passed, 241/241 tests green (includes the dm-0030 WR-anchor refinement). Five archetypes drive the frozen sim headlessly and replay bit-identically; the solvability audit treats exactly-one-jump as ground truth (a two-jump level is unsolvable by construction); softlock, exploit, and five-tier optimization audits classify their fixture sets correctly; the macro curriculum pass runs isolated. REQ-140/141 VERIFIED; REQ-142/101/102 hold their P4 share (P6/P10 remainder open). **Milestone M2 stays OPEN** (P5 + P6 remain); the content gate is still closed. Retained below as the historical record.

## Governing requirements

| Phase | REQs governing the work |
|-------|--------------------------|
| P4 | REQ-140, REQ-141 (owned); REQ-142 (P4 share — the four macro criteria; P6 contributes the campaign models); REQ-101, REQ-102 (P4 share — computation + rejection on fixtures; P10 consumes at generation time) |

## Work

Make the frozen M1 simulation *judge* levels by playing them. P4 builds the evaluation layer the entire content pipeline (P8 tools, P10 generation) will trust: five deterministic agent archetypes that drive the sim headlessly, the Local Spatial Verification pass (solvability under exactly-one-jump, softlock detection, exploit filtration, optimization windows + five-tier routing + delta), and the isolated Macro Curriculum Validation pass. P4 opens milestone **M2 — Design Intelligence Operational**. Nothing in P4 authors content — every level P4 touches is in-code unit scaffolding or an existing `test/fixtures/` file (the M2 hard gate stays closed).

This plan was produced by an adversarial review of the P4 slice table and the two open questions P2/P3 carried forward, the same treatment those phases got. Decisions are ledgered as dm-0022–dm-0024.

## Adversarial review — findings and upgrades over the original slice table

1. **Replay-tape serialization was unowned (P2 open question #5, carried through P3) — owned here, at S4.1 (dm-0023).** The harness is the first producer of tapes, so it defines the format: a versioned record `{ schemaVersion, levelId, seed, frames[] }` where each frame is one `InputFrame` per simulation tick. The full P2 serialization discipline applies verbatim (dm-0010/dm-0014): canonical field order, strict unknown-key rejection at every path, non-finite rejection, `Result`-typed parse with path-qualified errors, value-lossless + byte-idempotent round-trip. I/O lives in `src/schema/TapeIO.ts` (definition-time I/O — the dm-0013 placement rule). P8's input recorder and P9's save layer consume this format later; they do not redefine it.
2. **Evaluation logic had no legal home in the directory contract.** Agents/audits are not per-frame systems (`src/systems/` runs inside the engine loop; agents drive it from outside), not schema I/O, not core, not components. **Decision (dm-0022): new `src/eval/` directory** — evaluation-time logic that consumes the sim strictly through its public contracts (`createInitialState`, `Engine`, `StateManager`, `FIXED_STEP_SECONDS`, read-only `GameState`). The dependency is one-way: nothing under `src/core|systems|components|entities|schema` may import from `src/eval/` — the sim must never know it is being judged. Directory contract updated alongside this plan.
3. **Live-run vs. tape-replay divergence risk: agent randomness must not touch the sim's RNG.** If a policy drew from `state.rng`, replaying the recorded tape (no agent present) would leave the sim RNG un-advanced and the final state would differ bit-wise — silently breaking the P4 determinism contract. **Decision (dm-0024): agents thread their own seeded `RngState` stream** (derived from the run seed, threaded through agent memory); `state.rng` belongs to the simulation alone. Live-final-state ≡ replay-final-state (bit equality) is an acceptance test *per archetype*.
4. **Agent statefulness must be explicit or determinism is fiction.** Policies are pure: `decide(state, memory) → { input, memory }`. All agent memory (held intent, hesitation countdowns, per-life plans, the agent RNG cursor) is threaded through the harness exactly like sim state — no closures over mutable variables, no hidden fields. Same (level, seed, archetype) ⇒ identical tape, twice, by construction.
5. **Halting is a property, not a hope.** Every harness run carries a data-driven budget (`maxTicks`, `maxAttempts` — an `EvalBudget` record, not literals). Budget exhaustion is a first-class `'timeout'` outcome, never an exception and never a hang. S4.3's softlock detector *builds on* classified timeouts; nothing in P4 can stall the future generation pipeline.
6. **Archetypes are data-parameterized policies, not five code forks (dm-0024).** One shared sensing/decision core; five frozen `ArchetypeParams` records (reaction cadence, hesitation ticks, jump-commit lookahead, hazard caution, exploration prefix). Behavioral distinctness is *proven by test* — pairwise-distinct tapes on a discriminating fixture — not asserted by naming. Adding a sixth archetype later is a data change.
7. **Archetype play is evidence, not proof — solvability needs search (scoped to S4.2).** A reactive archetype failing a level does not prove the level unsolvable; REQ-141's solvability audit therefore gets a bounded deterministic search over input space at S4.2, with archetype runs as its fast path and witness generator. S4.1 deliberately ships the harness + archetypes only; conflating the two was the original table's hidden scope error.
8. **The two validation passes stay physically isolated (REQ-140).** Local Spatial Verification (S4.2–S4.5, per-level) and Macro Curriculum Validation (S4.6, per-chapter) are separate modules with separate verdict types; the macro pass consumes local verdicts *as data* and never re-runs simulations internally. Isolation is structural (imports), not stylistic.
9. **Five-tier routing is grounded in archetype times (REQ-101/102).** Discovery ≈ First-Time completion; World Record ≈ Expert-Speedrunner best; the middle tiers interpolate from the archetype spread. Optimization delta = T_Discovery − T_WR; zero/minimal delta ⇒ reject. The authored `parTimeTiersSeconds` (S2.2) becomes a cross-check input, not the source of truth.
10. **The math whitelist extends to `src/eval/` (dm-0017 discipline).** Agent decisions produce tapes; tapes must replay bit-identically on any JS engine. Same audit as `src/systems/`: no transcendental functions, only `+ − × ÷ %`, `Math.sqrt/min/max/abs/floor/ceil/trunc`.
11. **The axiom is P4's ground truth, not its parameter.** The solvability audit treats "exactly one jump" as engine-enforced fact (dm-0020) — it never re-implements the lock, never counts jumps by parsing input (it reads `world.jumpLock`), and no `maxJumps`-like knob exists anywhere in eval config (dm-0011 holds).

## Design summary (the compact model the code is written from)

1. **`AgentPolicy` contract (`src/eval/AgentPolicy.ts`).** `decide(state: JumpOnceState, memory: AgentMemory) → { input: InputFrame, memory: AgentMemory }` — pure, deterministic, whitelist-math only. `AgentMemory` carries the agent RNG cursor, held intent, replan/hesitation countdowns, and per-life plan state; the harness threads it.
2. **Archetypes (`src/eval/Archetypes.ts`).** `ArchetypeParams` (pure data) + five frozen records — `firstTime`, `cautious`, `experienced`, `expertSpeedrunner`, `curiousExplorer` — feeding one shared decision core: walk toward the goal, sense walls/gaps/hazards in tile space ahead, commit the single jump with archetype-specific hesitation and lookahead, pause near hazards per caution, optionally explore away from the goal first (Curious). Jump availability is *sensed* from `world.jumpLock.phase`.
3. **Harness (`src/eval/AgentHarness.ts`).** `runAgent(def, seed, params, budget) → AgentRunResult { outcome: 'completed' | 'timeout', frames, ticksElapsed, attempts, finalState }`. Assembles the engine in the **normative canonical order** — `lifecycle → entityKinematics → playerControl → playerPhysics → sensors → hazardsAndGoal` — commits the agent's `InputFrame`, ticks exactly one fixed step, records the frame; stops on `completed`, tick budget, or attempt budget. `replayTape(def, seed, frames)` re-drives the same pipeline with no agent; bit-equality with the live run is the determinism proof.
4. **Verdicts are pure data.** Every audit (S4.2+) emits a typed verdict record (classification + evidence: witness tape, offending region, tier times); downstream consumers (P5 gates, P8 tools, P10 pipeline) read verdicts, never re-derive them.
5. **Local vs. macro (REQ-140).** `src/eval/local/*` (S4.2–S4.5) judges one level; `src/eval/macro/*` (S4.6) judges an ordered sequence of local verdicts against the four §15 criteria. No shared mutable anything; the seam is a data type.

## Dependencies

P2+P3 VERIFIED, M1 CLOSED (satisfied). Consumes: the frozen deterministic sim (`Engine`/`StateManager`/`Clock` S1.x), `createInitialState`/`WorldState` (S2.5/P3), `InputFrame` (S1.4, dm-0019 boundary), `TUNING`, `COLLISION_CLASS_BY_KIND`, `TILE_KIND_BY_ID`, the P2 schema I/O conventions (dm-0010/0013/0014). No external dependencies.

## Deliverables (one per slice — see `docs/task_slices.md` Phase 4)

- **S4.1** `src/schema/TapeIO.ts` (replay-tape format + canonical serializer + strict parser — ownership assigned per finding 1), `src/eval/AgentPolicy.ts`, `src/eval/Archetypes.ts` (five data-parameterized archetypes over one decision core), `src/eval/AgentHarness.ts` (headless run + replay, canonical pipeline order, budgets). Tests: tape round-trip/rejection suite; per-archetype determinism (identical tape twice), live≡replay bit-equality, pairwise behavioral distinctness, completion on trivial fixtures, budget-halt on unreachable/lethal fixtures.
- **S4.2** Solvability audit: bounded deterministic search + archetype fast path; classifies known-solvable and known-unsolvable in-code fixtures; produces a witness tape for solvable levels; flags any level whose only completions would require >1 jump as axiom-violating by construction (impossible — evidence read from `world.jumpLock`).
- **S4.3** Softlock detection: identifies reachable regions from which neither goal nor defeat is reachable within budget (the "can neither die nor reach goal" dead zone), built on classified timeouts + region evidence.
- **S4.4** Exploit filtration: detects boundary path-skips that bypass authored hazards (completion tapes whose swept path never intersects the intended challenge envelope).
- **S4.5** Optimization windows: five-tier routing from archetype time spread; delta metric (REQ-102) + minimal-delta rejection; `parTimeTiersSeconds` cross-check.
- **S4.6** Macro Curriculum Validation: the four criteria (Cognitive Structural Mapping, Cross-Chapter Degradation Analysis, Curiosity Progression Curves, Graduation Assessment Verification) over sequences of local verdicts — isolated per finding 8.
- **S4.7** `docs/verification/P4.md` — per-REQ verification report (dm-0008 discipline).

## Validation criteria

- **Determinism (REQ-141 substrate):** same (level, seed, archetype) ⇒ byte-identical serialized tape across independent runs; live final state ≡ tape-replay final state, bit for bit, for every archetype; no `Math.random`, no transcendental function under `src/eval/` (grep-audited like `src/systems/`).
- **Tape format (dm-0023):** value-lossless + byte-idempotent round-trip; every rejection rule has a failing-fixture test (wrong version, unknown key, bad axis value, non-finite seed, malformed frames).
- **Archetype fidelity:** five archetypes produce pairwise-distinct tapes on a discriminating fixture; the Expert-Speedrunner completes solvable scaffolding fixtures in fewer ticks than the First-Time archetype.
- **Halting:** every run terminates in ≤ budget ticks/attempts with a typed outcome; unreachable-goal and always-lethal fixtures halt cleanly with `'timeout'`.
- **Isolation (REQ-140):** no import path from `src/eval/macro/` into the harness/sim internals; no import from `src/{core,systems,components,entities,schema}` into `src/eval/` (one-way, scan-testable).
- **Solvability ground truth (REQ-141):** S4.2 classifies the known-solvable and known-unsolvable fixture sets with zero misclassification; every 'solvable' verdict carries a replayable witness tape that completes the level.
- **Routing (REQ-101/102):** tier times computed on fixtures; delta metric rejects a zero/minimal-delta layout fixture and passes a wide-delta one.
- **Content gate:** no new files under any content path; all P4 fixtures are in-code defs or `test/fixtures/` scaffolding.
- **Green build:** `npm test` exits 0; every new module covered.

## Checkpoints

- **C4.1** ✅ Harness + five archetypes + tape I/O landed; determinism, live≡replay equality, pairwise distinctness, and budget-halt tests green.
- **C4.2** ✅ Solvability audit classifies the fixture sets correctly with witness tapes; the two-jump level is unsolvable by construction.
- **C4.3** ✅ Softlock detector flags the oubliette dead-zone (with deepest-trapped evidence), passes clean fixtures under exhaustive search.
- **C4.4** ✅ Exploit filter catches the jumped-clean-over pit, treats the ceiling-spike-guarded goal as clean.
- **C4.5** ✅ Five-tier routing + delta computed; flat minimal-delta fixture rejected (REQ-102); par cross-check flags an impossible optimal par.
- **C4.6** ✅ Macro pass audits a fixture chapter against all four criteria, each failing on a targeted defect; import isolation scan green.
- **C4.7** ✅ `docs/verification/P4.md` filed; REQ-140/141 → VERIFIED (dm-0008); PKG consistent (`s4-f6c7d8`); subtractive pass (0 findings) recorded.

## Risk register (P4)

| Risk | Mitigation |
|------|------------|
| Agent RNG leaks into sim RNG and replays silently diverge. | Separate seeded stream threaded through `AgentMemory` (dm-0024); live≡replay bit-equality is a per-archetype acceptance test. |
| Reactive archetypes under-approximate solvability (false "unsolvable"). | S4.2's bounded search is the classifier; archetypes are its fast path + realism evidence (finding 7). |
| Harness hangs on softlocked/unreachable fixtures. | `EvalBudget` hard stop with typed `'timeout'` outcome; halt tests on sealed and always-lethal fixtures. |
| Eval code drifts into the sim (reverse dependency). | One-way import rule (dm-0022), enforced by a scan test like the components logic-free scan. |
| Pipeline-order drift between eval harness and future P8/P9 assemblies. | The canonical order is exported once from the harness and asserted against the normative list in a test. |
| Tape format churn breaks stored tapes later (P8 recordings, P9 saves). | Versioned from day one (`TAPE_SCHEMA_VERSION`); dm-0010 policy — hard-reject other versions, migrate only when v2 exists. |
| Archetype params become de-facto gameplay tuning. | Params are eval-model data (frozen records in `src/eval/`), never read by `src/systems/`; the one-way import rule makes the reverse read impossible. |

## Open questions (carried into P4 implementation)

1. **Tier interpolation semantics (S4.5)** — how Good/Fast/Expert times derive from the archetype spread (fixed fractions vs. per-archetype anchors). Decide + ledger at S4.5; REQ-101 fixes only the five tier names.
2. **Chapter manifest shape (S4.6)** — no chapter schema exists yet (content is gated). S4.6 defines a minimal ordered-verdict-sequence input type; the real chapter manifest schema lands with P6/P10 and must adopt it or version it.
3. **Search budget calibration (S4.2)** — the bounded-search envelope (branching per tick, horizon) that makes fixture classification exact without exploding; decide + ledger at S4.2.
4. **Exploit "challenge envelope" definition (S4.4)** — what formally marks the intended challenge region (authored GDOS metadata vs. derived hazard proximity). Decide at S4.4; leans on dm-0012's structural GDOS block.

## Exit condition for P4

All checkpoints C4.1–C4.7 pass; the archetype harness is deterministic and replay-anchored; solvability/softlock/exploit/routing verdicts are correct on their fixture sets; the macro pass runs isolated; the verification report is filed. P4 `VERIFIED` is the first of the three M2 pillars (P4+P5+P6) — the content gate stays closed until all three close.

---

# P5 — GDOS Scoring Engine  *(CLOSED — VERIFIED, `docs/verification/P5.md`; authored before S5.1 code per REQ-P02; adversarial review ledgered dm-0031–dm-0035; slice table restructured)*

> **CLOSED at S5.9.** All nine slices COMPLETED, checkpoints C5.1–C5.9 passed, 336/336 tests green. Every GDOS score is a deterministic estimator over one `EvidenceBundle` with all calibration in a versioned `ScoringProfile` (proven by two-profile tests in every gate); the Design Memory is executable and byte-idempotent over the live ledger (dm-0040/0041/0042 were appended *through it*); CDRE evolves the profile under an ACCEPTED-only apply and mines symmetrically so the gates cannot ratchet toward vacuity; the subtraction pass ran with its own engine and removed three dead exports. REQ-020/021/040/042/051/052/055/056/111 → VERIFIED. **Milestone M2 stays OPEN** (P6 remains); the content gate is still closed. Retained below as the historical record.

## Governing requirements

| Phase | REQs governing the work |
|-------|--------------------------|
| P5 | REQ-040, REQ-041 (P5 share; P6 consumes coverage), REQ-042, REQ-050 (P5 share; P10 applies), REQ-052, REQ-053/054 (P5 share; P7 applies), REQ-055, REQ-056, REQ-061 (P5 share; P7 applies), REQ-020, REQ-021, REQ-022 (P5 share; P11 final pass); completes REQ-051/REQ-111 (P0 opened them); REQ-012/015/016 P5 shares (curation checks + arc semantics + failure-visibility; P9/P10 hold the rest) |

## Work

Make the design intelligence *judge* levels the way P4 made the sim *play* them. P5 builds the GDOS Scoring Engine: the quality gates (emotional thresholds, streamability matrix, IDS regulator), the design-space model (coverage matrix + economy of mechanics), the search metrics (novelty, emergent fun), the curation machinery (Kill Switch, First-Party filter, Subtractive Removal engine), the executable Design Memory / Intent Repository, and the CDRE loop that evolves the scoring calibration itself. P5 is the second M2 pillar. Nothing in P5 authors content — every level P5 touches is in-code unit scaffolding or an existing `test/fixtures/` file; the M2 hard gate stays closed.

This plan was produced by a first-principles adversarial review of the original S5.1–S5.9 slice table — the same treatment P2/P3/P4 got — explicitly asking whether a substantially better architecture exists before any production code. Decisions are ledgered as dm-0031–dm-0035.

## Adversarial review — findings and upgrades over the original slice table

1. **The central defect any naive P5 has: ungrounded scores (the Goodhart trap).** "Curiosity ≥ 90" and "Clip Potential ≥ 90" have no physical measurement; inventing formulas with hardcoded magic weights produces pseudo-measurements that the P7/P10 generators will optimize *against*, and every recalibration becomes a code change. **Decision (dm-0031): every GDOS score is a deterministic estimator over an explicit evidence bundle, and every weight, coefficient, and threshold lives in a versioned `ScoringProfile` data record** (strict-parsed with the full P2 discipline), never in code constants. Estimators are *honest proxies* — their epistemics (what evidence each proxy actually measures) are documented at the definition and ledgered. Recalibration is a data change plus a ledger entry; that channel is exactly what the CDRE loop (finding 4) drives. This is the P5 analogue of dm-0024 ("archetypes are data, not code forks").
2. **Evidence must be assembled exactly once.** Eight gates each re-running archetype sims would duplicate work, risk divergent evidence between gates, and violate the P4 handoff rule ("P5 consumes verdicts; it never re-runs the audits"). **Decision (dm-0031): a single immutable `EvidenceBundle`** — `LevelDefinition` + `GdosMetadata` + the four local verdicts (Solvability/Softlock/Exploit/Optimization) + witness/archetype tapes — assembled once per level by one assembler; every scorer is a pure function of it. One seam serves P10: `judgeLevel(evidence, profile) → GdosReport` (scores + gate verdicts + curation verdicts + emitted decision records). Gate unit tests hand-author bundles — no sim required — with a few end-to-end assemblies on P4 fixtures proving the seam.
3. **Slice-order defect: Design Memory was scheduled last (old S5.8) while everything upstream must record into it.** REQ-050/051 demand decisions originate from GDOS and history be parsed *before* proposing; the Kill Switch and CDRE both read and write memory — yet the old order ran CDRE (S5.6) and Kill Switch (S5.7) before Memory (S5.8). **Decision (dm-0032): gates emit pure `DesignDecision` records (data, defined in the S5.1 kernel) from day one; the executable Design Memory moves to S5.6, ahead of the Kill Switch (S5.7) and CDRE (S5.8).** Recording is decoupled from storage: scorers stay stateless and I/O-free; the store is pure text→records→text (`meta/design_memory_ledger.json` becomes its backing file per that file's own header note; callers own `fs`, and `append` takes the date as a parameter — no `Date.now`, determinism preserved).
4. **CDRE scope pinned before it balloons.** "Self-improving loop" is the phase's scope trap — it cannot mean ML (no deps, no data, determinism) or self-modifying code. **Decision (dm-0033): CDRE is a deterministic profile-evolution loop**: it mines recorded gate outcomes + evidence for patterns (systematically failing metrics, dead matrix regions, threshold/evidence mismatches), emits *proposals* as decision records with full Intent Repository fields, and an accepted proposal becomes a new `ScoringProfile` version. Self-improvement is data evolution under version control — the process improves because its calibration is versioned data with a feedback channel, not because code rewrites itself.
5. **Scores measure delivered-vs-intended, not floating absolutes.** The schema already carries authored intent — the `GdosMetadata` emotional budget curve (dm-0012 assigned P5 its semantics). Emotional estimators measure what the evidence shows was *delivered*: Surprise ≈ plan invalidation (failure-then-adapted-success patterns across archetype attempts), Confidence ≈ early-attempt success rates, Mastery ≈ the optimization tier spread/delta, Curiosity ≈ the Curious-Explorer's divergence from the direct route. The authored curve is the intent cross-check (the same role `parTimeTiersSeconds` played in P4): delivered vs. intended divergence is itself evidence, reported per keyframe window.
6. **Matrix axes derive from existing registries, never hand-maintained lists.** Mechanic axis = the P3 entity/tile kind registries; Optimization Style = the five REQ-101 tiers; Player Type = the five archetypes; Emotion = the six-phase arc (REQ-015, giving that REQ its P5 semantics); Environment = the environmental-modifier kinds (ice/conveyor/gravity-zone/collapsing). The matrix cannot drift from the sim because it is *derived* (dm-0034). Coverage = cells exercised by a level set's evidence; Economy of Mechanics (REQ-042) = depth ÷ mechanic count with depth = distinct covered cells involving that mechanic — "exhaust variations before adding a mechanic" becomes a computable comparison.
7. **IDS needs a "screen" with no renderer (P9 not started).** Viewport dimensions are profile data (tiles per screen); the regulator slides that window over level geometry, counting information elements (entities, hazards, active triggers, tile features) per window against min/max thresholds (dm-0035). The same visibility primitive makes REQ-016's P5 share *computable*: "failure information visually present" = every death in the evidence tapes traces to a hazard that was inside the window before the death tick — an unfair (invisible) kill fails the fairness check.
8. **Novelty requires a corpus parameter — content is gated.** The metric is a pure function `(candidate, corpus[]) → divergence`; no global level registry exists or may exist yet. Descriptor = mechanic histogram + geometry signature + witness-trajectory shape; whitelist-math distance. Emergent-fun search (REQ-054) reuses `src/eval/local/Search.ts` to probe kinetic edge cases (spring chains, conveyor+gravity interactions) and emits flagged *kinetic anchors* as data for P7 to consume. **Because EmergentFun executes a search it is NOT a `gdos/` module** — it lives at the top level of `src/eval/` beside `Evaluate.ts` (dm-0037, decided during S5.1–S5.4), so `gdos/` stays pure over evidence and the no-re-audit scan needs no exception.
9. **Alternatives weighed and rejected** (recorded with the review): a generic rule-DSL/JSON-interpreted gate engine (maximum data-drivenness but an interpreter is accidental complexity with worse type safety — TS scorers over data profiles achieve the same recalibration path at ~6 gates, YAGNI); one monolithic scoring module (violates system isolation and per-module testability); per-gate sim re-runs (finding 2); statistical/ML calibration (violates determinism + zero-dependency constraints; CDRE is the recalibration channel instead).
10. **Placement and curation semantics.** All P5 code lands in `src/eval/gdos/` — evaluation-time logic under the dm-0022 one-way rule (the sim never knows it is being scored); the EvalIsolation scan and math whitelist extend to it unchanged. The Kill Switch and First-Party filter are decision procedures over `GdosReport`s plus **typed authored attestations** where a criterion is genuinely qualitative (Self-Explanation, Inevitable Polish) — represented honestly as attestation records, never faked as computations. The Subtractive Removal engine formalizes what P2–P4 verifications did procedurally: an executable six-question checklist over a milestone inventory, producing a report with per-question findings.

## Design summary (the compact model the code is written from)

1. **Kernel (`src/eval/gdos/Evidence.ts`, `Profile.ts`, `Report.ts`).** `EvidenceBundle` (def + GDOS metadata + four local verdicts + tapes, assembled once); `ScoringProfile` (versioned record: all estimator weights, gate thresholds REQ-055/056, IDS window + min/max, novelty distance weights — strict-parsed, `DEFAULT_PROFILE` frozen); `GdosReport` + `DesignDecision` (pure data records every gate/curation verdict emits).
2. **Design space (`DesignSpace.ts`, `Economy.ts`).** Axes derived from registries (finding 6); `coverageMatrix(evidence[]) → CoverageMatrix`; `economyOfMechanics(matrix) → per-mechanic depth ÷ count` with the exhaust-first comparison.
3. **Gates (`Emotional.ts`, `Streamability.ts`, `InfoDensity.ts`).** Pure estimators over the bundle (finding 5 semantics; streamability: Reaction Density ≈ event density/sec across tapes, Clip Potential ≈ peak surprise×kinetic moments, Replay Value ≈ delta + route multiplicity, Shareability ≈ profile-weighted composite); each returns `{ scores, pass, findings, decisions }` against the profile thresholds. IDS includes the REQ-016 fairness check (finding 7).
4. **Search metrics (`src/eval/Novelty.ts`, `src/eval/EmergentFun.ts` — TOP-LEVEL eval, not gdos/; dm-0037).** Corpus-parameterized divergence; kinetic-anchor probe over `Search.ts` (finding 8). Because EmergentFun executes a search, it lives at the top level of `src/eval/` alongside `Evaluate.ts` (the module that runs the audits), keeping `gdos/` strictly pure over pre-assembled evidence — no sim, no search, no scan carve-out. Novelty (pure descriptor distance) may live in `gdos/` or beside it. Emitted as data for P7.
5. **Design Memory (`DesignMemory.ts`).** Typed strict parse of the ledger document; query API (by status/tag/title-term — the parse-before-proposing REQ-051 check is `findPriorArt(terms)`); pure `append` producing the canonical next document string; ledger `schema_version` bump only if new fields prove necessary (decide at S5.6).
6. **Curation (`Curation.ts`).** Kill Switch: reject decision + recorded reason when a report shows a non-elevating concept (fails gates / adds a mechanic while variations unexhausted / violates REQ-012 isolation). First-Party filter: three criteria over report + attestations. Subtractive engine: six-question checklist over a milestone inventory record.
7. **CDRE (`Cdre.ts`).** `mine(history: DesignDecision[], reports: GdosReport[]) → CdreProposal[]`; `apply(profile, acceptedProposal) → next ScoringProfile version`. Every proposal carries the five Intent Repository fields.

## Dependencies

P4 VERIFIED (satisfied). Consumes: the four local verdict types + `AgentRunResult`/tapes (S4.2–S4.5), `CurriculumLevel`/`MacroVerdict` (S4.6), `GdosMetadata` (S2.x, semantics assigned by dm-0012), the P3 kind registries, `Search.ts`, the P2 parse discipline (dm-0010/0013/0014), `meta/design_memory_ledger.json` as the memory backing store. No external dependencies. P6 consumes the coverage matrix; P7 consumes novelty/emergent-fun/IDS; P10 consumes `judgeLevel`.

## Deliverables (one per slice — see `docs/task_slices.md` Phase 5, restructured)

- **S5.1** Kernel + design space: `Evidence.ts`, `Profile.ts`, `Report.ts`, `DesignSpace.ts`, `Economy.ts` (REQ-040/041/042). Tests: profile strict-parse rejection suite; bundle assembly from P4 fixture verdicts; axis derivation locksteps with registries; coverage + economy on hand-built evidence sets; exhaust-first comparison.
- **S5.2** Emotional estimators + threshold gates (REQ-055; REQ-015 arc semantics). Tests: each estimator on targeted evidence fixtures; gates reject below-threshold and pass above-threshold bundles; delivered-vs-intended divergence reported.
- **S5.3** Streamability estimators + matrix gates (REQ-056). Same shape.
- **S5.4** IDS regulator + failure-visibility fairness (REQ-061; REQ-016 P5 share). Tests: overwhelm and boring fixtures rejected; window math exact; invisible-kill fixture fails fairness, visible-kill passes.
- **S5.5** Novelty + emergent-fun (REQ-053/054); EmergentFun sited at top-level `src/eval/` per dm-0037. Tests: identical-level divergence 0; divergent fixture scores higher; kinetic-anchor probe flags a spring-chain fixture, not a flat corridor.
- **S5.6** Executable Design Memory + Intent Repository (REQ-050/051/111 completion). Tests: round-trips the *real* ledger file content; strict rejection suite; prior-art query finds a known dm entry; append is canonical + idempotent-safe.
- **S5.7** Kill Switch + First-Party filter + Subtractive engine (REQ-020/021/022; REQ-012 curation share). Tests: kill fires on gate-failing/economy-violating reports with recorded reasons; passes an elevating fixture; checklist report over a fixture inventory.
- **S5.8** CDRE loop (REQ-052). Tests: mines a seeded history into expected proposals; applying an accepted proposal yields a new valid profile version; rejected proposals recorded, never applied.
- **S5.9** `docs/verification/P5.md` — per-REQ verification report (dm-0008 discipline).

## Validation criteria

- **Determinism:** every scorer/estimator/miner is a pure function — same inputs ⇒ identical outputs; no `Math.random`, no `Date.now`, math whitelist honored under `src/eval/gdos/` (scan-audited).
- **Data-driven calibration (dm-0031):** zero numeric literals in gate logic — every weight/threshold reaches code through a parsed `ScoringProfile`; changing a threshold requires no code edit (proven by a test that gates the same bundle differently under two profiles).
- **No re-auditing / purity:** `src/eval/gdos/` never invokes the P4 audit entry points (`solvability/softlock/exploit/optimization`), never drives the engine, and never runs a `Search` — evidence arrives assembled (two scans in `EvalIsolation.test.ts`: local-pass imports are types-only, and no `AgentHarness`/`Evaluate`/`Search`/`Engine` import at all; dm-0037). Search-using P5 code (EmergentFun) lives at top-level `src/eval/`, so there is **no exception** to weaken the rule.
- **Gate correctness:** every gate rejects its below-threshold fixture and passes its above-threshold fixture; every score traces to a PRD §-metric by name.
- **Memory fidelity (REQ-051/111):** the store parses the real `design_memory_ledger.json` losslessly; every accepted/rejected decision record carries all five Intent Repository fields; prior-art query prevents re-proposing a ledgered rejection.
- **Isolation:** one-way rule intact (sim never imports eval); `src/eval/gdos/` I/O-free (fs only at callers/tests).
- **Content gate:** no content authored; fixtures remain in-code/`test/fixtures/` scaffolding.
- **Green build:** `npm test` exits 0; every new module covered.

## Checkpoints

- **C5.1** ✅ Kernel + coverage matrix + economy metric landed; profile rejection suite green; axes lockstep with registries (`GdosProfile`/`GdosDesignSpace` tests).
- **C5.2** ✅ Emotional gates classify their fixture bundles correctly; delivered-vs-intended divergence reported; two-profile test proves calibration external (`GdosEmotional`).
- **C5.3** ✅ Streamability gates classify correctly; every metric named per §6 (`GdosStreamability`).
- **C5.4** ✅ IDS regulator rejects overwhelm/boring fixtures; fairness check catches the invisible kill (`GdosInfoDensity`).
- **C5.5** ✅ Novelty + emergent-fun metrics behave on fixture corpora; kinetic anchors emitted as data, attributed, and replay-proven (`GdosNovelty`/`EmergentFun` tests; dm-0039).
- **C5.6** ✅ Design Memory round-trips the live ledger byte-identically; prior-art query + canonical append proven; dm-0040 appended via the store itself (`GdosDesignMemory` tests).
- **C5.7** ✅ Kill Switch/First-Party/Subtractive verdicts fire correctly and record decisions — incl. the REQ-012 jump-free-completion kill and Intent-Repository fields on every kill (`GdosCuration` tests; dm-0041).
- **C5.8** ✅ CDRE mines seeded reports/coverage/history into proposals; an ACCEPTED threshold proposal produces a valid next profile version; PROPOSED/REJECTED are inert; mining is symmetric (lower *and* raise) so the gates cannot ratchet toward vacuity (`GdosCdre` tests; dm-0042).
- **C5.9** ✅ `docs/verification/P5.md` filed; 9 owned REQs → VERIFIED; PKG consistent (`s5-q7c4b1`); subtractive pass run *with the S5.7 engine* — found and removed 3 dead exports, then re-ran clean.

## Risk register (P5)

| Risk | Mitigation |
|------|------------|
| Estimator formulas become Goodhart targets for P7/P10 generators. | Evidence-rich reports (never bare booleans), the First-Party filter as an independent second gate, CDRE recalibration channel, epistemics ledgered per estimator (dm-0031). |
| Magic-number creep in gate logic. | The zero-numeric-literals validation criterion + two-profile test; all calibration in `ScoringProfile`. |
| CDRE scope balloons toward "AI improving AI". | dm-0033 pins it: mine → propose → versioned profile apply; proposals are data with Intent Repository fields. |
| Gates silently re-run P4 audits (duplicated, divergent evidence). | `EvidenceBundle` seam + import-discipline scan (finding 2). |
| Design Memory store corrupts the live ledger. | Pure text→records→text with strict parse + canonical serialize; round-trip test against the real file; callers own `fs`. |
| Qualitative criteria (Self-Explanation, Polish) faked as computations. | Typed attestation records — honest inputs, deterministic verdict logic over them (finding 10). |
| GdosMetadata semantics drift from the dm-0012 provisional shape. | P5 owns the semantics; any extension bumps the schema version explicitly (open question 2), never reinterprets silently. |

## Open questions (carried into P5 implementation)

1. **Exact estimator formulas per metric** — each slice defines its estimator precisely and ledgers it (the review fixes the *evidence source* per metric; coefficients live in the profile from day one).
2. **GdosMetadata schema extension** — do streamability intent or attestations need authored schema fields, or do attestation records stay eval-side data? Decide at S5.3/S5.7; version-bump if extending (dm-0012).
3. **Ledger schema version** — does the executable store need machine fields (tags, structured refs) beyond v1.0? Decide at S5.6; migrate per dm-0010 policy only if v2 exists.
4. **Novelty descriptor composition** — exact geometry-signature and trajectory-shape fields; decide + ledger at S5.5.

## Exit condition for P5

All checkpoints C5.1–C5.9 pass; `judgeLevel(evidence, profile)` produces a full `GdosReport` on fixture bundles with every gate correct on its fixture pair; the Design Memory is executable over the live ledger; CDRE produces versioned profile evolution; the verification report is filed. P5 `VERIFIED` is the second M2 pillar — the content gate stays closed until P6 also closes.

### Per-REQ `VERIFIED` schedule (four-state discipline)

A REQ becomes `VERIFIED` only at the phase report that closes its **last** owning phase (the P4 precedent: REQ-140/141 flipped at S4.7; REQ-142/101/102 stayed `IN_PROGRESS` because they span P6/P10). So S5.1–S5.4 leave their REQs at `IN_PROGRESS` — this is correct, not a loose end:

- **Flip to `VERIFIED` at S5.9** (P5 is their only owning phase): REQ-040, REQ-042, REQ-055, REQ-056.
- **Stay `IN_PROGRESS` past S5.9** (a later phase still owns a share): REQ-041 (P6 consumes coverage), REQ-061 (P7 applies IDS), REQ-015 (P10 authors the arc), REQ-016 (P9 renders failure signals, P10 authors). These flip at their final phase's report.
- Already `IN_PROGRESS` and completed by S5.6/S5.8 respectively: REQ-051/REQ-111 (Design Memory), REQ-052 (CDRE), REQ-020/021/022 (curation), REQ-050/053/054 — flip per the same rule.

---

# P6 — Campaign Intelligence  *(CLOSED — VERIFIED, `docs/verification/P6.md`; authored before S6.1 code per REQ-P02; adversarial review ledgered dm-0043–dm-0048)*

> **CLOSED at S6.6.** All six slices COMPLETED, checkpoints C6.1–C6.5 passed, 420/420 tests green. `CampaignDirector.processCampaign` folds a chapter-grouped campaign deterministically and flags a synthetic difficulty spike on a fixture campaign (the IRD exit condition); every one of the ten REQ-031 macro variables is genuinely computed by a profile-calibrated module (`CampaignProfile`/`CampaignState`/`TapeAnalyzer`/`MechanicTracker`/`KnowledgeModel`/`ChapterHealth`/`CampaignDirector`); five further design corrections surfaced during implementation and were ledgered before their code landed (dm-0049–dm-0053), including giving the `campaign/` isolation rule structural scan enforcement for the first time. REQ-030/031/032/041/142 → VERIFIED. **Milestone M2 — Design Intelligence Operational is VERIFIED** (P4 ✓, P5 ✓, P6 ✓ — all three pillars complete); **the content-generation hard gate is now OPEN.** Retained below as the historical record.

## Governing requirements

| Phase | REQs governing the work |
|-------|--------------------------|
| P6 | REQ-030 (Game Director: macro campaign state model), REQ-031 (ten macro state variables tracked continuously), REQ-032 (Player Behavior Model — P6 defines the data model; P8 supplies live telemetry feeds later), REQ-041 (P6 share: Campaign Intelligence consumes and tracks the P5 coverage matrix across the campaign arc), REQ-142 (P6 share: four macro curriculum criteria elevated to running campaign-level state) |

## Work

Make Campaign Intelligence *judge the arc* the way P5 made GDOS *judge levels*. P6 builds the macro-level Game Director layer: a pure deterministic fold over a campaign's level records that maintains the ten macro state variables, derives player behavioral signals from replay tapes without P8 telemetry, tracks mechanic introduction and mastery against the P5 coverage matrix, aggregates chapter health across the four REQ-142 macro criteria, detects difficulty spikes, and predicts retention from behavioral trajectories. P6 is the **third and final M2 pillar**. Closing P6 closes M2 and opens the content-generation hard gate (P7 PDA, P10 levels). Nothing in P6 authors content — fixtures remain in-code/`test/fixtures/` scaffolding only.

This plan was produced by a first-principles adversarial review of the P6 design space — the same treatment P4 and P5 got — explicitly asking whether a substantially better architecture exists before any production code. Decisions are ledgered as dm-0043–dm-0048.

## Adversarial review — findings and upgrades over the naive slice table

1. **The core defect of a naive Campaign Director: mutable rolling state.** A director that updates fields in place violates dm-0004 (never mutate `GameState` in place — this invariant generalises to all state records). A naïve implementation would keep a mutable `CampaignState` object and patch it field by field per level. **Decision (dm-0043): the campaign update is a pure fold step `updateState(state, record, profile) → CampaignState`, returning a new record every time.** The zero-state is `ZERO_CAMPAIGN_STATE` (the additive identity, same pattern as `Vec2.ZERO` in the engine). Processing a full campaign is `records.reduce(updateState_curried, ZERO_CAMPAIGN_STATE)` — no mutation, no side effects, replay-identical.

2. **Behavioral signals must be frame-count based, not wall-clock based.** Replay tapes (`AgentRunResult`) carry frame-indexed input events, not real-time timestamps. Wall-clock derivation would (a) violate dm-0003 (fixed step, no delta-time scaling) and (b) break determinism across machines. **Decision (dm-0043): every behavioral signal in `BehaviorSignals` is expressed in frame counts.** Hesitation = consecutive no-input frames before a jump input; panic burst = N jump-or-move inputs in M consecutive frames; commitment speed = frame index of the first jump input; drop-off = tape ends without the goal-reached event. These are reproducible purely from the tape.

3. **P8 contract boundary: interface now, implementation later.** REQ-032 is co-owned by P6 and P8. The risk is coupling the `CampaignDirector` to a concrete telemetry collector that does not yet exist, so either (a) P6 ships half-baked pending P8, or (b) P8 forces a P6 refactor when it arrives. **Decision (dm-0044): P6 defines `BehaviorSignals` as a typed data record and `TapeAnalyzer` as the derivation path from replay tapes (the P8-independent route). The `CampaignDirector` depends only on `BehaviorSignals`, never on the source. P8 will supply live-collected signals as an alternative implementation of the same record shape — a data substitution, not a structural change.** This is the "abstract interface" pattern the P5 verification report recommended (§7 item 2).

4. **Coverage matrix consumed by reference, never duplicated.** P5 built `coverageMatrix(evidence[]) → CoverageMatrix` and owns its derivation. P6 tracks *campaign-level* introduction and mastery against it — which axis cells have been activated across levels so far — but does not re-derive or store the matrix definition. **Decision (dm-0045): `MechanicTracker` receives a `CoverageMatrix` as a parameter (passed in by the caller); it never imports or re-computes the matrix itself.** "Mechanics introduced" = at least one level record's evidence covers a cell for that mechanic; "mechanics mastered" = that mechanic appears in the top optimization tier AND the exploration-archetype trace shows unambiguous routing confidence (≥ profile threshold). One source of truth for the matrix; P6 is a consumer.

5. **`CampaignProfile` is a separate schema from `ScoringProfile`.** A tempting simplification is to extend `ScoringProfile` with campaign-level calibration — spike thresholds, mastery weights, retention multipliers. This would couple two distinct concerns and force a `PROFILE_SCHEMA_VERSION` bump on `ScoringProfile` (dm-0039). **Decision (dm-0045): `CampaignProfile` is its own versioned data structure (`campaignProfileSchemaVersion: 1`), strict-parsed with the full P2 discipline, with its own `DEFAULT_CAMPAIGN_PROFILE` frozen constant.** The zero-numeric-literal validation criterion applies to P6 gate logic exactly as it does in P5: every threshold/weight reaches code through a parsed `CampaignProfile`; a two-profile test proves calibration is external.

6. **REQ-142 elevation: from per-session verdict to running campaign trajectory.** P4 computed the four macro criteria (Cognitive Structural Mapping, Cross-Chapter Degradation Analysis, Curiosity Progression Curves, Graduation Assessment Verification) for a single fixture curriculum run — a one-shot `MacroCurriculumVerdict`. P6 must *track them as running state across the full campaign arc*, enabling cross-chapter degradation *trends* over time. **Decision (dm-0046): `ChapterHealth` ingests the chapter's `MacroCurriculumVerdict` records (P4 output, passed as data) and lifts each criterion to a trend line in `CampaignState`.** The P4 verdict is an input; P6 computes the *delta* between adjacent chapters and stores the trajectory as campaign state. This is the share of REQ-142 that P4 explicitly left open ("P6 contributes the campaign models").

7. **Retention prediction is a design proxy, not a psychological model.** Calling a field "retention prediction" risks scope inflation toward ML or player psychology. **Decision (dm-0046): `retentionPrediction` is a score in [0, 1] computed as a `CampaignProfile`-weighted composite of observable behavioral signals** — high retry cadence with falling performance trends downward; high optimization depth with increasing commitment speed trends upward; panic cycles trend downward; curiosity trend and chapter health each contribute a weighted component. It is explicitly documented as a *proxy for whether the design is rewarding the player*, not a claim about player intent or future actions. The weights live in `CampaignProfile`.

8. **`CampaignDirector` is not a `gdos/` module.** The `gdos/` sub-tree is PURE over pre-assembled evidence — it runs no sim, no search, no audit, and calls no external I/O (dm-0037; enforced by two scans in `EvalIsolation.test.ts`). The `CampaignDirector` operates at a *higher level of abstraction* than per-level scoring: it consumes `GdosReport`s (already judged by P5) and drives the fold over a campaign record sequence. **Decision (dm-0047): all P6 code lives in `src/eval/campaign/` — a new top-level sub-folder of `src/eval/`, alongside `Evaluate.ts` and `EmergentFun.ts`, not inside `gdos/`.** The `EvalIsolation` scan's rule — `gdos/` must not import the audit entry points or the engine — is unaffected. `campaign/` is a consumer of `gdos/` output data types, not of its internal computation.

9. **Spike detection must use profiled thresholds, not heuristics.** A difficulty spike is "chapter health drops sharply from the rolling baseline." "Sharply" must not be a hardcoded constant. **Decision (dm-0048): the spike detector in `CampaignDirector` computes a rolling `chapterHealthBaseline` (exponential moving average, decay factor in `CampaignProfile`) and flags a spike when the current chapter's health falls below `baseline − profile.spikeDropThreshold`.** Flagged spikes are emitted as typed `CampaignAlert` records — same pattern as `DesignDecision` in P5 — with a reason string and the contributing metrics. No bare booleans; the alert carries evidence.

10. **Alternatives weighed and rejected:** a mutable event-stream model (observer/subscriber pattern) would allow decoupled updates but introduces non-determinism in subscriber order and violates the stateless-system invariant; a single monolithic `CampaignAnalyzer` module (violates per-concern testability and makes it impossible to unit-test behavioral extraction independently from chapter health); a JSON-rules engine for spike/retention logic (interpreter accidental complexity — the thresholds are data in `CampaignProfile` already, the logic is simple enough to be TS expressions); importing P4 audit functions directly from `src/eval/local/` in P6 (would re-run the sim — P6 consumes P4 output records passed as data, never re-runs audits).

## Design summary (the compact model the code is written from)

1. **Kernel (`src/eval/campaign/CampaignState.ts`).** `CampaignState` — the ten macro variables as typed fields: `knowledgeState` (per-mechanic confidence), `behaviorState` (`BehaviorSignals` rolling aggregate), `emotionalState` (inferred from panic/commitment/retry), `skillCurve` (rolling performance delta), `mechanicsIntroduced` (set of mechanic keys), `mechanicsMastered` (set of mechanic keys), `optimizationDepth` (mean tier reached across levels), `curiosityTrend` (exploration divergence direction), `chapterHealth` (map of chapterId → `ChapterHealthReport`), `retentionPrediction` ([0, 1] composite). `ZERO_CAMPAIGN_STATE` is the additive identity. `CampaignProfile` — calibration record: mastery threshold, spike drop threshold, baseline decay factor, retention component weights, behavioral signal sensitivity thresholds — strict-parsed, `DEFAULT_CAMPAIGN_PROFILE` frozen.

2. **Behavioral extraction (`src/eval/campaign/TapeAnalyzer.ts`).** `analyzeTape(tape: AgentRunResult, profile: CampaignProfile) → BehaviorSignals`. Signals: `hesitationFrames` (max gap before a jump input), `retryCount` (tape sequence length − 1), `panicBurstCount` (clusters of N inputs in M frames), `commitmentSpeed` (frame index of first jump), `platformCheckCount` (lateral moves near-edge without jump), `dropOff` (goal event absent). Every signal derived from frame-indexed events only — no wall-clock, no `Math.random` (dm-0043).

3. **Mechanic tracking (`src/eval/campaign/MechanicTracker.ts`, `KnowledgeModel.ts`).** `trackMechanics(state, record, coverageMatrix, profile) → { mechanicsIntroduced, mechanicsMastered }`. Introduced: the level's `GdosReport` covers ≥ 1 coverage matrix cell for that mechanic. Mastered: top optimization tier reached AND exploration-archetype routing confidence ≥ profile threshold (dm-0045). `KnowledgeModel.updateKnowledge(knowledgeState, record, profile) → knowledgeState` — per-mechanic confidence updated via the evidence in the `GdosReport`.

4. **Chapter health (`src/eval/campaign/ChapterHealth.ts`).** `aggregateChapterHealth(records: LevelRecord[], macroCriteriaVerdicts: MacroCurriculumVerdict[], profile: CampaignProfile) → ChapterHealthReport`. Incorporates all four REQ-142 criteria elevated to campaign trajectory (dm-0046): Cognitive Structural Mapping (each mechanic's prior-mechanic dependency chain respected), Cross-Chapter Degradation (performance delta vs previous chapter), Curiosity Progression Curves (curiosityTrend direction across chapter), Graduation Assessment Verification (chapter-final level demonstrates mastered mechanics). Returns `{ score, criteriaScores, trend, alerts }`.

5. **Campaign Director (`src/eval/campaign/CampaignDirector.ts`).** `updateState(state: CampaignState, record: LevelRecord, chapterMap: ChapterMap, profile: CampaignProfile) → CampaignState` — the core fold step (dm-0043). `processCampaign(records: LevelRecord[], profile: CampaignProfile) → CampaignReport`. Spike detection: rolling `chapterHealthBaseline` (EMA, decay factor from profile) — emits a `CampaignAlert` when health drops below `baseline − profile.spikeDropThreshold` (dm-0048). Retention prediction: `CampaignProfile`-weighted composite (dm-0046). Emotional state: inferred from `panicBurstCount`, `commitmentSpeed`, `retryCount` per profile weights. Skill curve: frame-count performance delta over a rolling window. Curiosity trend: exploration-archetype divergence direction over last N levels (N from profile).

6. **`LevelRecord`** — the P6 input unit: `{ levelId: string; chapterId: string; report: GdosReport; tape: AgentRunResult; macroCriteria: MacroCurriculumVerdict }`. Assembled by callers from P4 + P5 outputs. P6 code never imports `AgentHarness`, never drives the engine, never re-runs P4 audits. `CampaignReport` — output: `{ finalState: CampaignState; chapterHealthMap: Map<string, ChapterHealthReport>; alerts: CampaignAlert[]; retentionPrediction: number }`.

## Dependencies

P4 VERIFIED + P5 VERIFIED (both satisfied). Consumes: `GdosReport` (P5 `judgeLevel` output), `AgentRunResult`/tapes (P4 S4.2–S4.5 format), `MacroCurriculumVerdict` (P4 S4.6 output), `CoverageMatrix` (P5 `DesignSpace.ts` output — passed as parameter, not re-derived), P2 parse discipline (dm-0010/0013/0014 — `CampaignProfile` strict-parsed identically). No dependency on P8 telemetry (dm-0044). P7 (PDA/generation) consumes `CampaignReport` for curriculum gap signals. P10 (content) uses chapter health to guide authoring.

## Deliverables (one per slice — see `docs/task_slices.md` Phase 6)

- **S6.1** CampaignState + CampaignProfile data model: `CampaignState.ts` (ten typed fields + `ZERO_CAMPAIGN_STATE`), `CampaignProfile.ts` (calibration record + strict parse + rejection suite + `DEFAULT_CAMPAIGN_PROFILE`), `LevelRecord`/`CampaignReport`/`CampaignAlert` types (REQ-030/031 core). Tests: profile strict-parse rejection suite; `ZERO_CAMPAIGN_STATE` holds every one of the ten macro variables at its neutral/vacuous value (the additive identity's *shape*; the fold-identity property `updateState(ZERO_CAMPAIGN_STATE, noop) === ZERO_CAMPAIGN_STATE` is proven at S6.5 once `updateState` exists — this slice only locks the frozen record boundary); round-trip serialize/parse; two-profile test fixture (prove calibration reaches logic externally); a `LevelRecord` assembles cleanly from real `GdosReport`/`ReplayTape`/`MacroVerdict` fixtures, proving the frozen input boundary is usable end-to-end.
- **S6.2** TapeAnalyzer + BehaviorSignals (REQ-032 data model). `TapeAnalyzer.ts`: `analyzeTape(tape, profile) → BehaviorSignals`. Tests: fixture tapes exercising each signal in isolation (hesitation tape, panic-burst tape, early-drop tape, aggressive-commitment tape); signals are zero on a trivially short tape; two-profile test — signal sensitivity thresholds come from the profile, not literals.
- **S6.3** MechanicTracker + KnowledgeModel (REQ-031 mechanics-introduced/mastered; REQ-041 P6 share). `MechanicTracker.ts` + `KnowledgeModel.ts`. Tests: fixture `GdosReport` set showing mechanic introduced but not yet mastered; separate fixture showing mastered threshold met; `mechanicsIntroduced ⊆ mechanicsMastered` is impossible (mastered ⇒ introduced enforced); coverage matrix passed as parameter, never re-derived.
- **S6.4** ChapterHealth aggregator + REQ-142 P6 share. `ChapterHealth.ts`: `aggregateChapterHealth(records, macroCriteria, profile) → ChapterHealthReport`. Tests: synthetic chapter with planted Cross-Chapter Degradation (performance drop across boundary is detected); chapter with no Graduation Verification fixture fails that criterion; curiosity-trend positive chapter scores higher than curiosity-trend flat; two-profile test.
- **S6.5** CampaignDirector: fold + spike detection + retention + curiosity + skill curve (REQ-030 logic). `CampaignDirector.ts`. Tests: synthetic 3-chapter campaign with a spike planted at chapter 2 — `CampaignAlert` present at that chapter, absent for chapters 1 and 3; retention prediction moves in the expected direction under a "declining" behavioral fixture campaign vs an "improving" one; skill curve increases monotonically on a fixture campaign of escalating optimization tiers; two-profile test — spike threshold and retention weights come from profile, not literals; `processCampaign` is deterministic (run twice → identical `CampaignReport`).
- **S6.6** `docs/verification/P6.md` — per-REQ verification report (dm-0008 discipline); REQ-030/031/032/041/142 → VERIFIED; PKG update; ledger decisions (dm-0043–dm-0048); task_slices and execution_plan closed.

## Validation criteria

- **Determinism:** every function in `src/eval/campaign/` is pure — same `(state, record, profile)` ⇒ identical output; no `Math.random`, no `Date.now`, math whitelist honored (scan-audited).
- **Data-driven calibration (dm-0045):** zero numeric literals in campaign gate logic — every threshold/weight reaches code through a parsed `CampaignProfile`; two-profile test proves external calibration (same campaign record, different profile → different alert/retention outcome).
- **Fold purity (dm-0043):** `updateState` returns a new `CampaignState`; no mutation of the input state; `ZERO_CAMPAIGN_STATE` is the verified additive identity.
- **P8 independence (dm-0044):** `CampaignDirector` and all `campaign/` modules depend only on `BehaviorSignals` (the data record), never on a telemetry collector or any `src/tools/` import.
- **No re-auditing:** `src/eval/campaign/` never imports `AgentHarness`, `Evaluate`, `Search`, or any P4 audit entry point; receives P4/P5 output records as parameters.
- **Coverage matrix by reference (dm-0045):** `MechanicTracker` takes `CoverageMatrix` as a parameter; no `DesignSpace.coverageMatrix()` call inside `campaign/`.
- **Alert provenance:** every `CampaignAlert` carries a reason string and the contributing metric values — no bare boolean flags.
- **Content gate:** no `LevelDefinition` content authored; fixtures are hand-built data records only.
- **Green build:** `npm test` exits 0; every new module covered; suite count ≥ 336 + new P6 tests.

## Checkpoints

- **C6.1** CampaignState + CampaignProfile land; profile rejection suite green; `ZERO_CAMPAIGN_STATE` identity test passes; `CampaignProfile` two-profile fixture ready.
- **C6.2** `TapeAnalyzer` classifies all six behavioral signals on their fixture tapes; two-profile test proves signal sensitivity is external.
- **C6.3** `MechanicTracker` correctly distinguishes introduced vs mastered on fixture reports; `KnowledgeModel` accumulates per-mechanic confidence across two levels.
- **C6.4** `ChapterHealth` detects planted degradation and curiosity-drop in fixture chapters; all four REQ-142 criteria scored.
- **C6.5** `CampaignDirector` flags the planted spike at chapter 2, not chapters 1/3; retention moves in the right direction; skill curve monotonic on the escalating fixture; all two-profile tests pass; `processCampaign` is deterministic on two runs.
- **C6.6** `docs/verification/P6.md` filed; REQ-030/031/032/041/142 → VERIFIED; PKG consistent; **M2 CLOSES — content-generation hard gate OPENS.**

## Risk register (P6)

| Risk | Mitigation |
|------|------------|
| Behavioral signal derivation uses wall-clock time (breaks determinism). | All signals expressed in frame counts only (dm-0043); math whitelist scan enforced. |
| `CampaignDirector` couples to P8 telemetry, blocking P6 from closing. | `BehaviorSignals` is the only dependency — a typed data record; `TapeAnalyzer` provides it without P8 (dm-0044). |
| `CampaignProfile` thresholds end up hardcoded as literals in director logic. | Zero-numeric-literals criterion + two-profile test, same discipline as P5 (dm-0045). |
| Coverage matrix duplicated or re-derived inside `campaign/`. | Caller passes `CoverageMatrix` as a parameter; scan for `DesignSpace.coverageMatrix` imports in `campaign/` (dm-0045). |
| "Retention prediction" drifts toward a psychological claim or ML model. | Scoped explicitly as a `CampaignProfile`-weighted composite of observable frame-derived signals (dm-0046); ledgered definition. |
| Spike detector fires on normal inter-chapter variance (false positives). | EMA baseline with profile-controlled decay factor and explicit drop threshold; fixture tests for non-spike chapters confirm no false alerts (dm-0048). |
| REQ-142's four criteria get computed per-level instead of per-chapter trajectory. | `ChapterHealth` takes the full chapter record set and the P4 `MacroCurriculumVerdict` batch; criterion score is a trend across the chapter, not a per-level value (dm-0046). |
| `gdos/` purity violated by `campaign/` importing internal gates. | `campaign/` imports only P5 *output* data types (`GdosReport`, `CoverageMatrix`) — never `gdos/Emotional.ts`, `gdos/InfoDensity.ts`, etc.; `EvalIsolation` scan unchanged (dm-0047). |

## Open questions (carried into P6 implementation)

1. **Exact `BehaviorSignals` frame thresholds** — what constitutes a "hesitation" (N frames of no input before a jump)? What counts as a "panic burst" (M inputs in K frames)? Decide at S6.2; values live in `CampaignProfile` from day one, so the answer is "what goes in the default profile," not a code constant.
2. **`knowledgeState` representation** — a `Map<mechanicKey, number>` (confidence in [0, 1]) seems right, but decide at S6.3 whether the confidence update rule should be additive, exponential-decay, or peak-only. Ledger the decision.
3. **EMA decay factor semantics for `chapterHealthBaseline`** — does "decay factor" decay toward the new chapter health or toward zero? Decide at S6.5; document in `DEFAULT_CAMPAIGN_PROFILE` jsdoc.
4. **`CampaignReport` integration with P7** — P7 (PDA/generation) will consume `CampaignReport.alerts` to identify curriculum gaps. Define the exact consumption API at S6.5 so P7's consumption seam is unambiguous. (No P7 code in P6; just confirm the types are sufficient.)

## Exit condition for P6

All checkpoints C6.1–C6.5 pass; `processCampaign` produces a deterministic `CampaignReport` on a synthetic fixture campaign and correctly flags the planted spike; `TapeAnalyzer` derives all six behavioral signals without any P8 dependency; chapter health scores the four REQ-142 criteria at campaign scale; the verification report is filed. P6 `VERIFIED` closes the third M2 pillar. **M2 — Design Intelligence Operational is VERIFIED. The content-generation hard gate opens.**

### Per-REQ `VERIFIED` schedule (four-state discipline)

- **Flip to `VERIFIED` at S6.6** (P6 is the last owning phase): REQ-030, REQ-031, REQ-032 (P6 share; P8 contributes live telemetry feeds in its own phase), REQ-041 (P5 share + P6 share both delivered → final flip), REQ-142 (P4 share + P6 share both delivered → final flip).
- **Stay `IN_PROGRESS` past S6.6** (owned by later phases): REQ-032's P8 share (live telemetry collection — P8), REQ-061 (IDS applied — P7), REQ-012/015/016/050 (P9/P10 shares), REQ-022 (P11 final pass).

---

# P7 — PDA & Procedural Generation + Mechanic Lifecycle  *(CLOSED — VERIFIED, `docs/verification/P7.md`; authored before S7.1 code per REQ-P02; adversarial review ledgered dm-0054–dm-0060; implementation dm-0061–dm-0064)*

> **CLOSED at S7.8.** All eight slices COMPLETED, checkpoints C7.1–C7.7 passed, 498/498 tests green. `manufactureLevel` folds a concept through the eight REQ-090 phases and satisfies the IRD exit condition — a fixture concept manufactures end-to-end into a schema-valid level passing P4 solvability + the S7.2 counterfactual + the P5 gates, and poisoned concepts are rejected at the correct phase with a logged reason and no product. The dm-0041 counterfactual solver is discharged (`auditJumpRelevance`, zero `Search.ts` change). Four implementation corrections were ledgered before their code (dm-0061 one gap-corridor template; dm-0062 monotone-best creativity fold; dm-0063 structural intent rigor; dm-0064 exploit-recorded-not-gated, backed by the `ONE_GAP` evidence). REQ-060/081/082/053/054/061 → VERIFIED; REQ-090/091/012 retain a P10 share. **M3 — Production Capable does NOT close here — P8 (Internal Production Tools) is the second M3 pillar and is NOT_STARTED.** Retained below as the historical record.

## Governing requirements

| Phase | REQs governing the work |
|-------|--------------------------|
| P7 | REQ-060 (Procedural Design Assistant: standalone conceptual/structural/systemic opportunity search — not raw geometry), REQ-081 (Creativity & Iteration evolutionary loop), REQ-082 (9-stage mechanic lifecycle tracking; block exhausted mechanics; prune/convert on Retirement), REQ-090 (P7 share: the 8-phase level manufacturing pipeline as infrastructure; P10 uses it to author real content), REQ-091 (P7 share: Single-Sentence Intent Verification gate), REQ-053/054 (P5-built novelty + emergent-fun search — the P7 *application* share), REQ-061 (P5-built IDS gate — the P7 *application* share: pipeline regulation), REQ-012 (P7 share added by dm-0041: the counterfactual no-jump reachability solver deferred at P5 close) |

## Work

Build the **generation side** of the design intelligence M2 verified: a Procedural Design Assistant that discovers *where* the design space is unexploited, a mechanic lifecycle registry that knows *which* mechanics are still fresh, a deterministic candidate generator and creativity/iteration loop that produce and evolve `LevelDefinition` candidates, and the 8-phase manufacturing pipeline that drives a candidate from concept through P4 audits and P5 gates to an accepted, campaign-ready product — or to a typed, logged rejection. P7 is the first M3 (Production Capable) phase. **P7 builds the pipeline; it authors no content** — every `LevelDefinition` P7 produces exists only inside tests (generated fixtures), never as shipped campaign content (that is P10, gated behind M3 = P7 + P8).

This plan was produced by a first-principles adversarial review of the pre-P6 four-slice table — the same treatment P3–P6 each got. Level-design governance comes from `/level-design-principle` (invoked before this plan was written): its twelve archetypes, six design-workflow questions, and archetype→GDOS-metric mapping are baked into the concept model below. Decisions are ledgered as dm-0054–dm-0060.

## Adversarial review — findings and upgrades over the naive slice table

1. **The naive table sequences the intent gate (old S7.5) *after* the pipeline (old S7.4).** A pipeline assembled before its Sign-off/Intent phase exists would ship with a stub phase — a placeholder, forbidden outright. Same defect class as P3's missing run-lifecycle slice. **Fix (dm-0054): every pipeline phase's engine exists before the pipeline slice; the pipeline slice only composes finished parts.** The table is restructured to eight slices (S7.1–S7.8).

2. **No slice owned the dm-0041 counterfactual solver.** The deferred REQ-012 share ("a completion tape that never presses THE jump is necessary but not sufficient — a level where jumping is possible but irrelevant still passes the kill proxy") is P7's to build, and the naive table silently dropped it. **Fix (dm-0054/dm-0056): new slice S7.2.** Design: `searchReachability` already accepts a `forbidden: (state) => boolean` taint predicate (built for S4.4 exploit filtration). A no-jump reachability search is that same budgeted BFS with a predicate forbidding any state whose jump lock has left its initial phase — **zero modifications to P4's `Search.ts`**. Goal reachable under the constraint ⇒ the jump is irrelevant ⇒ REQ-012 kill. Frontier exhausted ⇒ the jump is necessary ⇒ pass. Node cap hit ⇒ `inconclusive`, honestly reported (same three-way honesty as `SolvabilityVerdict`).

3. **No slice owned candidate generation.** The creativity loop (old S7.3) and the pipeline's Structural Prototyping phase (old S7.4) both presuppose "generate a candidate level," yet nothing built it. **Fix (dm-0054/dm-0059): new slice S7.4 — the concept model + deterministic candidate generator.** `LevelConcept` (the pipeline's phase-1 record) carries the `/level-design-principle` design-workflow answers as typed fields: archetype (closed twelve-value list from the skill), the one-jump decision, the intent sentence (the REQ-091 subject), mechanics selected (lifecycle-checked), difficulty-vector target, emotional-arc phase. The generator maps a concept to a schema-valid `LevelDefinition` via parametric archetype templates; every emitted candidate is proven by round-trip through the P2 strict parser. Variation operators (mutate/combine) are the creativity loop's substrate.

4. **The lifecycle registry's home is already reserved — use it, don't fork it.** `DesignMemory.ts` v1.0 hard-pins `mechanic_lifecycle_registry.mechanics` to empty, with the parse error itself saying "lifecycle entries are defined by P7 behind a ledger version bump" (dm-0040; P5 verification report §Q3). A separate lifecycle JSON store would create a second source of truth. **Decision (dm-0055): S7.1 bumps `LEDGER_SCHEMA_VERSION` 1.0 → 1.1 inside `DesignMemory.ts` — the one pre-authorized `gdos/` modification of P7** — adding strict-parsed, typed `MechanicLifecycleEntry` records and migrating the live ledger file in the same change (idempotent; byte-idempotency suite stays green). The three-step refactor protocol applies: PKG dependents mapped, signatures anchored, the existing `GdosDesignMemory` suite is the isolation harness.

5. **The nine lifecycle stage names exist nowhere in the repo** (the PRD row abbreviates "Introduction→…→Retirement"). They must be defined and ledgered, not guessed at implementation time. **Decision (dm-0055), derived from the `/level-design-principle` chapter arc (introduce → apply under pressure → deepen → test mastery) plus REQ-082's exhaustion economics:** `Introduction → Isolation → Development → Combination → Subversion → Mastery → Saturation → Exhaustion → Retirement`. Transitions are forward-only and evidence-gated through a propose/apply split (the CDRE house pattern: `assessStage` observes and recommends; `advanceStage` is an explicit, validated act). `Exhaustion` and `Retirement` block the mechanic from new-concept selection; `Retirement` carries a `prune | convert` disposition.

6. **Generation calibration must not leak into `ScoringProfile` or `CampaignProfile`.** Lifecycle exhaustion thresholds, creativity-loop budgets, diminishing-returns epsilons, intent-sentence rigor bounds — none of it belongs in the scoring or campaign schemas (dm-0045's separation logic extends). **Decision (dm-0057): `GenProfile` — a third versioned, strict-parsed calibration record (`genProfileSchemaVersion: 1`, `DEFAULT_GEN_PROFILE` frozen), landed at S7.1 and extended per-slice exactly as `CampaignProfile` was.** Zero numeric literals in gen logic; two-profile tests per calibrated field.

7. **P7 code needs its own subtree with a one-way dependency rule — and scans from day one.** Generation is design-time logic: not evaluation (`eval/`), not definition-time I/O (`schema/`), not tooling (`tools/` is P8's interactive home; the pipeline must be pure and `node --test`-covered). **Decision (dm-0057): new subtree `src/gen/` — precedent: `schema/` added at P2 (dm-0013), `eval/` added at P4 (dm-0022); `directory_structure.md` updated in the same change.** Isolation invariants: nothing outside `gen/` ever imports `gen/` (one-way, like `eval/`); `gen/` consumes evaluation strictly through public seams (`evaluateLevel`/`judgeLevel`, `auditSolvability`, `probeEmergentFun`, `noveltyDivergence`, the new S7.2 audit) — never `gdos/` gate internals, never `campaign/` internals beyond types, never `systems/` directly; whitelist math; RNG only via threaded `core/Rng` state. Structural scans land at **S7.1 with the first `gen/` module** — the P6 lesson (dm-0053 closed a scan gap that had been prose-only for four slices).

8. **The intent sentence lives in `LevelConcept`, not `LevelDefinition`.** REQ-091 is a manufacture-time gate ("denied compile and deleted"); persisting the sentence into the level schema would force a `LEVEL_SCHEMA_VERSION` bump and P2 parser changes P7 does not need. **Decision (dm-0059): the sentence is carried by the concept and forwarded in the pipeline product's provenance record; whether it ships inside `LevelDefinition` is P10's decision when real content is authored.** The gate itself (S7.6) performs structural rigor checks (exactly one sentence; non-empty; names the lesson's decision; length bounds from `GenProfile`) — a denied concept yields a typed rejection record with the logged reason; "deleted" means the pipeline discards the candidate and persists only the rejection record (the `/level-design-principle` brainstorming bar: a keepable concept "has one sentence explaining the solution").

9. **Generated ≠ nondeterministic.** Every stochastic-looking step (template parameter draws, mutation, combination) advances a threaded `RngState` (`core/Rng`, dm-0003 family); every loop is doubly bounded (hard iteration cap + diminishing-returns epsilon, both from `GenProfile`). The pipeline is a pure function of `(concept, profile, seed)` — same inputs ⇒ byte-identical product or rejection. **(dm-0059/dm-0060.)** This is what makes the IRD exit condition testable at all.

10. **Alternatives weighed and rejected (dm-0054–dm-0060):** grammar/wave-function-collapse/ML generators (unverifiable or nondeterministic; parametric archetype templates are auditable and sufficient for pipeline verification — P10 can extend the template library without structural change); modifying `Search.ts` to strip jump actions from `ACTIONS` (the `forbidden` predicate achieves the same with zero touch of verified P4 code); a standalone lifecycle store (two sources of truth — the ledger already reserved the registry); placing the pipeline under `tools/` (loses purity + unit-test coverage; `tools/` is interactive P8 territory); extending `ScoringProfile`/`CampaignProfile` with gen calibration (couples three concerns; forces version bumps on verified schemas).

## Design summary (the compact model the code is written from)

1. **Lifecycle (`src/gen/Lifecycle.ts` + `DesignMemory.ts` v1.1).** `MechanicLifecycleEntry`: `{ mechanic: EntityKind; stage: LifecycleStage; history: readonly StageTransition[] }`, each transition `{ from, to, date, evidence }` — strict-parsed by the ledger store (v1.1), serialized canonically. `LIFECYCLE_STAGES` — the closed nine-value order above. `assessStage(entry, evidence, profile) → StageAssessment` (recommendation, never a mutation); `advanceStage(entry, transition) → entry′` (validated: forward-only, adjacent-or-forward steps, evidence required); `isBlocked(registry, mechanic) → boolean` (Exhaustion/Retirement ⇒ true). Evidence shape: usage counts, novelty-divergence trend for the mechanic's configurations, campaign mastery signal (`CampaignReport` types, read-only).
2. **Counterfactual audit (`src/eval/local/Counterfactual.ts`).** `auditJumpRelevance(def, options) → JumpRelevanceVerdict` — `classification: 'jump-necessary' | 'jump-irrelevant' | 'inconclusive'`, plus the no-jump witness frames when irrelevant (the proof), `exhausted`/`truncated` flags. Implementation: `searchReachability(def, seed, { …, stopAtGoal: true, forbidden: jumpConsumed })` where `jumpConsumed` reads the jump-lock phase against its spawn value (exact field pinned at S7.2 by reading `World.ts` — zero-assumption).
3. **PDA (`src/gen/Pda.ts`).** `discoverOpportunities(inputs: PdaInputs, profile: GenProfile) → PdaReport`. `PdaInputs` — all consumed by reference, all optional-degrading like `CdreInputs`: `coverageMatrix` (dead cells → conceptual gaps), `cdreProposals` (COVERAGE-GAP/RECURRING-REJECTION findings), `campaignReport` (alerts + weak chapter health → systemic gaps), `emergentFun` (kinetic anchors → structural opportunities), `lifecycleRegistry` (fresh vs blocked mechanics), `designMemory` (prior art — never re-propose a REJECTED idea: `findPriorArt`). Output: ranked, typed `DesignOpportunity` records `{ kind: 'conceptual' | 'structural' | 'systemic'; archetype; mechanics; rationale; sourceSignals }` — deterministic ordering, no geometry.
4. **Concept + generator (`src/gen/Concept.ts`, `src/gen/Generator.ts`).** `LevelConcept`: `{ archetype: LevelArchetype (closed 12-list); intentSentence; oneJumpDecision; mechanics: readonly EntityKind[]; difficultyTarget: Readonly<Record<DifficultyAxis, number>>; emotionalPhase; targetKgNode }`. `generateCandidate(concept, seed, profile) → GenerationResult` (parametric template per archetype family → `LevelDefinition`, proven by strict-parse round-trip); `mutateCandidate(def, rng, profile)`, `combineCandidates(a, b, rng, profile)` — the loop's operators, all schema-valid-by-construction then parse-proven.
5. **Creativity loop (`src/gen/Creativity.ts`).** `evolveLevel(concept, corpus, seed, profile) → EvolutionResult` — REQ-081's cycle: generate → variations → GDOS eval (`evaluateLevel`) → mutate/combine survivors → compare to memory (`noveltyDivergence` vs corpus + prior-art check) → select hybrid → improve → repeat until improvement < `profile.creativity.diminishingReturnsEpsilon` or the hard cap. Selection scoring: gate pass-count, then profile-weighted gate scores + novelty divergence — fully calibrated, zero literals.
6. **Intent gate (`src/gen/IntentGate.ts`).** `verifyIntent(concept, profile) → IntentVerdict` — pass, or a typed denial `{ reason, findings }`.
7. **Pipeline (`src/gen/Pipeline.ts`).** `manufactureLevel(concept, corpus, seed, profile, options) → PipelineOutcome` — the eight REQ-090 phases as a staged pure fold: **1 Concept** (lifecycle blocking check — no Exhausted/Retired mechanic enters), **2 Structural Prototyping** (`generateCandidate` + strict-parse proof), **3 Kinetic Simulation** (P4 stack: `auditSolvability` + `auditJumpRelevance` + softlock/exploit audits via their public seams), **4 AI Council Eval** (`evaluateLevel` → `GdosReport`; REQ-061 IDS regulation is this gate), **5 Targeted Revision** (bounded re-generation against the specific failing gate, budget from profile), **6 Optimization Layering** (expert-route existence — the `/level-design-principle` speedrunner check, via the P4 optimization seam), **7 Sign-off/Intent** (`verifyIntent`), **8 Campaign Integration** (assemble the `LevelRecord`-ready product: `{ def, evidence, report, run, mechanicsExercised, provenance }`). Outcome: `{ accepted: PipelineProduct }` or `{ rejected: PipelineRejection { phase, reason, evidence } }` — every rejection logged, no silent drops.

## Dependencies

M2 VERIFIED (P4+P5+P6 — satisfied). Consumes through public seams only: `evaluateLevel`/`judgeLevel` (dm-0031 — "the single seam the P10 pipeline reads"; P7 is that consumer), `auditSolvability`/`searchReachability(forbidden)` (P4), `probeEmergentFun`, `buildDescriptor`/`noveltyDivergence` (P5 S5.7/S5.9), `CoverageMatrix` + CDRE proposal records (P5), `CampaignReport`/`CampaignAlert` types (P6, read-only per dm-0047), `DesignMemory` store (the one authorized modification, dm-0055), P2 parse discipline for `GenProfile` and generated candidates, `core/Rng` threaded RNG. P8 is independent (no P7↔P8 dependency); P10 consumes everything P7 builds.

## Deliverables (one per slice — see `docs/task_slices.md` Phase 7, restructured)

- **S7.1** Mechanic lifecycle registry + tracker (REQ-082): `DesignMemory.ts` v1.0→v1.1 (typed `MechanicLifecycleEntry` parse/serialize; live ledger migrated idempotently; byte-idempotency suite green), `src/gen/Lifecycle.ts` (nine stages, assess/advance/isBlocked), `src/gen/GenProfile.ts` (v1, strict parse + rejection suite + `DEFAULT_GEN_PROFILE`), `gen/` isolation scans land now. Tests: stage-order/forward-only violations rejected; blocking on Exhaustion/Retirement; ledger round-trip with populated registry; migration idempotency; two-profile lifecycle-threshold test.
- **S7.2** Counterfactual jump-relevance audit (REQ-012 P7 share, dm-0041/dm-0056): `src/eval/local/Counterfactual.ts`. Tests: fixture where the jump is necessary → `jump-necessary`; fixture completable by walking alone → `jump-irrelevant` + no-jump witness replays to completion; tiny node budget → `inconclusive`; determinism (two runs identical).
- **S7.3** PDA opportunity search (REQ-060; REQ-054 applied): `src/gen/Pda.ts`. Tests: dead coverage cells surface as conceptual opportunities; kinetic anchors surface as structural; campaign alerts surface as systemic; blocked mechanics never appear in proposals; REJECTED prior art never re-proposed; deterministic ranking; degrades gracefully on absent inputs; two-profile ranking test.
- **S7.4** Concept model + candidate generator (REQ-090 phases 1–2 substrate; dm-0059): `src/gen/Concept.ts`, `src/gen/Generator.ts`. Tests: every archetype template generates a strict-parse-valid `LevelDefinition`; same `(concept, seed)` ⇒ byte-identical candidate; mutate/combine outputs parse-valid; lifecycle-blocked mechanics rejected at concept validation; two-profile parameter-bounds test.
- **S7.5** Creativity & Iteration loop (REQ-081; REQ-053 applied): `src/gen/Creativity.ts`. Tests: loop terminates by epsilon on a converging fixture and by hard cap on a non-converging one; each iteration's selection is deterministic; novelty divergence measured against the corpus (a clone scores near zero and loses to a divergent variant); improvement is monotonic in the selection metric; two-profile budget/epsilon test.
- **S7.6** Single-sentence intent gate (REQ-091 P7 share): `src/gen/IntentGate.ts`. Tests: rigorous sentence passes; empty/multi-sentence/overlong/lesson-free sentences each denied with a distinct typed reason; two-profile bounds test.
- **S7.7** 8-phase manufacturing pipeline (REQ-090 P7 share; REQ-061 applied; dm-0060): `src/gen/Pipeline.ts`. Tests — **the IRD exit condition**: a fixture concept manufactures end-to-end into a schema-valid level passing P4 solvability + the counterfactual audit + P5 gates, emitting a `LevelRecord`-ready product; a poisoned concept (blocked mechanic / unsolvable geometry / intent failure) is rejected at the correct phase with a logged reason and no product; revision budget exhaustion rejects honestly; `manufactureLevel` deterministic across two runs.
- **S7.8** `docs/verification/P7.md` — per-REQ verification report (dm-0008 discipline); REQ flips per the schedule below; PKG + ledger + task_slices + execution_plan closed; subtractive pass over the P7 modules.

## Validation criteria

- **Determinism:** every `gen/` function is pure over `(inputs, profile, seed)`; no `Math.random`, no `Date.now`, whitelist math, RNG threaded — scan-enforced from S7.1.
- **Data-driven calibration:** zero numeric literals in gen logic; every threshold/weight/budget reaches code through parsed `GenProfile`; two-profile test per calibrated field.
- **Isolation (dm-0057):** nothing outside `gen/` imports `gen/`; `gen/` never imports `gdos/` gate internals, `campaign/` internals, `systems/`, or the engine directly — public evaluation seams only; scans enforce all of it.
- **No placeholder phases:** the pipeline slice lands last among production slices; every phase engine is a finished, separately-tested module before composition.
- **Honest three-way verdicts:** budgeted searches report `inconclusive`/truncation explicitly (counterfactual audit, revision budget) — never a silent pass.
- **Content gate:** every `LevelDefinition` P7 emits exists only inside tests; no content directory, no shipped levels, no chapter authoring (P10).
- **Rejection provenance:** every pipeline rejection carries phase + reason + evidence; deletion means "no product persisted," never "no record."
- **Green build:** `npm test` exits 0; suite grows monotonically from 420; `tsc`/build clean at every slice.

## Checkpoints

- **C7.1** Ledger v1.1 migration green (byte-idempotency held); lifecycle stages enforce forward-only transitions; blocking works; `GenProfile` rejection suite green; `gen/` scans active.
- **C7.2** Counterfactual audit distinguishes jump-necessary from jump-irrelevant fixtures; witness replays; inconclusive honesty proven.
- **C7.3** PDA fuses all five input signals into ranked typed opportunities; blocked/rejected material never proposed.
- **C7.4** Every archetype template round-trips the strict parser; generation is seed-deterministic; operators preserve validity.
- **C7.5** Creativity loop converges by epsilon, halts by cap, beats a clone on novelty, and is deterministic.
- **C7.6** Intent gate passes rigor and denies each failure mode with a distinct typed reason.
- **C7.7** **IRD exit condition:** pipeline manufactures an accepted level end-to-end AND correctly rejects+logs a poisoned concept; deterministic both ways.
- **C7.8** `docs/verification/P7.md` filed; REQ flips per schedule; PKG consistent; subtractive pass run. *(M3 stays open — P8 remains.)*

## Risk register (P7)

| Risk | Mitigation |
|------|------------|
| Ledger v1.1 bump breaks byte-idempotency or the 53 existing decisions. | Refactor protocol: `GdosDesignMemory` suite is the anchor; migration is additive (`schema_version` + empty-tolerant `mechanics` parsing); round-trip asserted on the live file before/after. |
| Counterfactual predicate misreads the jump-lock state machine. | Zero-assumption: `World.ts`/`PlayerControl.ts` jump-lock fields read at S7.2 before the predicate is written; witness-replay test proves the no-jump route actually completes without a jump. |
| Generator drifts into content authoring (M3/P10 gate violation). | Templates emit test-scoped fixtures only; no `levels/` directory; validation criterion + verification-report check. |
| Creativity loop non-termination or hidden nondeterminism. | Double bound (epsilon + hard cap) from `GenProfile`; threaded RNG only; determinism test on the full loop. |
| Pipeline phases coupled to gate internals instead of public seams. | dm-0031's `judgeLevel` seam + audit entry points only; `gen/` scans forbid `gdos/` internal imports. |
| Intent gate degenerates into a vacuous length check. | Denial taxonomy tested per failure mode; rigor bounds calibrated in `GenProfile`; the sentence must name the lesson's decision (structural check on concept fields, not NLP). |
| Lifecycle evidence thresholds invented ad hoc. | All thresholds in `GenProfile` from day one; propose/apply split keeps classification advisory and auditable (dm-0055). |
| PDA re-proposes rejected ideas or blocked mechanics. | `findPriorArt` + `isBlocked` are mandatory filters; tests plant a REJECTED decision and an Exhausted mechanic and assert absence. |

## Open questions (carried into P7 implementation)

1. **Exact jump-lock phase field/values** for the counterfactual predicate — read `World.ts` at S7.2; ledger if the predicate needs anything beyond "phase ≠ spawn value."
2. **Template family size** — how many parametric templates per archetype are needed for the *pipeline* to be verifiable (P10 extends the library later)? Decide at S7.4; minimum one per archetype family, ledger the grouping.
3. **Diminishing-returns metric** — is "improvement" the delta in selection score, best-of-generation, or population mean? Decide at S7.5; semantics documented in `DEFAULT_GEN_PROFILE` jsdoc.
4. **Pipeline product ↔ `LevelRecord` boundary** — `LevelRecord.macroCriteria` is chapter-scoped (P4 macro verdict); a single manufactured level cannot carry it. Decide at S7.7 whether the product exposes a `LevelRecord`-builder given chapter context, or P10 assembles it. (Leaning: product carries everything level-scoped; chapter assembly is P10's.)
5. **Backlog REQ-012 phase column** — currently `P5,P10`; dm-0041 moved the counterfactual share to P7. Update the row to `P5,P7,P10` at S7.2 (exact-string edit, diff-verified).

## Exit condition for P7

All checkpoints C7.1–C7.7 pass; `manufactureLevel` produces a schema-valid level that passes P4 solvability (including the new counterfactual audit) and the P5 gates, or correctly rejects+deletes with a logged reason — deterministically, proven by test (the IRD P7 exit condition); the lifecycle registry blocks exhausted mechanics end-to-end (concept validation and PDA both); the verification report is filed. **M3 does not close at P7** — P8 (Internal Production Tools) is the second M3 pillar.

### Per-REQ `VERIFIED` schedule (four-state discipline)

- **Flip to `VERIFIED` at S7.8** (P7 is the last owning phase): REQ-060 (P7-only), REQ-082 (P5 share was the pinned-empty registry — both shares now delivered), REQ-081 (P5 substrate + P7 loop), REQ-053, REQ-054 (P5 built + P7 applied), REQ-061 (P5 built + P7 applied).
- **Stay `IN_PROGRESS` past S7.8** (owned by later phases): REQ-090, REQ-091 (P10 authors real content through the pipeline/gate), REQ-012 (P10 share remains; phase column updated to `P5,P7,P10` at S7.2).

---
---

# P8 — Internal Production Tools  *(CLOSED — VERIFIED, `docs/verification/P8.md`; authored before S8.1 code per REQ-P02; adversarial review ledgered dm-0065–dm-0070; implementation dm-0071–dm-0074)*

> **CLOSED at S8.7.** All seven slices COMPLETED, 560/560 tests green. The editor authors/playtests/exports a level headlessly and telemetry round-trips into the unmodified `processCampaign` (the IRD exit condition). REQ-133 flipped VERIFIED; REQ-130/131/132 hold a P9 (render/UI) + P11 (release) remainder (dm-0065/dm-0072). `tools/` isolation is scan-enforced (dm-0066/dm-0074); zero changes to `src/eval/` or `src/gen/`. **Milestone M3 — Production Capable is CLOSED** (P7 ✓ + P8 ✓); P10 unlocks. Retained below as the historical record.

## Governing requirements

| Phase | REQs governing the work |
|-------|--------------------------|
| P8 | REQ-130 (P8 share: editor authoring state, live-playtest driver, export — the render/UI share is P9), REQ-131 (P8 share: debug-overlay descriptors + runtime inspection controller — the render/paint share is P9), REQ-132 (P8 share: profiling instrumentation; P11 owns the release-audit share), REQ-133 (owned outright: telemetry capture, death-heatmap, GDOS round-trip), REQ-032 (P8 share: live-collected `BehaviorSignals` as an alternative `analyzeTape` input — P6 already delivered and VERIFIED the derivation logic itself, per dm-0044) |

## Work

Build the **second and final M3 pillar**: the internal tooling that lets a human (or, later, an automated agent) author a level, watch it play, inspect why it failed, measure what it costs, and feed what happened back into the design intelligence P4–P7 already built. P8 does not add gameplay, does not add scoring, and does not author content — it makes the existing, verified engine/eval/gen substrate *operable* by something other than a unit test.

This plan was produced by a first-principles adversarial review of the pre-existing four-slice table (`docs/task_slices.md` Phase 8, authored long before P6/P7 existed), the same treatment every phase since P2 got. The review found one structural gap of the same class P3's missing run-lifecycle slice and P7's phase-ordering finding both were: **the requirements as literally worded presuppose a rendering surface that does not exist yet** — P9 (Rendering, Audio & Visual Grammar) is the *next* phase after P8 in the IRD DAG, not a predecessor. Decisions are ledgered as dm-0065–dm-0070. The table is restructured to seven slices (S8.1–S8.7).

## Adversarial review — findings and upgrades over the naive slice table

1. **The rendering-dependency gap.** REQ-130 says "visual level editor" with tile *painting*; REQ-131 says "*visual* debug overlays" and "automated profiling to monitor *rendering* frame rates." Nothing in `package.json` or `src/` has ever pulled in a canvas/WebGL/DOM dependency — `tools/level_editor/` and `tools/telemetry/` are still `.gitkeep` placeholders — and P9 (where the WebGL renderer and visual grammar are actually built) is scheduled *after* P8. Building "the visual editor" literally, now, would mean silently reaching into P9's scope or shipping a stub UI — both forbidden (no debt/no placeholders; no phase starts early). **Fix (dm-0065): split REQ-130 and REQ-131 into a P8 share and a P9 share, the identical treatment REQ-150 got at P3 (dm-0008 precedent — visual sub-clauses re-scoped, backlog Phase column amended).** P8 delivers every part of REQ-130/131 that is pure logic/data and independently testable via `node --test`: the editor's draft-authoring state machine (paint/place/group/undo-redo as transitions over a `LevelDefinition` draft), the live-playtest driver (an interactive wrapper over the already-proven `Engine`/`StateManager`, not a new simulation), export (already fully built — P2's `serializeLevel`, zero new code), the debug-overlay *descriptors* (hitbox/trigger/path/jump-arc/normal/state as computed geometry and state records, not pixels), and the runtime inspection *controller* (pause/frame-step/variable-manipulation/instant-reload as `StateManager`-safe operations). P9 delivers the presentation share: painting these descriptors to a screen, and turning mouse/keyboard into editor commands. The backlog Phase columns for REQ-130 and REQ-131 are amended from `P8` to `P8,P9` (exact-string edit, diff-verified against exactly those two rows). The IRD's P8 exit wording — "a level can be authored, playtested, and exported through the editor" — is fully satisfiable headlessly: authored (draft state), playtested (deterministic replay drive), exported (`serializeLevel`) all need zero pixels.

2. **Profiling's wall-clock tension with the determinism axiom.** REQ-132 wants frame-rate/timing measurement, but CLAUDE.md's determinism invariant forbids delta-time scaling and the simulation core never reads a wall clock (dm-0003/dm-0004 scope `FIXED_STEP_SECONDS` and immutable-commit discipline to `src/core`/`src/systems`/gameplay state). Read literally, "never introduce delta-time scaling" could be misapplied to block profiling code from reading real time at all. **Decision (dm-0066... see below, split into two): profiling is diagnostic instrumentation, not gameplay logic — it lives in `tools/profiler/`, may read wall-clock time (`performance.now()`/`Date.now()`) freely for reporting, and its output is metadata that never feeds `WorldState`, is never part of a replay-determinism-checked value, and is never consumed by any `src/` module.** This is the same class of scoped exception dm-0017 already established for the transcendental-function ban (scoped to `src/systems/`, not the whole repo) — ledgered explicitly here so a future session does not wrongly block wall-clock reads in tooling.

3. **Telemetry's "death-coordinate heatmap" clause implies a second live-capture path the project's replay culture makes unnecessary.** A naive reading wants the live position stream logged continuously. But every level in this project is already fully reconstructible from `(level, seed, InputFrame tape)` via the P1-proven deterministic replay guarantee — inventing a second, parallel "log raw positions live" path would duplicate that guarantee with an unverified new one. **Decision (dm-0068): telemetry captures only the minimal replayable unit — `{levelId, seed, tape: ReplayTape, outcome}`, exactly the shape `analyzeTape`'s `ArchetypeRun` already expects (dm-0044's data-substitution contract, satisfied with zero new capture surface) — and death coordinates are recovered by deterministically replaying that capture through the existing `Engine`, sampling the player's position at the tick the `defeated` transition fires.** This is also, incidentally, exactly what "input recording for failure analysis" (REQ-133's other clause) already is: the same captured tape, filtered/indexed by `outcome`.

4. **REQ-133's "statistical difficulty spikes" clause is already built — P6 delivered it.** P6's exit condition (`docs/verification/P6.md`) is literally "flags a synthetic difficulty spike": `CampaignDirector.processCampaign` + `ChapterHealth` already derive `CampaignAlert`s (including a difficulty-spike class) from `BehaviorSignals`-bearing `ChapterRecord`s. Building a second spike-detection algorithm in `tools/telemetry/` would duplicate verified P6 logic and create two sources of truth for the same signal. **Decision (dm-0069): P8's sole remaining obligation for the spike clause is data supply — feed live-captured records through the existing `analyzeTape` (dm-0044) → assemble `ChapterRecord`s → `processCampaign` (P6, unmodified) — not build new detection logic.** This is precisely the "data substitution, not a structural change" contract dm-0044 pre-authorized, and precisely why REQ-032's P6 share could already flip `VERIFIED` at P6 close (see the `Note on REQ-032` below) while its P8 share remained real, unbuilt engineering.

5. **Runtime "variable manipulation" is worded like a debugger backdoor, which would violate the immutability axiom if implemented literally.** A live in-place edit of a running `WorldState` snapshot is exactly the "mutate active data buffers in place" the core invariant forbids (dm-0004/dm-0043). **Decision (dm-0070): a debug variable edit is expressed as an explicit state patch, applied the same way any system's output is applied — through `StateManager.commit()` — never a direct field write on a live snapshot.** This keeps debug tooling inside the same single-mutation-point discipline every system already honors; it costs nothing extra since `StateManager` was built generically from S1.6 onward.

6. **`tools/` needs the same one-way isolation discipline `src/eval/` and `src/gen/` got, and needs it from its first TypeScript module, not "eventually."** P4's isolation scan landed at phase start; P7's landed at S7.1 specifically because P6 (dm-0053) found a scan gap that had gone prose-only for four slices — the lesson is to never repeat that gap. **Decision (dm-0066): a `tools/` isolation invariant lands in `directory_structure.md` and gets scan-test enforcement (`test/unit/ToolsIsolation.test.ts`) at S8.1, the first slice to add a `tools/**/*.ts` module** (existing `tools/sdlc/*.js` are plain Node scripts outside `tsconfig.json`'s TS surface and are not part of this rule). The rule: `tools/` consumes `src/gen/` and `src/eval/` only through the exact public entry points their *existing* consumers already use (`evaluateLevel`/`judgeLevel`, the P4 audits, `analyzeTape`, `processCampaign`, `manufactureLevel`, `discoverOpportunities`) — never gate/search internals; nothing under `src/` may ever import `tools/`; `tools/` never modifies `src/gen/` or `src/eval/`.

7. **Alternatives weighed and rejected (dm-0065–dm-0070):** building a minimal renderer inside P8 to satisfy "visual" literally (violates phase gating — P9 is not VERIFIED, and a second ad hoc renderer would conflict with P9's real WebGL/visual-grammar work); treating profiling as forbidden from wall-clock reads (makes REQ-132 unbuildable at all before P9, contradicting the IRD's `P8,P11` phase column which expects P8 to deliver a real share now); a live continuous position-logging telemetry path (duplicates the replay guarantee with a second, unverified mechanism); a new spike-detection algorithm in `tools/telemetry/` (duplicates P6's already-verified `ChapterHealth`/`CampaignAlert` logic — two sources of truth for one signal); a direct-mutation debug variable editor (violates dm-0004/dm-0043 outright).

## Design summary (the compact model the code is written from)

1. **Editor draft state (`tools/level_editor/EditorState.ts`).** An `EditorDraft` wraps a mutable-by-replacement `LevelDefinition`-shaped working copy plus an `UndoStack` of inverse-command pairs. Commands — `paintTile`, `placeEntity` (grid-snapped), `groupEntities`, `ungroup` — are pure functions `(draft, command) => draft′` that also push their inverse onto the stack; `undo`/`redo` pop/replay inverses, never re-derive state by other means. `exportDraft(draft) → Result<LevelDefinition, SchemaError[]>` is a thin call into the existing P2 `parseLevel`/`serializeLevel` pair — the draft is only ever "real" once it round-trips the strict parser, so an invalid draft cannot export.
2. **Live-playtest driver (`tools/level_editor/Playtest.ts`).** `startPlaytest(def, seed) → PlaytestSession` instantiates the existing `Engine`/`StateManager` (zero new simulation code) and exposes `feedInput(frame)`/`currentState()`; this is the same (level, seed, input) → state contract P1's replay guarantee already proves, just driven interactively one frame at a time instead of from a pre-recorded tape.
3. **Debug overlay descriptors (`tools/debug/Overlay.ts`).** Pure functions of `WorldState` (plus, for the jump-arc case, a short forward simulation): `hitboxDescriptors`, `triggerDescriptors`, `pathDescriptors` (tick-sampled positions for movers, reusing the closed-form kinematics dm-0016 already computes), `jumpArcDescriptor` (previews the player's committed trajectory from the current jump-lock state using the same symplectic integrator `PlayerPhysics` already runs — a read-only preview step, never committed to `WorldState`), `normalDescriptors` (from the swept-collision contact data), `physicsStateDescriptor` (grounded/jumpLock phase/runState snapshot). Every descriptor is data (points, rects, enums) — no drawing.
4. **Runtime inspection controller (`tools/debug/Inspector.ts`).** Wraps a `PlaytestSession`: `pause()`/`resume()` gate whether `feedInput` advances the engine; `stepFrame()` advances exactly one tick regardless of pause state; `setVariable(patch)` commits an explicit partial-state patch through `StateManager.commit()` (dm-0070 — never a direct field write); `reload()` calls `instantiateWorld` again (already proven deterministic since P2).
5. **Profiler (`tools/profiler/Profiler.ts`).** `timeSection(label, fn)` wraps a callable with a wall-clock start/end read (`performance.now()`, diagnostic-only per dm-0067), accumulating per-label stats (count, total, mean, max) in a plain record; `countAllocations` style hooks wrap object-creation-heavy calls (e.g., per-tick `WorldState` copies) with a manual counter (no `process.memoryUsage()` dependency — counting is deterministic and portable); `sceneLoadTiming(def)` times `instantiateWorld`. Output is a plain `ProfileReport`, read-only diagnostic data.
6. **Telemetry capture (`tools/telemetry/Capture.ts`).** `recordSession(levelId, seed) → TelemetryRecorder` accumulates `InputFrame`s exactly as they're fed to a `PlaytestSession` (reuses `Playtest.ts`'s driver, no independent capture loop) and finalizes into `{ levelId, seed, tape: ReplayTape, outcome }` on completion/defeat — an `ArchetypeRun`-compatible shape by construction (dm-0044).
7. **Telemetry analysis (`tools/telemetry/DeathHeatmap.ts`, reuse of `TapeAnalyzer`/`CampaignDirector`).** `deriveDeathHeatmap(records, level) → HeatmapReport` deterministically replays each defeat-outcome record through `Engine`, samples the player position at the `defeated` tick, and bins it into a data-driven grid (bin size from a new `TelemetryProfile` or `GenProfile`-style calibration — TBD at S8.6, no literals). `buildChapterRecord(records, profile)` runs each captured record's tape through the *existing*, unmodified `analyzeTape(run, profile) → BehaviorSignals` (P6, dm-0044) and assembles a `ChapterRecord` `processCampaign` already knows how to consume — proving the round-trip into Campaign Intelligence without touching `src/eval/campaign/` (dm-0047's isolation rule holds).

## Note on REQ-032's P6/P8 split

`docs/verification/P6.md` already flipped REQ-032 (`P6,P8` phase column) to `VERIFIED` at P6 close, on the stated rationale that the P6 share (`analyzeTape` deriving all six signatures from an `ArchetypeRun`, zero P8 dependency) is complete and P8's live-collection share was explicitly out of that phase's scope. P8 (S8.5–S8.6) now delivers that outstanding share as real engineering. Per the four-state ledger, REQ-032 does not need a further backlog transition — it is already recorded `VERIFIED` — but the plan records this explicitly so a future audit does not mistake "already VERIFIED" for "nothing left to build." This is not re-litigated or reopened here; P6 stays closed as-is.

## Dependencies

P2 VERIFIED + P3 VERIFIED (satisfied) — the editor/playtest/inspector/profiler need the schema, serializer, and deterministic engine loop. Consumes through public seams only: `Engine`/`StateManager`/`instantiateWorld` (P1/P2), `parseLevel`/`serializeLevel` (P2), `PlayerPhysics`'s closed-form kinematics and swept-collision contact shape (P3, read as data, not re-implemented), `analyzeTape`/`CampaignProfile`/`ChapterRecord`/`processCampaign` (P6, unmodified). P8 does **not** depend on P7 (`src/gen/`) — nothing in this plan needs the PDA, lifecycle, or manufacturing pipeline — and does not depend on P9 (the render/UI share of REQ-130/131 is explicitly deferred there). M3 needs both P7 and P8; they have no dependency on each other.

## Deliverables (one per slice — see `docs/task_slices.md` Phase 8, restructured)

- **S8.1** Editor draft/authoring state + live-playtest driver + export (REQ-130 P8 share): `tools/level_editor/EditorState.ts`, `tools/level_editor/Playtest.ts`. Lands `test/unit/ToolsIsolation.test.ts` (dm-0066) as the first `tools/**/*.ts` scan. Tests: paint/place/group/undo/redo round-trip to the exact prior draft; every command's inverse is itself invertible (redo restores); an invalid draft never exports; a valid draft exports byte-stable via the existing golden-hash discipline; playtest session replays identically to a pre-recorded tape fed through the same `(def, seed)`.
- **S8.2** Debug overlay descriptors (REQ-131 P8 share, part 1): `tools/debug/Overlay.ts`. Tests: one fixture per descriptor kind (hitbox/trigger/path/jump-arc/normal/physics-state); path descriptors match the closed-form mover position at sampled ticks; jump-arc preview never mutates the live `WorldState` (read-only proof); descriptors are plain data (JSON-serializable, no functions).
- **S8.3** Runtime inspection controller (REQ-131 P8 share, part 2): `tools/debug/Inspector.ts`. Tests: pause halts `feedInput` advancement; `stepFrame` advances exactly one tick even while paused; `setVariable` produces a new committed state via `StateManager.commit()` (assert no in-place mutation of the prior snapshot — the existing freeze-on-commit test pattern extends here); reload reinstantiates deterministically.
- **S8.4** Profiling instrumentation (REQ-132 P8 share): `tools/profiler/Profiler.ts`. Tests: `timeSection` records count/total/mean/max correctly over repeated calls; allocation counter increments exactly once per counted call; scene-load timing wraps `instantiateWorld` without altering its return value; profiler output never appears in any `WorldState`/replay-hash path (grep-able isolation check).
- **S8.5** Telemetry capture (REQ-133 part 1): `tools/telemetry/Capture.ts`. Tests: a recorded session's finalized record is `ArchetypeRun`-shape-compatible; capturing reuses `Playtest.ts`'s driver (no second interactive loop); outcome (`completed`/`defeated`/`timeout`) matches the session's actual terminal state; determinism (two capture runs of the same scripted input sequence produce byte-identical records).
- **S8.6** Telemetry analysis + GDOS round-trip (REQ-133 part 2; REQ-032 P8 share; dm-0068/dm-0069): `tools/telemetry/DeathHeatmap.ts` + reuse of `analyzeTape`/`processCampaign`. Tests — **the IRD P8 exit condition, second half**: a captured defeat record's heatmap bin matches the position obtained by direct replay-and-inspect of the same `(level, seed, tape)`; a set of captured records assembled into a `ChapterRecord` and run through the unmodified `processCampaign` produces the same shape of `CampaignReport`/`CampaignAlert` P6's own fixtures produce (proving the round-trip); zero modifications to any file under `src/eval/campaign/` (isolation scan extends).
- **S8.7** `docs/verification/P8.md` — per-REQ verification report (dm-0008 discipline); REQ flips per the schedule below; **M3 — Production Capable CLOSES** (P7 ✓ + P8 ✓); subtractive pass over the ten P8 modules; PKG + ledger + task_slices + execution_plan closed; handoff points at P9.

## Validation criteria

- **No rendering creep:** nothing in `tools/level_editor/`, `tools/debug/`, or `tools/profiler/` imports a canvas/DOM/WebGL API; every descriptor/state object is plain data (grep-able + a structural check).
- **Isolation (dm-0066):** `tools/` consumes `src/gen/`/`src/eval/` only through named public entry points; nothing under `src/` imports `tools/`; `test/unit/ToolsIsolation.test.ts` enforces both directions from S8.1 onward.
- **Immutability held under debug tooling (dm-0070):** every `Inspector.setVariable` call is a `StateManager.commit()`, never a direct mutation; the existing freeze-on-commit assertion catches a regression.
- **Determinism (REQ-121 inheritance):** playtest driving, capture, and replay-derived heatmapping are all proven byte-identical across two runs of the same scripted input.
- **Diagnostic/gameplay boundary (dm-0067):** wall-clock reads exist only inside `tools/profiler/`; `src/core|systems|components|entities|schema|eval|gen` remain scan-clean of `Date.now`/`performance.now`.
- **Reuse over reinvention (dm-0068/dm-0069):** death coordinates are replay-derived, not live-logged; difficulty-spike detection is P6's `processCampaign`, not a new algorithm — both are validation criteria checked at S8.6, not just design notes.
- **Content gate:** nothing in P8 authors a `LevelDefinition` as shipped content; every fixture is test-scoped.
- **Green build:** `npm test` exits 0; suite grows monotonically from 498; `tsc`/build clean at every slice.

## Checkpoints

- **C8.1** Editor draft commands + undo/redo round-trip green; export gated on strict-parse validity; `ToolsIsolation` scan active.
- **C8.2** All six overlay descriptor kinds correct against fixtures; jump-arc preview proven read-only.
- **C8.3** Inspector pause/step/reload correct; `setVariable` proven to go through `StateManager.commit()`, never in-place.
- **C8.4** Profiler timing/allocation/scene-load stats correct; wall-clock-use confined to `tools/profiler/`.
- **C8.5** Capture produces `ArchetypeRun`-shape-compatible records; reuses the S8.1 driver; deterministic.
- **C8.6** **IRD P8 exit condition, second half:** heatmap-vs-direct-replay agreement; captured records round-trip into `processCampaign` producing P6-shaped output; `campaign/` untouched.
- **C8.7** `docs/verification/P8.md` filed; REQ flips per schedule; PKG consistent; subtractive pass run. **M3 — Production Capable CLOSES.**

## Risk register (P8)

| Risk | Mitigation |
|------|------------|
| "Visual" requirements get built literally, reaching into P9's rendering scope or shipping a stub UI. | dm-0065 explicitly splits each REQ's P8/P9 share; backlog Phase columns amended to `P8,P9`; validation criterion scans for canvas/DOM/WebGL imports. |
| Profiling's wall-clock reads get flagged as a determinism violation (or, conversely, the determinism rule gets weakened to allow wall-clock into gameplay code). | dm-0067 scopes the exception precisely to `tools/profiler/`; a scan checks `Date.now`/`performance.now` never appear in `src/core|systems|components|entities|schema|eval|gen`. |
| A second, unverified live-position-logging path is built for heatmaps, diverging from the replay guarantee over time. | dm-0068: heatmaps are always replay-derived from the same minimal capture; no parallel position stream exists to diverge. |
| Telemetry reinvents difficulty-spike detection, creating two sources of truth. | dm-0069: S8.6's validation criterion requires reuse of `processCampaign` verbatim; test asserts zero diff against P6 fixtures' alert shape. |
| Debug variable manipulation becomes a mutation backdoor that breaks replay integrity elsewhere. | dm-0070: `Inspector.setVariable` is contractually a `StateManager.commit()`; the existing freeze-on-commit test extends to catch a regression. |
| `tools/` quietly starts modifying `src/gen/` or `src/eval/` "just this once" (e.g., to expose an internal helper the editor wants). | `ToolsIsolation` scan test from S8.1; PKG dependency direction checked at S8.7. |

## Open questions (carried into P8 implementation)

1. **Heatmap bin-size calibration home** — a new `TelemetryProfile` (a fourth versioned calibration schema, following `ScoringProfile`/`CampaignProfile`/`GenProfile`) or an extension of `CampaignProfile`. Decide at S8.6; lean toward a new profile (telemetry calibration is P8-owned, not P6-owned — mirrors why `GenProfile` was kept separate at dm-0057 rather than extending `CampaignProfile`).
2. **Editor draft persistence format** — is a draft-in-progress (not yet exported) ever serialized to disk between editor sessions, or is it purely in-memory until export? Decide at S8.1; leaning in-memory-only for P8 (disk persistence of *drafts*, as opposed to exported levels, is not named by any REQ).
3. **Jump-arc preview's relationship to P4's optimization-window solver** — the preview at S8.2 is a single forward simulation from the current state; whether it should also expose the P4 speedrunner-route preview is a P9/P10 UI question, not a P8 data-layer requirement. Noted, not built.
4. **Asset-delivery-speed profiling clause** — REQ-132 names it, but no asset pipeline exists before P9. Treat as a P9-share addendum (same pattern as dm-0065), noted here so S8.4's verification report doesn't silently claim full REQ-132 coverage.

## Exit condition for P8

All checkpoints C8.1–C8.7 pass; a level can be authored (draft state), playtested (interactive engine drive), and exported (strict-parse-valid `LevelDefinition`) entirely headlessly; debug-overlay descriptors and the inspection controller are correct and immutability-safe; profiling instrumentation is accurate and scope-confined; telemetry captures round-trip into `processCampaign` producing real `CampaignReport` output, proven against P6's own fixtures; the verification report is filed. **Milestone M3 — Production Capable CLOSES** (P7 ✓ + P8 ✓). Only then does **P9 — Rendering, Audio & Visual Grammar** open — which also inherits the deferred P8/P9 shares of REQ-130/131/132 (dm-0065) as part of its own governing-requirements list.

### Per-REQ `VERIFIED` schedule (four-state discipline)

- **Flip to `VERIFIED` at S8.7:** REQ-133 (P8-only, fully delivered).
- **Stay `IN_PROGRESS` past S8.7** (P8 delivers a share; P9/P11 owns the remainder): REQ-130, REQ-131 (P9 render/UI share remains — phase column is `P8,P9`), REQ-132 (P9 asset-pipeline share + P11 release-audit share remain — phase column is `P8,P9,P11` after S8.4 amends it from `P8,P11`).
- **No transition needed:** REQ-032 (already `VERIFIED` at P6 close per the note above; P8 delivers its documented outstanding share as real engineering, not as a re-flip).

---
---

# P9 — Rendering, Audio & Visual Grammar  *(IN FLIGHT — authored before S9.1 code per REQ-P02; adversarial review ledgered dm-0075–dm-0079)*

> Milestone **M4 — Presentable** (P9 is its sole phase). Entry conditions satisfied: M3 CLOSED (P7 ✓ + P8 ✓), 560/560 tests green at open, pkg_hash `s8-c8f3a2` confirmed. This is the **first phase in the project's history to introduce a rendering surface** — everything before it is headless by construction, and everything before it must *stay* headless when this phase closes.

## Governing requirements

| Phase | REQs governing the work |
|-------|--------------------------|
| P9 | REQ-070, REQ-071 (visual grammar as a data-driven style system — owned outright), REQ-161 (P9 share: object-pooling framework; P11 audits), REQ-162 (P9 share: render batching + render-side spatial partitioning; P3 built the sim quadtree; P11 audits), REQ-163 (P9 share: async asset delivery + dynamic quality scale-back; P11 hardens), REQ-170 (P9 share: WebGL/WebAudio interface + Poki SDK lifecycle hooks; P11 finalizes), REQ-171 (P9 share: responsive scaling; P11 finalizes), REQ-150 (P9 share: the visual sub-clauses — anticipation frames, squash-and-stretch, particle burst, camera tracking; P3 delivered the physics share), REQ-016 (P9 share: failure information always visually present; P5 delivered the gate, P10 applies to content), REQ-001 (P9 share: first-30-seconds presentation on Poki), REQ-002 (P9 share: no long loads / no text-heavy tutorial *surface*), REQ-130 + REQ-131 (P9 share: render the P8 editor draft state + debug-overlay descriptors, per dm-0065), REQ-132 (P9 share: asset-delivery-speed profiling, per dm-0072) |

## Work

Build the **presentation layer** over the verified headless stack: a WebGL2 renderer (batching, pooling, culling), procedural WebAudio, the six-category visual grammar as a versioned data schema, the app shell (fixed-step loop + responsive scaling + Poki SDK lifecycle), the editor/debug UI over P8's plain-data substrate, and the dynamic quality scale-back controller. P9 adds **zero gameplay, zero scoring, zero content** — it is a pure projection of already-verified state onto screen and speakers, and the projection never feeds back.

This plan was produced by a first-principles adversarial review of the pre-existing seven-slice table (`docs/task_slices.md` Phase 9, authored long before P6/P7/P8 existed), the same treatment every phase since P2 got. The review found one architectural decision the naive table never makes (where rendering *lives*), one structural omission (the inherited P8/P9 shares appear in no slice), and one ordering inversion (renderer before grammar — backwards for a data-driven project). Decisions are ledgered as dm-0075–dm-0079. The table is restructured to ten slices (S9.1–S9.10).

## Adversarial review — findings and upgrades over the naive slice table

1. **The render↔tools direction (the handoff's explicit open question).** The naive table never says where rendering lives. Every existing home is forbidden: `src/` cannot import `tools/` (dm-0066 one-way rule), so an editor UI under `src/` could not read the `EditorDraft`/descriptor types it must render; `tools/` is scan-forbidden from canvas/DOM/WebGL (dm-0065, `ToolsIsolation.test.ts`) and retrofitting rendering there would break the split that let P8 close honestly. **Fix (dm-0075): a new top-level `render/` subtree, one-way-isolated at the TOP of the dependency chain.** `render/` may import `src/` (through the same public seams every other consumer uses) and `tools/` (as a typed library — descriptors, editor state, profiler); **nothing under `src/` or `tools/` may ever import `render/`**. A `RenderIsolation.test.ts` scan lands at S9.1, the first slice to add a `render/**/*.ts` module — the dm-0053 lesson (never let an isolation rule go prose-only) applied proactively, fourth subtree in a row. `directory_structure.md` gains the subtree + invariant at S9.1.
2. **The naive table silently drops P9's inherited shares.** REQ-130/131 (render the editor + overlays, dm-0065) and REQ-132 (asset-delivery-speed profiling, dm-0072) appear in **no** naive slice, and neither do REQ-150's visual sub-clauses (P3,P9 column since dm-0008), REQ-016's visual share, or REQ-001/002 — all of which the IRD assigns to P9. Left as-is, S9.7 would have filed a verification report that either falsely claimed them or stranded them. **Fix: explicit slices — S9.6 (asset pipeline + delivery profiling), S9.8 (editor/debug UI), S9.4 (game feel + fairness visuals) — and REQ-001/002/171 folded into the shell slice S9.7 where they factually land.**
3. **Data-driven order inversion.** The naive table builds the WebGL renderer (S9.1) *before* the visual grammar (S9.3), guaranteeing the renderer invents ad hoc colors/shapes that the grammar must then retrofit — the exact "gameplay values hardcoded in logic" anti-pattern the axioms forbid, in visual form. It also makes S9.4 (WebAudio) depend on the WebGL renderer, which it does not need at all. **Fix: the `StyleProfile` schema is S9.1 — the grammar is *data* the renderer consumes from its first line.** Audio (S9.5) depends on the StyleProfile + observable state transitions, not on WebGL. **The visual grammar is the fifth versioned calibration/definition schema** (after `ScoringProfile`/`CampaignProfile`/`GenProfile`/`TelemetryProfile`), with the same strict-parse discipline (dm-0077). REQ-070's "mixing signatures strictly prohibited" becomes a *validator rule*, not a convention: an entity/mechanic resolves to exactly one of the six categories, all four signature channels (palette/silhouette/motion/audio) come from that one category, and the parser rejects any profile or level-binding that cross-wires them.
4. **Real time vs. the determinism axiom.** A render loop needs `requestAnimationFrame` and wall-clock deltas, but dm-0067 scopes wall-clock reads to `tools/profiler/` only, and the axiom forbids real time influencing a tick. **Fix (dm-0076): the exception extends to the render layer with a precise contract — real time enters simulation *only* as the `realDeltaSeconds` argument of the P1-designed `Clock.advance` seam (which banks it into whole fixed steps), and is otherwise confined to `render/platform/` + frame-time diagnostics. Rendering is a pure projection `(state, previousState, interpolationAlpha, StyleProfile, viewport) → DrawList`; nothing computed by the renderer is ever written into `WorldState` or any replay-checked value.** `interpolationAlpha` (P1, `src/core/Clock.ts`) is read-only smoothing between fixed steps, exactly as designed. The wall-clock scan amends from "only `tools/profiler/`" to "only `tools/profiler/` + `render/`", with `src/` remaining scan-clean.
5. **Headless verifiability of a browser-facing layer.** The DoD requires `node --test` proof and no browser exists in the test loop. **Fix (dm-0078): hexagonal device seams.** Every render-layer module is pure logic written against injected interfaces — `Gl2Device` (a minimal, explicitly-enumerated subset of `WebGL2RenderingContext`), `AudioDevice` (subset of `AudioContext`), `AssetFetcher` (fetch-like), `PortalSdk`, `FrameScheduler` (rAF-like) — with hand-rolled recording fakes in tests (the established project culture: no jsdom, no headless-gl, no mocking framework). The only code that touches real browser globals is thin binding modules under `render/platform/` (context creation, rAF, script-tag SDK global, fullscreen API), which contain no logic beyond construction and are the *only* files allowed to name browser globals — scan-enforced. Browser smoke-testing rides P11's build pipeline (open question 3).
6. **Audio signatures without inventing a binary-asset authoring pipeline.** REQ-071 demands a per-category audio signature but zero audio assets exist and P9 authoring `.wav`/`.ogg` content would smuggle asset production into a rendering phase. **Fix (dm-0077): audio signatures are procedural synthesis patches defined as data in the `StyleProfile`** (oscillator/noise type, frequency envelope, gain envelope, duration) compiled to a WebAudio node graph by the executor. `AudioCue`s are derived from *observable state transitions* (jump start, defeat, goal, checkpoint, surface contact) — the same read-only projection discipline as the visual side. Zero binary assets in P9; if P10 content wants sample-based audio it flows through the same S9.6 manifest pipeline later.
7. **Poki SDK — current official approach, verified 2026-07-11 against sdk.poki.com.** The SDK loads exclusively from Poki's CDN (`https://game-cdn.poki.com/scripts/v2/poki-sdk.js` — they push updates server-side; bundling it is not the supported path), exposing a `PokiSDK` global: `init(): Promise` → `gameLoadingFinished()` → `gameplayStart()`/`gameplayStop()` → `commercialBreak(onStart?): Promise` / `rewardedBreak(opts?): Promise<boolean>`. Hard requirements: **audio and keyboard input disabled during breaks**, and **spacebar/arrow-key default scroll prevented**. **Implementation: a typed `PortalSdk` interface with a `NullPortalSdk` (dev/test) and a `PokiPortalSdk` adapter binding the CDN global; the ad-break flow contractually wraps audio-mute + input-suspend and is test-proven against a fake.** The official npm typed wrapper `@poki/sdk@0.0.4` (Poki-maintained, June 2026) was weighed and **rejected**: it is a pre-1.0 (0.x) forwarder around the very global we must wrap behind an injected interface anyway — it would add a bundled runtime dependency for ~40 lines of ambient types we author against the documented surface (dm-0078). 
8. **Package policy (dm-0038 continuation) — re-verified at plan time (2026-07-11) against registry.npmjs.org:** `typescript` 7.0.2 and `@types/node` 26.1.1 are the exact latest stable releases; both already pinned. **P9 adds zero new npm dependencies, runtime or dev** — raw WebGL2/WebAudio (both in `lib: ["DOM"]`, already in tsconfig), hand-rolled fakes, CDN-loaded Poki SDK. This is a deliberate choice, not an omission: every candidate dependency (jsdom, headless-gl, pixi/three, @poki/sdk) was weighed and rejected in dm-0078 with reasons.
9. **Advanced techniques — adopt what the REQs name, architect the seams for what P11 needs, build nothing speculative.** Adopted (dm-0079): single-draw-call sprite **batching** keyed by `(atlas, blendMode)`; **persistent static VBOs** for tilemap/background geometry uploaded once per level load; **WebGL2 instanced rendering** (`drawArraysInstanced`) for dynamic quads/particles; **texture-atlas regions as manifest data**; **viewport culling** through the P3 `SpatialPartition` quadtree consumed read-only (REQ-162's own wording — reuse, not a second tree); **fixed-step interpolation** via `interpolationAlpha`; **generation-counted object pools** (REQ-161) sized from profile data; **hysteresis + cooldown quality-tier controller** over a frame-time EMA (REQ-163), tiers as data. Weighed and rejected: a WebGPU backend (REQ-170 names WebGL; the portal long-tail runs hardware/browsers where WebGL2 is the honest baseline in mid-2026; the `Gl2Device` seam means a future backend is additive, not a rewrite), a WebGL1 fallback (WebGL2 is universal on evergreen browsers in 2026 — a fallback would be permanently-dead code), dirty-rect partial redraw (bookkeeping costs more than a batched full-frame redraw at this entity scale). **Fairness × quality interlock:** the scale-back controller is *forbidden from degrading grammar-critical signatures* — REQ-016 says failure information is always visually present, so every `DrawList` item carries a `critical` flag derived from its grammar category (Danger is always critical) and the tier controller may only drop non-critical items. This cross-REQ interlock is a validation criterion, not a convention.

## Design summary (the compact model the code is written from)

1. **`StyleProfile` (`render/style/StyleProfile.ts`)** — versioned, strict-parsed data: six `GrammarCategory` entries (`safe`, `danger`, `interactive`, `temporary`, `optimization`, `secret`), each holding `palette` (fill/outline/accent colors), `silhouette` (shape family + corner treatment), `motion` (idle/active animation params: amplitude, period in ticks), `audio` (procedural patch: waveform, freq/gain envelopes, duration), and `critical: boolean` (danger is always critical). A `categoryBindings` map resolves entity archetype/behavior kind → exactly one category; the validator rejects unknown categories, unbound archetypes, cross-category signature overrides, and any profile where danger is non-critical. `DEFAULT_STYLE_PROFILE` ships complete.
2. **Scene compiler (`render/scene/SceneCompiler.ts`, `render/scene/Camera.ts`)** — pure: `compileScene(state, previous, alpha, profile, viewport) → DrawList`. Interpolates transforms between the previous and current snapshots by `alpha`; resolves every visible entity through the grammar (one category → all four signatures); culls to the camera's world-space AABB via the P3 quadtree (read-only); emits plain-data draw items (sprite quads, tile ranges, particle batches) each tagged `critical` per its category. The camera is presentation state owned by the render layer (position smoothing toward the player), never written back.
3. **GL executor + batcher (`render/gl/Gl2Device.ts`, `render/gl/Batcher.ts`, `render/gl/GlRenderer.ts`)** — `Gl2Device` is the minimal typed subset of `WebGL2RenderingContext` the project uses (enumerated, documented); `Batcher` folds a `DrawList` into (a) persistent static buffers keyed by level identity and (b) per-frame instanced dynamic buffers grouped by `(atlas, blend)`, minimizing draw calls; `GlRenderer` replays batches against the device. Tests drive a recording `FakeGl2` and assert call-sequence + buffer contents.
4. **Pools (`render/pool/Pool.ts`, `render/pool/ParticlePool.ts`)** — generic fixed-capacity, generation-counted pool (REQ-161: particles, visual impacts, projectiles); acquiring recycles the oldest-free slot, stale handles are detected by generation mismatch; capacities come from profile data, not literals.
5. **Game feel (`render/feel/`)** — anticipation frames, squash-and-stretch, jump particle burst, landing impact (REQ-150 visual sub-clauses) computed as pure functions of observable state transitions (jump-lock phase changes, grounded transitions) and emitted as DrawList modifiers/pool spawns; the defeat marker (REQ-016) renders the death cause at the defeat position — always `critical`.
6. **Audio (`render/audio/`)** — `AudioDevice` seam; `deriveAudioCues(previous, current) → AudioCue[]` (pure, transition-driven); `PatchCompiler` turns a category's procedural patch into a node-graph plan; the executor schedules it. A master gain seam exposes `muteForBreak()`/`resume()` for the ad flow.
7. **Assets (`render/assets/`)** — manifest schema (strict-parsed): entries with `id`, `url`, `kind` (`atlas-image`, `atlas-regions`, `style-profile`, later `audio-sample`), `priority` (`critical` | `deferred`), `bytes`. `AssetLoader` over `AssetFetcher`: critical-tier loads gate first render; deferred tier streams after; progress events feed the shell's loading UI and `gameLoadingFinished`; per-asset delivery timing (bytes / elapsed via injected clock) feeds a `DeliveryReport` — REQ-132's P9 share, same diagnostic-only contract as dm-0067.
8. **Shell (`render/shell/`, `render/platform/`)** — `GameShell` owns the loop: `FrameScheduler` tick → `Clock.advance(clockState, realDelta)` → N × `Engine` fixed steps → `compileScene(...)` → `GlRenderer.draw` + audio cues; `ViewportModel` (pure) maps window size/DPR/fullscreen state to canvas size + world-to-screen transform with letterboxing (REQ-171); `InputCapture` maps key/pointer events to the existing `InputFrame` shape and prevents spacebar/arrow default scroll; `PortalSdk` lifecycle: `init` → loader progress → `gameLoadingFinished` → `gameplayStart` on first input / `gameplayStop` on defeat/goal → `commercialBreak` wrapping mute + input-suspend. `render/platform/` holds the only browser-global bindings (canvas context, rAF, `PokiSDK` global, fullscreen).
9. **Editor/debug UI (`render/tooling/`)** — `paintOverlays(descriptors…) → DrawList` for all six P8 descriptor kinds (hitbox/trigger/path/jump-arc/normal/physics-state); `EditorSurface`: `LevelDraft → DrawList` (grid, entities, selection) + `mapEditorInput(pointer/key events) → EditorCommand` feeding P8's `applyCommand`/`undo`/`redo` unchanged; inspector bindings expose pause/step/reload/variable-edit as UI commands calling P8's `Inspector` verbatim. `render/tooling/` is the *sanctioned* place that imports `tools/` types (dm-0075) — the game shell does not.
10. **Quality controller (`render/quality/`)** — pure: frame-time EMA over shell-reported frame durations; tier ladder from profile data (e.g. full → reduced-particles → no-deferred-decoration), transitions guarded by hysteresis thresholds + cooldown ticks; `applyTier(drawList, tier)` may drop only `critical: false` items (the REQ-016 interlock); scale-*up* re-tests upward after a stability window. Verified under synthetic load (scripted frame-time sequences) — the IRD exit condition.

## Dependencies

P1/P2/P3 VERIFIED (engine loop, schema, physics/quadtree), P8 VERIFIED (descriptors, editor state, inspector, profiler, telemetry) — all satisfied. Consumes through public seams only: `Engine`/`StateManager`/`createInitialState`/`Clock.advance`/`interpolationAlpha`/`FIXED_STEP_SECONDS` (P1), `parseLevel`/`serializeLevel` + `instantiateWorld` (P2), `SpatialPartition` queries + jump-lock/grounded fields read-only (P3), `CANONICAL_PIPELINE` (P4 seam), `EditorDraft`/`applyCommand`/`undo`/`redo`/`exportDraft`/`startPlaytest` + `Overlay` descriptors + `Inspector` + `Profiler` (P8). P9 does **not** touch `src/eval/` internals, `src/gen/`, or `src/eval/campaign/` — it has no reason to. P9 does not depend on P10/P11.

## Deliverables (one per slice — see `docs/task_slices.md` Phase 9, restructured)

- **S9.1** Render-layer substrate + visual-grammar schema (REQ-070, REQ-071 data share): `render/style/StyleProfile.ts` (+ `DEFAULT_STYLE_PROFILE`), `render/` subtree bootstrap, `test/unit/RenderIsolation.test.ts` (dm-0075 one-way scans + browser-global confinement + wall-clock scope amendment), `directory_structure.md` updated. Tests: strict-parse accept/reject suites (unknown category, unbound archetype, cross-category mix, non-critical danger), profile version round-trip, scans green.
- **S9.2** Scene compiler + camera + culling (REQ-070/071 applied; REQ-162 render-side partitioning; REQ-150 camera share): `render/scene/SceneCompiler.ts`, `render/scene/Camera.ts`. Tests: interpolation correctness at α∈{0,½,1}; every emitted item's four signatures trace to exactly one category; culling excludes out-of-view entities (quadtree-backed) and never culls `critical` items inside the view; camera smoothing never mutates `WorldState`; DrawList is plain data (JSON-serializable).
- **S9.3** WebGL2 executor + batching + pooling (REQ-161; REQ-162 batching; REQ-170 WebGL share): `render/gl/Gl2Device.ts`, `render/gl/Batcher.ts`, `render/gl/GlRenderer.ts`, `render/pool/Pool.ts`, `render/pool/ParticlePool.ts`. Tests: batcher groups by (atlas, blend) with expected draw-call count; static geometry uploads once across frames (FakeGl2 records); instanced buffers carry per-instance transforms; pool acquire/release/generation-stale/double-release; capacities from data.
- **S9.4** Game feel + fairness visuals (REQ-150 visual sub-clauses; REQ-016 visual share): `render/feel/*.ts`. Tests: anticipation frames appear between jump-intent and liftoff ticks; squash/stretch scales derive from velocity transitions and return to identity; particle burst spawns exactly-once per jump via the pool; defeat marker present at the defeat position and flagged `critical`.
- **S9.5** WebAudio signatures (REQ-071 audio share; REQ-170 WebAudio share): `render/audio/*.ts`. Tests: cue derivation fires exactly-once per transition (jump/defeat/goal/checkpoint); each category's patch compiles to the expected node-graph plan against `FakeAudioDevice`; mute/resume gates scheduling; cue derivation is a pure function (same transitions ⇒ same cues).
- **S9.6** Asset manifest + async delivery + delivery profiling (REQ-163 async share; REQ-132 P9 share; REQ-002): `render/assets/*.ts`. Tests: manifest strict-parse accept/reject; critical tier gates readiness, deferred tier streams after; progress monotonically reaches 1; delivery-speed report correct against a scripted fake fetcher+clock; failure of a deferred asset degrades (skips) without blocking readiness; failure of a critical asset surfaces a typed error.
- **S9.7** App shell + responsive scaling + Poki SDK (REQ-170, REQ-171, REQ-001, REQ-002): `render/shell/*.ts`, `render/platform/*.ts`. Tests: scripted real-time deltas drive exactly the fixed-step counts P1's Clock mandates (sim state bit-identical to a headless run fed the same InputFrames — the projection-purity proof); ViewportModel letterbox/fit/DPR/fullscreen cases; InputCapture maps keys→InputFrame and flags default-prevention for space/arrows; `NullPortalSdk` + fake `PokiSDK` global: init→loadingFinished ordering, gameplayStart/Stop on the right transitions, commercialBreak wraps mute+input-suspend and restores after.
- **S9.8** Editor + debug-overlay UI (REQ-130 P9 share; REQ-131 P9 share — flips both VERIFIED at S9.10): `render/tooling/*.ts`. Tests: each of the six descriptor kinds paints to expected DrawList geometry; editor surface renders grid/draft/selection; pointer/key mapping produces the exact P8 `EditorCommand`s (paint, snapped place, group, undo/redo) — P8 modules imported verbatim, zero modification (scan holds); inspector UI commands call P8 `Inspector` semantics (pause halts, step advances one tick, variable edit commits via `StateManager.commit`).
- **S9.9** Dynamic quality scale-back (REQ-163): `render/quality/*.ts`. Tests — **the IRD exit condition**: synthetic frame-time sequences drive tier transitions with hysteresis (no oscillation at the boundary) and cooldown respected; `applyTier` never drops a `critical` item (REQ-016 interlock); scale-up returns after stability; tiers/thresholds parsed from profile data, no literals.
- **S9.10** `docs/verification/P9.md` — per-REQ verification report (dm-0008 discipline); REQ flips per the schedule below; **M4 — Presentable CLOSES**; subtractive pass over the P9 modules; PKG + ledger + task_slices + execution_plan closed; handoff points at P10.

## Validation criteria

- **Isolation (dm-0075):** nothing under `src/` or `tools/` imports `render/`; `render/` imports `src/`/`tools/` only through the named public seams; `render/tooling/` is the only `render/` area importing `tools/`; enforced by `test/unit/RenderIsolation.test.ts` from S9.1.
- **Projection purity (dm-0076):** rendering never writes into `WorldState`/`GameState`; the shell's sim advance is bit-identical to a headless run given the same InputFrames (test-proven at S9.7); browser globals (`document`, `window`, `requestAnimationFrame`, `WebGL2RenderingContext`, `AudioContext`, `PokiSDK`) appear only under `render/platform/`; wall-clock reads confined to `tools/profiler/` + `render/` (scan amended, `src/` stays clean).
- **Grammar integrity (REQ-070/071):** every rendered entity resolves through exactly one category; all four signature channels come from that category; the mixing prohibition is parser-rejected, not reviewed-for.
- **Fairness × quality interlock (REQ-016 × REQ-163):** `critical` items survive every quality tier; danger category is structurally always-critical.
- **Determinism:** cue derivation, scene compilation, batching, pooling, viewport math, and the tier controller are all pure functions with repeat-run identity tests; no `Math.random`, no unthreaded time.
- **Package policy (dm-0038/dm-0078):** zero new npm dependencies; `typescript` 7.0.2 / `@types/node` 26.1.1 re-verified latest stable at plan time (2026-07-11); Poki SDK via official CDN script only.
- **No content creep:** every level fixture is test-scoped; no `levels/` directory; P10 stays closed during P9.
- **Green build:** `npm test` exits 0; suite grows monotonically from 560; `tsc`/build clean at every slice.

## Checkpoints

- **C9.1** StyleProfile strict-parse suites green; six categories complete in `DEFAULT_STYLE_PROFILE`; render isolation + browser-global + wall-clock scans active.
- **C9.2** Scene compiler emits grammar-faithful, interpolated, culled, plain-data DrawLists; camera proven read-only.
- **C9.3** Batcher/executor call-sequences verified on FakeGl2 (static-upload-once, instanced dynamics, expected draw-call counts); pools generation-safe.
- **C9.4** Game-feel modifiers + defeat marker correct and transition-driven; REQ-150 visual sub-clauses demonstrably present.
- **C9.5** Audio cues exactly-once per transition; per-category patches compile to expected node plans; break-mute gates scheduling.
- **C9.6** Asset tiers gate/stream correctly; delivery report accurate; REQ-132 P9 share delivered.
- **C9.7** Shell fixed-step fidelity proven (projection purity); viewport/fullscreen/DPR cases green; Poki lifecycle ordering + break gating proven against fakes.
- **C9.8** All six descriptor kinds + editor surface + inspector bindings render/map correctly with P8 modules unmodified.
- **C9.9** **IRD exit condition:** dynamic scale-back verified under synthetic load; hysteresis stable; critical items never dropped.
- **C9.10** `docs/verification/P9.md` filed; REQ flips per schedule; PKG consistent; subtractive pass run. **M4 — Presentable CLOSES.**

## Risk register (P9)

| Risk | Mitigation |
|------|------------|
| Rendering leaks back into simulation (camera, feel, or quality state written into `WorldState`). | dm-0076 projection-purity contract; S9.7 bit-identity test vs. headless run; render-layer state lives in render-layer records only. |
| `render/` quietly imports `tools/` internals everywhere, or `src/`/`tools/` starts importing `render/`. | `RenderIsolation.test.ts` from S9.1: one-way rules + the `render/tooling/`-only tools-import confinement. |
| FakeGl2/FakeAudio drift from real browser semantics, making tests pass while the browser fails. | Device interfaces are minimal *enumerated* subsets (every method used is listed and documented); executor tests assert call *sequences*, not just counts; real-browser smoke deferred to P11's build pipeline explicitly (open question 3), not silently assumed covered. |
| Grammar mixing creeps in via per-entity overrides ("just this once, a safe-colored spike"). | REQ-070's prohibition is a parser rejection; scene compiler resolves signatures only via the category; tests plant a cross-wired profile and assert rejection. |
| Quality scale-back deletes fairness-critical visuals under load. | `critical` flag derived from category (danger always); `applyTier` structurally cannot drop critical items; tested. |
| Ad break leaves audio/keyboard live (Poki compliance failure). | `commercialBreak` flow contractually wraps `muteForBreak` + input-suspend; ordering test against fake SDK. |
| Wall-clock reads spread into `src/` under rendering pressure. | Scan amended, not removed: `src/` remains clean; only `tools/profiler/` + `render/` may read time; sim entry is `Clock.advance` alone. |
| Pool handles outlive recycling (stale particle writes). | Generation counters; stale-handle and double-release tests. |
| The Poki CDN script changes surface under us (server-pushed updates). | Adapter binds the *documented* v2 lifecycle only; `PortalSdk` seam isolates the blast radius to one file; `NullPortalSdk` keeps the game fully functional without the SDK (also Poki's recommended local-dev mode). |

## Open questions (carried into P9 implementation)

1. **Atlas image sourcing in P9** — the manifest schema and loader land at S9.6, but P9 ships procedural/solid-color quads (grammar palettes) rather than authored texture art; whether any placeholder atlas *image* is needed at all before P10 content, decide at S9.6 (leaning: regions-over-a-generated-1×1-white-texture, tinted per palette — zero binary assets, fully data-driven).
2. **HUD/tutorial surface scope** — REQ-002 forbids text-heavy tutorials; P9 ships the rendering *primitives* (text-free iconography slots in the DrawList) and P10 decides content presentation. Decide the minimal HUD item set at S9.7.
3. **Browser smoke harness timing** — a real-browser (Playwright-class) smoke test naturally belongs to P11's automated build pipeline (REQ-172); P9 relies on the enumerated-subset device seams + fakes. Confirm at P11 planning; noted so S9.10's report doesn't overclaim.
4. **Render-side quadtree reuse vs. copy** — S9.2 should consume `SpatialPartition` read-only per REQ-162's wording; if its query API turns out sim-coupled (e.g., collision-class filtering the renderer shouldn't know), decide between a thin query wrapper in `render/scene/` vs. a PKG-visible shared seam. Decide at S9.2 after reading `SpatialPartition.ts` (zero-assumption).
5. **Fullscreen transition ownership** — Poki embeds handle fullscreen differently across portals; `ViewportModel` treats fullscreen as an input bit. Whether the shell ever *requests* fullscreen (vs. only reacting) — decide at S9.7 against Poki's embed behavior; leaning react-only.

## Exit condition for P9

All checkpoints C9.1–C9.9 pass; a data-defined level renders through the six-category grammar at the fixed-step/interpolated loop with batching, pooling, and culling in place; audio signatures fire per category; the editor and debug overlays render P8's substrate with P8 modules unmodified; assets stream async with measured delivery speeds; the Poki lifecycle is proven against fakes with break gating; **dynamic quality scale-back is verified under synthetic load (the IRD exit condition)**; `docs/verification/P9.md` is filed. **Milestone M4 — Presentable CLOSES.** P10 — Content Generation opens (already unlocked by M3, sequenced after P9 in the DAG).

### Per-REQ `VERIFIED` schedule (four-state discipline)

- **Flip to `VERIFIED` at S9.10:** REQ-070, REQ-071 (P9-only, fully delivered); REQ-130, REQ-131 (P8 logic/data share ✓ + P9 render/UI share — both shares then delivered); REQ-150 (P3 physics share ✓ + P9 visual share — both shares then delivered).
- **Stay `IN_PROGRESS` past S9.10** (P9 delivers a share; later phases own the remainder): REQ-161, REQ-162, REQ-163 (P11 zero-allocation/release audits), REQ-170, REQ-171 (P11 release hardening), REQ-132 (P11 release-audit share), REQ-016 (P10 applies to authored content), REQ-001 (P11 ship share), REQ-002 (P10 content share).
- **No transition needed:** REQ-032, REQ-133 (already `VERIFIED`; P9 touches neither).
