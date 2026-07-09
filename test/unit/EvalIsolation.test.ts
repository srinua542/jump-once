/**
 * S4.1 — enforces the two structural invariants the P4 plan added:
 *
 *  1. ONE-WAY DEPENDENCY (dm-0022): nothing under
 *     src/{core,systems,components,entities,schema} may import from
 *     src/eval/ — the simulation must never know it is being judged.
 *  2. MATH WHITELIST EXTENDED (dm-0017 → src/eval/): agent decisions feed
 *     replay tapes, and tapes must replay bit-identically on any JS engine,
 *     so src/eval/ obeys the same ban as src/systems/ — no transcendental
 *     Math functions, no Math.random. Allowed: sqrt, min, max, abs, floor,
 *     ceil, trunc.
 *
 * Scans TypeScript SOURCE (like the components logic-free scan), with
 * comments and strings stripped so prose mentioning banned tokens passes.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const SIM_DIRS = ['core', 'systems', 'components', 'entities', 'schema'];
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

test('src/eval/ exists and is non-empty (the scans must never pass vacuously)', () => {
  assert.ok(tsFiles(join(SRC, 'eval')).length > 0, 'no .ts files under src/eval — scans would be vacuous');
});

test('one-way dependency: no sim directory imports from src/eval/ (dm-0022)', () => {
  for (const dir of SIM_DIRS) {
    for (const file of tsFiles(join(SRC, dir))) {
      const stripped = stripCommentsAndStrings(readFileSync(join(SRC, dir, file), 'utf8'));
      // Strings are blanked by the stripper, so scan raw import statements too.
      const raw = readFileSync(join(SRC, dir, file), 'utf8');
      const importsEval = /from\s+['"][^'"]*\/eval\//.test(raw) || /require\(\s*['"][^'"]*\/eval\//.test(raw);
      assert.ok(
        !importsEval,
        `src/${dir}/${file} imports from src/eval/ — the sim must never depend on its evaluators`,
      );
      assert.ok(stripped.length >= 0); // stripped retained for symmetry with the whitelist scan
    }
  }
});

test('math whitelist holds in src/eval/: no transcendental Math calls, no Math.random (dm-0017)', () => {
  const evalDir = join(SRC, 'eval');
  for (const file of tsFiles(evalDir)) {
    const stripped = stripCommentsAndStrings(readFileSync(join(evalDir, file), 'utf8'));
    const lines = stripped.split('\n');
    for (let n = 0; n < lines.length; n++) {
      for (const match of lines[n].matchAll(/\bMath\.(\w+)/g)) {
        assert.ok(
          MATH_WHITELIST.has(match[1]),
          `src/eval/${file}:${n + 1} calls Math.${match[1]} — outside the determinism whitelist (${[...MATH_WHITELIST].join(', ')})`,
        );
      }
    }
  }
});
