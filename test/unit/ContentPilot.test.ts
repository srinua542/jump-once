/**
 * S10.3 — the pilot-chapter smoke regression (dm-0113): a content-volume-
 * INDEPENDENT end-to-end proof that the framework → concept → manufacture →
 * integrate → assemble → macro-validate wiring holds, run under the committed
 * content-calibration-v1 profile. It manufactures a small number of real levels
 * (not the full 24-seed spread — that is validate:campaign, kept out of npm
 * test) so the suite runtime stays flat as chapters are added in S10.4.
 *
 * Proves: the pilot chapter's slots manufacture accepted levels under the
 * calibrated profile; each is dual-path (REQ-100); assembleChapterRecord
 * produces a locally-healthy ChapterRecord with a computed macro verdict.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseChapterFrameworkText } from '../../content/schema/ChapterFramework';
import { parseProfile } from '../../src/eval/gdos/Profile';
import { buildConceptFromSlot, assembleChapterRecord } from '../../content/Assembler';
import { proveDualPath } from '../../content/DualPathProof';
import { manufactureLevel, type PipelineProduct, type PipelineOptions } from '../../src/gen/Pipeline';
import { DEFAULT_GEN_PROFILE } from '../../src/gen/GenProfile';
import { DEFAULT_EVALUATE_OPTIONS } from '../../src/eval/Evaluate';

const DATA = join(process.cwd(), 'content', 'data');
const PILOT = 'ch1-read-the-rhythm';

function calibration() {
  const r = parseProfile(JSON.parse(readFileSync(join(DATA, 'calibration-profile.json'), 'utf8')));
  assert.ok(r.ok, 'calibration-profile.json must parse');
  if (!r.ok) throw new Error('unreachable');
  return r.value;
}

test('content-calibration-v1 is a valid, recalibrated profile (thresholds below DEFAULT)', () => {
  const p = calibration();
  assert.equal(p.profileId, 'content-calibration-v1');
  assert.ok(p.emotional.thresholds.surprise < 95, 'surprise threshold recalibrated below the DEFAULT 95');
});

test('the pilot chapter manufactures accepted, dual-path levels and assembles a healthy ChapterRecord', () => {
  const fw = parseChapterFrameworkText(readFileSync(join(DATA, 'frameworks', `${PILOT}.framework.json`), 'utf8'));
  assert.ok(fw.ok);
  if (!fw.ok) return;
  const profile = calibration();

  // Manufacture a bounded subset (the first three slots) via a small seed spread
  // — enough to prove the overgenerate-and-curate wiring without running the full
  // 24-seed spread inside npm test (that is validate:campaign, dm-0113).
  const SMOKE_SPREAD = 12;
  const products: PipelineProduct[] = [];
  for (const slot of fw.value.levelSlots.slice(0, 3)) {
    const concept = buildConceptFromSlot(fw.value, slot);
    let accepted: PipelineProduct | null = null;
    for (let k = 0; k < SMOKE_SPREAD && accepted === null; k++) {
      const options: PipelineOptions = { seed: slot.seed + k, evalOptions: { ...DEFAULT_EVALUATE_OPTIONS, profile }, lifecycle: [], corpus: [] };
      const out = manufactureLevel(concept, options, DEFAULT_GEN_PROFILE);
      if ('accepted' in out) accepted = out.accepted;
    }
    assert.ok(accepted !== null, `slot ${slot.slotId} must manufacture within ${SMOKE_SPREAD} seeds under calibration`);
    if (accepted !== null) {
      assert.ok(proveDualPath(accepted.evidence.optimization).isDualPath, `slot ${slot.slotId} must be dual-path (REQ-100)`);
      products.push(accepted);
    }
  }

  const { record, difficulties } = assembleChapterRecord(fw.value.chapterId, products);
  assert.equal(record.levels.length, products.length);
  assert.equal(difficulties.length, products.length);
  // The wiring proof: the assembler computes a macro verdict, the sampled levels
  // are locally healthy (solvable, softlock-free, exploit-clean per dm-0117), and
  // cognitive mapping holds. (Graduation is a full-chapter criterion, exercised
  // over the whole campaign by validate:campaign, not this bounded subset.)
  assert.equal(record.macroVerdict.chapterHealthy, true, `sampled levels must be locally healthy: ${JSON.stringify(record.macroVerdict)}`);
  assert.equal(record.macroVerdict.cognitiveStructuralMapping.pass, true);
  assert.ok(record.coverageMatrix.totalCells > 0);
});
