/**
 * CollisionClass — the closed, total classification of every entity kind's
 * role in collision resolution.
 *
 * GDOS alignment: Section 16 (systems key on component presence / data
 * classification, never on entity identity — REQ-154), Section 17
 * (collision evaluates a well-defined set).
 *
 * Semantics (P3 execution plan, design summary point 3):
 *  - 'solid'  — blocks movement; the physics sweep clamps against its AABB.
 *  - 'lethal' — never blocks; overlap defeats the player (hazard systems,
 *               S3.7; lasers are lethal only while their tick-parametric
 *               beam is on).
 *  - 'sensor' — never blocks; produces signals or field effects
 *               (plates/proximity → triggers S3.7; gravity zones S3.8).
 *
 * Runtime gating refines (never overrides) the static class:
 *  - door: solid only while closed (S3.1 reads initiallyOpen from the def;
 *    S3.7 introduces the runtime open flag and takes over).
 *  - collapsingFloor: solid until collapsed (runtime state arrives S3.6).
 *  - laser: lethal only during the on-fraction of its period (S3.7).
 *
 * The table is TOTAL over EntityKind: a unit test asserts every kind has an
 * entry (compile-time via Record + runtime coverage), so adding a §16 kind
 * without classifying it cannot compile.
 *
 * This file is pure data declarations — no function bodies (directory
 * invariant: src/components/ is logic-free).
 */

import type { EntityKind } from './Behavior';

export type CollisionClass = 'solid' | 'lethal' | 'sensor';

export const COLLISION_CLASS_BY_KIND: Readonly<Record<EntityKind, CollisionClass>> = {
  movingPlatform: 'solid',
  collapsingFloor: 'solid',
  iceSurface: 'solid',
  spike: 'lethal',
  laser: 'lethal',
  movingHazard: 'lethal',
  pressurePlate: 'sensor',
  proximityZone: 'sensor',
  door: 'solid',
  spring: 'solid',
  gravityZone: 'sensor',
  conveyor: 'solid',
};
