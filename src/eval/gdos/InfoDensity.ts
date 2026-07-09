/**
 * InfoDensity — the Information Density regulator + failure-visibility fairness
 * gate (P5/S5.4, REQ-061; REQ-016 P5 share).
 *
 * GDOS alignment: Section 7 (Information Density Score per screen, regulated
 * against a max (overwhelm) and a min (boring)); Section 2 (REQ-016: no
 * arbitrary trolling — failure information always visually present on screen).
 *
 * The "screen" is a profile-defined tile window (dm-0035): P9's camera does
 * not exist yet, so viewport dimensions live in the ScoringProfile. The
 * regulator slides that window across the level counting information elements
 * (entities + goal) per window; a window over the max reads as overwhelming, a
 * global peak under the min reads as boring.
 *
 * The same window is the visibility primitive for REQ-016 (dm-0035): a death
 * is FAIR iff its killing hazard was inside the viewport around the player
 * `fairnessLookbackTicks` before the death — an invisible kill (a hazard that
 * rushed in from off-screen) fails the fairness check. Deaths with no
 * attributable killer within the fairness radius (falls) are fair by default.
 *
 * Metric `pass` flags encode band/limit tests directly (min ≤ peak ≤ max;
 * zero unfair deaths), so the `threshold` field here is the relevant BOUND,
 * not a ≥-only cutoff. Whitelist math only; pure over the bundle.
 */

import type { Vec2 } from '../../core/Vec2';
import type { EvidenceBundle } from './Evidence';
import type { ScoringProfile } from './Profile';
import { gateResult, type DesignDecision, type GateResult, type MetricScore } from './Report';

const GATE = 'info-density';

interface Cell {
  readonly tx: number;
  readonly ty: number;
}

/** Info elements a player must parse: every entity, plus the goal. */
function infoElements(bundle: EvidenceBundle): Cell[] {
  const tileSize = bundle.def.tilemap.tileSize;
  const width = bundle.def.tilemap.width;
  const height = bundle.def.tilemap.height;
  const cells: Cell[] = [];
  const place = (p: Vec2): void => {
    let tx = Math.floor(p.x / tileSize);
    let ty = Math.floor(p.y / tileSize);
    tx = Math.max(0, Math.min(width - 1, tx));
    ty = Math.max(0, Math.min(height - 1, ty));
    cells.push({ tx, ty });
  };
  for (const e of bundle.def.entities) place(e.transform.position);
  place(bundle.def.constraints.goal.position);
  return cells;
}

interface DensityResult {
  readonly peak: number;
  readonly worstOriginX: number;
  readonly worstOriginY: number;
}

/** Slide the profile viewport over the level; return the peak per-screen element count. */
function peakDensity(bundle: EvidenceBundle, profile: ScoringProfile): DensityResult {
  const cells = infoElements(bundle);
  const width = bundle.def.tilemap.width;
  const height = bundle.def.tilemap.height;
  const vw = profile.infoDensity.viewportTilesX;
  const vh = profile.infoDensity.viewportTilesY;
  const maxOriginX = Math.max(0, width - vw);
  const maxOriginY = Math.max(0, height - vh);
  let peak = 0;
  let worstOriginX = 0;
  let worstOriginY = 0;
  for (let oy = 0; oy <= maxOriginY; oy++) {
    for (let ox = 0; ox <= maxOriginX; ox++) {
      let count = 0;
      for (const c of cells) {
        if (c.tx >= ox && c.tx < ox + vw && c.ty >= oy && c.ty < oy + vh) count++;
      }
      if (count > peak) { peak = count; worstOriginX = ox; worstOriginY = oy; }
    }
  }
  return { peak, worstOriginX, worstOriginY };
}

/** True iff `other` lies within the viewport rectangle centered on `player`. */
function withinViewport(player: Vec2, other: Vec2, profile: ScoringProfile, tileSize: number): boolean {
  const halfW = (profile.infoDensity.viewportTilesX * tileSize) / 2;
  const halfH = (profile.infoDensity.viewportTilesY * tileSize) / 2;
  return Math.abs(other.x - player.x) <= halfW && Math.abs(other.y - player.y) <= halfH;
}

/** Deaths whose killer was off-screen the moment before impact (REQ-016 violations). */
function unfairDeaths(bundle: EvidenceBundle, profile: ScoringProfile): string[] {
  const tileSize = bundle.def.tilemap.tileSize;
  const violations: string[] = [];
  for (const d of bundle.deaths) {
    if (d.killerId === undefined || d.killerPositionAtLookback === undefined) continue; // fall/unattributed = fair
    if (!withinViewport(d.playerPositionAtLookback, d.killerPositionAtLookback, profile, tileSize)) {
      violations.push(`death at tick ${d.tick}: killer "${d.killerId}" (${d.killerKind ?? 'unknown'}) was off-screen ${bundle.lookbackTicks} ticks before impact`);
    }
  }
  return violations;
}

/** Regulate a level's information density and check failure visibility (REQ-061/016). */
export function scoreInfoDensity(bundle: EvidenceBundle, profile: ScoringProfile): GateResult {
  const id = profile.infoDensity;
  const density = peakDensity(bundle, profile);
  const overwhelmed = density.peak > id.maxElementsPerScreen;
  const boring = density.peak < id.minElementsPerScreen;
  const densityPass = !overwhelmed && !boring;

  const violations = unfairDeaths(bundle, profile);
  const fairPass = violations.length === 0;

  const scores: MetricScore[] = [
    { metric: 'peakScreenDensity', score: density.peak, threshold: id.maxElementsPerScreen, pass: densityPass },
    { metric: 'failureVisibility', score: violations.length, threshold: 0, pass: fairPass },
  ];

  const findings: string[] = [];
  if (overwhelmed) findings.push(`overwhelm: screen at tile (${density.worstOriginX},${density.worstOriginY}) holds ${density.peak} elements > max ${id.maxElementsPerScreen}`);
  if (boring) findings.push(`boring: densest screen holds only ${density.peak} elements < min ${id.minElementsPerScreen}`);
  for (const v of violations) findings.push(v);

  const pass = densityPass && fairPass;
  const decision: DesignDecision = {
    source: GATE,
    subject: bundle.def.levelId,
    verdict: pass ? 'pass' : 'fail',
    summary: pass
      ? `information density in band [${id.minElementsPerScreen},${id.maxElementsPerScreen}] and all failures visible`
      : `info-density/fairness unmet: ${!densityPass ? (overwhelmed ? 'overwhelm' : 'boring') : ''}${!densityPass && !fairPass ? ', ' : ''}${!fairPass ? `${violations.length} invisible kill(s)` : ''}`,
    findings,
  };
  return gateResult(GATE, scores, findings, [decision]);
}
