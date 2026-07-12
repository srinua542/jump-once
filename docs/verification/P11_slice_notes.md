# P11 — Slice-by-slice implementation notes

Running log of what each P11 slice actually did, kept as we go (the SDLC
agent-harness / `stage.js` nine-stage loop is deliberately NOT used this
phase, per explicit user instruction — this file is the substitute
durable record). `docs/verification/P11.md` (S11.7) synthesizes this into
the final phase report.

---

## S11.1 — Allocation-bounded runtime + render-hot-path audit (REQ-160/161/162/132)

**Claim tested:** REQ-160 ("zero-allocation runtime loop") is satisfied as
**allocation-bounded**, per dm-0119 — the immutable sim core is *not*
rewritten; only genuine unbounded/native-resource allocation is a bug.

**Sim side (confirmed correct, no change):** `Engine.tick` commits exactly
one snapshot per fixed step, never more — proven directly (not re-derived
from indirect evidence) by three new tests in
`test/unit/AllocationAudit.test.ts` using a `CountingStateManager` subclass
that counts real `StateManager.commit` calls: a multi-step tick commits
exactly `steps` times; a sub-step tick commits exactly once (persisting the
banked accumulator, never skipped, never duplicated); ten alternating
half-step calls commit exactly once per call (11 for 1 zero-delta + 10
half-step calls) while the world payload only advances on the five calls
that actually bank a whole step. This matches `Engine.tick`'s own documented
contract exactly — no drift found.

**Render side — real finding:** `render/gl/GlRenderer.ts`'s `drawBatches`
called `device.createBuffer()` on **every single call** (i.e. every frame,
per atlas page touched) before this slice. In production this maps to a
real `gl.createBuffer()` — a native GPU object allocated and abandoned 60
times a second per page, forever, for the life of the session. Unlike JS
object garbage (scavenged almost for free by V8's generational GC), a
GPU driver does not reclaim abandoned buffer objects for free — sustained
per-frame buffer creation is a well-known WebGL anti-pattern and the one
genuine unbounded-native-resource allocation found in the render hot path.

**Fix:** `render/gl/Atlas.ts` gained `ensureBuffer(pageIndex, device):
BufferHandle | null` — memoized exactly like the existing `page.texture`
pattern (created once, lazily, on first use; returned unchanged on every
subsequent call). `GlRenderer.drawBatches` now takes an `ensureBuffer`
resolver instead of calling `device.createBuffer()` itself; buffer *data*
is still re-uploaded every frame via `uploadBufferData` (the instance
transforms are genuinely live per-frame data) — only the buffer *handle*
is now persistent. A new regression test in `test/unit/GlExecutor.test.ts`
simulates five consecutive frames and asserts `createBuffer` fires exactly
once per page (not once per frame) while `uploadBufferData` still fires
once per page per frame.

**Deliberately not changed (documented, not a gap):** `SceneCompiler
.compileScene` allocates a fresh `DrawList` array + `DrawItem`/
`VisualRequest` objects, and rebuilds the entity quadtree, every frame.
`GlRenderer.packInstanceFloats` allocates a fresh `Float32Array` per batch
per frame. Both are small, contiguous, short-lived JS objects proportional
to on-screen entity/instance count (not accumulating, not unbounded) — the
same class of GC-scavenged garbage the sim's own one-snapshot-per-step
allocation already represents, and explicitly the kind of allocation
dm-0004/dm-0119 accept as the correctness/perf tradeoff. Rewriting
`SceneCompiler`/`packInstanceFloats` to use mutable scratch buffers would
be a real, invasive engine change with no corresponding measured problem —
out of scope per "don't add complexity beyond what the task requires."
`render/pool/Pool.ts`'s fixed-capacity backing arrays (never resized after
construction) already satisfy REQ-161 for particles/impacts/projectiles —
confirmed unchanged and already covered by `Pool.test.ts`.

**Tests:** +5 (`AllocationAudit.test.ts` ×3, `GlExecutor.test.ts` ×2).
`npm test`: 771 → 776 green. `tsc` clean.

**REQ status:** REQ-160 satisfied as allocation-bounded (dm-0119) —
candidate for VERIFIED at S11.5's compliance audit. REQ-161/162's P11
release-audit share delivered (the GPU buffer fix). REQ-132's profiling
share: the existing P8 `Profiler` class needed no change — this audit used
direct commit-counting/call-tracing instead of wall-clock profiling, which
is the correct tool for a *correctness* claim ("bounded, not zero") as
opposed to a *timing* claim; `Profiler` remains available for S11.2's
real-browser frame-timing work.
