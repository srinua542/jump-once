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
│   ├── eval/                       # Evaluation-time logic: agent archetypes, audits (P4)
│   └── gen/                        # Design-time generation: PDA, lifecycle, pipeline (P7)
├── test/                           # Automated verification engine
│   ├── unit/                       # Component-level isolated tests
│   └── integration/                # Solvability agent simulations
├── tools/                          # Internal production systems
│   ├── level_editor/               # Spatial design environment (P8): draft authoring state, live-playtest driver
│   ├── debug/                      # Debug overlay descriptors + runtime inspection controller (P8)
│   ├── profiler/                   # Profiling instrumentation (P8)
│   └── telemetry/                  # Capture, death-heatmap replay analysis, GDOS round-trip (P8)
└── render/                         # Presentation layer (P9): the first rendering surface in the project
    ├── grammar/                    # Style-agnostic Visual Grammar schema (REQ-070/071 data)
    ├── style/                      # StylePack seam (dm-0076) + style/paper/ — StylePack #1 "Paper Collage"
    ├── scene/                      # Scene compiler, camera, quadtree-backed culling
    ├── gl/                         # WebGL2 executor, atlas packing, batching
    ├── pool/                       # Generation-counted object pools (REQ-161)
    ├── feel/                       # Game-feel modifiers (REQ-150 visual share) + fairness/defeat visuals (REQ-016)
    ├── audio/                      # WebAudio procedural signatures + cue derivation
    ├── assets/                     # Asset manifest, async delivery, delivery-speed profiling (REQ-132 P9 share)
    ├── shell/                      # App loop: FrameScheduler → Clock.advance → Engine → compileScene → GlRenderer
    ├── platform/                   # THE ONLY files allowed to name real browser globals (canvas, rAF, PokiSDK, fullscreen)
    ├── tooling/                    # Renders the P8 editor/debug substrate — the ONLY render/ area importing tools/
    └── quality/                    # Dynamic quality scale-back (REQ-163), hysteresis tier controller
```

## Architectural separation invariants

- **Data/logic decoupling.** Everything under `src/components/` is strictly a plain data structure. It must never execute logic, loops, calculations, or system queries. If you find yourself writing a function body inside a component, it belongs in `src/systems/` (per-frame behavior) or `src/schema/` (definition-time I/O) instead.
- **Schema I/O isolation.** `src/schema/` holds definition-time logic only — serialization, parsing, structural validation of data payloads (added at P2 start, dm-0013). It is not a per-frame system (never called from the engine loop) and never imports from `src/systems/`. The types it validates live in `src/components/`; world construction from validated definitions lives in `src/entities/`.
- **Evaluation isolation.** `src/eval/` holds evaluation-time logic only — agent policies, the headless harness, validation audits (added at P4 start, dm-0022). It consumes the sim strictly through public contracts (`Engine`, `StateManager`, `createInitialState`, read-only `GameState`); the dependency is one-way — nothing under `src/core|systems|components|entities|schema` may ever import from `src/eval/`. The simulation must never know it is being judged.
- **Generation isolation.** `src/gen/` holds design-time generation logic only — the PDA, mechanic lifecycle tracker, candidate generator, creativity loop, and the manufacturing pipeline (added at P7 start, dm-0057). It consumes evaluation strictly through its public entry points (`evaluateLevel`/`judgeLevel`, the audits, `probeEmergentFun`, `noveltyDivergence`) — never the engine, harness, systems, world construction, or `gdos/` gate internals; `campaign/` records are read as types only. The dependency is one-way — nothing outside `src/gen/` may ever import from it. RNG only via threaded `core/Rng` state; enforced by `test/unit/GenIsolation.test.ts`.
- **System isolation.** Everything under `src/systems/` must operate completely independently of every other system. A physics system must never read input state directly — it parses decoupled data interfaces managed by the core engine loop, not another system's internals.
- **Tools isolation.** `tools/` holds interactive/production-time logic only — the level editor, debug overlays, profiler, and telemetry (added at P8 start, dm-0066). It consumes `src/gen/` and `src/eval/` strictly through their public entry points, the same whitelist their own consumers already respect (`evaluateLevel`/`judgeLevel`, the audits, `analyzeTape`, `processCampaign`, `manufactureLevel`, `discoverOpportunities`) — never gate/search internals. The dependency is one-way — nothing under `src/` may ever import from `tools/`. `tools/` does not modify `src/gen/` or `src/eval/`; enforced by `test/unit/ToolsIsolation.test.ts`.
- **Render isolation.** `render/` is the presentation layer (added at P9 start, dm-0081) and sits at the TOP of the dependency chain: it may import `src/` (public seams only — `Engine`/`StateManager`/`Clock`/`parseLevel`/`serializeLevel`/`instantiateWorld`/`SpatialPartition`/`CANONICAL_PIPELINE`, never `src/gen/` or `src/eval/` internals) and `tools/` (as a typed library, but ONLY from `render/tooling/` — no other `render/` file may import `tools/`). Nothing under `src/` or `tools/` may ever import from `render/`. Real browser globals (`document`, `window`, `WebGL2RenderingContext`, `AudioContext`, the `PokiSDK` script-tag global, `requestAnimationFrame`, `performance.now`) are confined to `render/platform/` — everywhere else in `render/` is pure logic against injected device seams (`Raster2D`, `Gl2Device`, `AudioDevice`, `AssetFetcher`, `PortalSdk`, `FrameScheduler`). Rendering reads simulation state one-way and never feeds back (`interpolationAlpha` stays read-only, dm-0004/dm-0082). Enforced by `test/unit/RenderIsolation.test.ts`.
- **Encapsulated geometry.** Tilemaps, hazard coordinate spaces, and visual parameters are raw data injections, not hardcoded values. Hardcoding spatial layout dimensions into functional code is a critical architectural violation — it silently couples level design to code and breaks the level editor's ability to iterate independently.

When deciding where a new file belongs, or whether a change violates isolation, check this structure first — misplacement here is one of the most common sources of long-term architectural drift, since it's invisible until two systems that should have been independent turn out to be entangled.
