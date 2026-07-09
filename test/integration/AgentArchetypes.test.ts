/**
 * S4.1 — the agent-archetype simulator harness (REQ-141): five archetypes
 * drive the frozen deterministic sim headlessly, in the canonical pipeline
 * order, producing replay tapes.
 *
 *  - completion: all five archetypes finish a flat corridor and a gap room
 *    that demands THE jump (evidence: jumpLock 'spent' on completion);
 *  - determinism (dm-0024): same (level, seed, archetype) ⇒ byte-identical
 *    tape and bit-identical final state across independent runs;
 *  - replay anchoring (dm-0023): re-driving the recorded tape with NO agent
 *    present reproduces the live final state bit for bit — which also proves
 *    the agent RNG stream never touched the sim's;
 *  - distinctness: the five archetypes produce pairwise-distinct tapes on a
 *    discriminating fixture (they are five behaviors, not five names);
 *  - halting: tick and attempt budgets terminate unreachable-goal and
 *    always-lethal fixtures with a typed 'timeout', never a hang or throw.
 *
 * Fixtures here are in-code unit scaffolding (M2 content gate: this is NOT
 * level content), validated through the real parseLevel gate so the harness
 * consumes exactly what production levels will be.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { LevelDefinition } from '../../src/components/Level';
import { parseTape, serializeTape } from '../../src/schema/TapeIO';
import { buildGridLevel } from '../helpers/GridLevel';
import {
  ARCHETYPES,
  archetypePolicy,
  type ArchetypeName,
} from '../../src/eval/Archetypes';
import {
  DEFAULT_EVAL_BUDGET,
  replayTape,
  runAgent,
  type AgentRunResult,
} from '../../src/eval/AgentHarness';

const SEED = 20260709;
const ALL: readonly ArchetypeName[] = [
  'firstTime',
  'cautious',
  'experienced',
  'expertSpeedrunner',
  'curiousExplorer',
];

/** Flat run to the goal — every archetype should stroll it. */
const CORRIDOR = buildGridLevel('s41-corridor', [
  '####################',
  '#..................#',
  '#..................#',
  '#S................G#',
  '####################',
]);

/**
 * The discriminating fixture: a 2-wide spiked shaft splits the route, so
 * finishing REQUIRES the one jump; the spikes sit inside cautious's caution
 * radius on approach, and the open left half gives the explorer room to roam.
 */
const GAP_ROOM = buildGridLevel('s41-gap-room', [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#S................G#',
  '#########..#########',
  '#########..#########',
  '#########xx#########',
  '####################',
]);

/** The goal is walled off entirely: only outcome is the tick budget. */
const SEALED = buildGridLevel('s41-sealed', [
  '############',
  '#S...#....G#',
  '#....#.....#',
  '#....#.....#',
  '############',
]);

/** Spawn drops straight onto a spike carpet: every life ends immediately. */
const SPIKE_CARPET = buildGridLevel('s41-spike-carpet', [
  '##########',
  '#S......G#',
  '#........#',
  '#xxxxxxxx#',
  '##########',
]);

function run(def: LevelDefinition, name: ArchetypeName, budget = DEFAULT_EVAL_BUDGET): AgentRunResult {
  return runAgent(def, SEED, archetypePolicy(ARCHETYPES[name]), budget);
}

test('all five archetypes complete the flat corridor headlessly, without dying', () => {
  for (const name of ALL) {
    const result = run(CORRIDOR, name);
    assert.equal(result.outcome, 'completed', `${name} must complete the corridor`);
    assert.equal(result.attempts, 0, `${name} has nothing to die on`);
    assert.equal(result.finalState.world.runState, 'completed');
    assert.equal(result.ticksElapsed, result.tape.frames.length);
  }
});

test('all five archetypes cross the spiked gap — completion requires and spends THE jump', () => {
  for (const name of ALL) {
    const result = run(GAP_ROOM, name);
    assert.equal(result.outcome, 'completed', `${name} must complete the gap room`);
    assert.equal(
      result.finalState.world.jumpLock.phase,
      'spent',
      `${name} cannot have finished without the one jump`,
    );
  }
});

test('archetypes are five behaviors, not five names: pairwise-distinct tapes on the gap room', () => {
  const tapes = ALL.map((name) => serializeTape(run(GAP_ROOM, name).tape));
  for (let a = 0; a < tapes.length; a++) {
    for (let b = a + 1; b < tapes.length; b++) {
      assert.notEqual(tapes[a], tapes[b], `${ALL[a]} and ${ALL[b]} produced identical tapes`);
    }
  }
});

test('archetype character shows in the clock: the speedrunner is strictly fastest, the explorer strictly slowest', () => {
  const ticks = new Map(ALL.map((name) => [name, run(GAP_ROOM, name).ticksElapsed]));
  for (const name of ALL) {
    if (name !== 'expertSpeedrunner') {
      assert.ok(
        ticks.get('expertSpeedrunner')! < ticks.get(name)!,
        `expert (${ticks.get('expertSpeedrunner')}) must beat ${name} (${ticks.get(name)})`,
      );
    }
    if (name !== 'curiousExplorer') {
      assert.ok(
        ticks.get('curiousExplorer')! > ticks.get(name)!,
        `explorer (${ticks.get('curiousExplorer')}) must dawdle behind ${name} (${ticks.get(name)})`,
      );
    }
  }
});

test('determinism: same (level, seed, archetype) twice ⇒ byte-identical tape and bit-identical final state', () => {
  for (const name of ALL) {
    const a = run(GAP_ROOM, name);
    const b = run(GAP_ROOM, name);
    assert.equal(serializeTape(a.tape), serializeTape(b.tape), `${name} tape must be reproducible`);
    assert.equal(JSON.stringify(a.finalState), JSON.stringify(b.finalState), `${name} final state must be reproducible`);
  }
});

test('replay anchoring: the recorded tape alone (no agent) reproduces the live final state bit for bit', () => {
  for (const name of ALL) {
    const live = run(GAP_ROOM, name);
    const replayed = replayTape(GAP_ROOM, SEED, live.tape.frames);
    assert.equal(
      JSON.stringify(replayed),
      JSON.stringify(live.finalState),
      `${name}: tape replay diverged from the live run — the agent leaked into sim state`,
    );
  }
});

test('halting on an unreachable goal: the tick budget is exact and the outcome is typed, never a hang', () => {
  const budget = { maxTicks: 300, maxAttempts: 25 };
  for (const name of ['expertSpeedrunner', 'curiousExplorer'] as const) {
    const result = run(SEALED, name, budget);
    assert.equal(result.outcome, 'timeout');
    assert.equal(result.ticksElapsed, budget.maxTicks, `${name} must consume exactly the tick budget`);
    assert.equal(result.finalState.world.runState, 'playing');
  }
});

test('halting on an always-lethal drop: the attempt budget stops the death loop', () => {
  const budget = { maxTicks: 600, maxAttempts: 4 };
  const result = run(SPIKE_CARPET, 'expertSpeedrunner', budget);
  assert.equal(result.outcome, 'timeout');
  assert.equal(result.attempts, budget.maxAttempts, 'the run must stop at the attempt budget');
  assert.ok(result.ticksElapsed < budget.maxTicks, 'attempts, not ticks, must be the binding constraint');
});

test('the recorded tape round-trips through the schema gate with correct metadata (dm-0023)', () => {
  const live = run(GAP_ROOM, 'expertSpeedrunner');
  assert.equal(live.tape.levelId, GAP_ROOM.levelId);
  assert.equal(live.tape.seed, SEED, 'an already-uint32 seed is stored as-is');
  const reparsed = parseTape(JSON.parse(serializeTape(live.tape)));
  assert.equal(reparsed.ok, true);
  if (!reparsed.ok) return;
  assert.deepEqual(reparsed.value, live.tape);
  const replayed = replayTape(GAP_ROOM, reparsed.value.seed, reparsed.value.frames);
  assert.equal(JSON.stringify(replayed), JSON.stringify(live.finalState), 'the serialized form is a full reproduction recipe');
});
