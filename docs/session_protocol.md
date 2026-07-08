# Jump Once — Session Protocol

The operating procedure every working session on Jump Once follows. It exists to defend against the one risk that kills long-horizon projects: **structural decay** — forgotten dependencies, re-derived-incorrectly context, and half-finished threads. Follow it even for changes that look trivial.

---

## Start of session — the Reboot Lifecycle

Run this in order, before touching any code:

```
[ READ HANDOFF SNAPSHOT ] ──► [ PARSE PROJECT KNOWLEDGE GRAPH ] ──► [ EXECUTE INTEGRATION TESTS ]
```

1. **Read `meta/handoff_latest.json`.** It names the active milestone/branch, what finished last session, the exact file + line range and pending transformation that was in progress, any blocker, and critical warnings you must not ignore.
2. **Parse `meta/project_knowledge_graph.json`.** Rebuild the mental model of system nodes, dependency edges, and GDOS anchors. Confirm `pkg_hash` matches `handoff.pkg_hash_at_handoff`; if they differ, the PKG drifted — reconcile before proceeding.
3. **Run the test suite:** `npm test` (builds, then runs `node --test dist/test/`). If anything fails, **stop** — fix the regression before writing any new feature. Never build on a known-red suite.

Then read `docs/execution_plan.md` for the active phase and pick the top item from the `task_slices.md` next-session pick-list.

## During the session — cognitive invariants

- **Zero-assumption execution.** Never guess how an unread file/API behaves — open it first.
- **Idempotency.** Every change must yield the same correct end state if applied twice.
- **No debt, no placeholders.** No `TODO`, no stubs, no temporary hacks. Ship complete logic per change.
- **Preserve intent.** Keep a system's mathematical constraints/specs intact unless the GDOS (via the user) explicitly deprecates them.
- **Context budget.** Keep at most three closely-related system files in active context; consult the PKG before importing a file; compact findings to a few bullets before writing new logic.

## On any structural change — keep the graph honest

Immediately after adding a module, changing a dependency, or changing a GDOS mapping, update `meta/project_knowledge_graph.json` (node + both dependency directions + `last_verified_commit`). A PKG that lags the code is worse than none because it will be trusted. Record accepted/rejected design decisions in `meta/design_memory_ledger.json` with all five Intent Repository fields.

## Before refactoring an existing system — three-step safety protocol

1. **Dependency mapping** — query the PKG for every `dependents` entry of the target node.
2. **Signature anchoring** — freeze the module's input/output boundary with explicit types before touching internals.
3. **Local test isolation** — run the target module's full unit block; if coverage < 100%, write the missing tests *first*.

## Phase discipline

- No phase begins until every predecessor's exit gate is `VERIFIED` (see `IRD.md`).
- Before coding a phase, author its execution plan; after finishing, file `docs/verification/P<n>.md` and flip that phase's REQs to `VERIFIED` in `requirements_backlog.md`.
- At every milestone run the **Subtractive Removal pass** (PRD §3) and a **full PRD compliance audit** (Directive).

## End of session — write the handoff

Before stepping away, write `meta/handoff_latest.json` (schema: `references/handoff_schema.md`): active milestone/branch, what completed since last snapshot, the exact file + line range + pending transformation in progress, blockers, critical warnings, and the current `pkg_hash`. A good handoff is the difference between resuming in one read and re-deriving lost context across a whole session.
