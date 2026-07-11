/**
 * InspectorBindings — REQ-131 P9 share (part 2): expose P8's `Inspector`
 * (`tools/debug/Inspector.ts`) pause/step/reload/variable-edit controls as a
 * closed UI-command union, for a debug-overlay panel to dispatch against.
 *
 * `render/tooling/` is the ONLY `render/` area permitted to import `tools/`
 * (dm-0081). Every command below calls exactly one `Inspector` method —
 * zero new mutation logic, zero re-derivation of dm-0070's
 * commit-through-StateManager discipline (that already lives in
 * `Inspector.setVariable`).
 */

import type { InputFrame } from '../../src/core/State';
import type { JumpOnceState, WorldState } from '../../src/entities/World';
import type { Inspector } from '../../tools/debug/Inspector';

export type InspectorUiCommand =
  | { readonly kind: 'pause' }
  | { readonly kind: 'resume' }
  | { readonly kind: 'stepFrame' }
  | { readonly kind: 'reload' }
  | { readonly kind: 'feedInput'; readonly frame: InputFrame }
  | { readonly kind: 'setVariable'; readonly patch: Partial<WorldState> };

/** Dispatch one UI-originated command to P8's Inspector, verbatim. */
export function applyInspectorCommand(inspector: Inspector, command: InspectorUiCommand): JumpOnceState {
  switch (command.kind) {
    case 'pause':
      inspector.pause();
      return inspector.currentState();
    case 'resume':
      inspector.resume();
      return inspector.currentState();
    case 'stepFrame':
      return inspector.stepFrame();
    case 'reload':
      return inspector.reload();
    case 'feedInput':
      return inspector.feedInput(command.frame);
    case 'setVariable':
      return inspector.setVariable(command.patch);
  }
}
