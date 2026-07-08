#!/usr/bin/env node
/**
 * Jump Once — SDLC Gate runner.
 *
 * Deterministic guardrail that checks the repo for the drift the AI workflow is
 * prone to: code changed without the PKG, placeholders slipped in, handoff stale,
 * backlog marked VERIFIED without a report, tests red. Declared by
 * tools/sdlc/sdlc.yaml; the checks themselves live here (the YAML is override-only).
 *
 * Modes:
 *   node tools/sdlc/gate.js               → CLI report (fast gates). Exit 1 if a block gate fails.
 *   node tools/sdlc/gate.js --with-tests  → also runs `npm test` (tests-green gate).
 *   node tools/sdlc/gate.js --hook stop    → Stop-hook mode: emits systemMessage on drift;
 *                                            in `block` enforcement, returns decision:"block".
 *
 * Design guarantees:
 *   - Fail-OPEN on its own errors: if the gate itself throws, it exits 0 silently so a
 *     guardrail hiccup never breaks the user's turn.
 *   - Fail-LOUD on findings: real drift is always surfaced.
 *   - Zero dependencies: Node builtins only, so it runs even if the project build is broken.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const WITH_TESTS = args.includes('--with-tests');
const HOOK_MODE = args.includes('--hook') ? (args[args.indexOf('--hook') + 1] || '') : '';

// ── helpers ──────────────────────────────────────────────────────────────────
function readText(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return null; }
}
function readJSON(rel) {
  const t = readText(rel);
  if (t == null) return null;
  try { return JSON.parse(t); } catch { return null; }
}
function git(argstr) {
  try { return execSync('git ' + argstr, { cwd: ROOT, encoding: 'utf8' }); } catch { return ''; }
}
function listSrcTs() {
  const dir = path.join(ROOT, 'src');
  let entries = [];
  try { entries = fs.readdirSync(dir, { recursive: true }); } catch { return []; }
  return entries
    .map((e) => String(e).split(path.sep).join('/'))
    .filter((p) => p.endsWith('.ts'))
    .map((p) => 'src/' + p);
}
/** Paths with uncommitted changes (modified, added, or untracked). */
function dirtyPaths() {
  const out = git('status --porcelain');
  if (!out) return [];
  return out.split('\n').filter(Boolean).map((line) => {
    let p = line.slice(3).trim();
    if (p.includes('->')) p = p.split('->').pop().trim(); // renames
    return p.replace(/^"(.*)"$/, '$1');
  });
}
/**
 * Is `file` covered by the dirty set? Handles git collapsing an untracked
 * directory to `dir/` (common before the first commit) as well as exact matches.
 */
function isDirty(paths, file) {
  return paths.some((p) => p === file || (p.endsWith('/') && file.startsWith(p)));
}

// ── recipe (override-only over built-in defaults) ────────────────────────────
const DEFAULTS = {
  enforcement: 'warn',
  gates: {
    'pkg-covers-src': { severity: 'block', enabled: true, when: 'src-dirty' },
    'pkg-not-stale': { severity: 'block', enabled: true, when: 'src-dirty' },
    'no-placeholders': { severity: 'block', enabled: true, when: 'always' },
    'handoff-fresh': { severity: 'warn', enabled: true, when: 'always' },
    'backlog-integrity': { severity: 'warn', enabled: true, when: 'always' },
    'stage-consistency': { severity: 'warn', enabled: true, when: 'always' },
    'tests-green': { severity: 'block', enabled: true, when: 'manual' },
  },
};
function loadRecipe() {
  const cfg = JSON.parse(JSON.stringify(DEFAULTS));
  const text = readText('tools/sdlc/sdlc.yaml');
  if (!text) return cfg;
  const em = text.match(/^enforcement:\s*(\w+)/m);
  if (em && (em[1] === 'warn' || em[1] === 'block')) cfg.enforcement = em[1];
  // Parse each gate block (override-only; safe if a field is missing/malformed).
  const gatesSection = text.split(/^gates:/m)[1] || '';
  for (const block of gatesSection.split(/\n\s*-\s*id:/).slice(1)) {
    const id = (block.match(/^\s*([\w-]+)/) || [])[1];
    if (!id || !cfg.gates[id]) continue;
    const sev = (block.match(/severity:\s*(\w+)/) || [])[1];
    const en = (block.match(/enabled:\s*(\w+)/) || [])[1];
    const wn = (block.match(/when:\s*([\w-]+)/) || [])[1];
    if (sev === 'block' || sev === 'warn') cfg.gates[id].severity = sev;
    if (en === 'true' || en === 'false') cfg.gates[id].enabled = en === 'true';
    if (wn) cfg.gates[id].when = wn;
  }
  return cfg;
}

// ── checks: id → () => { pass, detail } ──────────────────────────────────────
const CHECKS = {
  'pkg-covers-src'() {
    const pkg = readJSON('meta/project_knowledge_graph.json');
    if (!pkg) return { pass: false, detail: 'PKG missing or unparseable.' };
    const nodePaths = new Set((pkg.nodes || []).map((n) => n.file_path));
    const pending = new Set((pkg.pending_nodes || []).map((n) => n.planned_slice ? null : n.file_path).filter(Boolean));
    const src = listSrcTs();
    const orphans = src.filter((f) => !nodePaths.has(f) && !pending.has(f));
    const ghosts = [...nodePaths].filter((f) => f && !fs.existsSync(path.join(ROOT, f)));
    const problems = [];
    if (orphans.length) problems.push('src files not in PKG: ' + orphans.join(', '));
    if (ghosts.length) problems.push('PKG nodes for missing files: ' + ghosts.join(', '));
    return { pass: problems.length === 0, detail: problems.join(' | ') };
  },
  'pkg-not-stale'() {
    const dirty = dirtyPaths();
    const srcDirty = dirty.some((p) => p.startsWith('src/'));
    const pkgDirty = isDirty(dirty, 'meta/project_knowledge_graph.json');
    if (srcDirty && !pkgDirty) {
      return { pass: false, detail: 'src/ has uncommitted changes but the PKG was not updated.' };
    }
    return { pass: true, detail: '' };
  },
  'no-placeholders'() {
    const re = /\bTODO\b|\bFIXME\b|\bXXX\b|not\s+implemented/i;
    const hits = [];
    for (const f of listSrcTs()) {
      const t = readText(f);
      if (t == null) continue;
      t.split('\n').forEach((line, i) => { if (re.test(line)) hits.push(`${f}:${i + 1}`); });
    }
    return { pass: hits.length === 0, detail: hits.length ? 'markers at ' + hits.join(', ') : '' };
  },
  'handoff-fresh'() {
    const pkg = readJSON('meta/project_knowledge_graph.json');
    const ho = readJSON('meta/handoff_latest.json');
    if (!pkg || !ho) return { pass: false, detail: 'PKG or handoff missing.' };
    const match = pkg.pkg_hash === ho.pkg_hash_at_handoff;
    return { pass: match, detail: match ? '' : `handoff pkg_hash_at_handoff (${ho.pkg_hash_at_handoff}) != PKG pkg_hash (${pkg.pkg_hash}).` };
  },
  'backlog-integrity'() {
    const bl = readText('docs/requirements_backlog.md');
    if (!bl) return { pass: true, detail: 'no backlog to check.' };
    const verifiedReqs = new Set();
    for (const line of bl.split('\n')) {
      if (/\bVERIFIED\b/.test(line)) {
        const m = line.match(/REQ-[\w-]+/g);
        if (m) m.forEach((r) => verifiedReqs.add(r));
      }
    }
    if (verifiedReqs.size === 0) return { pass: true, detail: '' };
    let reports = '';
    try { reports = fs.readdirSync(path.join(ROOT, 'docs/verification')).map((f) => readText('docs/verification/' + f) || '').join('\n'); } catch { /* none */ }
    const missing = [...verifiedReqs].filter((r) => !reports.includes(r));
    return { pass: missing.length === 0, detail: missing.length ? 'VERIFIED without a report: ' + missing.join(', ') : '' };
  },
  'stage-consistency'() {
    const task = readJSON('meta/active_task.json');
    if (!task) return { pass: true, detail: '' }; // no active slice → nothing to check
    const order = ['reboot', 'select', 'plan', 'anchor', 'implement', 'verify', 'integrate', 'report', 'handoff'];
    const problems = [];
    const curIdx = order.indexOf(task.current_stage);
    if (curIdx < 0) return { pass: false, detail: `unknown current_stage "${task.current_stage}".` };
    // Every stage before the current must be done (no skipped stages).
    for (let i = 0; i < curIdx; i++) {
      const st = (task.stages && task.stages[order[i]] || {}).status;
      if (st !== 'done') problems.push(`stage "${order[i]}" not done but current is "${task.current_stage}"`);
    }
    // If verify is complete, at least one test file must exist (can't "verify" nothing).
    const verifyDone = task.stages && task.stages.verify && task.stages.verify.status === 'done';
    if (verifyDone) {
      let testFiles = [];
      try { testFiles = fs.readdirSync(path.join(ROOT, 'test'), { recursive: true }).filter((f) => String(f).endsWith('.ts') || String(f).endsWith('.js')); } catch { /* none */ }
      if (testFiles.length === 0) problems.push('verify stage marked done but no test files exist under test/');
    }
    return { pass: problems.length === 0, detail: problems.join(' | ') };
  },
  'tests-green'() {
    try {
      execSync('npm test', { cwd: ROOT, stdio: 'pipe' });
      return { pass: true, detail: '' };
    } catch (e) {
      const tail = String(e.stdout || e.message || '').split('\n').slice(-6).join('\n');
      return { pass: false, detail: 'npm test failed:\n' + tail };
    }
  },
};

// ── run ──────────────────────────────────────────────────────────────────────
function run() {
  const cfg = loadRecipe();
  const dirty = dirtyPaths();
  const srcDirty = dirty.some((p) => p.startsWith('src/'));
  const results = [];
  for (const [id, gate] of Object.entries(cfg.gates)) {
    if (!gate.enabled) continue;
    if (gate.when === 'manual' && !(id === 'tests-green' && WITH_TESTS)) continue;
    if (gate.when === 'src-dirty' && !srcDirty) continue;
    const check = CHECKS[id];
    if (!check) continue;
    let r;
    try { r = check(); } catch (e) { r = { pass: false, detail: 'check errored: ' + e.message }; }
    results.push({ id, severity: gate.severity, pass: r.pass, detail: r.detail });
  }
  const blockFails = results.filter((r) => !r.pass && r.severity === 'block');
  const warnFails = results.filter((r) => !r.pass && r.severity === 'warn');
  return { cfg, srcDirty, results, blockFails, warnFails };
}

function renderReport({ cfg, results, blockFails, warnFails }) {
  const lines = [];
  lines.push('JUMP ONCE — SDLC GATE   (enforcement: ' + cfg.enforcement + ')');
  const good = results.filter((r) => r.pass);
  if (good.length) { lines.push('GOOD:'); good.forEach((r) => lines.push('  ✓ ' + r.id)); }
  if (blockFails.length) { lines.push('BLOCK:'); blockFails.forEach((r) => lines.push('  ✗ ' + r.id + ' — ' + r.detail)); }
  if (warnFails.length) { lines.push('WARN:'); warnFails.forEach((r) => lines.push('  ⚠ ' + r.id + ' — ' + r.detail)); }
  lines.push(`Result: ${blockFails.length} blocking, ${warnFails.length} warning(s).`);
  return lines.join('\n');
}

// ── main ─────────────────────────────────────────────────────────────────────
try {
  const outcome = run();

  if (HOOK_MODE === 'stop') {
    // Only speak on drift, and only for turns that touched src/ (or any block/warn fail).
    const hasFindings = outcome.blockFails.length + outcome.warnFails.length > 0;
    if (!hasFindings) { process.exit(0); }
    const report = renderReport(outcome);
    if (outcome.cfg.enforcement === 'block' && outcome.blockFails.length > 0 && outcome.srcDirty) {
      process.stdout.write(JSON.stringify({
        decision: 'block',
        reason: 'SDLC gate blocked completion — reconcile before ending:\n' + report,
      }));
    } else {
      process.stdout.write(JSON.stringify({
        systemMessage: '⚠ SDLC gate: ' + outcome.blockFails.map((r) => r.id).concat(outcome.warnFails.map((r) => r.id)).join(', ') + ' (run `npm run gate` for detail)',
      }));
    }
    process.exit(0);
  }

  // CLI mode
  process.stdout.write(renderReport(outcome) + '\n');
  process.exit(outcome.blockFails.length > 0 ? 1 : 0);
} catch (e) {
  // Fail-open: never break the caller because the guardrail itself hiccuped.
  if (HOOK_MODE) process.exit(0);
  process.stderr.write('gate: internal error (non-fatal): ' + (e && e.message) + '\n');
  process.exit(0);
}
