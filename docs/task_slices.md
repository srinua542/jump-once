# Jump Once — Task Slices

Session-sized, dependency-ordered work units. Each slice is small enough to complete and verify within a single working session, traces to one or more REQ ids in [requirements_backlog.md](requirements_backlog.md), and declares explicit acceptance criteria so it can reach the `VERIFIED` state unambiguously.

**Slice states** mirror the backlog: `NOT_STARTED · IN_PROGRESS · COMPLETED · VERIFIED`.
**Convention:** `Sx.y` = phase `x`, slice `y`. A slice may not start until every slice in its `Depends` list is `COMPLETED` (or `VERIFIED` where noted).

---

## Phase 0 — Governance & Protocol Infrastructure

| Slice | Title | REQs | Depends | Acceptance criteria | State |
|-------|-------|------|---------|---------------------|-------|
| S0.1 | Toolchain + build/test harness | REQ-P02, REQ-121 | — | `package.json`, `tsconfig.json`, `.npmrc` present; `npx tsc` runs; `npm test` wired to `node --test dist/test/`. | COMPLETED |
| S0.2 | Directory structure per skill spec | REQ-P09 | S0.1 | `src/{core,systems,components,entities}`, `test/{unit,integration}`, `tools/`, `docs/`, `meta/` exist and match `directory_structure.md`. | IN_PROGRESS |
| S0.3 | PRD requirements backlog (four-state) | REQ-P01 | — | Every PRD section mapped to REQ ids with a state; rollup table present. | COMPLETED |
| S0.4 | Implementation Roadmap (IRD) | REQ-P02 | S0.3 | Phase DAG, gates, milestones, ordering-reconciliation documented. | COMPLETED |
| S0.5 | Task slices (this document) | REQ-P01 | S0.4 | Every phase has slices with REQs + acceptance criteria. | COMPLETED |
| S0.6 | Active-phase execution plan | REQ-P02 | S0.4 | `execution_plan.md` covers P0+P1 work, validation criteria, checkpoints. | COMPLETED |
| S0.7 | Project Knowledge Graph seeded | REQ-P03 | S0.2 | `meta/project_knowledge_graph.json` lists every existing module as a node with deps/dependents/gdos_alignment. | COMPLETED |
| S0.8 | Design Memory ledger seeded | REQ-P05, REQ-051, REQ-111 | — | `meta/design_memory_ledger.json` records Session-1 decisions with full Intent Repository fields. | COMPLETED |
| S0.9 | Session-1 handoff snapshot | REQ-P04 | S0.7 | `meta/handoff_latest.json` valid against schema; names exact resume point. | COMPLETED |
| S0.10 | Reboot lifecycle dry-run doc | REQ-P06 | S0.9 | `docs/session_protocol.md` documents the start-of-session sequence future sessions execute. | NOT_STARTED |

## Phase 1 — Deterministic Core Architecture

| Slice | Title | REQs | Depends | Acceptance criteria | State |
|-------|-------|------|---------|---------------------|-------|
| S1.1 | `Vec2` encapsulated geometry | REQ-P09, REQ-120 | S0.1 | Immutable ops; unit tests cover algebra + no-mutation. | IN_PROGRESS |
| S1.2 | `Rng` deterministic PRNG | REQ-P08 | S0.1 | Same seed → same sequence; state threaded, no globals; tests. | IN_PROGRESS |
| S1.3 | `Clock` fixed-timestep accumulator | REQ-121, REQ-160 | S0.1 | Fixed step constant; accumulator banks correctly; spiral-of-death clamp; tests. | IN_PROGRESS |
| S1.4 | `State` immutable root + `InputFrame` | REQ-120, REQ-P10 | S1.1–S1.3 | Generic over world; readonly; neutral input defined. | IN_PROGRESS |
| S1.5 | `System` contract | REQ-154, REQ-P09 | S1.4 | Pure `step(state)=>state` interface; documented isolation. | IN_PROGRESS |
| S1.6 | `StateManager` single source of truth | REQ-P10 | S1.4 | Only mutation point; prev/current; optional deep-freeze; tests prove immutability + idempotent commit. | IN_PROGRESS |
| S1.7 | `Engine` Read→Process→Emit loop | REQ-121, REQ-160 | S1.3, S1.5, S1.6 | Runs N fixed steps per tick via Clock; pipes systems; advances tick; zero-alloc-aware. | COMPLETED |
| S1.8 | Core unit tests | REQ-P02 | S1.1–S1.7 | `test/unit/` covers every core module; `npm test` green. | NOT_STARTED |
| S1.9 | Deterministic replay integration test | REQ-121 | S1.7, S1.8 | Same (seed, input-tape) → identical final state hash across two runs. | NOT_STARTED |
| S1.10 | Phase-1 verification report | REQ-P02, REQ-P07 | S1.9 | `docs/verification/P1.md` maps each P1 REQ to its passing test. | NOT_STARTED |

## Phase 2 — Data Models & Level Definition Schema

| Slice | Title | REQs | Depends | Acceptance criteria | State |
|-------|-------|------|---------|---------------------|-------|
| S2.1 | Component data structures (§16 entities as pure data) | REQ-120, REQ-154 | S1.10 | `src/components/*` are logic-free records; typecheck clean. | NOT_STARTED |
| S2.2 | Level Definition Schema types | REQ-122, REQ-014 | S2.1 | Tilemap, entities, constraints, triggers + GDOS metadata block typed. | NOT_STARTED |
| S2.3 | Level loader + structural validator | REQ-122 | S2.2 | Rejects malformed payloads with precise errors; accepts valid. | NOT_STARTED |
| S2.4 | Sample level fixture + round-trip test | REQ-122 | S2.3 | Hand-authored level parses, validates, serializes losslessly. | NOT_STARTED |
| S2.5 | Phase-2 verification report | REQ-P02 | S2.4 | `docs/verification/P2.md`. | NOT_STARTED |

## Phase 3 — Mechanic Library & Deterministic Physics

| Slice | Title | REQs | Depends | Acceptance criteria | State |
|-------|-------|------|---------|---------------------|-------|
| S3.1 | Deterministic physics/integration system | REQ-003, REQ-160 | S2.5 | Fixed-step integration; AABB collision; reproducible trajectory. | NOT_STARTED |
| S3.2 | Spatial partition (quadtree) for collision | REQ-162 | S3.1 | Only-neighborhood queries; equivalence test vs brute force. | NOT_STARTED |
| S3.3 | Player controller: instant accel/decel | REQ-150, REQ-003 | S3.1 | Horizontal control curves; grounded detection. | NOT_STARTED |
| S3.4 | **Single-jump lock** state machine | REQ-004, REQ-010, REQ-011, REQ-150 | S3.3 | Jump consumable exactly once; locks to horizontal-only; only scene reload refreshes; property test: never >1 jump under fuzzed input. | NOT_STARTED |
| S3.5 | Environmental elements | REQ-151 | S3.1 | Static, moving (linear/looping/triggered), collapsing, ice — data-driven; isolated tests. | NOT_STARTED |
| S3.6 | Hazards + triggers | REQ-152 | S3.1 | Spikes/lasers/moving hazards → defeat; plates/proximity/doors mutate layout. | NOT_STARTED |
| S3.7 | Kinetic modifiers | REQ-153 | S3.4 | Springs/gravity/conveyors alter velocity without consuming jump (asserted). | NOT_STARTED |
| S3.8 | Phase-3 verification report | REQ-P02 | S3.4–S3.7 | `docs/verification/P3.md`; one-jump invariant proven. | NOT_STARTED |

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
| S8.1 | Visual level editor (paint/snap/group/undo-redo/playtest) | REQ-130 | S3.8, S2.5 | NOT_STARTED |
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

1. **S1.7** — `Engine` Read→Process→Emit loop.
2. **S1.8** — core unit tests for every module in `src/core`.
3. **S1.9** — deterministic replay integration test.
4. **S1.10** — Phase-1 verification report, then flip P1 REQs to `VERIFIED`.
5. **S0.10** — session protocol doc (can be done anytime).

Only after S1.10 verifies does M0 close and P2 open.
