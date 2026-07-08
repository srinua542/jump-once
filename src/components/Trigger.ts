/**
 * TriggerDef — one interconnection wire: a signal source entity drives an
 * action on target entities.
 *
 * GDOS alignment: Section 13 ("interconnected triggers must all be statically
 * defined within the payload"), Section 16 (interactive elements modify
 * layouts dynamically).
 *
 * Design (dm-0015): triggers are standalone wiring records, NOT targets
 * embedded in plate/zone behavior payloads — signal sources stay decoupled
 * from their effects (REQ-154) and the interconnection graph is first-class
 * data the validator can check (source exists and is a signal-source kind;
 * every target exists and its kind is compatible with the action).
 *
 * The action union is CLOSED; extending it is a schema version bump
 * (dm-0010). TRIGGER_ACTIONS mirrors the union for programmatic iteration;
 * unit tests keep list and union in lockstep.
 *
 * This file is pure data declarations — no function bodies (directory
 * invariant: src/components/ is logic-free).
 */

import type { EntityId } from './EntityId';

declare const TRIGGER_ID_BRAND: unique symbol;

/** Stable trigger identity, unique among triggers within a level. Minted only by the schema validator. */
export type TriggerId = string & { readonly [TRIGGER_ID_BRAND]: true };

/** What firing the trigger does to each target. */
export type TriggerActionKind =
  | 'openDoor'
  | 'closeDoor'
  | 'toggleDoor'
  | 'collapseFloor'
  | 'activatePlatform';

/** Closed action list for programmatic iteration (coverage tests, validator tables). */
export const TRIGGER_ACTIONS: readonly TriggerActionKind[] = [
  'openDoor',
  'closeDoor',
  'toggleDoor',
  'collapseFloor',
  'activatePlatform',
];

/** Which target entity kind each action may drive (validator table, dm-0015). */
export const TRIGGER_ACTION_TARGET_KIND: Readonly<Record<TriggerActionKind, 'door' | 'collapsingFloor' | 'movingPlatform'>> = {
  openDoor: 'door',
  closeDoor: 'door',
  toggleDoor: 'door',
  collapseFloor: 'collapsingFloor',
  activatePlatform: 'movingPlatform',
};

export interface TriggerDef {
  readonly id: TriggerId;
  /** Signal source; must reference a pressurePlate or proximityZone entity. */
  readonly source: EntityId;
  /** Driven entities; non-empty, each of the action's compatible kind. */
  readonly targets: readonly EntityId[];
  readonly action: TriggerActionKind;
  /** True: fires at most once per level attempt. False: fires on every source activation. */
  readonly once: boolean;
}
