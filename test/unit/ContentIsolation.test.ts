/**
 * S10.1 — structural isolation scans for content/ (dm-0108), active from the
 * FIRST content/ module (the dm-0053 lesson applied proactively — the fifth
 * subtree after src/eval/, src/gen/, tools/, render/ to get scan enforcement
 * from its first slice, never prose-only):
 *
 *  1. ONE-WAY DEPENDENCY: nothing under src/, tools/, or render/ may import
 *     from content/ — content is authored/generated data + assembler logic at
 *     the TOP of the dependency chain; the verified stack never depends on it.
 *  2. PUBLIC SEAMS ONLY: content/ reaches src/gen/ and src/eval/ through their
 *     public entry points (manufactureLevel, Concept, Creativity; evaluateLevel/
 *     assembleLevelEvidence, AgentHarness runAgent/CANONICAL_PIPELINE,
 *     Optimization, campaign processCampaign/updateState, macro Curriculum) —
 *     never the engine, state manager, per-frame systems, or world construction.
 *  3. NO GATE INTERNALS: gdos/ scoring internals (Emotional, Streamability,
 *     InfoDensity, Score, Economy, Curation, Judge) stay behind evaluateLevel.
 *  4. MATH WHITELIST + NO CLOCK/RANDOM: same determinism ban as the rest of the
 *     project; content generation is a pure function of its persisted seeds.
 *
 * Scans TypeScript SOURCE with comments and strings stripped, like the four
 * prior isolation scans.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CONTENT = join(ROOT, 'content');
const SRC = join(ROOT, 'src');
const TOOLS = join(ROOT, 'tools');
const RENDER = join(ROOT, 'render');
const MATH_WHITELIST = new Set(['sqrt', 'min', 'max', 'abs', 'floor', 'ceil', 'trunc', 'round']);

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
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...tsFilesRecursive(join(dir, entry.name), `${prefix}${entry.name}/`));
    else if (entry.name.endsWith('.ts')) out.push(`${prefix}${entry.name}`);
  }
  return out;
}

test('content/ exists and is non-empty (the scans must never pass vacuously)', () => {
  assert.ok(tsFilesRecursive(CONTENT).length > 0, 'no .ts files under content/ — scans would be vacuous');
});

test('one-way dependency: nothing under src/, tools/, or render/ imports from content/ (dm-0108)', () => {
  for (const [label, base] of [['src', SRC], ['tools', TOOLS], ['render', RENDER]] as const) {
    for (const file of tsFilesRecursive(base)) {
      const raw = readFileSync(join(base, file), 'utf8');
      const importsContent = /from\s+['"][^'"]*(\.\.\/)+content\//.test(raw) || /require\(\s*['"][^'"]*(\.\.\/)+content\//.test(raw);
      assert.ok(!importsContent, `${label}/${file} imports from content/ — the verified stack must never depend on authored content`);
    }
  }
});

test('content/ consumes src/ through public seams only — no engine, state manager, systems, or world construction (dm-0108)', () => {
  const forbidden = [
    /from\s+['"][^'"]*\/core\/Engine['"]/,
    /from\s+['"][^'"]*\/core\/StateManager['"]/,
    /from\s+['"][^'"]*\/entities\/World['"]/,
    /from\s+['"][^'"]*\/systems\/[^'"]*['"]/,
  ];
  for (const file of tsFilesRecursive(CONTENT)) {
    const raw = readFileSync(join(CONTENT, file), 'utf8');
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(raw), `content/${file} matches ${pattern} — content reaches the sim only through evaluation/generation public seams`);
    }
  }
});

test('content/ never imports gdos/ gate internals — scoring stays behind evaluateLevel (dm-0108)', () => {
  const forbidden = ['Emotional', 'Streamability', 'InfoDensity', 'Score', 'Economy', 'Curation', 'Judge'];
  for (const file of tsFilesRecursive(CONTENT)) {
    const raw = readFileSync(join(CONTENT, file), 'utf8');
    for (const mod of forbidden) {
      const pattern = new RegExp(`from\\s+['"][^'"]*gdos/${mod}['"]`);
      assert.ok(!pattern.test(raw), `content/${file} imports gdos/${mod} — gate internals stay behind evaluateLevel`);
    }
  }
});

test('math whitelist holds in content/: no transcendental Math, no Math.random, no clock (dm-0108)', () => {
  for (const file of tsFilesRecursive(CONTENT)) {
    const stripped = stripCommentsAndStrings(readFileSync(join(CONTENT, file), 'utf8'));
    const lines = stripped.split('\n');
    for (let n = 0; n < lines.length; n++) {
      for (const match of lines[n].matchAll(/\bMath\.(\w+)/g)) {
        assert.ok(
          MATH_WHITELIST.has(match[1]),
          `content/${file}:${n + 1} calls Math.${match[1]} — outside the determinism whitelist (${[...MATH_WHITELIST].join(', ')})`,
        );
      }
      assert.ok(!/\bDate\.now\b/.test(lines[n]), `content/${file}:${n + 1} reads the clock — content generation is seed-pure`);
      assert.ok(!/\bnew\s+Date\b/.test(lines[n]), `content/${file}:${n + 1} constructs a Date — content generation is seed-pure`);
      assert.ok(!/\bMath\.random\b/.test(lines[n]), `content/${file}:${n + 1} calls Math.random — forbidden repo-wide`);
    }
  }
});
