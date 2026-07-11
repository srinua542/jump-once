/**
 * S8.6 — telemetry analysis + GDOS round-trip (REQ-133 part 2; REQ-032 P8
 * share; dm-0068/dm-0069/dm-0073). The IRD P8 exit condition, second half:
 * a captured record's death heatmap matches direct replay-and-inspect, and a
 * telemetry-sourced ArchetypeRun round-trips into the UNMODIFIED P6
 * processCampaign — proving live telemetry feeds Campaign Intelligence with
 * zero new detection logic and zero changes under src/eval/campaign/.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { InputFrame } from '../../src/core/State';
import { replayObserved } from '../../src/eval/AgentHarness';
import { analyzeTape } from '../../src/eval/campaign/TapeAnalyzer';
import { processCampaign, type ChapterRecord } from '../../src/eval/campaign/CampaignDirector';
import { DEFAULT_CAMPAIGN_PROFILE } from '../../src/eval/campaign/CampaignProfile';
import type { LevelRecord } from '../../src/eval/campaign/CampaignState';
import { gateResult, gdosReport, metricScore } from '../../src/eval/gdos/Report';
import type { CriterionResult, MacroVerdict } from '../../src/eval/macro/Curriculum';
import { buildGridLevel } from '../helpers/GridLevel';
import { coverageMatrixFixture } from '../helpers/CampaignFixtures';
import { recordSession, type TelemetryRecord } from '../../tools/telemetry/Capture';
import { deriveDeathHeatmap, toArchetypeRun } from '../../tools/telemetry/DeathHeatmap';
import {
  DEFAULT_TELEMETRY_PROFILE,
  parseTelemetryProfile,
  TELEMETRY_PROFILE_SCHEMA_VERSION,
} from '../../tools/telemetry/TelemetryProfile';

// Walking right off the spawn ledge runs the player into a spike hazard, dies,
// reloads, and repeats — a deterministic death generator at a fixed location.
const LETHAL = buildGridLevel('heatmap-spikes', ['S.x.G', '#####']);
const SEED = 3;

function right(): InputFrame {
  return { moveAxis: 1, jumpPressed: false, resetPressed: false };
}

/** Drive right for `ticks` steps and finalize the capture. */
function captureDeaths(ticks: number): TelemetryRecord {
  const recorder = recordSession(LETHAL, SEED);
  for (let i = 0; i < ticks; i++) recorder.capture(right());
  return recorder.finalize();
}

test('the lethal fixture actually produces deaths under a rightward walk (guards the test)', () => {
  const record = captureDeaths(180);
  assert.ok(record.attempts > 0, 'expected at least one death+reload in 180 ticks');
});

test('death heatmap matches an independent replay-and-inspect of the same record (dm-0068)', () => {
  const record = captureDeaths(180);

  // Independent expectation: replay the tape and hand-bin every defeated-tick position.
  const observations = replayObserved(LETHAL, record.seed, record.tape.frames);
  const bin = DEFAULT_TELEMETRY_PROFILE.heatmap.binWorldSize;
  const expected = new Map<string, number>();
  let expectedTotal = 0;
  for (const obs of observations) {
    if (obs.runState !== 'defeated') continue;
    expectedTotal += 1;
    const key = `${Math.floor(obs.playerPosition.x / bin)}|${Math.floor(obs.playerPosition.y / bin)}`;
    expected.set(key, (expected.get(key) ?? 0) + 1);
  }
  assert.ok(expectedTotal > 0);

  const heatmap = deriveDeathHeatmap(LETHAL, [record], DEFAULT_TELEMETRY_PROFILE);
  assert.equal(heatmap.totalDeaths, expectedTotal);
  assert.equal(heatmap.cells.reduce((s, c) => s + c.deaths, 0), expectedTotal);
  for (const cell of heatmap.cells) {
    assert.equal(cell.deaths, expected.get(`${cell.binX}|${cell.binY}`), `bin (${cell.binX},${cell.binY}) count mismatch`);
  }
});

test('records for a different level are ignored (a heatmap is per-level)', () => {
  const record = captureDeaths(180);
  const otherLevel = buildGridLevel('heatmap-other', ['S...G', '#####']);
  const empty = deriveDeathHeatmap(otherLevel, [record], DEFAULT_TELEMETRY_PROFILE);
  assert.equal(empty.totalDeaths, 0);
  assert.deepEqual(empty.cells, []);
});

test('deriveDeathHeatmap is deterministic across two runs', () => {
  const record = captureDeaths(180);
  const a = deriveDeathHeatmap(LETHAL, [record], DEFAULT_TELEMETRY_PROFILE);
  const b = deriveDeathHeatmap(LETHAL, [record], DEFAULT_TELEMETRY_PROFILE);
  assert.deepEqual(a, b);
});

test('bin size is calibrated, not hardcoded: a coarser binWorldSize collapses cells (two-profile proof)', () => {
  const record = captureDeaths(180);
  const fine = deriveDeathHeatmap(LETHAL, [record], DEFAULT_TELEMETRY_PROFILE); // binWorldSize 1
  const coarse = deriveDeathHeatmap(LETHAL, [record], {
    telemetryProfileSchemaVersion: TELEMETRY_PROFILE_SCHEMA_VERSION,
    profileId: 'coarse',
    heatmap: { binWorldSize: 100 },
  });
  // Same total deaths either way; the coarse grid bins them all into one cell.
  assert.equal(coarse.totalDeaths, fine.totalDeaths);
  assert.equal(coarse.cells.length, 1);
  assert.equal(coarse.cells[0].binX, 0);
  assert.equal(coarse.cells[0].binY, 0);
});

test('toArchetypeRun feeds a live capture into the UNMODIFIED analyzeTape (dm-0044 substitution)', () => {
  const record = captureDeaths(180);
  const run = toArchetypeRun(record, 'firstTime');
  assert.equal(run.outcome, record.outcome);
  assert.equal(run.attempts, record.attempts);
  assert.equal(run.ticksElapsed, record.ticksElapsed);
  assert.equal(run.tape, record.tape);

  const signals = analyzeTape(run, DEFAULT_CAMPAIGN_PROFILE);
  // The behavior model reads the run directly: retryCount IS the capture's reloads.
  assert.equal(signals.retryCount, record.attempts);
  assert.equal(signals.dropOffRate, record.outcome === 'timeout' ? 1 : 0);
});

/* ── round-trip into Campaign Intelligence (dm-0069) ─────────────────────── */

function passing(): CriterionResult {
  return { pass: true, findings: [] };
}
function macroVerdict(): MacroVerdict {
  return {
    chapterHealthy: true,
    cognitiveStructuralMapping: passing(),
    crossChapterDegradation: passing(),
    curiosityProgression: passing(),
    graduationAssessment: passing(),
    overallPass: true,
  };
}

test('a telemetry-sourced LevelRecord round-trips through processCampaign into a CampaignReport (IRD P8 exit, second half)', () => {
  const record = captureDeaths(180);
  // The `run` comes from telemetry; report/macro/mechanics come from the level's
  // GDOS evaluation (authoring-time), exactly the P6 LevelRecord assembly.
  const levelRecord: LevelRecord = {
    levelId: record.levelId,
    chapterId: 'telemetry-chapter',
    report: gdosReport(record.levelId, 'telemetry-fixture-profile', [
      gateResult('emotional-threshold', [
        metricScore('curiosity', 50, 90),
        metricScore('confidence', 50, 90),
        metricScore('surprise', 50, 95),
        metricScore('mastery', 50, 95),
      ], [], []),
    ]),
    run: toArchetypeRun(record, 'firstTime'),
    macroCriteria: macroVerdict(),
    mechanicsExercised: new Set(['spike']),
  };
  const chapter: ChapterRecord = {
    chapterId: 'telemetry-chapter',
    levels: [levelRecord],
    macroVerdict: macroVerdict(),
    coverageMatrix: coverageMatrixFixture([{ mechanic: 'spike', optimizationStyle: 'discovery' }]),
  };

  const report = processCampaign([chapter], DEFAULT_CAMPAIGN_PROFILE);
  // The round-trip produced a real CampaignReport of the expected shape.
  assert.ok(report.finalState);
  assert.ok('telemetry-chapter' in report.chapterHealthMap);
  assert.ok(Array.isArray(report.alerts));
  assert.equal(typeof report.retentionPrediction, 'number');
  // The captured reloads reached the behavior model via the standard fold.
  assert.equal(report.finalState.behaviorState.retryCount, record.attempts);
});

/* ── TelemetryProfile strict-parse discipline (dm-0073) ──────────────────── */

test('the default telemetry profile round-trips the strict parser', () => {
  const result = parseTelemetryProfile(DEFAULT_TELEMETRY_PROFILE);
  assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.errors));
});

test('parseTelemetryProfile rejects an unknown key, a bad version, and a non-positive bin size', () => {
  const unknownKey = parseTelemetryProfile({ ...DEFAULT_TELEMETRY_PROFILE, rogue: 1 });
  assert.equal(unknownKey.ok, false);

  const badVersion = parseTelemetryProfile({ ...DEFAULT_TELEMETRY_PROFILE, telemetryProfileSchemaVersion: 2 });
  assert.equal(badVersion.ok, false);

  const badBin = parseTelemetryProfile({
    telemetryProfileSchemaVersion: TELEMETRY_PROFILE_SCHEMA_VERSION,
    profileId: 'x',
    heatmap: { binWorldSize: 0 },
  });
  assert.equal(badBin.ok, false);
  assert.ok(badBin.ok === false && badBin.errors.some((e) => e.path === '/heatmap/binWorldSize'));
});
