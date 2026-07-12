#!/usr/bin/env node
/**
 * validateCampaign — the P10 campaign validation gate (S10.4, dm-0113).
 *
 * Re-proves the PERSISTED content (not a fresh regeneration): parses every
 * generated LevelDefinition, re-evaluates it under content-calibration-v1,
 * rebuilds each chapter's ChapterRecord through content/Assembler, folds the
 * whole campaign through the P6 CampaignDirector, and checks the REQ-084
 * difficulty distribution + REQ-015 arc completeness via content/CampaignAssembler.
 * Writes content/data/validation-report.json — the source of truth S10.5/S10.6
 * read for "every shipped level is VERIFIED by P4+P5".
 *
 * This lives OUTSIDE npm test on purpose (dm-0113): its cost scales with content
 * volume, so it must not inflate the flat unit suite. It re-uses the same
 * content/ functions the unit tests exercise in isolation.
 *
 * Usage: node tools/sdlc/validateCampaign.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');
const DATA = path.join(ROOT, 'content', 'data');

const { parseLevel } = require(path.join(DIST, 'src/schema/Parse.js'));
const { evaluateLevel, DEFAULT_EVALUATE_OPTIONS } = require(path.join(DIST, 'src/eval/Evaluate.js'));
const { parseProfile } = require(path.join(DIST, 'src/eval/gdos/Profile.js'));
const { DEFAULT_CAMPAIGN_PROFILE } = require(path.join(DIST, 'src/eval/campaign/CampaignProfile.js'));
const { parseChapterFrameworkText } = require(path.join(DIST, 'content/schema/ChapterFramework.js'));
const { parseCampaignManifestText } = require(path.join(DIST, 'content/schema/CampaignManifest.js'));
const { assembleChapterRecord } = require(path.join(DIST, 'content/Assembler.js'));
const { proveDualPath } = require(path.join(DIST, 'content/DualPathProof.js'));
const { assembleCampaignReport, assessDifficultyDistribution, assessArcCompleteness } = require(path.join(DIST, 'content/CampaignAssembler.js'));

function representativeRun(evidence) {
  return evidence.runs.find((r) => r.outcome === 'completed') || evidence.runs[0];
}

function main() {
  const calib = parseProfile(JSON.parse(fs.readFileSync(path.join(DATA, 'calibration-profile.json'), 'utf8')));
  if (!calib.ok) { console.error('calibration invalid'); process.exit(1); }
  const evalOptions = { ...DEFAULT_EVALUATE_OPTIONS, profile: calib.value };
  const manifest = parseCampaignManifestText(fs.readFileSync(path.join(DATA, 'campaign.manifest.json'), 'utf8'));
  if (!manifest.ok) { console.error('manifest invalid'); process.exit(1); }
  const genLog = JSON.parse(fs.readFileSync(path.join(DATA, 'generation-log.json'), 'utf8'));

  const frameworks = manifest.value.chapters.map((chId) => {
    const r = parseChapterFrameworkText(fs.readFileSync(path.join(DATA, 'frameworks', `${chId}.framework.json`), 'utf8'));
    if (!r.ok) { console.error(`framework ${chId} invalid`); process.exit(1); }
    return r.value;
  });

  const chapterRecords = [];
  const perLevel = [];
  const measuredTiers = [];
  let dualPathCount = 0;

  for (const fw of frameworks) {
    const slotById = new Map(fw.levelSlots.map((s) => [s.slotId, s]));
    const entries = (genLog.chapters[fw.chapterId] || []).filter((e) => e.generated);
    const products = [];
    for (const e of entries) {
      const slot = slotById.get(e.slotId);
      const raw = JSON.parse(fs.readFileSync(path.join(DATA, 'levels', `${e.levelId}.json`), 'utf8'));
      const parsed = parseLevel(raw);
      if (!parsed.ok) { console.error(`level ${e.levelId} failed re-parse:`, JSON.stringify(parsed.errors)); process.exit(1); }
      const { evidence, report } = evaluateLevel(parsed.value, evalOptions);
      products.push({
        def: parsed.value, evidence, report,
        run: representativeRun(evidence),
        mechanicsExercised: new Set(slot.mechanics),
        concept: undefined, provenance: undefined,
      });
    }

    const { record, difficulties } = assembleChapterRecord(fw.chapterId, products);
    chapterRecords.push(record);

    for (let i = 0; i < products.length; i++) {
      const dual = proveDualPath(products[i].evidence.optimization);
      if (dual.isDualPath) dualPathCount++;
      measuredTiers.push(difficulties[i].tier);
      perLevel.push({
        levelId: record.levels[i].levelId,
        chapterId: fw.chapterId,
        slotId: entries[i].slotId,
        gatePass: products[i].report.pass,
        measuredTier: difficulties[i].tier,
        discoverySeconds: Number(difficulties[i].discoverySeconds.toFixed(3)),
        dualPath: dual.isDualPath,
        deltaSeconds: dual.deltaSeconds,
      });
    }
  }

  const campaign = assembleCampaignReport(chapterRecords, DEFAULT_CAMPAIGN_PROFILE);
  const distribution = assessDifficultyDistribution(measuredTiers, manifest.value);
  const arc = assessArcCompleteness(frameworks);

  const perChapter = chapterRecords.map((r) => ({
    chapterId: r.chapterId,
    levels: r.levels.length,
    chapterHealthy: r.macroVerdict.chapterHealthy,
    macroOverallPass: r.macroVerdict.overallPass,
    cognitiveMapping: r.macroVerdict.cognitiveStructuralMapping.pass,
    degradation: r.macroVerdict.crossChapterDegradation.pass,
    curiosity: r.macroVerdict.curiosityProgression.pass,
    graduation: r.macroVerdict.graduationAssessment.pass,
  }));

  const report = {
    calibrationProfileId: calib.value.profileId,
    generatedLevels: perLevel.length,
    allGatePass: perLevel.every((l) => l.gatePass),
    dualPathCount,
    allDualPath: dualPathCount === perLevel.length,
    macroPassChapters: perChapter.filter((c) => c.macroOverallPass).length,
    totalChapters: perChapter.length,
    difficultyDistribution: distribution,
    arcCompleteness: { pass: arc.pass, chapters: arc.chapters },
    campaign: { retentionPrediction: campaign.retentionPrediction, alertCount: campaign.alerts.length },
    perChapter,
    perLevel,
  };
  fs.writeFileSync(path.join(DATA, 'validation-report.json'), JSON.stringify(report, null, 2) + '\n');

  console.log(`validated ${perLevel.length} levels across ${perChapter.length} chapters`);
  console.log(`  all gate-pass: ${report.allGatePass}   all dual-path: ${report.allDualPath}`);
  console.log(`  macro-pass chapters: ${report.macroPassChapters}/${report.totalChapters}`);
  console.log(`  REQ-084 distribution within tolerance: ${distribution.pass}`);
  console.log(`  REQ-015 arc-complete: ${arc.pass}`);
  console.log(`  retention prediction: ${campaign.retentionPrediction.toFixed(3)}, alerts: ${campaign.alerts.length}`);
  console.log('wrote content/data/validation-report.json');
}

main();
