# Jump Once — Execution Plan

This document holds one section per phase, authored *before* that phase's implementation code (REQ-P02).

- **P0 + P1 (M0 — Foundation Locked): CLOSED.** M0 is VERIFIED, see `docs/verification/P1.md`. Retained below as the historical record.
- **P2 — Data Models & Level Definition Schema: CLOSED — VERIFIED**, see `docs/verification/P2.md`. Checkpoints C2.1–C2.6 all passed (118/118 tests). Retained below as the historical record.
- **P3 — Mechanic Library & Deterministic Physics: CLOSED — VERIFIED**, see `docs/verification/P3.md`. Authored at S3.1 start via adversarial review (dm-0016–dm-0021; table restructured to S3.1–S3.9). All checkpoints C3.1–C3.9 passed (186/186 tests). **Milestone M1 — Simulatable Game CLOSED.**
- **P4 — Evaluation & Validation Framework: CLOSED — VERIFIED**, see `docs/verification/P4.md`. Section authored at S4.1 start per REQ-P02 via the same adversarial review P2/P3 got (dm-0022–dm-0029). All seven slices S4.1–S4.7 ran the nine-stage SDLC loop (archives in `meta/runs/S4.*`); checkpoints C4.1–C4.7 passed (241/241 tests). **Milestone M2 remains OPEN** — P5 + P6 still required before the content gate opens.
- **P5 — GDOS Scoring Engine: CLOSED — VERIFIED**, see `docs/verification/P5.md`. Section below authored before S5.1 code per REQ-P02, via a first-principles adversarial review of the original slice table (dm-0031–dm-0035; table restructured — Design Memory moved ahead of the Kill Switch and CDRE). All nine slices S5.1–S5.9 ran the SDLC loop (archives in `meta/runs/S5.*`); checkpoints C5.1–C5.9 passed (336/336 tests). Implementation decisions dm-0036–dm-0042. **Milestone M2 remains OPEN** — P6 still required before the content gate opens.

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
