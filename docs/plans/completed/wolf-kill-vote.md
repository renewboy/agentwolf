# Wolf kill vote

## Goal

Make an intentional no-kill vote an explicit wolf action, resolve a tied highest wolf target to one
replay-stable random target, and show the complete private wolf ballot to god and Werewolf player
views.

## Completed work

- Kept `targetPlayerId: null` as the structured no-kill ballot and documented it in the versioned
  wolf Prompt, MCP schema description, and player action reference.
- Made no-kill win only when its ballot count is strictly greater than every player target. A tie
  that contains player targets selects one of the highest-vote players through a deterministic hash
  of Match ID, night, and tied targets.
- Emitted seat-ordered `vote.cast` events and one `vote.resolved` event with Werewolf-faction
  visibility before the selected attack event. God and Werewolf player projections receive the
  grouped ballot; closed-eye, non-Werewolf, Seer, and Witch projections do not.
- Reused the existing vote result card with wolf-specific selected, tie, and no-kill copy. Null
  ballots display as `空刀`, and the selected target remains the final player ID in the timeline
  item.
- Preserved Prompt reconstruction through contract 17, updated deterministic simulation oracles,
  and prevented the prior wolf result from entering Sheriff resolution.
- Updated product, architecture, rule, synchronization, frontend, testing, and acceptance
  documentation.

## Completion evidence

- `pnpm check` passed every architecture, artifact, documentation, Skill, typecheck, lint, format,
  hygiene, duplication, 107-test coverage, and production-build gate. Coverage reached 88.90%
  lines, 85.98% statements, 90.86% functions, and 75.43% branches.
- The approved simulation corpus passed all recorded, parallel-order, transient-delivery, restart,
  and playback variants with updated 186-event and 526-event terminal traces.
- `pnpm test:e2e` passed all 15 Chromium scenarios. The private-wolf-ballot scenario displayed
  target-grouped votes and `空刀` in god and Werewolf player views, hid the card in closed-eye and
  non-Werewolf player views, and restored it when switching back to a Werewolf or god view.
