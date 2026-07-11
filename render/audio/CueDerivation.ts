/**
 * CueDerivation — pure, transition-driven audio cues (S9.6, REQ-071's audio
 * signature channel). `deriveAudioCues` is a function of two already-
 * committed `WorldState` snapshots ONLY — same transitions ⇒ same cues,
 * every time; never wall-clock, never `Math.random`.
 *
 * Reuses `render/feel/ImpulseEvents.landed` (S9.5) rather than re-deriving
 * the airborne→grounded edge a second time — one source of truth for "did
 * the player just land".
 *
 * Scope (documented, not silently narrowed): REQ-071 fixes an audio
 * signature per STRUCTURAL CATEGORY, so every cue this module emits
 * resolves to one of the six existing `AUDIO_PATCH` entries — there is no
 * seventh "player action" patch. Two transitions named in early planning
 * prose are deliberately NOT built here:
 *  - a generic jump-liftoff cue has no structural category to bind to (jump
 *    is a player action, not a category signal) — omitted rather than
 *    inventing an ungoverned seventh patch;
 *  - "checkpoint" does not exist anywhere in this codebase (grep-verified
 *    at S9.6) — Jump Once has no checkpoint mechanic (its whole design is
 *    the one-jump lock + instant restart, dm-0018); there is nothing to
 *    derive a cue from.
 */

import type { WorldState } from '../../src/entities/World';
import { landed } from '../feel/ImpulseEvents';
import { resolveCategory, type GrammarCategoryId, type VisualGrammar } from '../grammar/Grammar';

export type AudioCue =
  | { readonly transition: 'landed'; readonly category: GrammarCategoryId }
  | { readonly transition: 'defeat'; readonly category: 'danger' }
  | { readonly transition: 'goal'; readonly category: 'interactive' };

function landedOnCategory(grammar: VisualGrammar, world: WorldState): GrammarCategoryId {
  if (world.playerGroundEntity === -1) return resolveCategory(grammar, 'terrain').id;
  const kind = world.level.entities[world.playerGroundEntity].behavior.kind;
  return resolveCategory(grammar, kind).id;
}

/** Derive every audio cue that fired on the transition from `previous` to `current`. */
export function deriveAudioCues(previous: WorldState, current: WorldState, grammar: VisualGrammar): readonly AudioCue[] {
  const cues: AudioCue[] = [];

  if (landed(previous, current)) {
    cues.push({ transition: 'landed', category: landedOnCategory(grammar, current) });
  }
  if (previous.runState !== 'defeated' && current.runState === 'defeated') {
    cues.push({ transition: 'defeat', category: 'danger' });
  }
  if (previous.runState !== 'completed' && current.runState === 'completed') {
    cues.push({ transition: 'goal', category: 'interactive' });
  }

  return cues;
}
