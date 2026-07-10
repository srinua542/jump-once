/**
 * Generator — concept → schema-valid candidate LevelDefinition
 * (P7/S7.4, REQ-090 phases 1–2 substrate + REQ-081 operators; dm-0059).
 *
 * GDOS alignment: Section 10 (Structural Prototyping — geometry follows the
 * concept), Section 2/15 via core/Rng ("Surprise Through Context, Never
 * Randomness": a generated level is a pure function of its seed).
 *
 * Template (dm-0059, plan open question 2 resolved): P7 ships ONE parametric
 * structural skeleton — the bordered GAP CORRIDOR (the same proven shape the
 * P4 audit fixtures use): approach floor, one spiked pit whose width derives
 * from the concept's executionPrecision, landing floor, goal. All twelve
 * mechanic kinds are templatable via a fixed per-kind placement rule (spike =
 * the pit itself; lasers/hazards live at the gap; springs/doors on the
 * landing; surfaces/plates/zones on the approach; a door+plate pair is
 * trigger-wired). The skeleton is code (that is what a template IS); every
 * gameplay VALUE — corridor range, air rows, gap ceiling, par tiers, entity
 * dynamics — is GenProfile calibration (dm-0057), and every emitted candidate
 * is PROVEN by a round-trip through the P2 strict parser. P10 extends the
 * template library; it does not restructure this one.
 *
 * Candidates carry their GenParams so the REQ-081 operators work at the
 * parameter level — mutate jitters one parameter, combine mixes parameters
 * per-slot — and every operator output is re-BUILT and re-parse-proven:
 * schema-valid by construction, never by luck. All draws thread core/Rng
 * state; loops are structurally bounded; no clock, no Math.random.
 *
 * Rejections are typed SchemaError records (a concept whose mechanics cannot
 * fit the profiled corridor is refused with a reason, never truncated
 * silently). Lives in src/gen/ (dm-0057).
 */

import { FIXED_STEP_SECONDS } from '../core/Clock';
import { createRng, nextInt, type RngState } from '../core/Rng';
import type { EntityKind } from '../components/Behavior';
import type { EmotionalKeyframe } from '../components/Gdos';
import type { LevelDefinition } from '../components/Level';
import { parseLevel } from '../schema/Parse';
import type { SchemaError } from '../schema/Parse';
import type { EmotionPhase } from '../eval/gdos/DesignSpace';
import type { GenProfile } from './GenProfile';
import type { LevelConcept } from './Concept';

/** The gap-corridor template's drawn parameters — the operators' working space. */
export interface GenParams {
  /** Corridor floor length in tiles, borders excluded. */
  readonly corridorLength: number;
  /** Pit width in tiles. */
  readonly gapWidth: number;
  /** Column (tile x, border included) of the pit's first cell. */
  readonly gapStart: number;
}

/** One generated candidate: the concept it serves, the parameters drawn, and the parse-proven definition. */
export interface Candidate {
  readonly concept: LevelConcept;
  readonly params: GenParams;
  readonly def: LevelDefinition;
}

export type CandidateResult =
  | { readonly ok: true; readonly candidate: Candidate; readonly rng: RngState }
  | { readonly ok: false; readonly errors: readonly SchemaError[] };

/* ── structural skeleton constants (shape, not gameplay values) ──────────── */

/** Run-up floor cells always kept before the pit (skeleton shape). */
const MIN_APPROACH = 3;
/** Floor cells always kept between the pit and the goal (skeleton shape). */
const MIN_LANDING = 2;

/** Which template slot each mechanic occupies (dm-0059's fixed placement rule). */
type Slot = 'approach' | 'landing' | 'gap' | 'pit';
const SLOT_BY_KIND: Readonly<Record<EntityKind, Slot>> = Object.freeze({
  movingPlatform: 'approach',
  collapsingFloor: 'approach',
  iceSurface: 'approach',
  spike: 'pit',
  laser: 'gap',
  movingHazard: 'gap',
  pressurePlate: 'approach',
  proximityZone: 'approach',
  door: 'landing',
  spring: 'landing',
  gravityZone: 'approach',
  conveyor: 'approach',
});

/**
 * REQ-015 emotional-budget presets per arc phase (0–100 scale, `at` strictly
 * increasing — the P2 parse contract). A design vocabulary starting point:
 * P10 authors real curves when real content exists.
 */
const CURVE_BY_PHASE: Readonly<Record<EmotionPhase, readonly EmotionalKeyframe[]>> = Object.freeze({
  curiosity: [
    { at: 0, curiosity: 70, confidence: 40, surprise: 10, mastery: 0 },
    { at: 1, curiosity: 80, confidence: 50, surprise: 20, mastery: 10 },
  ],
  confidence: [
    { at: 0, curiosity: 40, confidence: 60, surprise: 10, mastery: 20 },
    { at: 1, curiosity: 40, confidence: 80, surprise: 10, mastery: 40 },
  ],
  surpriseBetrayal: [
    { at: 0, curiosity: 50, confidence: 60, surprise: 20, mastery: 20 },
    { at: 0.6, curiosity: 60, confidence: 30, surprise: 80, mastery: 20 },
    { at: 1, curiosity: 70, confidence: 40, surprise: 60, mastery: 30 },
  ],
  realization: [
    { at: 0, curiosity: 60, confidence: 30, surprise: 40, mastery: 20 },
    { at: 1, curiosity: 50, confidence: 60, surprise: 20, mastery: 50 },
  ],
  mastery: [
    { at: 0, curiosity: 30, confidence: 70, surprise: 10, mastery: 60 },
    { at: 1, curiosity: 30, confidence: 80, surprise: 10, mastery: 90 },
  ],
  renewedUncertainty: [
    { at: 0, curiosity: 60, confidence: 60, surprise: 20, mastery: 60 },
    { at: 1, curiosity: 80, confidence: 40, surprise: 50, mastery: 60 },
  ],
});

function slug(text: string): string {
  let out = '';
  for (const ch of text) out += /[a-zA-Z0-9]/.test(ch) ? ch : '-';
  return out;
}

/** How many approach/landing slots the concept's mechanics consume. */
function slotNeeds(mechanics: readonly EntityKind[]): { approach: number; landing: number } {
  let approach = 0;
  let landing = 0;
  for (const m of mechanics) {
    if (SLOT_BY_KIND[m] === 'approach') approach++;
    else if (SLOT_BY_KIND[m] === 'landing') landing++;
  }
  return { approach, landing };
}

/**
 * Generate one candidate: draw parameters within the profiled envelope
 * (sized so the concept's mechanics fit), build, and prove by strict parse.
 * Pure function of (concept, seed, profile).
 */
export function generateCandidate(concept: LevelConcept, seed: number, profile: GenProfile): CandidateResult {
  const g = profile.generator;
  const needs = slotNeeds(concept.mechanics);
  // Gap width follows the concept's execution-precision target.
  const gapWidth = 1 + Math.floor(concept.difficultyTarget.executionPrecision * (g.maxGapWidth - 1));
  // The corridor must host: approach (run-up AND entity slots), the gap, landing (slots AND run-out).
  const approachCells = Math.max(MIN_APPROACH, needs.approach + 1);
  const landingCells = Math.max(MIN_LANDING, needs.landing + 1);
  const minViableLength = approachCells + gapWidth + landingCells;
  const lo = Math.max(g.corridorMinLength, minViableLength);
  if (lo > g.corridorMaxLength) {
    return {
      ok: false,
      errors: [{
        path: '/generator/corridorMaxLength',
        message: `the concept needs a corridor of >= ${minViableLength} tiles (${needs.approach} approach + ${needs.landing} landing mechanic slots, gap ${gapWidth}) but the profile caps at ${g.corridorMaxLength}`,
      }],
    };
  }
  let rng = createRng(seed);
  const lengthDraw = nextInt(rng, lo, g.corridorMaxLength + 1);
  rng = lengthDraw.next;
  const corridorLength = lengthDraw.value;
  // gapStart in tile coords (border at col 0): approach occupies cols 1..gapStart-1.
  const gapLo = 1 + approachCells;
  const gapHi = 1 + corridorLength - landingCells - gapWidth; // inclusive
  const gapDraw = nextInt(rng, gapLo, gapHi + 1);
  rng = gapDraw.next;
  const params: GenParams = { corridorLength, gapWidth, gapStart: gapDraw.value };
  const built = buildFromParams(concept, params, profile);
  if (!built.ok) return built;
  return { ok: true, candidate: { concept, params, def: built.value }, rng };
}

type BuildResult =
  | { readonly ok: true; readonly value: LevelDefinition }
  | { readonly ok: false; readonly errors: readonly SchemaError[] };

/** Build the raw definition from parameters and prove it through the P2 strict parser. */
function buildFromParams(concept: LevelConcept, params: GenParams, profile: GenProfile): BuildResult {
  const g = profile.generator;
  const t = g.entityTuning;
  const width = params.corridorLength + 2;
  const floorRow = 1 + g.corridorAirRows;
  const pitWallRow = floorRow + 1;
  const spikeRow = floorRow + 2;
  const height = floorRow + 4;
  const gapEnd = params.gapStart + params.gapWidth; // exclusive

  const inGap = (col: number): boolean => col >= params.gapStart && col < gapEnd;
  const tiles: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const border = row === 0 || row === height - 1 || col === 0 || col === width - 1;
      const floorish = row === floorRow || row === pitWallRow || row === spikeRow;
      tiles.push(border || (floorish && !inGap(col)) ? 1 : 0);
    }
  }

  const center = (col: number, row: number): { x: number; y: number } => ({ x: col + 0.5, y: row + 0.5 });
  const box = { halfExtents: { x: 0.5, y: 0.5 }, offset: { x: 0, y: 0 } };
  const entities: unknown[] = [];
  const triggers: unknown[] = [];

  // The pit's spikes — every gap column; also how a concept's 'spike' mechanic is exercised.
  for (let col = params.gapStart; col < gapEnd; col++) {
    entities.push({ id: `pit-spike-${col}`, transform: { position: center(col, spikeRow), facing: 1 }, collider: box, behavior: { kind: 'spike' } });
  }

  const walkRow = floorRow - 1;
  let approachCol = 2; // col 1 is the spawn cell
  let landingCol = gapEnd; // goal sits at width-2
  let plateId: string | undefined;
  let doorId: string | undefined;

  for (let i = 0; i < concept.mechanics.length; i++) {
    const kind = concept.mechanics[i];
    const slot = SLOT_BY_KIND[kind];
    if (kind === 'spike') continue; // the pit IS the spike placement
    let position: { x: number; y: number };
    if (slot === 'approach') {
      if (approachCol >= params.gapStart) {
        return { ok: false, errors: [{ path: `/mechanics/${i}`, message: `no approach slot left for "${kind}" (approach spans cols 2..${params.gapStart - 1})` }] };
      }
      position = center(approachCol, walkRow);
      approachCol++;
    } else if (slot === 'landing') {
      if (landingCol >= width - 2) {
        return { ok: false, errors: [{ path: `/mechanics/${i}`, message: `no landing slot left for "${kind}" (landing spans cols ${gapEnd}..${width - 3})` }] };
      }
      position = center(landingCol, walkRow);
      landingCol++;
    } else {
      // 'gap': above the pit (laser) or inside it (moving hazard).
      const gapCenterCol = params.gapStart + Math.floor(params.gapWidth / 2);
      position = kind === 'laser' ? center(gapCenterCol, floorRow - 2) : center(gapCenterCol, pitWallRow);
    }
    const id = `${kind}-${i}`;
    const behavior: Record<string, unknown> = (() => {
      switch (kind) {
        case 'movingPlatform': return { kind, waypoints: [{ x: 0, y: 0 }, { x: 0, y: -1 }], speed: t.moverSpeed, mode: 'looping' };
        case 'collapsingFloor': return { kind, collapseDelaySeconds: t.collapseDelaySeconds };
        case 'iceSurface': return { kind };
        case 'laser': return { kind, periodSeconds: t.laserPeriodSeconds, onFractionOfPeriod: t.laserOnFractionOfPeriod, phaseSeconds: t.laserPhaseSeconds };
        case 'movingHazard': return { kind, waypoints: [{ x: 0, y: 0 }, { x: 0, y: 0.5 }], speed: t.moverSpeed, mode: 'looping' };
        case 'pressurePlate': return { kind };
        case 'proximityZone': return { kind };
        case 'door': return { kind, initiallyOpen: true };
        case 'spring': return { kind, launchVelocity: { x: t.springLaunchVelocityX, y: -t.springLaunchVelocityY } };
        case 'gravityZone': return { kind, gravityScale: t.gravityZoneScale };
        case 'conveyor': return { kind, surfaceVelocityX: t.conveyorSurfaceVelocityX };
        default: return { kind };
      }
    })();
    if (kind === 'pressurePlate') plateId = id;
    if (kind === 'door') doorId = id;
    entities.push({ id, transform: { position, facing: 1 }, collider: box, behavior });
  }

  // A plate+door pair is wired (dm-0015: interconnection is first-class data).
  if (plateId !== undefined && doorId !== undefined) {
    triggers.push({ id: 'wire-0', source: plateId, targets: [doorId], action: 'toggleDoor', once: true });
  }

  const levelId = `gen-${slug(concept.targetKgNode)}-L${params.corridorLength}G${params.gapStart}W${params.gapWidth}`;
  const raw = {
    schemaVersion: 1,
    levelId,
    title: `Generated ${concept.archetype} candidate (${levelId})`,
    gdos: {
      targetKgNode: concept.targetKgNode,
      difficultyVectors: { ...concept.difficultyTarget },
      emotionalBudgetCurve: CURVE_BY_PHASE[concept.emotionalPhase].map((k) => ({ ...k })),
      creatorMomentFrame: {
        tickWindow: [0, Math.ceil(g.parTimeGenerousSeconds / FIXED_STEP_SECONDS)],
        description: concept.oneJumpDecision,
      },
    },
    tilemap: { width, height, tileSize: 1, tiles },
    entities,
    triggers,
    constraints: {
      spawn: center(1, walkRow),
      goal: { position: center(width - 2, walkRow), halfExtents: { x: 0.5, y: 0.5 } },
      parTimeTiersSeconds: [g.parTimeGenerousSeconds, g.parTimeExpertSeconds],
    },
  };
  const parsed = parseLevel(raw);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  return { ok: true, value: parsed.value };
}

/**
 * REQ-081 operator: jitter exactly one parameter by ±1 (clamped to the
 * profiled/geometric envelope) and re-build. A clamp that lands on the same
 * value yields an identical candidate — the creativity loop reads that as
 * zero novelty, honestly.
 */
export function mutateCandidate(candidate: Candidate, rng: RngState, profile: GenProfile): CandidateResult {
  const g = profile.generator;
  const needs = slotNeeds(candidate.concept.mechanics);
  const approachCells = Math.max(MIN_APPROACH, needs.approach + 1);
  const landingCells = Math.max(MIN_LANDING, needs.landing + 1);
  const which = nextInt(rng, 0, 3);
  const dir = nextInt(which.next, 0, 2);
  const delta = dir.value === 0 ? -1 : 1;
  const p = candidate.params;
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  let mutated: GenParams;
  if (which.value === 0) {
    const lo = Math.max(g.corridorMinLength, approachCells + p.gapWidth + landingCells);
    mutated = { ...p, corridorLength: clamp(p.corridorLength + delta, lo, g.corridorMaxLength) };
    // Keep the gap inside the (possibly shrunk) corridor.
    mutated = { ...mutated, gapStart: clamp(p.gapStart, 1 + approachCells, 1 + mutated.corridorLength - landingCells - p.gapWidth) };
  } else if (which.value === 1) {
    const hi = 1 + p.corridorLength - landingCells - p.gapWidth;
    mutated = { ...p, gapStart: clamp(p.gapStart + delta, 1 + approachCells, hi) };
  } else {
    const maxHere = Math.min(g.maxGapWidth, p.corridorLength - approachCells - landingCells);
    const gapWidth = clamp(p.gapWidth + delta, 1, Math.max(1, maxHere));
    mutated = { ...p, gapWidth, gapStart: clamp(p.gapStart, 1 + approachCells, 1 + p.corridorLength - landingCells - gapWidth) };
  }
  const built = buildFromParams(candidate.concept, mutated, profile);
  if (!built.ok) return built;
  return { ok: true, candidate: { concept: candidate.concept, params: mutated, def: built.value }, rng: dir.next };
}

/**
 * REQ-081 operator: a hybrid — each parameter drawn from parent a or b by a
 * threaded coin flip; the concept (and its intent) comes from parent a. The
 * result is re-built and re-proven; geometric consistency is re-clamped.
 */
export function combineCandidates(a: Candidate, b: Candidate, rng: RngState, profile: GenProfile): CandidateResult {
  const g = profile.generator;
  const needs = slotNeeds(a.concept.mechanics);
  const approachCells = Math.max(MIN_APPROACH, needs.approach + 1);
  const landingCells = Math.max(MIN_LANDING, needs.landing + 1);
  const d1 = nextInt(rng, 0, 2);
  const d2 = nextInt(d1.next, 0, 2);
  const d3 = nextInt(d2.next, 0, 2);
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  const corridorLength = clamp(
    (d1.value === 0 ? a : b).params.corridorLength,
    Math.max(g.corridorMinLength, approachCells + 1 + landingCells),
    g.corridorMaxLength,
  );
  const gapWidth = clamp(
    (d2.value === 0 ? a : b).params.gapWidth,
    1,
    Math.max(1, Math.min(g.maxGapWidth, corridorLength - approachCells - landingCells)),
  );
  const gapStart = clamp(
    (d3.value === 0 ? a : b).params.gapStart,
    1 + approachCells,
    1 + corridorLength - landingCells - gapWidth,
  );
  const params: GenParams = { corridorLength, gapWidth, gapStart };
  const built = buildFromParams(a.concept, params, profile);
  if (!built.ok) return built;
  return { ok: true, candidate: { concept: a.concept, params, def: built.value }, rng: d3.next };
}
