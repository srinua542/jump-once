# Jump Once — Level Definition Schema (v1)

Normative documentation for the serialized level payload (PRD §13, REQ-122). The TypeScript types in `src/components/` are the source of truth for *shape*; this document is the single normative statement of *conventions and policies* — coordinate system, canonical form, versioning, and the axiom boundary. Governing ledger entries: dm-0009–dm-0015.

- Types: `src/components/{Level,Tilemap,Trigger,Gdos,Entity,Behavior,Collider,Transform,EntityId}.ts`
- Canonical serializer: `src/schema/Serialize.ts`
- Loader/validator (only construction path from untrusted input): `src/schema/` (S2.3)

---

## 1. Coordinate convention (dm-0015)

Stated once, here. Every phase (P3 physics, P4 solvers, P8 editor, P9 renderer) inherits this; none may restate or reinterpret it.

- **Y is down. The origin is the tilemap's top-left corner. Gravity acts in +y.**
- All positions and distances are in **world units**; `tilemap.tileSize` is the tile edge length in world units.
- The tilemap is **row-major**: `tiles[row * width + col]`. Tile `(col, row)` covers world rect `[col·tileSize, (col+1)·tileSize) × [row·tileSize, (row+1)·tileSize)`.
- Entity `transform.position` is the entity's **center**. Collider boxes are `halfExtents` around `position + offset`.
- Waypoint polylines are **local offsets from the entity's transform position** (so moving a platform in the editor moves its whole path).
- `facing` is `+1` (right) / `-1` (left); render/behavior hint only, no physics meaning.

## 2. Versioning policy (dm-0010)

- The root field `schemaVersion` must equal `LEVEL_SCHEMA_VERSION` (currently **1**). The loader **hard-rejects** any other value — there is no best-effort parsing of unknown versions, ever.
- Migrations are pure `vN → vN+1` functions, written **only when v2 exists**. No migration framework ships with v1 (explicit accepted debt, dm-0010).
- Extending any closed union (entity kinds, trigger actions, tile ids, difficulty axes) **is** a schema change: bump the version, write the migration, ledger the decision.

## 3. Canonical serialization (dm-0010, dm-0014)

`serializeLevel()` emits the canonical text: fixed key order at every level (the orders in §5 below), two-space indent, no trailing newline. Rules:

- **Numbers** must be finite IEEE doubles (the validator rejects `NaN`/`±Infinity`, which JSON would silently turn into `null`). `-0` is normalized to `0` at parse *and* at serialize.
- **Unknown/extra keys are strictly rejected** at every path (dm-0014). A lenient parser would re-serialize a future-version file with its fields silently dropped — a "lossless" round-trip that loses data. Strictness makes version drift fail loudly at parse time.
- **Round-trip guarantees** (tested in S2.4): value-level `deepEqual(parse(serialize(v)), v)` and byte-level idempotence `serialize(parse(serialize(v))) === serialize(v)`. Byte identity with a *hand-authored* file is deliberately **not** promised — human whitespace and key order are noise; canonical form is what the toolchain emits.
- The canonical form is anchored by a **committed golden hash** of the sample fixture (S2.4). Changing key order or number formatting fails that test and requires a deliberate, ledgered decision.

## 4. The axiom boundary (dm-0011)

`constraints` carries per-level **values**: spawn, goal, par tiers. It will never carry the game's **axioms**: there is no `maxJumps` field and none may be added. The single-jump rule (REQ-004/010) is enforced by the P3 jump-lock state machine as an engine invariant. Data-driven means behaviors and geometry are edited via data — not that the game's identity is runtime-configurable.

## 5. Field reference

Top-level canonical key order: `schemaVersion, levelId, title, gdos, tilemap, entities, triggers, constraints`.

### Root
| Field | Type | Constraints (validator-enforced) |
|---|---|---|
| `schemaVersion` | number | `=== 1` (hard reject otherwise) |
| `levelId` | string | non-empty; unique across the campaign; stable forever (KG, chapter manifests, telemetry key on it) |
| `title` | string | non-empty; human-readable (editor, diagnostics) |

### `gdos` — GDOS metadata block (structural in P2; semantics owned by P5, dm-0012)
Key order: `targetKgNode, difficultyVectors, emotionalBudgetCurve, creatorMomentFrame`.

| Field | Type | Constraints |
|---|---|---|
| `targetKgNode` | string | non-empty; Campaign Knowledge Graph node id (PRD §10 step 1) |
| `difficultyVectors` | record | exactly the four axes `executionPrecision, readingComplexity, timingStrictness, routeAmbiguity` (dm-0015, **provisional** until P5); each finite, in [0,1] |
| `emotionalBudgetCurve` | keyframe[] | non-empty; `at` in [0,1] **strictly increasing**; the four §6 metrics (`curiosity, confidence, surprise, mastery`) each finite, in [0,100] |
| `creatorMomentFrame` | object | `tickWindow: [start, end]` integers, `0 ≤ start ≤ end`; `description` non-empty. Minimal shape per dm-0012 — the PRD names this field exactly once; semantics to be confirmed before P5 consumes it |

### `tilemap` — permanently-static geometry only (dm-0009)
Key order: `width, height, tileSize, tiles`.

| Field | Type | Constraints |
|---|---|---|
| `width`, `height` | number | positive integers |
| `tileSize` | number | finite, > 0 |
| `tiles` | number[] | length `=== width × height`; every id a key of `TILE_KIND_BY_ID` (`0` empty, `1` solid — closed set; visual variants are a P9 v2 extension) |

Anything that changes at runtime — collapsing floors, doors, moving platforms — is an **entity**, never a tile. "Modifying the layout" (§16) is an entity state transition; the parsed tilemap is deep-frozen and reference-shared by every snapshot.

### `entities[]`
Key order: `id, transform, collider, behavior`. `behavior.kind` serializes first within `behavior`.

| Field | Type | Constraints |
|---|---|---|
| `id` | string | non-empty; unique among entities; must **not** start with the reserved runtime prefix `rt:` |
| `transform` | `{position {x,y}, facing}` | position finite; facing `1 \| -1` |
| `collider` | `{halfExtents {x,y}, offset {x,y}}` | halfExtents strictly positive, finite |
| `behavior` | discriminated union | one of the 12 closed §16 kinds below |

Behavior payloads (all numbers finite; time fields in **seconds**, converted to fixed steps deterministically — never real delta time, dm-0003):

| `kind` | Payload | Constraints |
|---|---|---|
| `movingPlatform` | `waypoints: {x,y}[], speed, mode` | ≥ 2 waypoints (local offsets); speed > 0; mode `linear\|looping\|triggered` |
| `collapsingFloor` | `collapseDelaySeconds` | ≥ 0 |
| `iceSurface` | — | |
| `spike` | — | |
| `laser` | `periodSeconds, onFractionOfPeriod, phaseSeconds` | period > 0; fraction in (0,1]; phase ≥ 0 |
| `movingHazard` | `waypoints, speed, mode` | as movingPlatform |
| `pressurePlate` | — | signal source; wiring lives in `triggers` |
| `proximityZone` | — | signal source; its collider is the sensed region |
| `door` | `initiallyOpen: boolean` | |
| `spring` | `launchVelocity {x,y}` | non-zero vector |
| `gravityZone` | `gravityScale` | finite, non-zero (−1 inverts) |
| `conveyor` | `surfaceVelocityX` | finite, non-zero; sign is direction |

Kinetic modifiers (`spring`, `gravityZone`, `conveyor`) alter velocity/inertia but never consume the single jump (REQ-153) — a P3 system invariant, not data.

### `triggers[]` — interconnection wiring (dm-0015)
Key order: `id, source, targets, action, once`.

| Field | Constraints |
|---|---|
| `id` | non-empty; unique among triggers |
| `source` | must reference an existing entity of kind `pressurePlate` or `proximityZone` |
| `targets` | non-empty; every id references an existing entity whose kind matches the action per `TRIGGER_ACTION_TARGET_KIND` (`openDoor/closeDoor/toggleDoor → door`, `collapseFloor → collapsingFloor`, `activatePlatform → movingPlatform`) |
| `action` | one of the closed action set |
| `once` | boolean |

### `constraints`
Key order: `spawn, goal, parTimeTiersSeconds`.

| Field | Constraints |
|---|---|
| `spawn` | finite `{x,y}`; inside the tilemap's world bounds |
| `goal` | `position` inside bounds; `halfExtents` strictly positive |
| `parTimeTiersSeconds` | non-empty; finite, > 0; **strictly decreasing** (casual → optimal; feeds P4's five-tier routing, REQ-101) |

## 6. Identity rules (dm-0015 / P2 plan point 2)

- Authored `EntityId`s are human-readable strings, unique per level, promoted from raw strings **only** by the schema validator.
- Runtime-spawned instances draw ids from a deterministic counter inside `WorldState` in the reserved `rt:` namespace — disjoint from authored ids by the validator rule above, so spawning is a pure, replayable state transition.
- Array order (entities, triggers) is preserved by serialization but carries **no gameplay meaning**; identity is always the id, never the index.
