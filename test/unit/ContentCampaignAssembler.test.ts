/**
 * S10.5 — CampaignAssembler: REQ-084 distribution assessment, REQ-015 arc
 * completeness, and REQ-174 rewarded-skip wiring closure. Unit-proven against
 * fixtures + the committed frameworks (no pipeline run — the campaign fold over
 * real content lives in validate:campaign, dm-0113).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { assessDifficultyDistribution, assessArcCompleteness } from '../../content/CampaignAssembler';
import { parseChapterFrameworkText, type ChapterFramework, type DifficultyTier } from '../../content/schema/ChapterFramework';
import { parseCampaignManifestText, type CampaignManifest } from '../../content/schema/CampaignManifest';

const DATA = join(process.cwd(), 'content', 'data');
const FRAMEWORKS = join(DATA, 'frameworks');

function frameworks(): ChapterFramework[] {
  return readdirSync(FRAMEWORKS)
    .filter((f) => f.endsWith('.framework.json'))
    .map((f) => {
      const r = parseChapterFrameworkText(readFileSync(join(FRAMEWORKS, f), 'utf8'));
      assert.ok(r.ok);
      if (!r.ok) throw new Error('unreachable');
      return r.value;
    });
}

function manifest(): CampaignManifest {
  const r = parseCampaignManifestText(readFileSync(join(DATA, 'campaign.manifest.json'), 'utf8'));
  assert.ok(r.ok);
  if (!r.ok) throw new Error('unreachable');
  return r.value;
}

/* ── REQ-084 distribution assessment ─────────────────────────────────────── */

test('assessDifficultyDistribution passes when the measured tiers hit the bands within tolerance', () => {
  const m = manifest(); // 0.2/0.35/0.25/0.15/0.05, tolerance 0.08
  // Construct 20 levels matching the bands exactly.
  const tiers: DifficultyTier[] = [
    ...Array(4).fill('easy'), ...Array(7).fill('medium'), ...Array(5).fill('hard'),
    ...Array(3).fill('harder'), ...Array(1).fill('very-hard'),
  ];
  const v = assessDifficultyDistribution(tiers, m);
  assert.equal(v.total, 20);
  assert.equal(v.pass, true, JSON.stringify(v.buckets));
});

test('assessDifficultyDistribution fails and reports the gap when a bucket is off-band', () => {
  const m = manifest();
  const tiers: DifficultyTier[] = Array(20).fill('easy'); // everything easy
  const v = assessDifficultyDistribution(tiers, m);
  assert.equal(v.pass, false);
  const easy = v.buckets.find((b) => b.tier === 'easy');
  assert.ok(easy && easy.fraction === 1 && !easy.withinTolerance);
  const medium = v.buckets.find((b) => b.tier === 'medium');
  assert.ok(medium && medium.count === 0 && !medium.withinTolerance);
});

test('assessDifficultyDistribution buckets every level exactly once', () => {
  const m = manifest();
  const tiers: DifficultyTier[] = ['easy', 'hard', 'hard', 'medium', 'very-hard'];
  const v = assessDifficultyDistribution(tiers, m);
  assert.equal(v.buckets.reduce((n, b) => n + b.count, 0), tiers.length);
});

/* ── REQ-015 arc completeness ────────────────────────────────────────────── */

test('assessArcCompleteness passes on the committed campaign (every chapter covers the arc)', () => {
  const v = assessArcCompleteness(frameworks());
  assert.equal(v.pass, true, JSON.stringify(v.chapters.filter((c) => !c.pass)));
  assert.equal(v.chapters.length, 6);
});

test('assessArcCompleteness fails a chapter whose slots skip a phase', () => {
  const fw = frameworks()[0];
  const broken: ChapterFramework = {
    ...fw,
    levelSlots: fw.levelSlots.filter((s) => s.emotionalPhase !== 'realization'), // drop a phase
  };
  const v = assessArcCompleteness([broken]);
  assert.equal(v.pass, false);
});

/* ── REQ-174 wiring closure ──────────────────────────────────────────────── */

test('REQ-174: every authored level slot carries a rewardedSkip field across the whole campaign', () => {
  let slots = 0;
  let available = 0;
  for (const fw of frameworks()) {
    for (const s of fw.levelSlots) {
      slots++;
      assert.equal(typeof s.rewardedSkip.available, 'boolean', `${s.slotId} must have a rewardedSkip.available boolean`);
      if (s.rewardedSkip.available) {
        available++;
        assert.ok(s.rewardedSkip.altRouteHint && s.rewardedSkip.altRouteHint.length > 0, `${s.slotId} available skip must carry a non-empty hint`);
      }
    }
  }
  assert.equal(slots, 36);
  assert.ok(available > 0, 'at least some levels should offer the non-IAP rewarded skip');
});
