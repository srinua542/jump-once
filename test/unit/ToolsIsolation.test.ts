/**
 * S8.1 — structural isolation scans for tools/ (dm-0066), active from the
 * FIRST tools/**\/*.ts module (the P6 lesson — dm-0053 closed a scan gap that
 * had been prose-only for four slices; P7 applied it immediately at S7.1;
 * this phase does the same):
 *
 *  1. ONE-WAY DEPENDENCY: nothing under src/{core,systems,components,
 *     entities,schema,eval,gen} may import from tools/ — the verified
 *     simulation/eval/gen stack never depends on interactive tooling.
 *  2. tools/ NEVER IMPORTS src/gen/: P8 has zero dependency on P7's subtree
 *     (docs/execution_plan.md §P8 "Dependencies" — nothing in this plan
 *     needs the PDA, lifecycle, or manufacturing pipeline).
 *  3. tools/ REACHES src/eval/ ONLY THROUGH NAMED PUBLIC SEAMS: `AgentHarness`
 *     (for `CANONICAL_PIPELINE`, "the only sanctioned engine assembly order")
 *     and `campaign/` (for `analyzeTape`/`processCampaign` and their
 *     supporting types — S8.6's telemetry round-trip). NEVER `eval/local/`
 *     (solvability/search/softlock/exploit internals — P8 doesn't audit
 *     levels), NEVER `eval/gdos/` (scoring-gate internals), NEVER
 *     `AgentPolicy`/`Archetypes`/`Evaluate`/`EmergentFun` (archetype-policy
 *     machinery P8 has no use for).
 *  4. NO RENDERING CREEP (dm-0065): no canvas/DOM/WebGL API anywhere in
 *     tools/ — REQ-130/131's presentation share is P9's, not P8's.
 *  5. WALL-CLOCK CONFINEMENT (dm-0067): `Date.now`/`performance.now` are
 *     permitted ONLY inside tools/profiler/ (diagnostic instrumentation);
 *     forbidden in tools/level_editor/, tools/debug/, tools/telemetry/.
 *
 * Scans TypeScript SOURCE with comments and strings stripped, like
 * GenIsolation/EvalIsolation. `tools/sdlc/*.js` are plain Node scripts
 * outside the TS surface (tsconfig only globs tools/**\/*.ts) and are exempt.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const TOOLS = join(process.cwd(), 'tools');
const NON_TOOLS_DIRS = ['core', 'systems', 'components', 'entities', 'schema', 'eval', 'gen'];

function stripCommentsAndStrings(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (; i < stop; i++) out += source[i] === '\n' ? '\n' : ' ';
    } else if (two === '//') {
      while (i < source.length && source[i] !== '\n') { out += ' '; i++; }
    } else if (source[i] === '"' || source[i] === "'" || source[i] === '`') {
      const quote = source[i];
      out += ' '; i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') { out += '  '; i += 2; continue; }
        out += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += ' '; i++;
    } else {
      out += source[i]; i++;
    }
  }
  return out;
}

function tsFilesRecursive(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...tsFilesRecursive(join(dir, entry.name), `${prefix}${entry.name}/`));
    else if (entry.name.endsWith('.ts')) out.push(`${prefix}${entry.name}`);
  }
  return out;
}

const TOOLS_FILES = tsFilesRecursive(TOOLS);

test('tools/ has at least one .ts module (the scans must never pass vacuously)', () => {
  assert.ok(TOOLS_FILES.length > 0, 'no .ts files under tools/ — scans would be vacuous');
});

test('one-way dependency: nothing outside tools/ imports from tools/ (dm-0066)', () => {
  for (const dir of NON_TOOLS_DIRS) {
    for (const file of tsFilesRecursive(join(SRC, dir))) {
      const raw = readFileSync(join(SRC, dir, file), 'utf8');
      const importsTools = /from\s+['"][^'"]*\/tools\//.test(raw) || /require\(\s*['"][^'"]*\/tools\//.test(raw);
      assert.ok(!importsTools, `src/${dir}/${file} imports from tools/ — the verified stack must never depend on interactive tooling`);
    }
  }
});

test('tools/ never imports src/gen/ — P8 has zero dependency on P7\'s subtree (dm-0066)', () => {
  for (const file of TOOLS_FILES) {
    const raw = readFileSync(join(TOOLS, file), 'utf8');
    assert.ok(!/from\s+['"][^'"]*\/gen\//.test(raw), `tools/${file} imports from src/gen/ — P8 does not depend on P7`);
  }
});

test('tools/ reaches src/eval/ only through named public seams — AgentHarness and campaign/ (dm-0066/dm-0074)', () => {
  // Entirely forbidden surface: local audits (P8 doesn't audit), archetype-policy
  // machinery, evaluation orchestration, the emergent-fun probe.
  const forbiddenEntirely = [
    /from\s+['"][^'"]*\/eval\/local\//,
    /from\s+['"][^'"]*AgentPolicy['"]/,
    /from\s+['"][^'"]*\/eval\/Evaluate['"]/,
    /from\s+['"][^'"]*EmergentFun['"]/,
  ];
  // gdos SCORING-GATE internals: forbidden even as types (mirrors GenIsolation) —
  // scoring stays behind judgeLevel. gdos/Evidence + gdos/Report are OUTPUT types,
  // not gate internals, and are governed by the type-only rule below (dm-0074).
  const gdosInternals = ['Emotional', 'Streamability', 'InfoDensity', 'Score', 'Economy', 'Curation'];
  for (const file of TOOLS_FILES) {
    const raw = readFileSync(join(TOOLS, file), 'utf8');
    for (const pattern of forbiddenEntirely) {
      assert.ok(!pattern.test(raw), `tools/${file} matches ${pattern} — tools/ reaches eval/ only via AgentHarness (CANONICAL_PIPELINE/replayObserved) or campaign/ (analyzeTape/processCampaign)`);
    }
    for (const mod of gdosInternals) {
      const pattern = new RegExp(`from\\s+['"][^'"]*gdos/${mod}['"]`);
      assert.ok(!pattern.test(raw), `tools/${file} imports gdos/${mod} — scoring-gate internals stay behind judgeLevel`);
    }
  }
});

test('tools/ imports gdos OUTPUT types (Evidence/Report) and Archetype names as TYPES only (dm-0074)', () => {
  // ArchetypeRun (gdos/Evidence) and ArchetypeName (eval/Archetypes) are public
  // evaluation output types the telemetry→campaign adapter must name; read as
  // types they carry zero runtime coupling (they compile away), exactly as gen/
  // reads campaign types (dm-0047). Value imports from these remain forbidden.
  const typeOnly = /import\s+(type\s+)?[^;]*from\s+['"]([^'"]*(?:\/eval\/gdos\/|\/eval\/Archetypes)[^'"]*)['"]/g;
  for (const file of TOOLS_FILES) {
    const raw = readFileSync(join(TOOLS, file), 'utf8');
    for (const match of raw.matchAll(typeOnly)) {
      assert.ok(match[1] !== undefined, `tools/${file} value-imports ${match[2]} — gdos output types / archetype names are read as types only`);
    }
  }
});

test('no rendering creep: no canvas/DOM/WebGL API anywhere in tools/ (dm-0065 — the presentation share is P9\'s)', () => {
  const forbidden = [/\bdocument\./, /\bwindow\./, /getContext\(/, /WebGLRenderingContext/, /HTMLCanvasElement/];
  for (const file of TOOLS_FILES) {
    const stripped = stripCommentsAndStrings(readFileSync(join(TOOLS, file), 'utf8'));
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(stripped), `tools/${file} matches ${pattern} — P8 builds the pure logic/data share only; rendering is P9's`);
    }
  }
});

test('wall-clock reads confined to tools/profiler/ (dm-0067)', () => {
  for (const file of TOOLS_FILES) {
    if (file.startsWith('profiler/')) continue;
    const stripped = stripCommentsAndStrings(readFileSync(join(TOOLS, file), 'utf8'));
    const lines = stripped.split('\n');
    for (let n = 0; n < lines.length; n++) {
      assert.ok(!/\bDate\.now\b/.test(lines[n]), `tools/${file}:${n + 1} reads the wall clock — confined to tools/profiler/ (dm-0067)`);
      assert.ok(!/\bperformance\.now\b/.test(lines[n]), `tools/${file}:${n + 1} reads the wall clock — confined to tools/profiler/ (dm-0067)`);
    }
  }
});
