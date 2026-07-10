/**
 * S7.1 — structural isolation scans for src/gen/ (dm-0057), active from the
 * FIRST gen/ module (the P6 lesson — dm-0053 closed a scan gap that had been
 * prose-only for four slices):
 *
 *  1. ONE-WAY DEPENDENCY: nothing under src/{core,systems,components,
 *     entities,schema,eval} may import from src/gen/ — generation consumes
 *     the verified stack; the stack never knows it is being generated for.
 *  2. PUBLIC SEAMS ONLY: gen/ never imports the engine, the state manager,
 *     world construction, the agent harness/policies/archetypes, or any
 *     per-frame system — evaluation is reached through its public entry
 *     points (evaluateLevel/judgeLevel, the audits, probeEmergentFun,
 *     noveltyDivergence) only.
 *  3. NO GATE INTERNALS: gdos/ scoring internals (Emotional, Streamability,
 *     InfoDensity, Score, Economy, Curation) stay behind judgeLevel.
 *  4. CAMPAIGN TYPES ONLY: campaign/ records may be read as types, never as
 *     values (dm-0047 — campaign/ is a verified, read-only layer to P7).
 *  5. MATH WHITELIST + NO CLOCK/RANDOM: same determinism ban as src/eval/
 *     (dm-0017/dm-0031); RNG only via threaded core/Rng state.
 *
 * Scans TypeScript SOURCE with comments and strings stripped, like
 * EvalIsolation.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const GEN = join(SRC, 'gen');
const NON_GEN_DIRS = ['core', 'systems', 'components', 'entities', 'schema', 'eval'];
const MATH_WHITELIST = new Set(['sqrt', 'min', 'max', 'abs', 'floor', 'ceil', 'trunc']);

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

function tsFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith('.ts'));
}

function tsFilesRecursive(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...tsFilesRecursive(join(dir, entry.name), `${prefix}${entry.name}/`));
    else if (entry.name.endsWith('.ts')) out.push(`${prefix}${entry.name}`);
  }
  return out;
}

test('src/gen/ exists and is non-empty (the scans must never pass vacuously)', () => {
  assert.ok(tsFiles(GEN).length > 0, 'no .ts files under src/gen — scans would be vacuous');
});

test('one-way dependency: nothing outside gen/ imports from src/gen/ (dm-0057)', () => {
  for (const dir of NON_GEN_DIRS) {
    for (const file of tsFilesRecursive(join(SRC, dir))) {
      const raw = readFileSync(join(SRC, dir, file), 'utf8');
      const importsGen = /from\s+['"][^'"]*\/gen\//.test(raw) || /require\(\s*['"][^'"]*\/gen\//.test(raw);
      assert.ok(!importsGen, `src/${dir}/${file} imports from src/gen/ — the verified stack must never depend on the generator`);
    }
  }
});

test('gen/ consumes evaluation through public seams only — no engine, no harness, no systems, no world construction (dm-0057)', () => {
  const forbidden = [
    /from\s+['"][^'"]*\/core\/Engine['"]/,
    /from\s+['"][^'"]*\/core\/StateManager['"]/,
    /from\s+['"][^'"]*\/entities\/World['"]/,
    /from\s+['"][^'"]*AgentHarness['"]/,
    /from\s+['"][^'"]*AgentPolicy['"]/,
    /from\s+['"][^'"]*Archetypes['"]/,
    /from\s+['"][^'"]*\/systems\/[^'"]*['"]/,
  ];
  for (const file of tsFiles(GEN)) {
    const raw = readFileSync(join(GEN, file), 'utf8');
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(raw), `src/gen/${file} matches ${pattern} — gen/ reaches the sim only through evaluation's public entry points`);
    }
  }
});

test('gen/ never imports gdos/ gate internals — scoring stays behind judgeLevel (dm-0057)', () => {
  const forbidden = ['Emotional', 'Streamability', 'InfoDensity', 'Score', 'Economy', 'Curation'];
  for (const file of tsFiles(GEN)) {
    const raw = readFileSync(join(GEN, file), 'utf8');
    for (const mod of forbidden) {
      const pattern = new RegExp(`from\\s+['"][^'"]*gdos/${mod}['"]`);
      assert.ok(!pattern.test(raw), `src/gen/${file} imports gdos/${mod} — gate internals stay behind judgeLevel/evaluateLevel`);
    }
  }
});

test('gen/ reads campaign/ as types only (dm-0047: a verified, read-only layer to P7)', () => {
  for (const file of tsFiles(GEN)) {
    const raw = readFileSync(join(GEN, file), 'utf8');
    for (const match of raw.matchAll(/import\s+(type\s+)?[^;]*from\s+['"]([^'"]*\/campaign\/[^'"]*)['"]/g)) {
      assert.ok(match[1] !== undefined, `src/gen/${file} value-imports ${match[2]} — campaign/ records are read as types only`);
    }
  }
});

test('math whitelist holds in src/gen/: no transcendental Math, no Math.random, no clock (dm-0017/dm-0057)', () => {
  for (const file of tsFiles(GEN)) {
    const stripped = stripCommentsAndStrings(readFileSync(join(GEN, file), 'utf8'));
    const lines = stripped.split('\n');
    for (let n = 0; n < lines.length; n++) {
      for (const match of lines[n].matchAll(/\bMath\.(\w+)/g)) {
        assert.ok(
          MATH_WHITELIST.has(match[1]),
          `src/gen/${file}:${n + 1} calls Math.${match[1]} — outside the determinism whitelist (${[...MATH_WHITELIST].join(', ')})`,
        );
      }
      assert.ok(!/\bDate\.now\b/.test(lines[n]), `src/gen/${file}:${n + 1} reads the clock — dates are parameters (dm-0032)`);
      assert.ok(!/\bnew\s+Date\b/.test(lines[n]), `src/gen/${file}:${n + 1} constructs a Date — dates are parameters (dm-0032)`);
    }
  }
});
