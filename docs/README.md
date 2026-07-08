# Jump Once — Documentation Index

Governance and engineering docs for the Jump Once project. Start here.

## Read in this order
1. **[session_protocol.md](session_protocol.md)** — the Reboot Lifecycle every session runs first, and the invariants that hold all session.
2. **[requirements_backlog.md](requirements_backlog.md)** — every PRD requirement as a tracked `REQ-###` in one of four states. The source of truth for *what must be built*.
3. **[IRD.md](IRD.md)** — the Implementation Roadmap: the 12-phase dependency-ordered plan, the DAG, milestones, and gates. The source of truth for *what order to build in*.
4. **[task_slices.md](task_slices.md)** — session-sized work units per phase with acceptance criteria. The day-to-day work queue.
5. **[execution_plan.md](execution_plan.md)** — the detailed plan for the phases currently in flight (P0 + P1 = milestone M0).
6. **verification/** — per-phase verification reports (filed as each phase closes).

## Machine-readable state (`../meta/`)
- **project_knowledge_graph.json** — nodes, dependency edges, and GDOS anchors mirroring the codebase.
- **design_memory_ledger.json** — accepted/rejected decisions with full Design-Intent-Repository fields.
- **handoff_latest.json** — the cognitive save-state; read at session start, written at session end.

## Where things live (`../`)
- `src/core` — deterministic engine substrate (state, clock, rng, state manager, engine loop).
- `src/systems` — pure per-frame systems (physics, input, render orchestration).
- `src/components` — logic-free data structures.
- `src/entities` — game-world entity initializers.
- `test/unit`, `test/integration` — the verification engine.
- `tools/` — internal production tools (level editor, telemetry).

## Current status
Milestone **M0 — Foundation Locked**, in progress. See the handoff for the exact resume point.
