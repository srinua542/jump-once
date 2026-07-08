/**
 * BehaviorDef — the closed, discriminated union of entity behavior payloads,
 * one member per PRD §16 library entry.
 *
 * GDOS alignment: Section 16 (Gameplay Systems & Modular Components Library),
 * Section 13 (all mechanical values as structured data payloads).
 *
 * Design (P2 execution plan, design summary point 3; dm-0009):
 *  - `kind` is the single discriminant; systems (P3) key on payload presence,
 *    not on entity class hierarchies. There is no ECS machinery and there are
 *    no entity classes — records only.
 *  - Everything dynamic is an entity behavior, never a tile (dm-0009):
 *    collapsing floors and doors "modify the layout" by entity state
 *    transition; the tilemap stays frozen.
 *  - Time-valued fields are authored in seconds; systems convert to fixed
 *    steps deterministically (FIXED_STEP_SECONDS), never via real delta time
 *    (dm-0003).
 *  - Kinetic modifiers (spring, gravityZone, conveyor) alter velocity or
 *    inertia but must never consume the single jump (REQ-153) — that rule is
 *    a P3 system invariant, not data.
 *  - The union is CLOSED: extending it is a schema change (version bump,
 *    dm-0010). ENTITY_KINDS mirrors the union for programmatic iteration
 *    (fixture coverage tests, validators); a compile-time exhaustiveness
 *    check in the unit tests keeps the list and the union in lockstep.
 *
 * This file is pure data declarations — no function bodies (directory
 * invariant: src/components/ is logic-free).
 */

import type { Vec2 } from '../core/Vec2';

/** Path traversal mode for waypoint-driven movers (§16: linear, looping, triggered). */
export type MovingMode = 'linear' | 'looping' | 'triggered';

/* ── Environmental elements (§16) ─────────────────────────────────────── */

/** Moving platform following a waypoint polyline at constant speed. */
export interface MovingPlatformDef {
  readonly kind: 'movingPlatform';
  /** Polyline in world units, local to the entity's transform position. ≥ 2 points. */
  readonly waypoints: readonly Vec2[];
  /** Traversal speed in world units per second. Strictly positive. */
  readonly speed: number;
  readonly mode: MovingMode;
}

/** Floor that collapses after being stood on. */
export interface CollapsingFloorDef {
  readonly kind: 'collapsingFloor';
  /** Delay between first contact and collapse, in seconds. ≥ 0. */
  readonly collapseDelaySeconds: number;
}

/** Frictionless ice surface region. */
export interface IceSurfaceDef {
  readonly kind: 'iceSurface';
}

/* ── Hazards (§16: instant defeat on boundary intersection) ───────────── */

/** Static spike hazard. */
export interface SpikeDef {
  readonly kind: 'spike';
}

/** Timed laser array: on for `onFractionOfPeriod` of each period. */
export interface LaserDef {
  readonly kind: 'laser';
  /** Full on+off cycle length in seconds. Strictly positive. */
  readonly periodSeconds: number;
  /** Fraction of the period the beam is lethal. In (0, 1]. */
  readonly onFractionOfPeriod: number;
  /** Cycle offset in seconds, for de-synchronizing arrays. ≥ 0. */
  readonly phaseSeconds: number;
}

/** Hazard following a waypoint polyline. */
export interface MovingHazardDef {
  readonly kind: 'movingHazard';
  /** Polyline in world units, local to the entity's transform position. ≥ 2 points. */
  readonly waypoints: readonly Vec2[];
  /** Traversal speed in world units per second. Strictly positive. */
  readonly speed: number;
  readonly mode: MovingMode;
}

/* ── Interactive elements (§16: modify layouts dynamically) ───────────── */

/** Pressure plate signal source. Wiring to targets lives in TriggerDef (schema layer), not here. */
export interface PressurePlateDef {
  readonly kind: 'pressurePlate';
}

/** Proximity zone signal source. Its AabbDef is the sensed region. */
export interface ProximityZoneDef {
  readonly kind: 'proximityZone';
}

/** Mechanical door. Open/close transitions arrive via triggers. */
export interface DoorDef {
  readonly kind: 'door';
  readonly initiallyOpen: boolean;
}

/* ── Kinetic modifiers (§16: alter velocity/inertia, never consume the jump) ── */

/** Directional launch spring. */
export interface SpringDef {
  readonly kind: 'spring';
  /** Velocity imparted on contact, world units per second. Non-zero. */
  readonly launchVelocity: Vec2;
}

/** Gravity-altering zone. Scale -1 inverts gravity inside the zone's AabbDef. */
export interface GravityZoneDef {
  readonly kind: 'gravityZone';
  /** Multiplier applied to world gravity while inside. Finite, non-zero. */
  readonly gravityScale: number;
}

/** Conveyor surface adding horizontal velocity to grounded entities. */
export interface ConveyorDef {
  readonly kind: 'conveyor';
  /** Surface velocity in world units per second; sign is direction. Non-zero. */
  readonly surfaceVelocityX: number;
}

/* ── The closed union ─────────────────────────────────────────────────── */

export type BehaviorDef =
  | MovingPlatformDef
  | CollapsingFloorDef
  | IceSurfaceDef
  | SpikeDef
  | LaserDef
  | MovingHazardDef
  | PressurePlateDef
  | ProximityZoneDef
  | DoorDef
  | SpringDef
  | GravityZoneDef
  | ConveyorDef;

/** The discriminant set. Derived from the union so the two can never drift. */
export type EntityKind = BehaviorDef['kind'];

/**
 * Closed kind list for programmatic iteration (fixture coverage tests,
 * validator tables). Unit tests assert compile-time exhaustiveness against
 * EntityKind and runtime uniqueness.
 */
export const ENTITY_KINDS: readonly EntityKind[] = [
  'movingPlatform',
  'collapsingFloor',
  'iceSurface',
  'spike',
  'laser',
  'movingHazard',
  'pressurePlate',
  'proximityZone',
  'door',
  'spring',
  'gravityZone',
  'conveyor',
];
