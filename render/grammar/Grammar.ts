/**
 * VisualGrammar — the style-agnostic core of REQ-070/071 (S9.1, dm-0083).
 *
 * The SIXTH versioned schema (after the level schema, ScoringProfile,
 * CampaignProfile, GenProfile, TelemetryProfile): the six structural
 * categories, the renderable-role -> category bindings, and per-category
 * criticality. This is the layer that stays STABLE when the art style is
 * swapped (dm-0076): no colour, no shape, no texture, no sound lives here —
 * materials belong to a StylePack (render/style/StylePack.ts). A hex code in
 * this file is a defect (dm-0083).
 *
 * REQ-070's "mixing signatures strictly prohibited" is enforced structurally:
 *  - every renderable role is bound to EXACTLY ONE category (the bindings
 *    record is total over RENDERABLE_ROLES and single-valued by construction;
 *    the parser rejects unknown or missing roles);
 *  - all four signature channels (palette / silhouette / motion / audio) are
 *    resolved from that one category by the scene compiler — there is no
 *    per-entity override channel to mix through;
 *  - the pack-side half of the prohibition (accent uniqueness, achromatic
 *    optimization, distinct motion classes / patches) lives in validatePack.
 *
 * Grammar reconciliations resolved at P9 planning (bible §1):
 *  - the goal binds to `interactive`, NOT `danger` (dm-0085): sim-side the
 *    goal is the terminal proximity trigger; terracotta means exactly
 *    "kills you" (REQ-016).
 *  - `optimization` carries movingPlatform + conveyor (the bible's motion-
 *    glyph elements); its achromatic-accent rule is pack-side (dm-0084).
 *
 * The PLAYER is deliberately NOT a bound role: REQ-071's categories classify
 * level elements by what they mean to the player, and the avatar is the
 * point of view, not a meaning. Packs supply the player visual through the
 * reserved 'player' request role; the player is always render-critical
 * (PLAYER_IS_CRITICAL) and can never be quality-scaled away.
 *
 * Determinism: this module is pure data + a strict parser (dm-0010/0014
 * discipline: never throws, path-qualified errors, unknown keys rejected,
 * version hard-checked).
 */

import type { SchemaError } from '../../src/schema/Parse';
import { ENTITY_KINDS, type EntityKind } from '../../src/components/Behavior';

/** Bump only with a written migration decision (dm-0010 policy). */
export const GRAMMAR_SCHEMA_VERSION = 1;

/** The six REQ-071 structural categories. Closed; extending is a schema change. */
export type GrammarCategoryId =
  | 'safe'
  | 'danger'
  | 'interactive'
  | 'temporary'
  | 'optimization'
  | 'secret';

export const GRAMMAR_CATEGORY_IDS: readonly GrammarCategoryId[] = [
  'safe',
  'danger',
  'interactive',
  'temporary',
  'optimization',
  'secret',
];

/**
 * Everything the scene compiler can ask a category for. Entity kinds come
 * from the closed BehaviorDef union (P2); 'terrain' is the tilemap mass;
 * 'goal' is the level's GoalDef region.
 */
export type RenderableRole = EntityKind | 'terrain' | 'goal';

export const RENDERABLE_ROLES: readonly RenderableRole[] = [
  ...ENTITY_KINDS,
  'terrain',
  'goal',
];

/** The avatar is render-critical by construction (REQ-016 × REQ-163 interlock). */
export const PLAYER_IS_CRITICAL = true;

export interface GrammarCategory {
  readonly id: GrammarCategoryId;
  /**
   * Whether items resolved through this category survive every quality tier
   * (REQ-016 × REQ-163 interlock). The parser hard-requires danger === true;
   * DEFAULT_GRAMMAR keeps every category critical — quality tiers drop only
   * non-category items (decor, grain, particles).
   */
  readonly critical: boolean;
  /** Human-readable meaning, for the verification report and tooling UI. */
  readonly meaning: string;
}

export interface VisualGrammar {
  readonly grammarSchemaVersion: number;
  /** Stable identity stamped onto scene provenance. Non-empty. */
  readonly grammarId: string;
  /** Exactly the six categories, each id appearing once. */
  readonly categories: readonly GrammarCategory[];
  /** Total, single-valued: every renderable role bound to exactly one category. */
  readonly bindings: Readonly<Record<RenderableRole, GrammarCategoryId>>;
}

export type GrammarParseResult =
  | { readonly ok: true; readonly value: VisualGrammar }
  | { readonly ok: false; readonly errors: readonly SchemaError[] };

/**
 * The default grammar — the bindings ledgered at P9 planning:
 *   safe:         terrain, iceSurface (washed-blue ice is a within-Safe pack
 *                 material variant; the category is "what you stand on")
 *   danger:       spike, laser, movingHazard (and ONLY lethal things — dm-0085)
 *   interactive:  pressurePlate, proximityZone, door, goal (dm-0085)
 *   temporary:    collapsingFloor, spring (bible §1 lists spring pads here)
 *   optimization: movingPlatform, conveyor (the motion-glyph elements, dm-0084)
 *   secret:       gravityZone (bible §1: "altered rules … gravity flips")
 */
export const DEFAULT_GRAMMAR: VisualGrammar = Object.freeze({
  grammarSchemaVersion: GRAMMAR_SCHEMA_VERSION,
  grammarId: 'grammar-default-v1',
  categories: Object.freeze([
    Object.freeze({ id: 'safe', critical: true, meaning: 'Anything you can stand on; the structural ground.' }),
    Object.freeze({ id: 'danger', critical: true, meaning: 'Kills you. Exactly that, and only that (dm-0085).' }),
    Object.freeze({ id: 'interactive', critical: true, meaning: 'Logic that responds to your arrival: zones, triggers, watchers, plates, doors, the goal.' }),
    Object.freeze({ id: 'temporary', critical: true, meaning: 'Soft and breakable: collapsing floors, springs, pads.' }),
    Object.freeze({ id: 'optimization', critical: true, meaning: 'Rewards skilled or fast routing: conveyors, moving platforms.' }),
    Object.freeze({ id: 'secret', critical: true, meaning: 'Reveals or rule-changes: altered rules, hidden or fake geometry, gravity flips.' }),
  ]) as readonly GrammarCategory[],
  bindings: Object.freeze({
    terrain: 'safe',
    iceSurface: 'safe',
    spike: 'danger',
    laser: 'danger',
    movingHazard: 'danger',
    pressurePlate: 'interactive',
    proximityZone: 'interactive',
    door: 'interactive',
    goal: 'interactive',
    collapsingFloor: 'temporary',
    spring: 'temporary',
    movingPlatform: 'optimization',
    conveyor: 'optimization',
    gravityZone: 'secret',
  }) as Readonly<Record<RenderableRole, GrammarCategoryId>>,
}) as VisualGrammar;

/** Resolve a role's category record. Total by parser guarantee. */
export function resolveCategory(grammar: VisualGrammar, role: RenderableRole): GrammarCategory {
  const id = grammar.bindings[role];
  const category = grammar.categories.find((c) => c.id === id);
  /* The parser guarantees totality; this guard keeps the function honest if
     handed an unparsed record. */
  if (category === undefined) {
    return { id, critical: true, meaning: 'unresolved (grammar not strict-parsed)' };
  }
  return category;
}

/* ── strict parser (dm-0010/0014 discipline, self-contained) ─────────────── */

type Errors = SchemaError[];

function fail(errors: Errors, path: string, message: string): undefined {
  errors.push({ path, message });
  return undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'an array';
  return typeof v;
}

function checkKeys(v: Record<string, unknown>, path: string, allowed: readonly string[], errors: Errors): void {
  for (const key of Object.keys(v)) {
    if (!allowed.includes(key)) fail(errors, `${path}/${key}`, `unknown key "${key}"`);
  }
}

function parseCategory(v: unknown, path: string, errors: Errors): GrammarCategory | undefined {
  if (!isRecord(v)) return fail(errors, path, `expected an object (got ${describe(v)})`);
  checkKeys(v, path, ['id', 'critical', 'meaning'], errors);
  const id = v['id'];
  if (typeof id !== 'string' || !(GRAMMAR_CATEGORY_IDS as readonly string[]).includes(id)) {
    return fail(errors, `${path}/id`, `expected one of [${GRAMMAR_CATEGORY_IDS.join(', ')}] (got ${JSON.stringify(id)})`);
  }
  const critical = v['critical'];
  if (typeof critical !== 'boolean') return fail(errors, `${path}/critical`, `expected a boolean (got ${describe(critical)})`);
  if (id === 'danger' && critical !== true) {
    return fail(errors, `${path}/critical`, 'danger is structurally always-critical (REQ-016): failure information must survive every quality tier');
  }
  const meaning = v['meaning'];
  if (typeof meaning !== 'string' || meaning.length === 0) {
    return fail(errors, `${path}/meaning`, 'expected a non-empty string');
  }
  return { id: id as GrammarCategoryId, critical, meaning };
}

/**
 * Strict parse. Never throws. Rejects: schema-version mismatch, unknown keys,
 * a category set that is not exactly the six ids once each, non-critical
 * danger, a bindings record that is not total over RENDERABLE_ROLES, any
 * binding naming an unknown role or category.
 */
export function parseGrammar(input: unknown): GrammarParseResult {
  const errors: Errors = [];
  if (!isRecord(input)) {
    return { ok: false, errors: [{ path: '', message: `expected an object (got ${describe(input)})` }] };
  }
  checkKeys(input, '', ['grammarSchemaVersion', 'grammarId', 'categories', 'bindings'], errors);

  const version = input['grammarSchemaVersion'];
  if (version !== GRAMMAR_SCHEMA_VERSION) {
    fail(errors, '/grammarSchemaVersion', `expected ${GRAMMAR_SCHEMA_VERSION} (got ${JSON.stringify(version)})`);
  }

  const grammarId = input['grammarId'];
  if (typeof grammarId !== 'string' || grammarId.length === 0) {
    fail(errors, '/grammarId', 'expected a non-empty string');
  }

  const categories: GrammarCategory[] = [];
  const rawCategories = input['categories'];
  if (!Array.isArray(rawCategories)) {
    fail(errors, '/categories', `expected an array (got ${describe(rawCategories)})`);
  } else {
    rawCategories.forEach((c, i) => {
      const parsed = parseCategory(c, `/categories/${i}`, errors);
      if (parsed !== undefined) categories.push(parsed);
    });
    const seen = new Set<string>();
    for (const c of categories) {
      if (seen.has(c.id)) fail(errors, '/categories', `duplicate category "${c.id}"`);
      seen.add(c.id);
    }
    for (const id of GRAMMAR_CATEGORY_IDS) {
      if (!seen.has(id)) fail(errors, '/categories', `missing category "${id}" — the six REQ-071 categories are all mandatory`);
    }
  }

  const bindings: Partial<Record<RenderableRole, GrammarCategoryId>> = {};
  const rawBindings = input['bindings'];
  if (!isRecord(rawBindings)) {
    fail(errors, '/bindings', `expected an object (got ${describe(rawBindings)})`);
  } else {
    for (const key of Object.keys(rawBindings)) {
      if (!(RENDERABLE_ROLES as readonly string[]).includes(key)) {
        fail(errors, `/bindings/${key}`, `unknown renderable role "${key}"`);
        continue;
      }
      const value = rawBindings[key];
      if (typeof value !== 'string' || !(GRAMMAR_CATEGORY_IDS as readonly string[]).includes(value)) {
        fail(errors, `/bindings/${key}`, `expected one of [${GRAMMAR_CATEGORY_IDS.join(', ')}] (got ${JSON.stringify(value)})`);
        continue;
      }
      bindings[key as RenderableRole] = value as GrammarCategoryId;
    }
    for (const role of RENDERABLE_ROLES) {
      if (bindings[role] === undefined) {
        fail(errors, `/bindings/${role}`, `unbound renderable role "${role}" — every role resolves through exactly one category (REQ-070)`);
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      grammarSchemaVersion: GRAMMAR_SCHEMA_VERSION,
      grammarId: grammarId as string,
      categories,
      bindings: bindings as Readonly<Record<RenderableRole, GrammarCategoryId>>,
    },
  };
}
