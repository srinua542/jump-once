/**
 * Sensors — signal sources drive interconnection triggers (S3.7). Runs after
 * playerPhysics and before hazardsAndGoal in the canonical pipeline, so it
 * reacts to the player's resolved position and its layout edits are visible
 * to the outcome check the same tick.
 *
 * GDOS alignment: Section 16 (pressure plates, proximity zones, mechanical
 * doors that modify layout dynamically — REQ-152), Section 13 (triggers are
 * standalone wiring records — dm-0015 — validated for referential integrity
 * and kind-compatibility at parse time, so this system trusts them).
 *
 * Semantics:
 *  - A source is ACTIVE when the player strictly overlaps its AABB
 *    (pressurePlate or proximityZone — the two signal-source kinds).
 *  - Triggers fire on the RISING EDGE (inactive→active) so a held plate does
 *    not re-fire every tick. `once` triggers fire at most once per life; the
 *    rest fire on every rising edge.
 *  - Triggers are evaluated in AUTHORED ARRAY ORDER; a cascade (plate → door,
 *    plate → platform) resolves single-pass this tick, deterministically.
 *  - Actions (closed union): open/close/toggleDoor set a target door's
 *    runtime doorOpen; collapseFloor starts a target floor's collapse timer
 *    (firstContactTick = tick, if not already collapsing); activatePlatform
 *    wakes a dormant triggered mover (activationTick = tick, if dormant).
 *
 * Pure: returns a new state when anything changed, else the same snapshot.
 * Reads the player position from world (never state.input — isolation).
 */

import type { GameState } from '../core/State';
import type { EntityId } from '../components/EntityId';
import type { TriggerActionKind } from '../components/Trigger';
import { TUNING } from '../components/Tuning';
import type { EntityState, WorldState } from '../entities/World';
import type { System } from './System';

/** Strict AABB overlap between the player and entity `i`'s collider (flush is not overlap). */
function playerOverlapsEntity(world: WorldState, i: number): boolean {
  const def = world.level.entities[i];
  const pos = world.entities[i].position;
  const half = TUNING.playerHalfExtents;
  const cx = pos.x + def.collider.offset.x;
  const cy = pos.y + def.collider.offset.y;
  return (
    Math.abs(world.playerPosition.x - cx) < half.x + def.collider.halfExtents.x &&
    Math.abs(world.playerPosition.y - cy) < half.y + def.collider.halfExtents.y
  );
}

/** Apply one trigger action to a target entity record, returning the (possibly new) record. */
function applyAction(action: TriggerActionKind, target: EntityState, tick: number): EntityState {
  switch (action) {
    case 'openDoor':
      return target.doorOpen ? target : { ...target, doorOpen: true };
    case 'closeDoor':
      return target.doorOpen ? { ...target, doorOpen: false } : target;
    case 'toggleDoor':
      return { ...target, doorOpen: !target.doorOpen };
    case 'collapseFloor':
      return target.firstContactTick === null ? { ...target, firstContactTick: tick } : target;
    case 'activatePlatform':
      return target.activationTick === null ? { ...target, activationTick: tick } : target;
  }
}

/** The sensors/triggers System. Fires authored triggers on rising edges and edits layout. */
export const sensorsSystem: System<WorldState> = {
  id: 'sensors',
  step(state: GameState<WorldState>): GameState<WorldState> {
    const world = state.world;
    if (world.runState !== 'playing' || world.level.triggers.length === 0) return state;

    // Source-entity id → index (validator guarantees every source/target resolves).
    const indexById = new Map<EntityId, number>();
    for (let i = 0; i < world.level.entities.length; i++) indexById.set(world.level.entities[i].id, i);

    let working: EntityState[] | null = null; // lazy mutable clone of entities
    const activePrev = world.triggerActivePrev.slice();
    const fired = world.triggerFired.slice();
    let changed = false;

    for (let t = 0; t < world.level.triggers.length; t++) {
      const trigger = world.level.triggers[t];
      const sourceIndex = indexById.get(trigger.source);
      const active = sourceIndex !== undefined && playerOverlapsEntity(world, sourceIndex);
      const rising = active && !world.triggerActivePrev[t];
      const shouldFire = rising && (!trigger.once || !world.triggerFired[t]);

      if (active !== world.triggerActivePrev[t]) {
        activePrev[t] = active;
        changed = true;
      }

      if (shouldFire) {
        for (const targetId of trigger.targets) {
          const ti = indexById.get(targetId);
          if (ti === undefined) continue;
          const cur = working ?? world.entities;
          const updated = applyAction(trigger.action, cur[ti], state.tick);
          if (updated !== cur[ti]) {
            if (working === null) working = world.entities.slice();
            working[ti] = updated;
            changed = true;
          }
        }
        if (trigger.once && !fired[t]) {
          fired[t] = true;
          changed = true;
        }
      }
    }

    if (!changed) return state;
    return {
      ...state,
      world: {
        ...world,
        entities: working ?? world.entities,
        triggerActivePrev: activePrev,
        triggerFired: fired,
      },
    };
  },
};
