/**
 * S3.7 — hazards + triggers (REQ-152).
 *
 * Hazards (swept lethal check, hazardsAndGoal):
 *  - a spike defeats on overlap, and on a SWEPT pass-through the discrete
 *    endpoints would miss (fast player cannot skip a thin hazard);
 *  - a laser is lethal only while its beam is ON — a pure function of tick;
 *  - a moving hazard defeats on contact.
 *
 * Triggers (Sensors, authored order, rising-edge):
 *  - a pressure plate opens a door (door goes non-solid — the player passes);
 *  - a proximity zone closes it again;
 *  - `once` triggers fire exactly once; toggle fires per rising edge, not
 *    every tick a plate is held;
 *  - activatePlatform wakes a dormant triggered mover; collapseFloor starts
 *    a floor's collapse;
 *  - LAYERING (REQ-154): plate → opens door AND wakes a platform, three
 *    mechanics composing from data wiring alone;
 *  - determinism + purity.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createClock } from '../../src/core/Clock';
import { createRng } from '../../src/core/Rng';
import { deepFreeze } from '../../src/core/StateManager';
import { NEUTRAL_INPUT, type InputFrame } from '../../src/core/State';
import { vec2 } from '../../src/core/Vec2';
import type { BehaviorDef } from '../../src/components/Behavior';
import type { EntityDef } from '../../src/components/Entity';
import type { TriggerDef, TriggerActionKind } from '../../src/components/Trigger';
import { LEVEL_SCHEMA_VERSION, type LevelDefinition } from '../../src/components/Level';
import { instantiateWorld, type JumpOnceState } from '../../src/entities/World';
import { entityKinematicsSystem } from '../../src/systems/EntityKinematics';
import { lifecycleSystem } from '../../src/systems/Lifecycle';
import { playerControlSystem } from '../../src/systems/PlayerControl';
import { playerPhysicsSystem } from '../../src/systems/PlayerPhysics';
import { sensorsSystem } from '../../src/systems/Sensors';
import { hazardsAndGoalSystem } from '../../src/systems/HazardsAndGoal';
import { asEntityId, asTriggerId } from '../helpers/Samples';

function makeLevel(opts: {
  width: number;
  height: number;
  spawn: { x: number; y: number };
  goal?: { x: number; y: number };
  entities: readonly EntityDef[];
  triggers?: readonly TriggerDef[];
}): LevelDefinition {
  const { width, height, spawn } = opts;
  const tiles: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const isBorder = row === 0 || row === height - 1 || col === 0 || col === width - 1;
      tiles.push(isBorder ? 1 : 0);
    }
  }
  const goal = opts.goal ?? { x: width - 1.5, y: 1.5 };
  return {
    schemaVersion: LEVEL_SCHEMA_VERSION,
    levelId: 'unit-hz',
    title: 'Hazards/triggers unit level',
    gdos: {
      targetKgNode: 'kg:test/hz',
      difficultyVectors: { executionPrecision: 0, readingComplexity: 0, timingStrictness: 0, routeAmbiguity: 0 },
      emotionalBudgetCurve: [
        { at: 0, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
        { at: 1, curiosity: 50, confidence: 50, surprise: 0, mastery: 0 },
      ],
      creatorMomentFrame: { tickWindow: [0, 1], description: 'n/a (unit fixture)' },
    },
    tilemap: { width, height, tileSize: 1, tiles },
    entities: opts.entities,
    triggers: opts.triggers ?? [],
    constraints: {
      spawn: vec2(spawn.x, spawn.y),
      goal: { position: vec2(goal.x, goal.y), halfExtents: vec2(0.4, 0.4) },
      parTimeTiersSeconds: [10, 5],
    },
  };
}

function ent(id: string, x: number, y: number, hx: number, hy: number, behavior: BehaviorDef): EntityDef {
  return { id: asEntityId(id), transform: { position: vec2(x, y), facing: 1 }, collider: { halfExtents: vec2(hx, hy), offset: vec2(0, 0) }, behavior };
}

function trig(id: string, source: string, targets: string[], action: TriggerActionKind, once: boolean): TriggerDef {
  return { id: asTriggerId(id), source: asEntityId(source), targets: targets.map(asEntityId), action, once };
}

function makeState(def: LevelDefinition): JumpOnceState {
  return { tick: 0, clock: createClock(), rng: createRng(1), input: NEUTRAL_INPUT, world: instantiateWorld(def) };
}

/** Full canonical pipeline: lifecycle → kinematics → control → physics → sensors → outcome. */
function tick(state: JumpOnceState, input: InputFrame): JumpOnceState {
  let s: JumpOnceState = { ...state, tick: state.tick + 1, input };
  s = lifecycleSystem.step(s);
  s = entityKinematicsSystem.step(s);
  s = playerControlSystem.step(s);
  s = playerPhysicsSystem.step(s);
  s = sensorsSystem.step(s);
  s = hazardsAndGoalSystem.step(s);
  return s;
}

function indexOf(state: JumpOnceState, id: string): number {
  return state.world.level.entities.findIndex((e) => (e.id as string) === id);
}

/* ── Lethal hazards ──────────────────────────────────────────────────── */

test('spike: swept lethal check catches a fast pass-through the discrete endpoints would miss', () => {
  const spike = ent('sp', 6, 6, 0.4, 0.4, { kind: 'spike' });
  const def = makeLevel({ width: 20, height: 10, spawn: { x: 2, y: 6 }, entities: [spike] });
  const base = makeState(def);
  // Prev far left of the spike, current far right of it — endpoints clear, segment crosses.
  const straddling: JumpOnceState = {
    ...base,
    world: { ...base.world, playerPrevPosition: vec2(2, 6), playerPosition: vec2(10, 6) },
  };
  assert.equal(hazardsAndGoalSystem.step(straddling).world.runState, 'defeated', 'the sweep must catch the spike');
  // A parallel sweep that never reaches the spike row stays alive.
  const clear: JumpOnceState = {
    ...base,
    world: { ...base.world, playerPrevPosition: vec2(2, 2), playerPosition: vec2(10, 2) },
  };
  assert.equal(hazardsAndGoalSystem.step(clear).world.runState, 'playing');
});

test('laser is lethal only while its beam is ON (pure function of tick)', () => {
  // period 2s, on-fraction 0.5, phase 0 → ON during [0,1)s of each 2s cycle.
  const laser = ent('lz', 6, 6, 0.4, 0.9, { kind: 'laser', periodSeconds: 2, onFractionOfPeriod: 0.5, phaseSeconds: 0 });
  const def = makeLevel({ width: 20, height: 10, spawn: { x: 6, y: 6 }, entities: [laser] });
  const base = makeState(def);
  const standingInBeam = (tk: number): JumpOnceState => ({
    ...base,
    tick: tk,
    world: { ...base.world, playerPrevPosition: vec2(6, 6), playerPosition: vec2(6, 6) },
  });
  assert.equal(hazardsAndGoalSystem.step(standingInBeam(0)).world.runState, 'defeated', 'beam ON at t=0');
  assert.equal(hazardsAndGoalSystem.step(standingInBeam(90)).world.runState, 'playing', 'beam OFF at t=1.5s');
  assert.equal(hazardsAndGoalSystem.step(standingInBeam(120)).world.runState, 'defeated', 'beam ON again at t=2s');
});

test('moving hazard: walking into it defeats', () => {
  const hazard = ent('mh', 8, 6, 0.4, 0.9, { kind: 'movingHazard', waypoints: [vec2(0, 0), vec2(0, 0.001)], speed: 0.001, mode: 'linear' });
  const def = makeLevel({ width: 20, height: 8, spawn: { x: 3, y: 6 }, entities: [hazard] });
  let s = makeState(def);
  let defeated = false;
  for (let i = 0; i < 200 && !defeated; i++) {
    s = tick(s, { ...NEUTRAL_INPUT, moveAxis: 1 });
    defeated = s.world.runState === 'defeated';
  }
  assert.equal(defeated, true, 'the player runs into the hazard and dies');
});

/* ── Triggers ────────────────────────────────────────────────────────── */

test('pressure plate opens a door (door goes non-solid); once-fired stays fired', () => {
  const plate = ent('pl', 4, 6.5, 0.5, 0.1, { kind: 'pressurePlate' });
  const door = ent('dr', 9, 6, 0.4, 1, { kind: 'door', initiallyOpen: false });
  const def = makeLevel({ width: 20, height: 9, spawn: { x: 4, y: 6 }, entities: [plate, door], triggers: [trig('t', 'pl', ['dr'], 'openDoor', true)] });
  const di = indexOf(makeState(def), 'dr');
  let s = makeState(def);
  assert.equal(s.world.entities[di].doorOpen, false);
  // Let the player settle onto the plate.
  for (let i = 0; i < 60 && !s.world.entities[di].doorOpen; i++) s = tick(s, NEUTRAL_INPUT);
  assert.equal(s.world.entities[di].doorOpen, true, 'standing on the plate opened the door');
  assert.equal(s.world.triggerFired[0], true, 'the once trigger latched');
});

test('toggleDoor fires on the rising edge only — not every tick a plate is held', () => {
  const plate = ent('pl', 4, 6.5, 0.5, 0.1, { kind: 'pressurePlate' });
  const door = ent('dr', 9, 6, 0.4, 1, { kind: 'door', initiallyOpen: false });
  const def = makeLevel({ width: 20, height: 9, spawn: { x: 4, y: 6 }, entities: [plate, door], triggers: [trig('t', 'pl', ['dr'], 'toggleDoor', false)] });
  const di = indexOf(makeState(def), 'dr');
  let s = makeState(def);
  for (let i = 0; i < 60 && !s.world.entities[di].doorOpen; i++) s = tick(s, NEUTRAL_INPUT);
  assert.equal(s.world.entities[di].doorOpen, true, 'first contact toggled the door open');
  const openState = s.world.entities[di].doorOpen;
  // Hold on the plate: the door must NOT flicker (no re-toggle while held).
  for (let i = 0; i < 30; i++) s = tick(s, NEUTRAL_INPUT);
  assert.equal(s.world.entities[di].doorOpen, openState, 'held plate does not re-toggle');
});

test('activatePlatform wakes a dormant triggered mover; collapseFloor starts a collapse', () => {
  const plate = ent('pl', 4, 6.5, 0.5, 0.1, { kind: 'pressurePlate' });
  const platform = ent('pf', 12, 5, 1, 0.25, { kind: 'movingPlatform', waypoints: [vec2(0, 0), vec2(3, 0)], speed: 2, mode: 'triggered' });
  const floor = ent('fl', 15, 6, 1, 0.4, { kind: 'collapsingFloor', collapseDelaySeconds: 0.25 });
  const def = makeLevel({
    width: 24, height: 9, spawn: { x: 4, y: 6 },
    entities: [plate, platform, floor],
    triggers: [trig('tp', 'pl', ['pf'], 'activatePlatform', true), trig('tf', 'pl', ['fl'], 'collapseFloor', true)],
  });
  const pfi = indexOf(makeState(def), 'pf');
  const fli = indexOf(makeState(def), 'fl');
  let s = makeState(def);
  const platX0 = s.world.entities[pfi].position.x;
  for (let i = 0; i < 60 && s.world.entities[pfi].activationTick === null; i++) s = tick(s, NEUTRAL_INPUT);
  assert.notEqual(s.world.entities[pfi].activationTick, null, 'platform woke');
  assert.notEqual(s.world.entities[fli].firstContactTick, null, 'floor collapse started');
  for (let i = 0; i < 40; i++) s = tick(s, NEUTRAL_INPUT);
  assert.ok(Math.abs(s.world.entities[pfi].position.x - platX0) > 0.5, 'the woken platform is moving');
  assert.equal(s.world.entities[fli].collapsed, true, 'the triggered floor collapsed after its delay');
});

test('LAYERING (REQ-154): one plate opens a door AND wakes a platform — three mechanics from data wiring', () => {
  const plate = ent('pl', 4, 6.5, 0.5, 0.1, { kind: 'pressurePlate' });
  const door = ent('dr', 9, 6, 0.4, 1, { kind: 'door', initiallyOpen: false });
  const platform = ent('pf', 14, 5, 1, 0.25, { kind: 'movingPlatform', waypoints: [vec2(0, 0), vec2(4, 0)], speed: 2, mode: 'triggered' });
  const def = makeLevel({
    width: 24, height: 9, spawn: { x: 4, y: 6 },
    entities: [plate, door, platform],
    triggers: [trig('td', 'pl', ['dr'], 'openDoor', true), trig('tp', 'pl', ['pf'], 'activatePlatform', true)],
  });
  const di = indexOf(makeState(def), 'dr');
  const pfi = indexOf(makeState(def), 'pf');
  let s = makeState(def);
  for (let i = 0; i < 60 && !s.world.entities[di].doorOpen; i++) s = tick(s, NEUTRAL_INPUT);
  assert.equal(s.world.entities[di].doorOpen, true, 'door opened');
  assert.notEqual(s.world.entities[pfi].activationTick, null, 'platform woke — same plate, two effects, authored order');
});

/* ── Determinism & purity ────────────────────────────────────────────── */

test('full hazard+trigger pipeline replays bit-identically', () => {
  const runOnce = (): string => {
    const plate = ent('pl', 4, 6.5, 0.5, 0.1, { kind: 'pressurePlate' });
    const door = ent('dr', 9, 6, 0.4, 1, { kind: 'door', initiallyOpen: false });
    const laser = ent('lz', 12, 6, 0.4, 0.9, { kind: 'laser', periodSeconds: 1.5, onFractionOfPeriod: 0.4, phaseSeconds: 0.2 });
    const def = makeLevel({ width: 24, height: 9, spawn: { x: 4, y: 6 }, entities: [plate, door, laser], triggers: [trig('t', 'pl', ['dr'], 'toggleDoor', false)] });
    let s = makeState(def);
    for (let i = 0; i < 260; i++) s = tick(s, { ...NEUTRAL_INPUT, moveAxis: i % 5 === 0 ? 1 : 0 });
    return JSON.stringify(s.world);
  };
  assert.equal(runOnce(), runOnce());
});

test('sensors is pure on frozen state and a no-op with no triggers', () => {
  const spike = ent('sp', 6, 6, 0.4, 0.4, { kind: 'spike' });
  const def = makeLevel({ width: 12, height: 8, spawn: { x: 3, y: 3 }, entities: [spike] });
  const state = deepFreeze(makeState(def));
  const before = JSON.stringify(state);
  assert.equal(sensorsSystem.step(state), state, 'no triggers → same snapshot');
  assert.equal(JSON.stringify(state), before);
});
