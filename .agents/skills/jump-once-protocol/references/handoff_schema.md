# Session Handoff Snapshot Schema

Stored at `/meta/handoff_latest.json`. This is an explicit cognitive save-state — write it whenever stepping away from the project, so any agent (you, months later, or a different session) can resume with pixel-perfect technical continuity instead of re-deriving lost context.

## Schema

```json
{
  "session_end_timestamp": "2026-07-08T20:23:42Z",
  "current_milestone": "Phase_3_Internal_Tooling_Validation",
  "active_working_branch": "feature/jump-locking-mechanism",
  "completed_since_last_snapshot": [
    "Implemented StateLock within JumpController.ts",
    "Verified zero dynamic allocations inside the frame-by-frame player loop"
  ],
  "exact_execution_focus": {
    "file_path": "src/systems/physics/JumpController.ts",
    "target_line_range": "45-82",
    "pending_logical_transformation": "Integrating the collision surface normal verification to prevent accidental jump reset clips on high-velocity ceiling impacts."
  },
  "blocked_by": {
    "dependency_node": "systems/core/state_manager",
    "reason": "Requires matching action-payload registration for 'JUMP_EXHAUSTED' event state."
  },
  "critical_warnings_for_next_session": [
    "Do not alter the delta-time scaling in PhysicsSystem.ts; it breaks the pixel-perfect trajectory solver used by the automated level validation agents."
  ],
  "pkg_hash_at_handoff": "9e12f4b3c"
}
```

## Field notes

- `session_end_timestamp` — ISO 8601 UTC timestamp of when the snapshot was written.
- `current_milestone` — the current named phase of the project, matched to whatever milestone tracking the project uses.
- `active_working_branch` — the git branch actively being developed when the session ended.
- `completed_since_last_snapshot` — a short list of concrete, verifiable things finished since the previous handoff. Not a diff dump — just enough for a future session to know what changed.
- `exact_execution_focus` — the precise file, line range, and in-progress logical transformation you were mid-way through. This is what lets a future session resume in one read instead of re-scanning the file to guess where things were left off.
- `blocked_by` — if work is stalled on another node or an external dependency, name it and say why, so the next session can go resolve that first rather than rediscovering the blocker by trial and error.
- `critical_warnings_for_next_session` — anything a future session absolutely must not do (e.g., "don't touch X, it silently breaks Y"). These are the warnings that don't show up in a diff or a test failure until much later.
- `pkg_hash_at_handoff` — hash of the Project Knowledge Graph at the moment of handoff, so a future session can detect whether the PKG has drifted out of sync with this snapshot.

## Reboot lifecycle that consumes this file

```
[ READ HANDOFF SNAPSHOT ] ──► [ PARSE PROJECT KNOWLEDGE GRAPH ] ──► [ EXECUTE INTEGRATION TESTS ]
```

1. Read `/meta/handoff_latest.json` to instantly realign with the exact line range, operational parameters, and structural roadblocks left behind.
2. Re-verify `/meta/project_knowledge_graph.json` to rebuild an accurate mental blueprint of the active architectural dependencies.
3. Run `test/unit/` and `test/integration/`. If any test fails, suspend all feature generation immediately and fix the regression before writing new code.
