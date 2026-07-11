#!/usr/bin/env node
/**
 * Jump Once — SessionStart hook.
 *
 * Runs deterministically at the start of every Claude Code session (the harness
 * executes it, not the model). Its stdout is injected into the session context,
 * so the reboot-lifecycle reminder and the last handoff are in front of the
 * model before any work begins — even for a tiny, seemingly-unrelated task.
 *
 * Fails soft: if the handoff is missing or unreadable, it still prints the
 * reboot instructions so the protocol is never silently skipped.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const handoffPath = path.join(root, 'meta', 'handoff_latest.json');

const lines = [];
lines.push('══════════════════════════════════════════════════════════════');
lines.push(' JUMP ONCE — long-horizon project. RUN THE REBOOT LIFECYCLE FIRST.');
lines.push('══════════════════════════════════════════════════════════════');
lines.push('Before ANY work (even a one-line change):');
lines.push('  1. Invoke /jump-once-protocol (governance). To DO a task, also invoke /jump-once-task (the SDLC loop).');
lines.push('  2. Read meta/handoff_latest.json (summary below).');
lines.push('  3. Parse meta/project_knowledge_graph.json; confirm pkg_hash matches the handoff.');
lines.push('  4. Run `npm test`; if red, fix the regression before new code.');
lines.push('See CLAUDE.md and docs/session_protocol.md for the invariants.');
lines.push('VISUAL: art direction = Paper Collage (docs/visual_design_bible.md); renderer is art-style-agnostic via a swappable StylePack (dm-0075/0076). For any visual/asset/render decision, invoke /visual-design-principle. Rendering code is gated to P9.');
lines.push('');

try {
  const handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
  lines.push('── Last handoff ─────────────────────────────────────────────');
  lines.push('Milestone : ' + (handoff.current_milestone || '(unknown)'));
  lines.push('Branch    : ' + (handoff.active_working_branch || '(unknown)'));
  lines.push('Written   : ' + (handoff.session_end_timestamp || '(unknown)'));
  lines.push('pkg_hash  : ' + (handoff.pkg_hash_at_handoff || '(unknown)'));

  const focus = handoff.exact_execution_focus;
  if (focus) {
    lines.push('Resume at : ' + (focus.file_path || '?') + ' [' + (focus.target_line_range || '?') + ']');
    if (focus.pending_logical_transformation) {
      lines.push('  → ' + focus.pending_logical_transformation);
    }
  }

  if (handoff.blocked_by && handoff.blocked_by.dependency_node && handoff.blocked_by.dependency_node !== 'none') {
    lines.push('BLOCKED by: ' + handoff.blocked_by.dependency_node + ' — ' + (handoff.blocked_by.reason || ''));
  }

  const warnings = handoff.critical_warnings_for_next_session;
  if (Array.isArray(warnings) && warnings.length > 0) {
    lines.push('Critical warnings:');
    for (const w of warnings) lines.push('  ⚠ ' + w);
  }

  const pick = handoff.next_session_pick_list;
  if (Array.isArray(pick) && pick.length > 0) {
    lines.push('Next up   : ' + pick.join(' → '));
  }

  // Fine-grained: if a slice was mid-flight, surface its exact stage.
  try {
    const task = JSON.parse(fs.readFileSync(path.join(root, 'meta', 'active_task.json'), 'utf8'));
    lines.push('ACTIVE SLICE (mid-flight): ' + task.slice + ' — ' + (task.title || ''));
    lines.push('  current stage: ' + task.current_stage + ' — resume there. Run `npm run stage` for the full checklist.');
  } catch { /* no active slice — clean between-slice boundary */ }

  lines.push('─────────────────────────────────────────────────────────────');
} catch (err) {
  lines.push('(No readable handoff at meta/handoff_latest.json — ' + err.message + ')');
  lines.push('Still run the reboot lifecycle above before working.');
}

process.stdout.write(lines.join('\n') + '\n');
