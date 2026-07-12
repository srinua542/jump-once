#!/usr/bin/env node
/**
 * generateCampaign — the P10 content generation runner (S10.3/S10.4, dm-0114).
 *
 * Overgenerate-and-curate: for each authored ChapterFramework slot, manufacture
 * a spread of candidates (seed slot.seed + 0..SPREAD) through the REAL pipeline
 * under the committed content-calibration-v1 profile, keep only pipeline-ACCEPTED
 * candidates (they passed solvability + jump-necessity + softlock + the AI-Council
 * GDOS gate + optimization + intent), and select the highest GDOS-scoring one.
 * The selection is code-enforced (max total gate score, tie-broken by seed) so
 * REQ-050 ("all creative decisions originate from GDOS") holds by construction.
 *
 * The winning LevelDefinition is persisted to content/data/levels/<levelId>.json
 * and a generation log (winning seed, score, measured difficulty tier, dual-path
 * verdict) to content/data/generation-log.json. Deterministic: same frameworks +
 * seeds + calibration ⇒ byte-identical output (idempotent regeneration).
 *
 * This is an operational script (like gate.js / stage.js), not part of the P8
 * tools/ TypeScript library — it consumes the compiled dist/ public seams.
 *
 * Usage: node tools/sdlc/generateCampaign.js [chapterId ...]   (default: all)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');
const DATA = path.join(ROOT, 'content', 'data');

const { parseChapterFrameworkText } = require(path.join(DIST, 'content/schema/ChapterFramework.js'));
const { parseCampaignManifestText } = require(path.join(DIST, 'content/schema/CampaignManifest.js'));
const { buildConceptFromSlot } = require(path.join(DIST, 'content/Assembler.js'));
const { estimateDifficultyTier } = require(path.join(DIST, 'content/DifficultyEstimator.js'));
const { proveDualPath } = require(path.join(DIST, 'content/DualPathProof.js'));
const { manufactureLevel } = require(path.join(DIST, 'src/gen/Pipeline.js'));
const { DEFAULT_GEN_PROFILE } = require(path.join(DIST, 'src/gen/GenProfile.js'));
const { DEFAULT_EVALUATE_OPTIONS } = require(path.join(DIST, 'src/eval/Evaluate.js'));
const { parseProfile } = require(path.join(DIST, 'src/eval/gdos/Profile.js'));

const SEED_SPREAD = 24;

function loadCalibration() {
  const r = parseProfile(JSON.parse(fs.readFileSync(path.join(DATA, 'calibration-profile.json'), 'utf8')));
  if (!r.ok) { console.error('calibration-profile.json invalid:', JSON.stringify(r.errors)); process.exit(1); }
  return r.value;
}

function totalScore(report) {
  let s = 0;
  for (const g of report.gates) for (const x of g.scores) s += x.score;
  return s;
}

/** Overgenerate a slot and curate the highest-GDOS-scoring accepted candidate. */
function generateSlot(framework, slot, calibration) {
  const concept = buildConceptFromSlot(framework, slot);
  let best = null;
  const rejPhases = {};
  for (let k = 0; k < SEED_SPREAD; k++) {
    const seed = slot.seed + k;
    const out = manufactureLevel(concept, { seed, evalOptions: { ...DEFAULT_EVALUATE_OPTIONS, profile: calibration }, lifecycle: [], corpus: [] }, DEFAULT_GEN_PROFILE);
    if ('accepted' in out) {
      const score = totalScore(out.accepted.report);
      if (best === null || score > best.score || (score === best.score && seed < best.seed)) {
        best = { score, seed, product: out.accepted };
      }
    } else {
      rejPhases[out.rejected.phase] = (rejPhases[out.rejected.phase] || 0) + 1;
    }
  }
  return { best, rejPhases };
}

function main() {
  const calibration = loadCalibration();
  const manifest = parseCampaignManifestText(fs.readFileSync(path.join(DATA, 'campaign.manifest.json'), 'utf8'));
  if (!manifest.ok) { console.error('manifest invalid'); process.exit(1); }
  const requested = process.argv.slice(2);
  const chapterIds = requested.length ? requested : manifest.value.chapters;

  const log = { calibrationProfileId: calibration.profileId, seedSpread: SEED_SPREAD, chapters: {} };
  let generated = 0, failed = 0;

  for (const chId of chapterIds) {
    const fw = parseChapterFrameworkText(fs.readFileSync(path.join(DATA, 'frameworks', `${chId}.framework.json`), 'utf8'));
    if (!fw.ok) { console.error(`framework ${chId} invalid`); process.exit(1); }
    const chLog = [];
    console.log(`\n=== ${chId} ===`);
    for (const slot of fw.value.levelSlots) {
      const { best, rejPhases } = generateSlot(fw.value, slot, calibration);
      if (best === null) {
        failed++;
        chLog.push({ slotId: slot.slotId, generated: false, rejections: rejPhases });
        console.log(`  ${slot.slotId.padEnd(46)} FAILED — rejections ${JSON.stringify(rejPhases)}`);
        continue;
      }
      const p = best.product;
      const tier = estimateDifficultyTier(p.evidence, p.evidence.optimization);
      const dual = proveDualPath(p.evidence.optimization);
      fs.writeFileSync(path.join(DATA, 'levels', `${p.def.levelId}.json`), JSON.stringify(p.def, null, 2) + '\n');
      generated++;
      chLog.push({
        slotId: slot.slotId, generated: true, levelId: p.def.levelId, winningSeed: best.seed,
        revisions: p.provenance.revisions, score: Number(best.score.toFixed(2)),
        targetTier: slot.targetDifficultyTier, measuredTier: tier,
        dualPath: dual.isDualPath, deltaSeconds: dual.deltaSeconds,
      });
      console.log(`  ${slot.slotId.padEnd(46)} -> ${p.def.levelId}  tier(t/m)=${slot.targetDifficultyTier}/${tier}  dual=${dual.isDualPath}  score=${best.score.toFixed(0)}`);
    }
    log.chapters[chId] = chLog;
  }

  fs.writeFileSync(path.join(DATA, 'generation-log.json'), JSON.stringify(log, null, 2) + '\n');
  console.log(`\ngenerated ${generated} levels, ${failed} slots failed. Wrote generation-log.json`);
  if (failed > 0) process.exitCode = 2;
}

main();
