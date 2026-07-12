/**
 * S10.4/S10.5 — a fast regression over the COMMITTED campaign validation report
 * (content/data/validation-report.json, produced by `npm run validate:campaign`,
 * dm-0113). This reads the persisted evidence manifest — it does NOT re-run the
 * generation or evaluation pipeline — so it stays content-volume-independent and
 * flat in npm test while still guarding the shipped campaign's honest properties:
 * every level gate-passes and is dual-path, every chapter is macro-healthy and
 * curriculum-valid, and the arc is complete. The REQ-084 distribution result is
 * asserted to be COMPUTED (not asserted to pass — the single-template generator
 * cannot span the tiers, a documented limitation, dm-0115/dm-0116).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DIFFICULTY_TIERS } from '../../content/schema/ChapterFramework';

const report = JSON.parse(readFileSync(join(process.cwd(), 'content', 'data', 'validation-report.json'), 'utf8'));

test('the campaign is the registry-derived 36 levels, all under content-calibration-v1', () => {
  assert.equal(report.generatedLevels, 36);
  assert.equal(report.calibrationProfileId, 'content-calibration-v1');
});

test('every shipped level passes its GDOS gates and is dual-path (REQ-100)', () => {
  assert.equal(report.allGatePass, true);
  assert.equal(report.allDualPath, true);
  assert.equal(report.dualPathCount, 36);
});

test('every chapter is macro-healthy and curriculum-valid (REQ-142 applied to real content)', () => {
  assert.equal(report.macroPassChapters, report.totalChapters, JSON.stringify(report.perChapter.filter((c: { macroOverallPass: boolean }) => !c.macroOverallPass)));
  for (const c of report.perChapter) {
    assert.equal(c.chapterHealthy, true, `${c.chapterId} must be locally healthy`);
    assert.equal(c.cognitiveMapping, true, `${c.chapterId} must not overload or orphan mechanics`);
  }
});

test('the six-phase emotional arc is complete in every chapter (REQ-015)', () => {
  assert.equal(report.arcCompleteness.pass, true);
  assert.equal(report.arcCompleteness.chapters.length, 6);
});

test('the REQ-084 difficulty distribution is computed over all 36 levels (assessment present)', () => {
  const d = report.difficultyDistribution;
  assert.equal(d.total, 36);
  assert.equal(d.buckets.length, DIFFICULTY_TIERS.length);
  const summed = d.buckets.reduce((n: number, b: { count: number }) => n + b.count, 0);
  assert.equal(summed, 36, 'every level must be bucketed into exactly one tier');
  // The distribution is honestly measured; whether it lands within tolerance is
  // a generator-capability question, not asserted here (dm-0115/dm-0116).
});

test('the campaign fold produced a retention prediction and no unresolved difficulty-spike alerts', () => {
  assert.ok(report.campaign.retentionPrediction >= 0 && report.campaign.retentionPrediction <= 1);
  assert.equal(report.campaign.alertCount, 0);
});
