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
│   └── entities/                   # Game world entity initializers
├── test/                           # Automated verification engine
│   ├── unit/                       # Component-level isolated tests
│   └── integration/                # Solvability agent simulations
└── tools/                          # Internal production systems
    ├── level_editor/               # Spatial design environment
    └── telemetry/                  # Profiling and analytics parsers
```

## Architectural separation invariants

- **Data/logic decoupling.** Everything under `src/components/` is strictly a plain data structure. It must never execute logic, loops, calculations, or system queries. If you find yourself writing a function body inside a component, it belongs in `src/systems/` instead.
- **System isolation.** Everything under `src/systems/` must operate completely independently of every other system. A physics system must never read input state directly — it parses decoupled data interfaces managed by the core engine loop, not another system's internals.
- **Encapsulated geometry.** Tilemaps, hazard coordinate spaces, and visual parameters are raw data injections, not hardcoded values. Hardcoding spatial layout dimensions into functional code is a critical architectural violation — it silently couples level design to code and breaks the level editor's ability to iterate independently.

When deciding where a new file belongs, or whether a change violates isolation, check this structure first — misplacement here is one of the most common sources of long-term architectural drift, since it's invisible until two systems that should have been independent turn out to be entangled.
