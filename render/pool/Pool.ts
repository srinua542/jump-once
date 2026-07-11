/**
 * Pool — generic, fixed-capacity, generation-counted object pool (S9.4,
 * REQ-161: particles, visual impacts, projectiles).
 *
 * `acquire` recycles the oldest-freed slot (a FIFO free-queue) — never the
 * newest — so a just-released slot isn't immediately reused ahead of ones
 * freed longer ago (spreads reuse evenly, avoiding value-thrash on a hot
 * slot). Returns `null` when the pool is exhausted (fixed capacity — the
 * caller decides whether skipping a spawn is acceptable, never silently
 * evicting an active instance).
 *
 * Each slot carries a generation counter, bumped every time it is released.
 * A `PoolHandle` is only valid while its `generation` matches the slot's
 * current generation — this is what makes a stale handle (held past its
 * slot's next reuse) detectable rather than a silent wrong-object read, and
 * what makes a double `release()` on the same handle a safe no-op (the
 * second call's generation no longer matches).
 */

export interface PoolHandle {
  readonly index: number;
  readonly generation: number;
}

export interface Pool<T> {
  readonly capacity: number;
  readonly activeCount: number;
  /** Acquire a slot for `value`, or null if the pool is at capacity. */
  acquire(value: T): PoolHandle | null;
  /** Release a slot. A stale or already-released handle is a safe no-op. */
  release(handle: PoolHandle): void;
  /** Read a slot's value, or undefined if the handle is stale/released/out of range. */
  get(handle: PoolHandle): T | undefined;
}

export function createPool<T>(capacity: number): Pool<T> {
  const slots = new Array<T | undefined>(capacity).fill(undefined);
  const generations = new Array<number>(capacity).fill(0);
  const freeQueue: number[] = [];
  for (let i = 0; i < capacity; i++) freeQueue.push(i);
  let activeCount = 0;

  function isLive(handle: PoolHandle): boolean {
    return handle.index >= 0 && handle.index < capacity && generations[handle.index] === handle.generation && slots[handle.index] !== undefined;
  }

  return {
    capacity,
    get activeCount() {
      return activeCount;
    },
    acquire(value: T): PoolHandle | null {
      const index = freeQueue.shift();
      if (index === undefined) return null;
      slots[index] = value;
      activeCount++;
      return { index, generation: generations[index] };
    },
    release(handle: PoolHandle): void {
      if (!isLive(handle)) return;
      slots[handle.index] = undefined;
      generations[handle.index]++;
      activeCount--;
      freeQueue.push(handle.index);
    },
    get(handle: PoolHandle): T | undefined {
      return isLive(handle) ? slots[handle.index] : undefined;
    },
  };
}
