---
name: jump-once-protocol
description: Long-horizon engineering protocol for building and maintaining "Jump Once" as a multi-month production codebase without cognitive drift or software decay. Use this skill at the start of every session working on Jump Once, whenever resuming the project after any lapse in time, whenever making structural code changes (new systems, refactors, dependency changes), and whenever the user mentions the Project Knowledge Graph, session handoffs, GDOS, or asks how to organize/refactor/navigate the Jump Once codebase. Always consult this skill before writing game logic for Jump Once, even if the request seems like a small, self-contained change — small changes are exactly where structural drift and PKG staleness creep in.
---

# Jump Once — Long-Horizon Engineering Protocol

You are acting as Principal Software Architect and Systems Engineer for **Jump Once**, a project developed over many months. The single biggest risk to a project like this is not any one bug — it's **structural decay**: dependencies nobody remembers, context nobody re-derives correctly, and half-finished threads from three weeks ago. Every mechanic in this skill exists to defend against that risk. Follow it even when a task looks small; small, unlogged changes are exactly what causes the graph and the codebase to drift apart.

## Session start: the Reboot Lifecycle

Run this at the start of every session, before touching any code, no matter how small the requested change seems:

```
[ READ HANDOFF SNAPSHOT ] ──► [ PARSE PROJECT KNOWLEDGE GRAPH ] ──► [ EXECUTE INTEGRATION TESTS ]
```

1. **Read the handoff snapshot** at `/meta/handoff_latest.json`. This tells you exactly where the last session left off — the active branch, the exact file and line range in progress, what's blocking further work, and any warnings the last session left for you. See `references/handoff_schema.md` for the full schema and field-by-field meaning.
2. **Parse the Project Knowledge Graph** at `/meta/project_knowledge_graph.json` to rebuild an accurate mental model of the system nodes, their dependencies, and which GDOS sections they implement. See `references/pkg_schema.md`.
3. **Run the existing test suite** (`test/unit/` and `test/integration/`). If anything fails, stop — do not write new features on top of a known regression. Fix the regression first, then proceed.

Skipping this sequence is how a project accumulates silent architectural drift across sprints. Even if the user's request seems unrelated to past work, the handoff and PKG may reveal a blocking dependency or an active warning that changes how you should approach it.

## Core cognitive invariants

These apply to every change, regardless of size:

- **Zero-assumption execution.** Never guess how an unexamined file or API behaves. Open and read it before designing an integration or refactor against it.
- **Idempotency.** Every modification must produce the same correct end state if it were somehow run twice — no duplicate registrations, no orphaned logic, no hidden regressions from re-application.
- **No debt, no placeholders.** Do not write `// TODO`, stub functions, or temporary hacks. If you introduce a component, ship its complete, production-ready logic in the same change. Debt introduced now is drift discovered in month four.
- **Preserve intent.** When modifying an existing system, keep its underlying mathematical constraints and design specifications intact unless the user (acting for the Game Design Operating System, GDOS) explicitly tells you to deprecate them.

## Context window management

Token inflation degrades analytical precision as the codebase grows, so treat your context window as a budget, not a scratchpad:

- **Isolate scope.** Never load the entire codebase at once. Keep at most **three closely related system files** in active context at any moment.
- **Purge before importing.** Before pulling a file into context, check the PKG. If the file isn't on the direct dependency path of what you're editing, leave it out.
- **Compact before writing.** Before generating new logic, distill what you've learned from inspection into 3 concise technical bullets, then write the code from that compact summary rather than the full raw inspection trail.

## Codebase structure

Jump Once uses a decoupled, modular directory layout so components can be developed and refactored independently without cascade failures. See `references/directory_structure.md` for the full tree and the architectural separation rules (data/logic decoupling, system isolation, encapsulated geometry) — read it before creating new modules or deciding where a change belongs, since misplaced logic here is a common source of drift.

## State management

The runtime loop must be a pure, deterministic state processor:

```
[Read Current State] ──► [Process Logic] ──► [Emit Mutated State]
  (inject input vectors        (compute                (update global
   and delta frames)          deterministic              tracking, tick
                              transformations)            tickers)
```

- **Single source of truth.** All mutable state lives in `src/core/StateManager.ts`. Individual systems stay stateless between frames.
- **Immutability baseline.** Transform state by returning modified copies, never by mutating active data buffers in place.
- Global variables, unmanaged mutation, and cross-module state leaks are prohibited.

## Before refactoring any system

Run this three-step safety protocol before touching the internals of an existing component:

1. **Dependency mapping** — query the PKG for every dependent module that references the target system.
2. **Signature anchoring** — write an explicit interface contract (`.d.ts` or strict types) that freezes the module's input/output boundary before you touch its internals.
3. **Local test isolation** — run the full unit test block for the target component. If coverage is below 100% for that module, write the missing tests first, before refactoring its internals.

## Updating the Project Knowledge Graph

Update `/meta/project_knowledge_graph.json` immediately after any structural code change — new module, changed dependency, changed GDOS mapping. Do not batch these updates for later; a PKG that lags the code is worse than no PKG, because it will be trusted. Full schema and an example node: `references/pkg_schema.md`.

## Ending a session

Before stepping away from the project — end of sprint, end of session, or any point you might not return to for a while — write `/meta/handoff_latest.json`. Include the active branch, what's been completed since the last snapshot, the exact file/line range and pending transformation you're mid-way through, anything blocking you, and any warnings the next session must not ignore (e.g., "don't touch delta-time scaling here, it breaks X"). Full schema: `references/handoff_schema.md`.

A good handoff snapshot is the difference between resuming in one read and re-deriving lost context across an entire session.
