# Project Knowledge Graph (PKG) Schema

Stored at `/meta/project_knowledge_graph.json`. Read it at the start of every session and update it immediately upon executing any structural code change.

```
┌────────────────────────────────────────────────────────────────────────┐
│                    PROJECT KNOWLEDGE GRAPH (PKG)                       │
├────────────────────────────────────────────────────────────────────────┤
│  [System Nodes]   ──► Map core logic modules and data models.          │
│  [Graph Edges]     ──► Track hard imports and functional dependencies. │
│  [GDOS Anchors]    ──► Link source code to active design specifications│
└────────────────────────────────────────────────────────────────────────┘
```

## Node types

Every entry in the PKG must map to one of three strictly defined node types:

1. **System Nodes** — core software modules, decoupled runtime classes, or global state data models.
2. **Dependency Edges** — directed links tracing hard imports, data pipelines, event subscriptions, and execution sequencing between components.
3. **GDOS Alignment Anchors** — explicit mapping hooks tracing which code module executes a specific section of the Game Design Operating Specification (e.g., matching the physics loop directly to Section 16).

## Node template

```json
{
  "node_id": "systems/physics/jump_controller",
  "type": "SystemNode",
  "file_path": "src/systems/physics/JumpController.ts",
  "functional_summary": "Manages the single-jump allocation, state locking, vector calculations, and deceleration dampening.",
  "gdos_alignment": "Section_16_Player_Character_Controller",
  "dependencies": [
    "systems/core/state_manager",
    "components/physics/collision_box"
  ],
  "dependents": [
    "entities/player/player_entity"
  ],
  "volatile_state_flags": {
    "has_side_effects": true,
    "state_dependencies": ["global_jump_counter"]
  },
  "last_verified_commit": "a3f89e2"
}
```

Field notes:
- `node_id` — stable path-like identifier, mirrors the module's logical location.
- `type` — one of `SystemNode`, `DependencyEdge`, `GDOSAnchor`.
- `file_path` — actual path in the repo, kept in sync with `node_id`'s location.
- `functional_summary` — plain-language description of what the module does, written so a future session can rebuild intent without reading the code.
- `gdos_alignment` — the GDOS section this module implements, if any.
- `dependencies` / `dependents` — node_ids this module hard-imports from, and node_ids that hard-import this module. Keep both directions in sync; a one-directional update is a common source of graph drift.
- `volatile_state_flags` — flags anything with side effects or shared/global state dependencies, so future refactors know to treat this module carefully.
- `last_verified_commit` — the commit hash at which this entry was last confirmed accurate. Update it whenever you touch the node.
