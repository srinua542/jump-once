/**
 * S9.1 — structural isolation scans for render/ (dm-0081/dm-0082), active
 * from the FIRST render/**\/*.ts module (the dm-0053 lesson, applied at
 * subtree birth for the fourth subtree in a row after eval/, gen/, tools/):
 *
 *  1. ONE-WAY DEPENDENCY (dm-0081): nothing under src/ or tools/ may import
 *     from render/ — the presentation layer sits at the TOP of the chain;
 *     the verified headless stack never depends on it.
 *  2. TOOLS CONFINEMENT (dm-0081): within render/, ONLY render/tooling/ may
 *     import from tools/ — the game shell renders the sim, not the tooling.
 *  3. EVAL SEAM (dm-0081): render/ reaches src/eval/ only through
 *     AgentHarness (CANONICAL_PIPELINE — "the only sanctioned engine
 *     assembly order"); never eval/local/, eval/gdos/, eval/campaign/,
 *     Evaluate/EmergentFun/AgentPolicy/Archetypes. render/ never imports
 *     src/gen/ at all.
 *  4. BROWSER-GLOBAL CONFINEMENT (dm-0082/dm-0086): only render/platform/
 *     may name a browser global or DOM/WebGL/WebAudio type — everything
 *     else is pure logic against the injected device seams (Raster2D,
 *     Gl2Device, AudioDevice, AssetFetcher, PortalSdk, FrameScheduler).
 *  5. WALL-CLOCK CONFINEMENT (dm-0082, amending dm-0067's map): real-time
 *     reads live ONLY in tools/profiler/ (P8) and render/platform/ (P9).
 *     Everything else in render/ receives time as data (Clock.advance's
 *     realDeltaSeconds argument, injected clocks). src/ stays scan-clean
 *     (ToolsIsolation + EvalIsolation already pin that side).
 *  6. THE AXIOM: Math.random is forbidden in render/ — visual RNG is a
 *     seeded generator hashed off entity identity (bible §4, dm-0003).
 *
 * Scans TypeScript SOURCE with comments and strings stripped, exactly like
 * ToolsIsolation/GenIsolation.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const TOOLS = join(process.cwd(), 'tools');
const RENDER = join(process.cwd(), 'render');
const SRC_DIRS = ['core', 'systems', 'components', 'entities', 'schema', 'eval', 'gen'];

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

const RENDER_FILES = tsFilesRecursive(RENDER);
const TOOLS_FILES = tsFilesRecursive(TOOLS);

test('render/ has at least one .ts module (the scans must never pass vacuously)', () => {
  assert.ok(RENDER_FILES.length > 0, 'no .ts files under render/ — scans would be vacuous');
});

test('one-way dependency: nothing under src/ imports from render/ (dm-0081)', () => {
  for (const dir of SRC_DIRS) {
    for (const file of tsFilesRecursive(join(SRC, dir))) {
      const raw = readFileSync(join(SRC, dir, file), 'utf8');
      const importsRender = /from\s+['"][^'"]*\/render\//.test(raw) || /require\(\s*['"][^'"]*\/render\//.test(raw);
      assert.ok(!importsRender, `src/${dir}/${file} imports from render/ — the verified stack never depends on presentation`);
    }
  }
});

test('one-way dependency: nothing under tools/ imports from render/ (dm-0081)', () => {
  for (const file of TOOLS_FILES) {
    const raw = readFileSync(join(TOOLS, file), 'utf8');
    const importsRender = /from\s+['"][^'"]*\/render\//.test(raw) || /require\(\s*['"][^'"]*\/render\//.test(raw);
    assert.ok(!importsRender, `tools/${file} imports from render/ — tools/ stays headless (dm-0065) and below render/ in the chain (dm-0081)`);
  }
});

test('within render/, only render/tooling/ imports from tools/ (dm-0081)', () => {
  for (const file of RENDER_FILES) {
    if (file.startsWith('tooling/')) continue;
    const raw = readFileSync(join(RENDER, file), 'utf8');
    const importsTools = /from\s+['"][^'"]*\/tools\//.test(raw) || /require\(\s*['"][^'"]*\/tools\//.test(raw);
    assert.ok(!importsTools, `render/${file} imports from tools/ — only render/tooling/ renders the tooling substrate; the game shell stays tools-free`);
  }
});

test('render/ never imports src/gen/, and reaches src/eval/ only via AgentHarness (dm-0081)', () => {
  const forbidden = [
    /from\s+['"][^'"]*\/gen\//,
    /from\s+['"][^'"]*\/eval\/local\//,
    /from\s+['"][^'"]*\/eval\/gdos\//,
    /from\s+['"][^'"]*\/eval\/campaign\//,
    /from\s+['"][^'"]*AgentPolicy['"]/,
    /from\s+['"][^'"]*\/eval\/Archetypes['"]/,
    /from\s+['"][^'"]*\/eval\/Evaluate['"]/,
    /from\s+['"][^'"]*EmergentFun['"]/,
  ];
  for (const file of RENDER_FILES) {
    const raw = readFileSync(join(RENDER, file), 'utf8');
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(raw), `render/${file} matches ${pattern} — render/ consumes the sim via core/schema/entities/systems public seams and eval/ only via AgentHarness`);
    }
  }
});

test('browser globals and DOM/WebGL/WebAudio types confined to render/platform/ (dm-0082/dm-0086)', () => {
  /* Naming a browser TYPE outside platform/ is forbidden too — it is what
     forces the enumerated-subset device seams (Gl2Device, AudioDevice, …)
     instead of leaking real DOM types through pure logic. */
  const forbidden = [
    /\bdocument\b/,
    /\bwindow\b/,
    /\bnavigator\b/,
    /\brequestAnimationFrame\b/,
    /\bdevicePixelRatio\b/,
    /\bfetch\s*\(/,
    /\bHTMLCanvasElement\b/,
    /\bOffscreenCanvas\b/,
    /\bCanvasRenderingContext2D\b/,
    /\bOffscreenCanvasRenderingContext2D\b/,
    /\bWebGL2?RenderingContext\b/,
    /\bAudioContext\b/,
    /\bPokiSDK\b/,
    /\bgetContext\s*\(/,
  ];
  for (const file of RENDER_FILES) {
    if (file.startsWith('platform/')) continue;
    const stripped = stripCommentsAndStrings(readFileSync(join(RENDER, file), 'utf8'));
    const lines = stripped.split('\n');
    for (let n = 0; n < lines.length; n++) {
      for (const pattern of forbidden) {
        assert.ok(!pattern.test(lines[n]), `render/${file}:${n + 1} matches ${pattern} — browser surface is confined to render/platform/; everything else uses the injected device seams`);
      }
    }
  }
});

test('wall-clock reads confined to render/platform/ within render/ (dm-0082, amending the dm-0067 map)', () => {
  for (const file of RENDER_FILES) {
    if (file.startsWith('platform/')) continue;
    const stripped = stripCommentsAndStrings(readFileSync(join(RENDER, file), 'utf8'));
    const lines = stripped.split('\n');
    for (let n = 0; n < lines.length; n++) {
      assert.ok(!/\bDate\.now\b/.test(lines[n]), `render/${file}:${n + 1} reads the wall clock — real time enters as data (Clock.advance argument / injected clock), reads live in render/platform/ only`);
      assert.ok(!/\bperformance\.now\b/.test(lines[n]), `render/${file}:${n + 1} reads the wall clock — real time enters as data (Clock.advance argument / injected clock), reads live in render/platform/ only`);
    }
  }
});

test('Math.random forbidden in render/ — visual RNG is identity-seeded (the axiom, bible §4)', () => {
  for (const file of RENDER_FILES) {
    const stripped = stripCommentsAndStrings(readFileSync(join(RENDER, file), 'utf8'));
    assert.ok(!/\bMath\.random\b/.test(stripped), `render/${file} calls Math.random — visual RNG is a seeded generator hashed off entity identity (dm-0003/bible §4)`);
  }
});
