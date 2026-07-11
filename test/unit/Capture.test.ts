/**
 * S8.5 — telemetry capture (REQ-133 part 1): a live session captured as the
 * minimal replayable unit (dm-0068), ArchetypeRun-compatible by construction
 * (dm-0044), reusing the S8.1 playtest driver.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { InputFrame } from '../../src/core/State';
import { replayTape } from '../../src/eval/AgentHarness';
import { parseTape } from '../../src/schema/TapeIO';
import { buildGridLevel } from '../helpers/GridLevel';
import { recordSession } from '../../tools/telemetry/Capture';

const RUNWAY = buildGridLevel('capture-runway', ['S....G', '######']);
const SEED = 99;

function right(): InputFrame {
  return { moveAxis: 1, jumpPressed: false, resetPressed: false };
}
function neutral(): InputFrame {
  return { moveAxis: 0, jumpPressed: false, resetPressed: false };
}

test('a finalized record carries the tape, normalized seed, levelId, outcome, attempts, and tick count', () => {
  const recorder = recordSession(RUNWAY, SEED);
  recorder.capture(right());
  recorder.capture(right());
  recorder.capture(neutral());
  const record = recorder.finalize();

  assert.equal(record.levelId, 'capture-runway');
  assert.equal(record.seed, SEED); // small non-negative seed is its own uint32 form
  assert.equal(record.ticksElapsed, 3);
  assert.equal(record.tape.frames.length, 3);
  assert.equal(record.tape.levelId, record.levelId);
  assert.equal(record.tape.seed, record.seed);
  assert.ok(record.outcome === 'completed' || record.outcome === 'timeout');
});

test('the captured tape is a valid ReplayTape (passes the strict TapeIO parser)', () => {
  const recorder = recordSession(RUNWAY, SEED);
  recorder.capture(right());
  const record = recorder.finalize();
  const parsed = parseTape(record.tape);
  assert.equal(parsed.ok, true, parsed.ok ? '' : JSON.stringify(parsed.errors));
});

test('capture reuses the playtest driver: the record replays bit-identically via headless replayTape', () => {
  const frames: InputFrame[] = [right(), right(), right(), neutral(), right()];
  const recorder = recordSession(RUNWAY, SEED);
  let liveFinal;
  for (const f of frames) liveFinal = recorder.capture(f);
  const record = recorder.finalize();

  const replayed = replayTape(RUNWAY, record.seed, record.tape.frames);
  assert.deepEqual(liveFinal, replayed);
});

test('outcome is "completed" when the session actually reaches the goal', () => {
  // Drive right until completion (the runway is short and flat).
  const recorder = recordSession(RUNWAY, SEED);
  let state = recorder.capture(right());
  let guard = 0;
  while (state.world.runState !== 'completed' && guard < 600) {
    state = recorder.capture(right());
    guard++;
  }
  const record = recorder.finalize();
  if (state.world.runState === 'completed') {
    assert.equal(record.outcome, 'completed');
  } else {
    // If the flat runway isn't completable by walking alone, outcome must honestly be timeout.
    assert.equal(record.outcome, 'timeout');
  }
});

test('capture is deterministic: the same scripted inputs produce byte-identical records', () => {
  const script: InputFrame[] = [right(), neutral(), right(), right()];
  function run() {
    const recorder = recordSession(RUNWAY, SEED);
    for (const f of script) recorder.capture(f);
    return recorder.finalize();
  }
  assert.deepEqual(run(), run());
});

test('frameCount tracks captured frames as they arrive', () => {
  const recorder = recordSession(RUNWAY, SEED);
  assert.equal(recorder.frameCount(), 0);
  recorder.capture(right());
  assert.equal(recorder.frameCount(), 1);
  recorder.capture(neutral());
  assert.equal(recorder.frameCount(), 2);
});
