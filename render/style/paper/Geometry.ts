/**
 * Geometry — the hand-cut-paper drawing primitives shared by every Paper
 * Collage generator (S9.2). Direct ports of the reference engine's
 * roughPoly/roughRect/fillRough/wear/grain/roughLine/inkSplat
 * (src/assets/paper-asset-library.html), translated from direct
 * CanvasRenderingContext2D property/method calls onto the injected Raster2D
 * seam (dm-0086) — same math, same call order, so the command trace is
 * byte-identical in shape to what the original canvas calls would have been.
 *
 * Every function takes an `RngFn` explicitly (never touches global state) —
 * the same determinism discipline as the simulation's threaded `Rng`
 * (dm-0003), applied to the visual layer.
 */

import type { Raster2D } from '../Raster2D';
import type { RngFn } from './PaperRng';

/** A 2D point, `[x, y]`. */
export type Point = readonly [number, number];

/** Walk a closed polygon in ~`seg`px steps, offsetting each step by ±`j` — the cut-paper edge. */
export function roughPoly(g: Raster2D, pts: readonly Point[], rnd: RngFn, j = 1.0, seg = 14): void {
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const n = Math.max(1, Math.round(Math.hypot(dx, dy) / seg));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const x = a[0] + dx * t + (rnd() - 0.5) * j * 2;
      const y = a[1] + dy * t + (rnd() - 0.5) * j * 2;
      if (i === 0 && k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
  }
  g.closePath();
}

export function roughRect(g: Raster2D, x: number, y: number, w: number, h: number, rnd: RngFn, j = 1.0): void {
  roughPoly(g, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], rnd, j);
}

export function fillRough(g: Raster2D, x: number, y: number, w: number, h: number, color: string, rnd: RngFn, j: number): void {
  g.setFillStyle(color);
  roughRect(g, x, y, w, h, rnd, j);
  g.fill();
}

/** `destination-out` erase of low-alpha specks + thin scratches — reads as missing ink. */
export function wear(g: Raster2D, x: number, y: number, w: number, h: number, rnd: RngFn, amt = 1): void {
  g.save();
  g.setGlobalCompositeOperation('destination-out');
  const n = Math.floor((w * h) / 130 * amt);
  for (let i = 0; i < n; i++) {
    g.setGlobalAlpha(0.1 + rnd() * 0.28);
    g.beginPath();
    g.arc(x + rnd() * w, y + rnd() * h, 0.4 + rnd() * 1.3, 0, 7);
    g.fill();
  }
  const scratches = Math.max(2, amt * 3);
  for (let i = 0; i < scratches; i++) {
    g.setGlobalAlpha(0.07 + rnd() * 0.13);
    g.setLineWidth(0.5 + rnd());
    const px = x + rnd() * w;
    const py = y + rnd() * h;
    const a = rnd() * Math.PI;
    const l = 4 + rnd() * w * 0.35;
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
    g.stroke();
  }
  g.restore();
  g.setGlobalAlpha(1);
}

/** 1px specks, half dark/half near-white — the ONE shared background paper texture (dm-0077). */
export function grain(g: Raster2D, x: number, y: number, w: number, h: number, rnd: RngFn, alpha = 0.05, density = 180): void {
  const n = Math.floor((w * h) / density);
  for (let i = 0; i < n; i++) {
    g.setFillStyle(rnd() < 0.5 ? `rgba(35,32,25,${alpha * rnd()})` : `rgba(255,255,250,${alpha * rnd()})`);
    g.fillRect(x + rnd() * w, y + rnd() * h, 1, 1);
  }
}

export function roughLine(g: Raster2D, x1: number, y1: number, x2: number, y2: number, rnd: RngFn, wdt = 2, j = 0.8): void {
  g.setLineWidth(wdt);
  g.setLineCap('round');
  const n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 12));
  g.beginPath();
  g.moveTo(x1, y1);
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    g.lineTo(x1 + (x2 - x1) * t + (rnd() - 0.5) * j * 2, y1 + (y2 - y1) * t + (rnd() - 0.5) * j * 2);
  }
  g.stroke();
}

export function inkSplat(g: Raster2D, cx: number, cy: number, rnd: RngFn, scale = 1, color: string): void {
  g.setFillStyle(color);
  const n = 8 + Math.floor(rnd() * 10);
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.28;
    const d = rnd() * rnd() * 18 * scale;
    g.setGlobalAlpha(0.5 + rnd() * 0.5);
    g.beginPath();
    g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, (0.5 + rnd() * 2) * scale, 0, 7);
    g.fill();
  }
  g.setGlobalAlpha(1);
}
