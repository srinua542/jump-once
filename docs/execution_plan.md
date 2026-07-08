# Jump Once — Execution Plan: P0 + P1 (M0 — Foundation Locked)

**Status: CLOSED — M0 is VERIFIED, see `docs/verification/P1.md`.** Retained as the historical record of the P0+P1 plan and its checkpoints. The active phase is now **P2 — Data Models & Level Definition Schema**; its execution plan is authored at the start of S2.1, per the Directive's per-phase planning requirement (REQ-P02).

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
