# Jump Once — Execution Plan

This document holds one section per phase, authored *before* that phase's implementation code (REQ-P02).

- **P0 + P1 (M0 — Foundation Locked): CLOSED.** M0 is VERIFIED, see `docs/verification/P1.md`. Retained below as the historical record.
- **P2 — Data Models & Level Definition Schema: CLOSED — VERIFIED**, see `docs/verification/P2.md`. Checkpoints C2.1–C2.6 all passed (118/118 tests). Retained below as the historical record.
- **P3 — Mechanic Library & Deterministic Physics: IN FLIGHT.** Section authored at S3.1 start, before any P3 code (REQ-P02), via adversarial review of the original S3.1–S3.8 slice table (decisions dm-0016–dm-0019; table restructured to S3.1–S3.9).

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

# P3 — Mechanic Library & Deterministic Physics  *(IN FLIGHT; authored at S3.1 start per REQ-P02)*

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

- **C3.1** Physics core lands; no-tunneling + trajectory replay green. ✅*(pending)*
- **C3.2** Quadtree equivalence green.
- **C3.3** Controller consumes real `InputFrame`s; instant accel/decel proven.
- **C3.4** Lifecycle: defeat→instant reload→fresh world; goal→completed; deterministic across replays.
- **C3.5** Single-jump lock fuzz property green — the axiom holds.
- **C3.6–C3.8** Mechanic library complete, each isolated + layered tests green.
- **C3.9** `docs/verification/P3.md` filed; P3 REQs flipped per dm-0008; PKG consistent; subtractive pass recorded; **M1 — Simulatable Game closes.**

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
