/**
 * Enforces the directory invariant: src/components/ is strictly plain data.
 * No function bodies, no arrow functions, no classes — ever (S2.1 acceptance
 * criterion; directory_structure.md data/logic decoupling).
 *
 * The scan reads the TypeScript SOURCE (not compiled output, which erases
 * types and could hide or invent syntax), strips comments and string
 * literals, then rejects the three syntactic forms that can introduce
 * executable logic in this codebase's style: `function`, `=>`, `class`.
 * `declare` statements and type-only syntax survive the scan because they
 * carry none of those tokens.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// npm test runs from the repo root; dist/test mirrors test/, so cwd-relative
// is the stable way to reach the uncompiled sources.
const COMPONENTS_DIR = join(process.cwd(), 'src', 'components');

/** Comment bodies and string contents may legitimately mention forbidden tokens — blank them out, preserving line structure. */
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

const FORBIDDEN: ReadonlyArray<{ readonly pattern: RegExp; readonly why: string }> = [
  { pattern: /\bfunction\b/, why: 'function declaration/expression' },
  { pattern: /=>/, why: 'arrow function (or function-typed field, equally forbidden in data)' },
  { pattern: /\bclass\b/, why: 'class declaration' },
];

test('src/components/ exists and is non-empty (the scan must never pass vacuously)', () => {
  const files = readdirSync(COMPONENTS_DIR).filter((f) => f.endsWith('.ts'));
  assert.ok(files.length > 0, 'no .ts files found in src/components — scan would be vacuous');
});

test('no file under src/components/ contains executable logic (function, =>, class)', () => {
  const files = readdirSync(COMPONENTS_DIR).filter((f) => f.endsWith('.ts'));
  for (const file of files) {
    const stripped = stripCommentsAndStrings(readFileSync(join(COMPONENTS_DIR, file), 'utf8'));
    const lines = stripped.split('\n');
    for (const { pattern, why } of FORBIDDEN) {
      for (let n = 0; n < lines.length; n++) {
        assert.ok(
          !pattern.test(lines[n]),
          `src/components/${file}:${n + 1} contains ${why} — components must be logic-free plain data; move logic to src/systems/ or src/schema/`,
        );
      }
    }
  }
});
