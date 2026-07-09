# Jump Once — Task Slices

Session-sized, dependency-ordered work units. Each slice is small enough to complete and verify within a single working session, traces to one or more REQ ids in [requirements_backlog.md](requirements_backlog.md), and declares explicit acceptance criteria so it can reach the `VERIFIED` state unambiguously.

**Slice states** mirror the backlog: `NOT_STARTED · IN_PROGRESS · COMPLETED · VERIFIED`.
**Convention:** `Sx.y` = phase `x`, slice `y`. A slice may not start until every slice in its `Depends` list is `COMPLETED` (or `VERIFIED` where noted).

---

## Phase 0 — Governance & Protocol Infrastructure

| Slice | Title | REQs | Depends | Acceptance criteria | State |
|-------|-------|------|---------|---------------------|-------|
| S0.1 | Toolchain + build/test harness | REQ-P02, REQ-121 | — | `package.json`, `tsconfig.json`, `.npmrc` present; `npx tsc` runs; `npm test` wired to `node --test dist/test/`. | COMPLETED |
| S0.2 | Directory structure per skill spec | REQ-P09 | S0.1 | `src/{core,systems,components,entities}`, `test/{unit,integration}`, `tools/`, `docs/`, `meta/` exist and match `directory_structure.md`. | COMPLETED |
| S0.3 | PRD requirements backlog (four-state) | REQ-P01 | — | Every PRD section mapped to REQ ids with a state; rollup table present. | COMPLETED |
| S0.4 | Implementation Roadmap (IRD) | REQ-P02 | S0.3 | Phase DAG, gates, milestones, ordering-reconciliation documented. | COMPLETED |
| S0.5 | Task slices (this document) | REQ-P01 | S0.4 | Every phase has slices with REQs + acceptance criteria. | COMPLETED |
| S0.6 | Active-phase execution plan | REQ-P02 | S0.4 | `execution_plan.md` covers P0+P1 work, validation criteria, checkpoints. | COMPLETED |
| S0.7 | Project Knowledge Graph seeded | REQ-P03 | S0.2 | `meta/project_knowledge_graph.json` lists every existing module as a node with deps/dependents/gdos_alignment. | COMPLETED |
| S0.8 | Design Memory ledger seeded | REQ-P05, REQ-051, REQ-111 | — | `meta/design_memory_ledger.json` records Session-1 decisions with full Intent Repository fields. | COMPLETED |
| S0.9 | Session-1 handoff snapshot | REQ-P04 | S0.7 | `meta/handoff_latest.json` valid against schema; names exact resume point. | COMPLETED |
| S0.10 | Reboot lifecycle dry-run doc | REQ-P06 | S0.9 | `docs/session_protocol.md` documents the start-of-session sequence future sessions execute. | COMPLETED |

## Phase 1 — Deterministic Core Architecture

| Slice | Title | REQs | Depends | Acceptance criteria | State |
|-------|-------|------|---------|---------------------|-------|
| S1.1 | `Vec2` encapsulated geometry | REQ-P09, REQ-120 | S0.1 | Immutable ops; unit tests cover algebra + no-mutation. | COMPLETED |
| S1.2 | `Rng` deterministic PRNG | REQ-P08 | S0.1 | Same seed → same sequence; state threaded, no globals; tests. | COMPLETED |
| S1.3 | `Clock` fixed-timestep accumulator | REQ-121, REQ-160 | S0.1 | Fixed step constant; accumulator banks correctly; spiral-of-death clamp; tests. | COMPLETED |
| S1.4 | `State` immutable root + `InputFrame` | REQ-120, REQ-P10 | S1.1–S1.3 | Generic over world; readonly; neutral input defined. | COMPLETED |
| S1.5 | `System` contract | REQ-154, REQ-P09 | S1.4 | Pure `step(state)=>state` interface; documented isolation. | COMPLETED |
| S1.6 | `StateManager` single source of truth | REQ-P10 | S1.4 | Only mutation point; prev/current; optional deep-freeze; tests prove immutability + idempotent commit. | COMPLETED |
| S1.7 | `Engine` Read→Process→Emit loop | REQ-121, REQ-160 | S1.3, S1.5, S1.6 | Runs N fixed steps per tick via Clock; pipes systems; advances tick; zero-alloc-aware. | COMPLETED |
| S1.8 | Core unit tests | REQ-P02 | S1.1–S1.7 | `test/unit/` covers every core module; `npm test` green. | COMPLETED |
| S1.9 | Deterministic replay integration test | REQ-121 | S1.7, S1.8 | Same (seed, input-tape) → identical final state hash across two runs. | COMPLETED |
| S1.10 | Phase-1 verification report | REQ-P02, REQ-P07 | S1.9 | `docs/verification/P1.md` maps each P1 REQ to its passing test. | COMPLETED |

## Phase 2 — Data Models & Level Definition Schema

> Table restructured at S2.1 start per the P2 execution plan (adversarial architecture review; decisions dm-0009–dm-0012). S2.1–S2.4 keep their original ids; **S2.5 (world instantiation) is new** — it supplies the runtime-consumption evidence REQ-120/121 completion requires; the verification report moved to S2.6.

| Slice | Title | REQs | Depends | Acceptance criteria | State |
|-------|-------|------|---------|---------------------|-------|
| S2.1 | Component data structures (§16 entities as pure data): `EntityId` brand, `TransformDef`, `AabbDef`, `EntityKind`, per-kind `BehaviorDef` payloads | REQ-120, REQ-154 | S1.10 | `src/components/*.ts` export only types/interfaces/const records; automated scan test fails on any function body under `src/components/`; `tsc` clean; every record constructible + deep-freezable in a unit test. | COMPLETED |
| S2.2 | Level Definition Schema types + canonical serializer (`schemaVersion`, `levelId` + title, GDOS block, flat-array tilemap + `width/height/tileSize` with closed collision-relevant tile-kind set, entities, constraints, closed trigger union); types in `src/components/`, `serializeLevel()` in `src/schema/` (dm-0013); coordinate convention decided + ledgered | REQ-122, REQ-014 | S2.1 | Schema types compile; S2.1 scan test still green (no function bodies entered `src/components/`); `serializeLevel()` byte-identical across repeated calls on equal values (fixed key order); `docs/level_schema.md` documents every field, coordinate convention, versioning policy (dm-0010/dm-0014), axiom boundary (dm-0011), tile-semantics scope (visuals deferred to P9). | COMPLETED |
| S2.3 | Level loader + structural validator in `src/schema/` — `parseLevel(raw: unknown): Result<LevelDefinition, SchemaError[]>` (parse-don't-validate, only construction path) | REQ-122, REQ-120 | S2.2 | Rejects with path-qualified error **+ dedicated failing-fixture test each**: wrong `schemaVersion`, non-finite number, unknown/extra key at any path (strict, dm-0014), tilemap length ≠ `width×height`, non-positive `width`/`height`/`tileSize`, unknown tile id, unknown entity/trigger kind, duplicate `EntityId`, dangling trigger reference, spawn/goal out of bounds, non-increasing emotional-curve keyframes, value outside [0,100]; normalizes `-0`; accepts valid payload as typed value; seeded fuzz test (`src/core/Rng`-driven mutations of a valid payload) always yields a `Result` error or valid value — never a throw, never a false accept. | COMPLETED |
| S2.4 | Sample level fixture + round-trip test (hand-authored, `test/fixtures/` — schema scaffolding, not P10 content) | REQ-122 | S2.3 | Fixture coverage asserted programmatically by iterating the closed kind lists (every entity kind, trigger kind, tile kind, full GDOS block present); `deepEqual(parse(serialize(v)), v)`; `serialize(parse(serialize(v))) === serialize(v)` byte-identical; canonical serialization matches a committed golden hash (dm-0014). | COMPLETED |
| S2.5 | `WorldState` + deterministic level instantiation — `instantiateWorld(def, …)` in `src/entities/`; frozen `LevelDefinition` reference-shared into state | REQ-120, REQ-121 | S2.3, S2.4 | Same (def, seed) → deep-equal `WorldState` twice; Engine runs N ticks over instantiated world; replay test extended: (fixture file, seed, input tape) → identical final-state hash across two runs; `state.world.level === def` after N ticks (never copied). | COMPLETED |
| S2.6 | Phase-2 verification report | REQ-P02 | S2.5 | `docs/verification/P2.md` maps each P2 REQ to its passing test; REQ-120/121/122/014 re-audited per dm-0008 (REQ-154 stays open — full scope closes in P3); subtractive pass over new modules recorded; PKG hash bumped + consistent. | COMPLETED |

## Phase 3 — Mechanic Library & Deterministic Physics

> Table restructured at S3.1 start per the P3 execution plan (adversarial review; decisions dm-0016–dm-0019). Two gaps closed: **S3.4 (run lifecycle) is new** — goal/defeat/scene-reload had no owner, yet REQ-010/011's "refresh only on reload" is untestable without it; input-system ownership is resolved by decision (controller consumes `state.input`; live capture → P9, replay tapes → P4 — dm-0019). Jump lock moved S3.4→S3.5; env/hazards/kinetic shifted to S3.6–S3.8; verification report → S3.9. Dependencies tightened (riding/plates need the controller, not just physics).

| Slice | Title | REQs | Depends | Acceptance criteria | State |
|-------|-------|------|---------|---------------------|-------|
| S3.1 | Deterministic physics & collision core | REQ-003, REQ-160 | S2.6 | `src/components/Tuning.ts` pure-data tuning record; `WorldState` physics fields (PKG-recorded); semi-implicit Euler at fixed step; **swept, axis-separated** AABB-vs-tilemap resolution + solid-entity collision; grounding; no-tunneling property test at ≥spring velocities; trajectory replay bit-identical; no transcendental fn in `src/systems/` (dm-0017). | COMPLETED |
| S3.2 | Spatial partition (quadtree) for collision | REQ-162 | S3.1 | Deterministic build (fixed insertion order/capacity/depth); only-neighborhood queries; equivalence-vs-brute-force under seeded fuzz. | COMPLETED |
| S3.3 | Player controller: instant accel/decel | REQ-150, REQ-003 | S3.1 | Consumes `state.input` (`InputFrame`) — the P3 input boundary (dm-0019); instant horizontal accel/decel from Tuning; grounded detection; replay assertion. | COMPLETED |
| S3.4 | Run lifecycle: goal, defeat, instant scene reload | REQ-003 | S3.1, S3.3 | Goal overlap → `completed`; `defeated` → next-tick pure re-instantiation (attemptCount+1, same frozen level ref); `resetPressed` honored; reload determinism proven by replay. | COMPLETED |
| S3.5 | **Single-jump lock** state machine (the axiom) | REQ-004, REQ-010, REQ-011, REQ-150 | S3.3, S3.4 | Anticipation ticks → single impulse → locked (horizontal-only); lock state lives in `WorldState` so reload-refresh holds by construction (dm-0018); property test: never >1 jump per life under fuzzed input tapes. | COMPLETED |
| S3.6 | Environmental elements | REQ-151 | S3.1, S3.3 | Tick-parametric (closed-form, dm-0016) moving platforms (linear/looping/triggered) + platform carry (incl. platform-into-wall); collapsing floors; frictionless ice — data-driven; isolated tests. | COMPLETED |
| S3.7 | Hazards + triggers | REQ-152 | S3.4, S3.6 | Spikes/lasers (pure fn of tick)/moving hazards → defeat via **swept** lethal check; plates/proximity/doors execute the closed trigger-action union in authored order; layering test ≥3 mechanics. | NOT_STARTED |
| S3.8 | Kinetic modifiers | REQ-153 | S3.5 | Springs/gravity zones/conveyors alter velocity/inertia; lock state bit-identical before/after (never consumes jump — asserted). | NOT_STARTED |
| S3.9 | Phase-3 verification report | REQ-P02 | S3.5–S3.8 | `docs/verification/P3.md`; one-jump invariant proven across full library; M1 exit items (subtractive pass, compliance audit, save-persistence ownership → P9/REQ-171). | NOT_STARTED |

## Phase 4 — Evaluation & Validation Framework

| Slice | Title | REQs | Depends | Acceptance criteria | State |
|-------|-------|------|---------|---------------------|-------|
| S4.1 | Agent-archetype simulator harness | REQ-141 | S3.8 | Five archetypes drive the deterministic sim headlessly. | NOT_STARTED |
| S4.2 | Solvability audit (exactly-one-jump) | REQ-141 | S4.1 | Classifies solvable/unsolvable fixtures; flags multi-jump requirement. | NOT_STARTED |
| S4.3 | Softlock detection | REQ-141 | S4.1 | Detects dead zones (can neither die nor reach goal). | NOT_STARTED |
| S4.4 | Exploit filtration | REQ-141 | S4.1 | Detects boundary path-skips bypassing hazards. | NOT_STARTED |
| S4.5 | Optimization windows + five-tier routing + delta | REQ-101, REQ-102 | S4.2 | Computes Discovery→WR routes; rejects minimal-delta layouts. | NOT_STARTED |
| S4.6 | Macro curriculum validation (4 criteria) | REQ-140, REQ-142 | S4.2 | Audits chapter fixtures for the four macro criteria. | NOT_STARTED |
| S4.7 | Phase-4 verification report | REQ-P02 | S4.2–S4.6 | `docs/verification/P4.md`. | NOT_STARTED |

## Phase 5 — GDOS Scoring Engine

| Slice | Title | REQs | Depends | State |
|-------|-------|------|---------|-------|
| S5.1 | Design-space coverage matrix + economy metric | REQ-040, REQ-041, REQ-042 | S4.7 | NOT_STARTED |
| S5.2 | Emotional-threshold gates | REQ-055 | S4.7 | NOT_STARTED |
| S5.3 | Streamability matrix | REQ-056 | S4.7 | NOT_STARTED |
| S5.4 | Information Density regulator | REQ-061 | S4.7 | NOT_STARTED |
| S5.5 | Novelty search + Emergent Fun search | REQ-053, REQ-054 | S5.1 | NOT_STARTED |
| S5.6 | CDRE self-improving loop | REQ-052 | S5.1–S5.5 | NOT_STARTED |
| S5.7 | Kill Switch + First-Party filter + Subtractive Removal engine | REQ-020, REQ-021, REQ-022 | S5.2 | NOT_STARTED |
| S5.8 | Design Memory + Intent Repository (executable) | REQ-050, REQ-051, REQ-111 | S5.1 | NOT_STARTED |
| S5.9 | Phase-5 verification report | REQ-P02 | S5.1–S5.8 | NOT_STARTED |

## Phase 6 — Campaign Intelligence

| Slice | Title | REQs | Depends | State |
|-------|-------|------|---------|-------|
| S6.1 | Ten macro state variables (data model) | REQ-030, REQ-031 | S5.9 | NOT_STARTED |
| S6.2 | Player knowledge + behavior models | REQ-032 | S6.1 | NOT_STARTED |
| S6.3 | Retention/curiosity/chapter-health analytics | REQ-031, REQ-142 | S6.1 | NOT_STARTED |
| S6.4 | Phase-6 verification report | REQ-P02 | S6.1–S6.3 | NOT_STARTED |

## Phase 7 — PDA & Procedural Generation + Lifecycle

| Slice | Title | REQs | Depends | State |
|-------|-------|------|---------|-------|
| S7.1 | Mechanic 9-stage lifecycle tracker | REQ-082 | S6.4 | NOT_STARTED |
| S7.2 | PDA opportunity search | REQ-060 | S7.1 | NOT_STARTED |
| S7.3 | Creativity/iteration evolutionary loop | REQ-081 | S7.2 | NOT_STARTED |
| S7.4 | 8-phase level manufacturing pipeline | REQ-090 | S7.2 | NOT_STARTED |
| S7.5 | Single-sentence intent verification gate | REQ-091 | S7.4 | NOT_STARTED |
| S7.6 | Phase-7 verification report | REQ-P02 | S7.4–S7.5 | NOT_STARTED |

## Phase 8 — Internal Production Tools

| Slice | Title | REQs | Depends | State |
|-------|-------|------|---------|-------|
| S8.1 | Visual level editor (paint/snap/group/undo-redo/playtest) | REQ-130 | S3.8, S2.6 | NOT_STARTED |
| S8.2 | Debug overlays + runtime inspection | REQ-131 | S3.8 | NOT_STARTED |
| S8.3 | Profiling instrumentation | REQ-132 | S3.8 | NOT_STARTED |
| S8.4 | Telemetry → GDOS pipeline | REQ-133 | S6.4 | NOT_STARTED |
| S8.5 | Phase-8 verification report | REQ-P02 | S8.1–S8.4 | NOT_STARTED |

## Phase 9 — Rendering, Audio & Visual Grammar

| Slice | Title | REQs | Depends | State |
|-------|-------|------|---------|-------|
| S9.1 | WebGL renderer + batching | REQ-162, REQ-170 | S3.8 | NOT_STARTED |
| S9.2 | Object pooling framework | REQ-161 | S9.1 | NOT_STARTED |
| S9.3 | Visual grammar style system (6 categories) | REQ-070, REQ-071 | S9.1 | NOT_STARTED |
| S9.4 | WebAudio signatures | REQ-071 | S9.1 | NOT_STARTED |
| S9.5 | Responsive scaling + SDK lifecycle hooks | REQ-170, REQ-171 | S9.1 | NOT_STARTED |
| S9.6 | Dynamic quality scale-back | REQ-163 | S9.2 | NOT_STARTED |
| S9.7 | Phase-9 verification report | REQ-P02 | S9.1–S9.6 | NOT_STARTED |

## Phase 10 — Content Generation

| Slice | Title | REQs | Depends | State |
|-------|-------|------|---------|-------|
| S10.1 | Chapter architecture authoring (7-step) | REQ-083 | S7.6, M2 VERIFIED | NOT_STARTED |
| S10.2 | Dual-path level generation | REQ-100, REQ-005 | S10.1 | NOT_STARTED |
| S10.3 | Campaign assembly + macro validation | REQ-013, REQ-015 | S10.2 | NOT_STARTED |
| S10.4 | Phase-10 verification report | REQ-P02 | S10.3 | NOT_STARTED |

## Phase 11 — Optimization, Build Pipeline & Ship

| Slice | Title | REQs | Depends | State |
|-------|-------|------|---------|-------|
| S11.1 | Zero-allocation runtime audit | REQ-160 | S9.7 | NOT_STARTED |
| S11.2 | Automated build pipeline (compile+assets+validate+package) | REQ-172 | S10.4 | NOT_STARTED |
| S11.3 | Final PRD compliance audit | REQ-173, REQ-P07 | S11.2 | NOT_STARTED |
| S11.4 | Release sign-off | REQ-173 | S11.3 | NOT_STARTED |

---

## Next-session pick-list (top of queue)

**P2 — Data Models & Level Definition Schema is VERIFIED** (`docs/verification/P2.md`); all six P2 slices COMPLETED, 118/118 tests green. P3 — Mechanic Library & Deterministic Physics is now the active phase.

1. **S3.1** — Deterministic physics & collision core (P3 execution-plan section authored ✓).
2. **S3.2** — Spatial partition (quadtree) for collision.
3. **S3.3** — Player controller: instant accel/decel.
4. **S3.4** — Run lifecycle: goal, defeat, instant scene reload.
5. **S3.5** — **Single-jump lock** state machine (the game's axiom, REQ-004).
6. **S3.6–S3.8** — Environmental elements, hazards + triggers, kinetic modifiers.
7. **S3.9** — Phase-3 verification report (closes M1).
