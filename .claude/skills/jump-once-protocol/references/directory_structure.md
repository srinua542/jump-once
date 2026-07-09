# Codebase Navigation Structure & Architectural Isolation

Organize Jump Once using this decoupled, modular directory layout so components can be developed, tested, and refactored over long periods without causing cascade failures.

## Unified directory tree

```
project_root/
├── docs/                           # Human-readable architectural specs
├── meta/                           # Machine-readable graph and design state
│   ├── project_knowledge_graph.json
│   └── design_memory_ledger.json
├── src/                            # Pure execution logic (Zero side-effects)
│   ├── core/                       # Core engine loop and boot state
│   ├── systems/                    # Game loops (Physics, Input, Render)
│   ├── components/                 # Pure data structures
│   ├── schema/                     # Definition-time schema I/O (serialize/parse/validate)
│   ├── entities/                   # Game world entity initializers
│   └── eval/                       # Evaluation-time logic: agent archetypes, audits (P4)
├── test/                           # Automated verification engine
│   ├── unit/                       # Component-level isolated tests
│   └── integration/                # Solvability agent simulations
└── tools/                          # Internal production systems
    ├── level_editor/               # Spatial design environment
    └── telemetry/                  # Profiling and analytics parsers
```

## Architectural separation invariants

- **Data/logic decoupling.** Everything under `src/components/` is strictly a plain data structure. It must never execute logic, loops, calculations, or system queries. If you find yourself writing a function body inside a component, it belongs in `src/systems/` (per-frame behavior) or `src/schema/` (definition-time I/O) instead.
- **Schema I/O isolation.** `src/schema/` holds definition-time logic only — serialization, parsing, structural validation of data payloads (added at P2 start, dm-0013). It is not a per-frame system (never called from the engine loop) and never imports from `src/systems/`. The types it validates live in `src/components/`; world construction from validated definitions lives in `src/entities/`.
- **Evaluation isolation.** `src/eval/` holds evaluation-time logic only — agent policies, the headless harness, validation audits (added at P4 start, dm-0022). It consumes the sim strictly through public contracts (`Engine`, `StateManager`, `createInitialState`, read-only `GameState`); the dependency is one-way — nothing under `src/core|systems|components|entities|schema` may ever import from `src/eval/`. The simulation must never know it is being judged.
- **System isolation.** Everything under `src/systems/` must operate completely independently of every other system. A physics system must never read input state directly — it parses decoupled data interfaces managed by the core engine loop, not another system's internals.
- **Encapsulated geometry.** Tilemaps, hazard coordinate spaces, and visual parameters are raw data injections, not hardcoded values. Hardcoding spatial layout dimensions into functional code is a critical architectural violation — it silently couples level design to code and breaks the level editor's ability to iterate independently.

When deciding where a new file belongs, or whether a change violates isolation, check this structure first — misplacement here is one of the most common sources of long-term architectural drift, since it's invisible until two systems that should have been independent turn out to be entangled.
