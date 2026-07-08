#!/usr/bin/env node
/**
 * Jump Once — SDLC Stage Manager.
 *
 * Tracks progress of the ACTIVE task slice through the nine-stage loop and
 * persists it to disk so a session that dies mid-slice can resume at the exact
 * stage instead of re-deriving it. Complements meta/handoff_latest.json (coarse,
 * between-session) with fine-grained, within-slice state.
 *
 *   Live pointer : meta/active_task.json   (the one slice in flight)
 *   Run archive  : meta/runs/<slice>__<ts>.json  (completed/aborted slices)
 *
 * Commands:
 *   stage.js start <slice> [--title "..."] [--reqs REQ-1,REQ-2]
 *   stage.js advance [--note "..."]        complete current stage, activate next (in order)
 *   stage.js criterion <REQ> <met|unmet> [--note "..."]
 *   stage.js status
 *   stage.js done                          require handoff reached; archive + clear pointer
 *   stage.js abort  [--reason "..."]        archive as aborted + clear pointer
 *
 * Zero dependencies (Node builtins). Enforces stage ORDER so stages cannot be skipped.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const ACTIVE = path.join(ROOT, 'meta', 'active_task.json');
const RUNS_DIR = path.join(ROOT, 'meta', 'runs');

const STAGES = ['reboot', 'select', 'plan', 'anchor', 'implement', 'verify', 'integrate', 'report', 'handoff'];

function nowISO() { return new Date().toISOString(); }
function fsTs() { return nowISO().replace(/:/g, '-').replace(/\..+/, 'Z'); } // filename-safe
function readActive() {
  try { return JSON.parse(fs.readFileSync(ACTIVE, 'utf8')); } catch { return null; }
}
function writeActive(task) {
  task.updated_at = nowISO();
  fs.writeFileSync(ACTIVE, JSON.stringify(task, null, 2) + '\n');
}
function flag(argv, name, def) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
}
function die(msg) { process.stderr.write('stage: ' + msg + '\n'); process.exit(1); }

function freshStages() {
  const s = {};
  for (const name of STAGES) s[name] = { status: 'pending', at: null, note: null };
  return s;
}

function cmdStart(argv) {
  const slice = argv[0];
  if (!slice) die('usage: start <slice> [--title "..."] [--reqs A,B]');
  if (readActive()) die('an active task already exists (meta/active_task.json). Finish it with `done`/`abort` first.');
  const reqs = (flag(argv, 'reqs', '') || '').split(',').map((r) => r.trim()).filter(Boolean);
  const task = {
    slice,
    title: flag(argv, 'title', slice),
    reqs,
    started_at: nowISO(),
    updated_at: nowISO(),
    current_stage: 'reboot',
    stages: freshStages(),
    acceptance: reqs.map((r) => ({ req: r, criterion: '(fill in)', met: false, note: null })),
  };
  task.stages.reboot.status = 'in_progress';
  task.stages.reboot.at = nowISO();
  writeActive(task);
  process.stdout.write(`started ${slice} — stage: reboot (in_progress)\n`);
}

function cmdAdvance(argv) {
  const task = readActive();
  if (!task) die('no active task. Run `start <slice>` first.');
  const idx = STAGES.indexOf(task.current_stage);
  const note = flag(argv, 'note', null);
  task.stages[task.current_stage].status = 'done';
  task.stages[task.current_stage].note = note;
  if (idx === STAGES.length - 1) {
    task.stages[task.current_stage].at = task.stages[task.current_stage].at || nowISO();
    writeActive(task);
    process.stdout.write('handoff stage completed — run `stage.js done` to archive.\n');
    return;
  }
  const next = STAGES[idx + 1];
  task.current_stage = next;
  task.stages[next].status = 'in_progress';
  task.stages[next].at = nowISO();
  writeActive(task);
  process.stdout.write(`advanced: ${STAGES[idx]} ✓ → ${next} (in_progress)\n`);
}

function cmdCriterion(argv) {
  const task = readActive();
  if (!task) die('no active task.');
  const [req, state] = argv;
  if (!req || !['met', 'unmet'].includes(state)) die('usage: criterion <REQ> <met|unmet> [--note "..."]');
  const entry = task.acceptance.find((a) => a.req === req);
  if (!entry) die(`REQ ${req} not on this task (reqs: ${task.reqs.join(', ') || 'none'}).`);
  entry.met = state === 'met';
  const note = flag(argv, 'note', null);
  if (note) entry.criterion = note;
  writeActive(task);
  process.stdout.write(`${req}: ${state}\n`);
}

function cmdStatus() {
  const task = readActive();
  if (!task) { process.stdout.write('no active task.\n'); return; }
  const bar = STAGES.map((s) => {
    const st = task.stages[s].status;
    return st === 'done' ? s.toUpperCase() : st === 'in_progress' ? `[${s}]` : s;
  }).join(' → ');
  process.stdout.write(`slice ${task.slice} — ${task.title}\n${bar}\n`);
  if (task.acceptance.length) {
    process.stdout.write('acceptance:\n');
    for (const a of task.acceptance) process.stdout.write(`  ${a.met ? '✓' : '✗'} ${a.req} — ${a.criterion}\n`);
  }
}

function archive(task, outcome, reason) {
  if (!fs.existsSync(RUNS_DIR)) fs.mkdirSync(RUNS_DIR, { recursive: true });
  task.outcome = outcome;
  if (reason) task.outcome_reason = reason;
  task.closed_at = nowISO();
  const file = path.join(RUNS_DIR, `${task.slice}__${fsTs()}.json`);
  fs.writeFileSync(file, JSON.stringify(task, null, 2) + '\n');
  fs.rmSync(ACTIVE, { force: true });
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function cmdDone() {
  const task = readActive();
  if (!task) die('no active task.');
  if (task.stages.handoff.status !== 'done') die('cannot finish: handoff stage not completed. Advance through all stages first.');
  const unmet = task.acceptance.filter((a) => !a.met);
  if (unmet.length) process.stderr.write(`warning: ${unmet.length} acceptance criterion(s) still unmet: ${unmet.map((a) => a.req).join(', ')}\n`);
  const rel = archive(task, 'completed', null);
  process.stdout.write(`archived → ${rel}\n`);
}

function cmdAbort(argv) {
  const task = readActive();
  if (!task) die('no active task.');
  const rel = archive(task, 'aborted', flag(argv, 'reason', 'unspecified'));
  process.stdout.write(`aborted & archived → ${rel}\n`);
}

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case 'start': cmdStart(rest); break;
  case 'advance': cmdAdvance(rest); break;
  case 'criterion': cmdCriterion(rest); break;
  case 'status': case undefined: cmdStatus(); break;
  case 'done': cmdDone(); break;
  case 'abort': cmdAbort(rest); break;
  default: die(`unknown command "${cmd}". Use: start|advance|criterion|status|done|abort`);
}
