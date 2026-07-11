/**
 * Raster2D — the minimal, enumerated 2D-drawing device seam (S9.2, dm-0086).
 *
 * Every StylePack that generates art procedurally (Paper Collage; any future
 * pack that does the same) draws through THIS interface, never a real
 * CanvasRenderingContext2D — RenderIsolation.test.ts forbids naming that type
 * outside render/platform/. The interface is a closed, hand-enumerated subset
 * of the 2D canvas API (methods only, no property assignment, so a recording
 * fake can log every call without a Proxy): every member is actually used by
 * the ported Paper Collage generators (render/style/paper/), and extending it
 * means enumerating and documenting the new member, never widening to the
 * whole DOM type.
 *
 * render/platform/ (S9.8) binds the real implementation once, adapting each
 * method onto an actual CanvasRenderingContext2D/OffscreenCanvasRenderingContext2D.
 * Everywhere else — including StylePack.validatePack's own determinism probe
 * below — uses a plain recording implementation.
 */

export type LineCap = 'butt' | 'round' | 'square';
export type CompositeOperation = 'source-over' | 'destination-out';

export interface Raster2D {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(sx: number, sy: number): void;
  rotate(radians: number): void;

  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  arc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;

  setFillStyle(color: string): void;
  setStrokeStyle(color: string): void;
  setLineWidth(width: number): void;
  setLineCap(cap: LineCap): void;
  setLineDash(segments: readonly number[]): void;
  setGlobalAlpha(alpha: number): void;
  setGlobalCompositeOperation(op: CompositeOperation): void;
}

/**
 * A pure, in-memory recording Raster2D: every call appends one line to an
 * internal trace (method name + JSON-stable args), nothing else. Used by
 * StylePack.validatePack's determinism probe and by render/style/paper's own
 * structural tests — never touches a real canvas, so it is safe to construct
 * and discard freely in any test or validation pass.
 */
export function createTraceRecorder(): { readonly device: Raster2D; trace(): readonly string[] } {
  const lines: string[] = [];
  const record = (name: string, args: readonly unknown[]): void => {
    lines.push(`${name}(${args.map((a) => JSON.stringify(a)).join(',')})`);
  };
  const device: Raster2D = {
    save: () => record('save', []),
    restore: () => record('restore', []),
    translate: (x, y) => record('translate', [x, y]),
    scale: (sx, sy) => record('scale', [sx, sy]),
    rotate: (r) => record('rotate', [r]),
    beginPath: () => record('beginPath', []),
    moveTo: (x, y) => record('moveTo', [x, y]),
    lineTo: (x, y) => record('lineTo', [x, y]),
    quadraticCurveTo: (cpx, cpy, x, y) => record('quadraticCurveTo', [cpx, cpy, x, y]),
    arc: (cx, cy, r, s, e, ccw) => record('arc', [cx, cy, r, s, e, ccw ?? false]),
    closePath: () => record('closePath', []),
    fill: () => record('fill', []),
    stroke: () => record('stroke', []),
    fillRect: (x, y, w, h) => record('fillRect', [x, y, w, h]),
    setFillStyle: (c) => record('setFillStyle', [c]),
    setStrokeStyle: (c) => record('setStrokeStyle', [c]),
    setLineWidth: (w) => record('setLineWidth', [w]),
    setLineCap: (c) => record('setLineCap', [c]),
    setLineDash: (segs) => record('setLineDash', [segs]),
    setGlobalAlpha: (a) => record('setGlobalAlpha', [a]),
    setGlobalCompositeOperation: (op) => record('setGlobalCompositeOperation', [op]),
  };
  return { device, trace: () => lines };
}
