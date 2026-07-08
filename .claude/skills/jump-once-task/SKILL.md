---
name: jump-once-task
description: The per-task SDLC loop for Jump Once. Use this whenever you are about to DO work on the Jump Once codebase — implement a feature, fix a bug, refactor a system, write tests, or advance a task slice (Sx.y) — as opposed to planning the roadmap. It drives one task slice end-to-end (reboot → select → plan → anchor → implement → verify → integrate → report → handoff) while enforcing the project's invariants, phase gating, context budget, and four-state Definition of Done. Invoke it after (or together with) jump-once-protocol at the start of any working session; invoke it again each time you pick up a new slice. Trigger phrases: "work on Jump Once", "implement S1.7 / the Engine", "fix the …", "start the next task", "continue where we left off", "pick up the next slice".
---

# Jump Once — Per-Task SDLC Loop

This skill governs how a *single unit of work* moves from "not started" to **Verified** in Jump Once. It sits underneath [`jump-once-protocol`](../jump-once-protocol/SKILL.md), which owns the long-horizon governance (Reboot Lifecycle, PKG, handoff, architecture, context rules). **Do not duplicate that skill — consult it.** This skill adds the concrete, repeatable SDLC pipeline for one task and the gates that decide when the task is actually done.

The unit of work is always a **task slice** (`Sx.y`) from [`docs/task_slices.md`](../../../docs/task_slices.md), which traces to one or more `REQ-###` in [`docs/requirements_backlog.md`](../../../docs/requirements_backlog.md). If the user's request doesn't map to an existing slice, first add it as a slice (with REQs, dependencies, acceptance criteria) before coding — untracked work is how the backlog and the code drift apart.

## The nine-stage task loop

```
1 REBOOT ─► 2 SELECT ─► 3 PLAN ─► 4 ANCHOR ─► 5 IMPLEMENT ─► 6 VERIFY ─► 7 INTEGRATE ─► 8 REPORT ─► 9 HANDOFF
                              ▲                                   │
                              └───────────── (fix regressions) ◄──┘
```

**Persist your stage progress.** This loop is tracked on disk by the Stage Manager so a session that dies mid-slice resumes at the exact stage. At SELECT, run `node tools/sdlc/stage.js start <slice> --title "..." --reqs REQ-a,REQ-b`; after finishing each stage run `node tools/sdlc/stage.js advance --note "..."`; tick acceptance with `node tools/sdlc/stage.js criterion <REQ> met`; at the end run `node tools/sdlc/stage.js done`. `npm run stage` shows the current checklist. The live pointer is `meta/active_task.json`; completed slices archive to `meta/runs/`. The SDLC gate's `stage-consistency` check will flag a stage marked done that reality contradicts (e.g. `verify` done with no tests).

### 1. REBOOT — reorient before touching anything
Run the Reboot Lifecycle from `jump-once-protocol`: read `meta/handoff_latest.json`, parse `meta/project_knowledge_graph.json` (confirm its `pkg_hash` matches the handoff), then run `npm test`. **If the suite is red, the only permitted task is fixing that regression.** Never build a feature on a known-red suite.

### 2. SELECT — commit to exactly one slice
Pick the slice. Confirm every slice in its `Depends` list is `COMPLETED` (or `VERIFIED` where the roadmap requires it) and that its phase's predecessors are `VERIFIED` — **no phase starts early**, and content generation (levels/chapters) is hard-gated behind milestone **M2**. If the slice is blocked, stop and either clear the blocker or pick an unblocked slice. Flip the slice and its REQs to `IN_PROGRESS`.

### 3. PLAN — write the micro-plan before code
State, in a few lines: the slice's goal, the exact REQ acceptance criteria it must satisfy, the files you will touch, and the test(s) that will prove it. For anything beyond a trivial edit, add its entry to the phase execution plan. This is the per-task equivalent of the directive's "execution plan before code."

### 4. ANCHOR — freeze the boundary (refactors especially)
If you're changing an existing system, run the protocol's three-step safety protocol first: **dependency-map** it via the PKG (`dependents`), **signature-anchor** its input/output types before touching internals, and **isolate-test** it — if the target module's unit coverage is below 100%, write the missing tests *first*. New modules skip the dependency-map step but still define their type boundary up front.

### 5. IMPLEMENT — build it complete, under the invariants
Write production-ready logic — **no `TODO`, no stubs, no placeholders, no temporary hacks.** Hold every invariant (see the checklist below): data-driven (no hardcoded gameplay values/geometry), single source of truth in `StateManager`, immutable state (return copies), determinism (no `Math.random`, no delta-time scaling), system isolation, encapsulated geometry. Put each file where the directory rules say it belongs — components are logic-free data; systems never read each other's internals.

### 6. VERIFY — prove it, don't assume it
`npm test` must be green, including the new tests that exercise this slice's acceptance criteria. Determinism-sensitive work must include a replay/regression assertion. Zero-assumption still applies: if you integrated against a file you didn't read, read it now. This is a hard gate — a slice cannot pass with unproven behavior.

### 7. INTEGRATE — keep the graph and memory honest (do this immediately, not later)
On any structural change, update `meta/project_knowledge_graph.json` in the **same change**: add/modify the node, update **both** `dependencies` and `dependents` directions, refresh `last_verified_commit`, and bump `pkg_hash`. Record any design decision (accepted or rejected) in `meta/design_memory_ledger.json` with all five Design-Intent-Repository fields. A PKG that lags the code is worse than none — it will be trusted.

### 8. REPORT — advance the four-state ledger truthfully
Only now may the slice move: `IN_PROGRESS → COMPLETED` when built + tested; `→ VERIFIED` only after it is reviewed against its PRD acceptance criteria. When a slice closes a phase, file `docs/verification/P<n>.md` mapping each phase REQ to its passing test, then flip that phase's REQs to `VERIFIED` in the backlog. If a milestone closed, run the Subtractive Removal pass and the PRD compliance audit.

### 9. HANDOFF — leave a clean save-state
Write `meta/handoff_latest.json` (schema in `jump-once-protocol/references/handoff_schema.md`): active milestone/branch, what completed, the **exact file + line range + pending transformation** if mid-slice, blockers, critical warnings, current `pkg_hash`, and the next-session pick-list. A good handoff is the difference between resuming in one read and re-deriving lost context.

## Context management (enforce actively during stages 4–6)

Token inflation degrades precision as the codebase grows. Treat context as a budget:
- **Three-file rule.** Keep at most three closely-related system files in active context at once. The slice's target + its direct PKG dependencies — nothing more.
- **Purge before import.** Before opening a file, check the PKG. If it isn't on the direct dependency path of what you're editing, don't load it.
- **Compact before writing.** Distill what you learned from inspection into ~3 technical bullets, then write code from that summary — not from the full raw inspection trail.
- **Explore via subagents for breadth.** When a question needs sweeping many files (not editing them), delegate the search so the file dumps never enter your main context — only the conclusion does.

## Definition of Done (the gate for VERIFIED)

A slice is **Verified** only when ALL hold. If any fails, it is at most `COMPLETED`:

- [ ] Behavior matches every REQ acceptance criterion the slice claims.
- [ ] `npm test` green; new tests cover this slice; determinism asserted where relevant.
- [ ] No placeholders/TODOs/stubs introduced; logic is production-complete.
- [ ] Invariants held: data-driven · single-source-of-truth · immutable · deterministic · isolated systems · encapsulated geometry.
- [ ] Correct directory placement (data vs. logic vs. entity).
- [ ] PKG updated (node + both dependency directions + hash); design decisions logged.
- [ ] Phase gating respected (predecessors verified; M2 gate honored for content).
- [ ] Backlog + slice states advanced truthfully; verification report filed if a phase closed.
- [ ] Handoff written.

## Anti-patterns this loop exists to prevent

- Coding before REBOOT → building on a red suite or a stale blocker.
- "I'll update the PKG later" → guaranteed graph drift; do it in-change.
- Marking `COMPLETED`/`VERIFIED` on unproven behavior → the four-state ledger becomes fiction.
- Loading the whole codebase "to be safe" → context inflation, degraded precision.
- A quick stub "to unblock" → debt that surfaces as drift in month four.
- Generating level/chapter content before M2 is verified → violates the hard PRD gate.

See [`references/slice_worklog_template.md`](references/slice_worklog_template.md) for a copyable per-slice worklog you can fill as you move through the nine stages.
