---
name: level-design-principle
description: Design, brainstorm, implement, balance, and review any Jump Once level, mechanic, puzzle sequence, or progression. Use whenever making decisions about one-jump choices, player expectation, observation, planning, timing, physics, difficulty, retry loops, accessibility, or speedrun potential. Trigger phrases: "design a level", "review the puzzle sequence", "balance the mechanic", "brainstorm a new chapter", "check the one-jump decision", "evaluate player expectation", "assess difficulty and retry loops".
---

# Jump Once Level Design Principles

Treat every level as a short, readable problem built around one irreversible jump. Jump Once is not only a game about remembering hidden deaths: it is a game about making the right decision with one irreversible resource. Design for observation, planning, self-control, physics understanding, timing, and execution as well as surprise.

## Core philosophy

- Make surprise fair when using it: first failure may be unexpected, but its cause must be clear in hindsight.
- Make the one jump meaningful. It should be a commitment, a resource, a timing decision, or a route decision.
- Preserve trust. Break an expectation only after the player has had a reason to form it.
- Make each failure or attempt teach a specific correction. Avoid solutions based only on luck, exhaustive guessing, or hidden rules.
- Prefer simple situations with one strong twist over busy layouts with several unrelated tricks.
- Keep deaths quick, restarts immediate, and the successful route easy to recognize once learned.

## Level archetypes

Build a varied level set. Do not make every level a hidden-trap memory test. Select the archetype that best expresses the current mechanic, then give it a distinct one-jump decision.

- **Assumption:** Let a reasonable platformer habit lead to a wrong choice; reward changing that habit.
- **Observation:** Put the needed information in view; reward looking before committing.
- **Planning:** Make the full situation legible before movement; reward choosing where the jump belongs.
- **Timing:** Make the solution known; reward performing it at the right moment.
- **Physics:** Let momentum, force, collision, or movement systems determine the answer; teach the system before testing it.
- **Resource management:** Present several possible uses for the jump; reward saving it for the one that matters.
- **Choice:** Offer routes or interacting systems; reward evaluating consequences before committing.
- **Execution:** Use no deception; reward clean movement, precision, and consistency.
- **Prediction:** Make an action have a delayed or indirect result; reward thinking ahead.
- **Environmental reading:** Use visible world signals to communicate behavior; reward interpreting them.
- **Reverse thinking:** Make an apparent danger or obstacle useful in a well-signposted way.
- **Psychological pressure:** Create urgency or tension that encourages a bad decision, while keeping the calm solution observable.

Use blind or memorization-based traps sparingly. They can punctuate the game, but should never define its whole identity.

## Design workflow

For every new level or mechanic, establish these answers before implementation:

1. Which level archetype is this, and what makes it distinct from recent levels?
2. What does the player see and reasonably infer before committing?
3. What exact decision does the one-jump rule make meaningful?
4. What lesson should the player gain from an attempt: a new observation, plan, timing, system understanding, or execution improvement?
5. If the level contains a betrayal, what clue makes the real rule understandable after failure?
6. How can an expert complete the level faster, more consistently, or with cleaner movement?

If the next attempt cannot be described as a clear improvement in understanding or execution, redesign the level.

## Build expectations responsibly

Use geometry, animation, timing, object behavior, sound, UI, and prior levels to teach rules. A deceptive level must still communicate its true behavior through at least one readable signal.

- Never rely only on sound or colour for critical information.
- Support colour-blind, muted-audio, and small-screen play through redundant cues.
- Keep repeated objects consistent unless inconsistency is the deliberate lesson and has been set up fairly.
- Let players observe moving hazards or systems before a committed jump whenever practical.
- Avoid fake-outs that remove control after the player has made the correct decision.

## Progression and chapters

Create progression from the mechanics and player knowledge actually present in the game. Do not force levels into a prewritten chapter template or make every chapter use the same archetype.

For each chapter or sequence, choose a clear learning arc:

1. Introduce a rule in a low-risk, readable situation.
2. Ask the player to apply that rule under pressure or with a new constraint.
3. Deepen the rule through a fair exception, a new archetype, or a combination.
4. End with a concise test of mastery.

Only combine mechanics after players can identify and use each one independently. Balance the overall game across observation, assumptions, planning, timing, physics, choice, and execution. Let the required knowledge determine the chapter boundaries, pacing, and number of levels.

## Brainstorming rules

Generate several concepts from different archetypes before selecting one. Judge concepts by the decision they create, not by how surprising the death appears.

Favor concepts that:

- Produce a visible before-and-after understanding.
- Have one sentence explaining the solution.
- Create a satisfying reaction for both first-time players and viewers.
- Allow optimization through route choice, timing, positioning, or movement control.
- Let skilled players succeed without relying on a prior death when the level is intended as observation, planning, or execution.
- Feel native to a precision platformer with one jump.

Reject concepts that:

- Need a hidden fact, random timing, pixel-perfect input, or external knowledge.
- Repeat a familiar trick without a new decision.
- Turn the game into a different genre's puzzle.
- Make players distrust every object, cue, or exit indefinitely.
- Are amusing once but have no satisfying mastery route.

## First-time player and speedrunner checks

Review each level from both perspectives.

**First-time player:** Can they explain the death, identify a changed plan, and feel motivated to restart?

**Speedrunner:** Is there a reliable fast line, a worthwhile optimization, and enough consistency to practice rather than merely hope?

**Viewer:** Can they understand the setup, betrayal, and solution quickly enough for a stream or short video?

For Poki/CrazyGames, prefer short self-contained attempts, clear feedback, forgiving control interpretation, and low friction after failure.

## Review output

When reviewing a proposed level, be concise and critical. Provide:

1. Verdict: Keep, Improve, or Reject.
2. Strengths.
3. Risks or likely frustration.
4. Specific improvement that preserves the concept, when possible.
5. Scores out of 10: Fun, Betrayal, Fairness, Replayability, Streamability.

Prioritize long-term player enjoyment and the identity of Jump Once over individual clever ideas. Reject a concept when it creates cheap frustration or violates player trust.
