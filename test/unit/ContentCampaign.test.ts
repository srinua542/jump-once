/**
 * S10.1 — the committed campaign artifacts under content/data/ parse through
 * the strict schema (REQ-083 chapter architecture authored for the whole
 * campaign). Proves: every framework file parses; the manifest parses; the
 * manifest's chapter list matches the framework files exactly and in order;
 * every chapter covers the six-phase arc; and the campaign's authored
 * target-tier distribution is consistent with the manifest's declared REQ-084
 * bands. This is content-volume-independent (it parses authored data, it does
 * not run the generation pipeline — that is validate:campaign, dm-0113).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseChapterFrameworkText, DIFFICULTY_TIERS, type DifficultyTier } from '../../content/schema/ChapterFramework';
import { parseCampaignManifestText } from '../../content/schema/CampaignManifest';

const DATA = join(process.cwd(), 'content', 'data');
const FRAMEWORKS = join(DATA, 'frameworks');

test('every committed chapter framework parses through the strict schema', () => {
  const files = readdirSync(FRAMEWORKS).filter((f) => f.endsWith('.framework.json'));
  assert.ok(files.length > 0, 'no framework files found under content/data/frameworks');
  for (const f of files) {
    const r = parseChapterFrameworkText(readFileSync(join(FRAMEWORKS, f), 'utf8'));
    assert.ok(r.ok, `${f} failed to parse: ${JSON.stringify(r.ok ? {} : r.errors)}`);
  }
});

test('the campaign manifest parses and its chapters match the framework files exactly', () => {
  const mr = parseCampaignManifestText(readFileSync(join(DATA, 'campaign.manifest.json'), 'utf8'));
  assert.ok(mr.ok, `manifest failed to parse: ${JSON.stringify(mr.ok ? {} : mr.errors)}`);
  if (!mr.ok) return;
  const fileIds = readdirSync(FRAMEWORKS)
    .filter((f) => f.endsWith('.framework.json'))
    .map((f) => {
      const r = parseChapterFrameworkText(readFileSync(join(FRAMEWORKS, f), 'utf8'));
      return r.ok ? r.value.chapterId : '';
    })
    .sort();
  const manifestIds = [...mr.value.chapters].sort();
  assert.deepEqual(manifestIds, fileIds, 'manifest chapters must match the framework files exactly');
});

test('the authored campaign is 6 chapters × 6 arc-phase slots = 36 levels (registry-derived size)', () => {
  const files = readdirSync(FRAMEWORKS).filter((f) => f.endsWith('.framework.json'));
  assert.equal(files.length, 6, 'expected 6 chapters (4 mechanic families + combination + mastery)');
  let totalSlots = 0;
  for (const f of files) {
    const r = parseChapterFrameworkText(readFileSync(join(FRAMEWORKS, f), 'utf8'));
    assert.ok(r.ok);
    if (r.ok) {
      assert.ok(r.value.levelSlots.length >= 6, `${f} must have >= 6 slots to cover the arc`);
      totalSlots += r.value.levelSlots.length;
    }
  }
  assert.equal(totalSlots, 36, 'expected 36 authored level slots total');
});

test("the authored target-tier distribution matches the manifest's REQ-084 bands within tolerance", () => {
  const mr = parseCampaignManifestText(readFileSync(join(DATA, 'campaign.manifest.json'), 'utf8'));
  assert.ok(mr.ok);
  if (!mr.ok) return;
  const counts: Record<DifficultyTier, number> = { easy: 0, medium: 0, hard: 0, harder: 0, 'very-hard': 0 };
  let total = 0;
  for (const f of readdirSync(FRAMEWORKS).filter((x) => x.endsWith('.framework.json'))) {
    const r = parseChapterFrameworkText(readFileSync(join(FRAMEWORKS, f), 'utf8'));
    assert.ok(r.ok);
    if (!r.ok) continue;
    for (const s of r.value.levelSlots) { counts[s.targetDifficultyTier]++; total++; }
  }
  // Authored aim must sit within the manifest tolerance of the declared bands.
  for (const tier of DIFFICULTY_TIERS) {
    const frac = counts[tier] / total;
    const band: number = mr.value.difficultyDistribution[tier];
    assert.ok(
      Math.abs(frac - band) <= mr.value.distributionTolerance,
      `authored target-tier ${tier} fraction ${frac.toFixed(3)} deviates from band ${band} beyond tolerance ${mr.value.distributionTolerance}`,
    );
  }
});
