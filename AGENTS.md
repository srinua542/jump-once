# Jump Once — Project Operating Instructions

This repo is **Jump Once**, a long-horizon (multi-month) 2D one-jump puzzle-platformer built under a strict engineering protocol. This file is loaded into context every session. **Read it before doing anything — even a one-line change.**

## ⛔ Before ANY work — run the Reboot Lifecycle

No matter how small the task looks, do this first:

1. **Invoke the `/jump-once-protocol` skill** (governance: schemas, architecture, context rules). When you're about to actually *do* a task — implement, fix, refactor, test, advance a slice — also invoke **`/jump-once-task`**, which drives one task slice end-to-end through the nine-stage SDLC loop and the Definition of Done.
2. **Read `meta/handoff_latest.json`** — the exact resume point, blockers, and critical warnings from the last session.
3. **Parse `meta/project_knowledge_graph.json`** — rebuild the dependency/architecture model. Confirm its `pkg_hash` matches the handoff's `pkg_hash_at_handoff`; if not, the graph drifted — reconcile first.
4. **Run `npm test`** — if anything is red, fix the regression before writing any new code.

A "small unrelated task" is exactly the case that causes drift. Do not skip this.

## Non-negotiable invariants

- **Zero-assumption:** never guess how an unread file/API behaves — open it first.
- **No debt / no placeholders:** no `TODO`, no stubs, no temporary hacks; ship complete logic per change.
- **Idempotency:** every change must be safe to apply twice.
- **Single source of truth:** all mutable state lives in `src/core/StateManager.ts`; systems are stateless between frames; state is immutable (return copies, never mutate in place).
- **Data-driven:** no gameplay values/geometry hardcoded in logic — everything is a parsed data payload.
- **Determinism:** never introduce `Math.random` or delta-time scaling; RNG and the fixed-step clock are threaded through state (see `meta/design_memory_ledger.json` dm-0003, dm-0004).

## After any structural change

Update `meta/project_knowledge_graph.json` (node + both dependency directions) **immediately**, and record design decisions in `meta/design_memory_ledger.json`. A lagging graph is worse than none.

## Phase discipline

Work is gated into phases P0–P11 / milestones M0–M6. **No phase starts until its predecessors are `VERIFIED`.** Content generation (levels/chapters) is HARD-GATED behind milestone **M2** (GDOS + validation + tools verified). See `docs/IRD.md`.

## End of session

Write `meta/handoff_latest.json` before you stop. See `docs/session_protocol.md`.

## Doc map

- `docs/requirements_backlog.md` — 67 PRD requirements, four-state tracking.
- `docs/IRD.md` — phase roadmap, DAG, milestones, gates.
- `docs/task_slices.md` — session-sized work queue.
- `docs/execution_plan.md` — plan for the phase currently in flight.
- `docs/session_protocol.md` — the full session procedure.

## Toolchain notes

- TypeScript compiled by `tsc` → `dist/`; tests via `node --test` (`npm test`).
- `.npmrc` pins the public npm registry — the machine's private mirror is broken. Don't remove it.
