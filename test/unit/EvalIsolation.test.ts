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

test('macro isolation: src/eval/macro/ imports nothing from the sim or the local pass (REQ-140)', () => {
  const macroDir = join(SRC, 'eval', 'macro');
  const files = tsFiles(macroDir);
  assert.ok(files.length > 0, 'no .ts files under src/eval/macro — scan would be vacuous');
  for (const file of files) {
    const raw = readFileSync(join(macroDir, file), 'utf8');
    // The macro pass consumes local verdicts as DATA; it must not reach into
    // the harness, the search, or any simulation module.
    const forbidden = /from\s+['"][^'"]*\/(core|systems|entities|schema|eval\/(AgentHarness|AgentPolicy|Archetypes|local))/;
    assert.ok(
      !forbidden.test(raw),
      `src/eval/macro/${file} imports simulation/local-pass code — the macro pass must stay isolated (REQ-140)`,
    );
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

test('math whitelist extends to src/eval/gdos/ (dm-0031: the scoring engine replays no differently)', () => {
  const gdosDir = join(SRC, 'eval', 'gdos');
  const files = tsFiles(gdosDir);
  assert.ok(files.length > 0, 'no .ts files under src/eval/gdos — scan would be vacuous');
  for (const file of files) {
    const stripped = stripCommentsAndStrings(readFileSync(join(gdosDir, file), 'utf8'));
    const lines = stripped.split('\n');
    for (let n = 0; n < lines.length; n++) {
      for (const match of lines[n].matchAll(/\bMath\.(\w+)/g)) {
        assert.ok(
          MATH_WHITELIST.has(match[1]),
          `src/eval/gdos/${file}:${n + 1} calls Math.${match[1]} — outside the determinism whitelist`,
        );
      }
    }
  }
});

test('no re-auditing: src/eval/gdos/ imports the local audit pass ONLY as types (dm-0031)', () => {
  const gdosDir = join(SRC, 'eval', 'gdos');
  for (const file of tsFiles(gdosDir)) {
    const raw = readFileSync(join(gdosDir, file), 'utf8');
    // Any import that reaches into the local audit pass must be `import type` —
    // gdos consumes verdicts as DATA and must never invoke the audit functions.
    for (const m of raw.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+['"][^'"]*\/local\//gm)) {
      assert.ok(m[1] !== undefined, `src/eval/gdos/${file} value-imports from src/eval/local/ — gates must consume verdicts as types, not re-run audits`);
    }
    // The macro pass is off-limits entirely.
    assert.ok(!/from\s+['"][^'"]*\/macro\//.test(raw), `src/eval/gdos/${file} imports the macro pass`);
  }
});

test('gdos is PURE over pre-assembled evidence: it runs no sim and no search (dm-0037)', () => {
  // The scoring engine never drives the engine, never re-runs an archetype, and
  // never runs a reachability search. Anything that EXECUTES the sim or Search
  // (the assembler; the S5.5 Novelty/EmergentFun probes) lives at the TOP level
  // of src/eval/ (siblings of Evaluate.ts), NOT under gdos/. This makes the
  // one-way "gdos reads verdicts as data" rule total, so the no-re-auditing
  // scan above never needs a carve-out for a search-using gate.
  //
  // Reading the ARCHETYPES registry as DATA (DesignSpace's player-type axis,
  // dm-0034) is allowed — that imports a frozen record, it runs nothing. Only
  // the execution modules are banned here.
  const gdosDir = join(SRC, 'eval', 'gdos');
  const forbidden = /from\s+['"][^'"]*\/(AgentHarness|Evaluate|local\/Search|core\/Engine)['"]/;
  for (const file of tsFiles(gdosDir)) {
    const raw = readFileSync(join(gdosDir, file), 'utf8');
    const m = raw.match(forbidden);
    assert.ok(m === null, `src/eval/gdos/${file} imports ${m ? m[1] : ''} — gdos must run no sim/search; site search-using code at the top level of src/eval/ (dm-0037)`);
  }
});

test('math whitelist extends to src/eval/campaign/ (dm-0047: the campaign director replays no differently)', () => {
  const campaignDir = join(SRC, 'eval', 'campaign');
  const files = tsFiles(campaignDir);
  assert.ok(files.length > 0, 'no .ts files under src/eval/campaign — scan would be vacuous');
  for (const file of files) {
    const stripped = stripCommentsAndStrings(readFileSync(join(campaignDir, file), 'utf8'));
    const lines = stripped.split('\n');
    for (let n = 0; n < lines.length; n++) {
      for (const match of lines[n].matchAll(/\bMath\.(\w+)/g)) {
        assert.ok(
          MATH_WHITELIST.has(match[1]),
          `src/eval/campaign/${file}:${n + 1} calls Math.${match[1]} — outside the determinism whitelist`,
        );
      }
    }
  }
});

test('campaign/ runs no sim, no search, no local audits (dm-0047: campaign/ never re-audits, mirroring gdos/\'s dm-0037 rule one abstraction level up)', () => {
  const campaignDir = join(SRC, 'eval', 'campaign');
  // Reading OPTIMIZATION_STYLE_AXIS as DATA from DesignSpace.ts (dm-0052) is
  // allowed — the same "read the registry as data" precedent dm-0034 grants
  // gdos/ itself for ARCHETYPES/ENTITY_KINDS. Only execution modules are banned.
  const forbidden = /from\s+['"][^'"]*\/(AgentHarness|AgentPolicy|Archetypes|Evaluate|eval\/local\/|core\/Engine)/;
  for (const file of tsFiles(campaignDir)) {
    const raw = readFileSync(join(campaignDir, file), 'utf8');
    const m = raw.match(forbidden);
    assert.ok(m === null, `src/eval/campaign/${file} imports ${m ? m[0] : ''} — campaign/ must run no sim/search/local-audit (dm-0047)`);
  }
});

test('campaign/ consumes gdos/ ONLY as pre-assembled output data, never a gate-internal module (dm-0047)', () => {
  const campaignDir = join(SRC, 'eval', 'campaign');
  // Allowed gdos/ imports: Report.ts (GdosReport), Evidence.ts (ArchetypeRun),
  // DesignSpace.ts (CoverageMatrix + the OPTIMIZATION_STYLE_AXIS registry
  // value, dm-0052). Everything else under gdos/ is a GATE or curation/memory
  // internal that campaign/ must never reach into.
  const forbiddenGdos = /from\s+['"][^'"]*\/gdos\/(Emotional|Streamability|InfoDensity|Curation|Cdre|DesignMemory|Judge|Profile)['"]/;
  for (const file of tsFiles(campaignDir)) {
    const raw = readFileSync(join(campaignDir, file), 'utf8');
    const m = raw.match(forbiddenGdos);
    assert.ok(m === null, `src/eval/campaign/${file} imports gdos-internal ${m ? m[0] : ''} — campaign/ consumes GdosReport/CoverageMatrix/ArchetypeRun as data only, never a gate/curation/memory module (dm-0047)`);
    // The macro pass (MacroVerdict) is consumed as a TYPE only, exactly like gdos/'s own rule for local/ verdicts.
    for (const macroImport of raw.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+['"][^'"]*\/macro\//gm)) {
      assert.ok(macroImport[1] !== undefined, `src/eval/campaign/${file} value-imports the macro pass — MacroVerdict must be consumed as a type only`);
    }
  }
});
