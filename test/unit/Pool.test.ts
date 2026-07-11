/**
 * S9.4 — Pool: generic fixed-capacity, generation-counted object pool
 * (REQ-161). acquire/release/stale-handle/double-release/capacity-from-data.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPool } from '../../render/pool/Pool';
import { createParticlePool, DEFAULT_PARTICLE_POOL_PROFILE, type ParticleInstance } from '../../render/pool/ParticlePool';

test('acquire fills slots up to capacity, then returns null', () => {
  const pool = createPool<number>(3);
  const a = pool.acquire(1);
  const b = pool.acquire(2);
  const c = pool.acquire(3);
  assert.ok(a && b && c);
  assert.equal(pool.activeCount, 3);
  assert.equal(pool.acquire(4), null, 'expected exhaustion to return null, never evict an active slot');
});

test('release frees a slot for reuse (oldest-freed-first, FIFO)', () => {
  const pool = createPool<string>(2);
  const a = pool.acquire('a')!;
  const b = pool.acquire('b')!;
  pool.release(a);
  const c = pool.acquire('c')!;
  assert.equal(c.index, a.index, 'expected the oldest-freed slot (a) to be recycled first');
  assert.equal(pool.get(b)?.valueOf(), 'b', 'b must remain untouched');
  assert.equal(pool.get(c), 'c');
});

test('a stale handle (from before the slot was recycled) reads as undefined, not the new value', () => {
  const pool = createPool<string>(1);
  const first = pool.acquire('first')!;
  pool.release(first);
  const second = pool.acquire('second')!;
  assert.equal(second.index, first.index);
  assert.notEqual(second.generation, first.generation);
  assert.equal(pool.get(first), undefined, 'the stale handle must not read the new occupant');
  assert.equal(pool.get(second), 'second');
});

test('double-release is a safe no-op: activeCount and the free queue are not double-counted', () => {
  const pool = createPool<number>(2);
  const a = pool.acquire(1)!;
  pool.acquire(2);
  assert.equal(pool.activeCount, 2);
  pool.release(a);
  assert.equal(pool.activeCount, 1);
  pool.release(a); // double release of the same (now-stale) handle
  assert.equal(pool.activeCount, 1, 'a double release must not decrement activeCount twice');
  /* the freed slot must appear exactly once in the free queue: acquiring
     twice more should yield two DIFFERENT indices, not the same one reused
     twice from a duplicated free-queue entry. */
  const r1 = pool.acquire(10)!;
  const r2 = pool.acquire(11);
  assert.ok(r1 !== null);
  assert.equal(r2, null, 'capacity is 2 and only one slot was genuinely free — a duplicated free-queue entry would wrongly allow a second acquire');
});

test('releasing an out-of-range or already-released handle never throws', () => {
  const pool = createPool<number>(1);
  assert.doesNotThrow(() => pool.release({ index: -1, generation: 0 }));
  assert.doesNotThrow(() => pool.release({ index: 99, generation: 0 }));
  const h = pool.acquire(1)!;
  pool.release(h);
  assert.doesNotThrow(() => pool.release(h));
});

test('ParticlePool capacity comes from profile data, not a literal', () => {
  const custom = createParticlePool({ capacity: 4 });
  for (let i = 0; i < 4; i++) assert.ok(custom.acquire({ worldX: 0, worldY: 0, velocityX: 0, velocityY: 0, ticksRemaining: 10, category: 'danger' } as ParticleInstance) !== null);
  assert.equal(custom.acquire({} as ParticleInstance), null);

  const withDefault = createParticlePool();
  assert.equal(withDefault.capacity, DEFAULT_PARTICLE_POOL_PROFILE.capacity);
});
