# Day speech order

## Goal

Give every daytime Agent turn an explicit day and publicly living roster, and make sheriff
campaign and daytime speech order follow one replay-stable ruleset.

## Completed work

- Added one current-state line to every daytime incremental Prompt and replacement foundation. It
  states the current day and every publicly living nickname, seat, and Player ID while suppressing
  duplicate narration of the current `day.started` event.
- Added a dedicated Sheriff direction Prompt. A single death offers dead-left/dead-right; peaceful
  and multiple-death mornings offer Sheriff-left/Sheriff-right; each option maps explicitly to the
  structured action value and states that the Sheriff summarizes last.
- Added a replay-stable sheriff-campaign rotation so the first candidate is random per Match and
  subsequent candidates continue in seat order.
- Added replay-stable no-sheriff decisions. A single death is the anchor; multiple deaths use the
  lowest-seat death; peaceful nights choose a random start. Direction is deterministic per Match
  and day.
- Persisted the resolved basis, anchor player, direction, and complete order in
  `speech.order-set`. Replay consumes the persisted order.
- Moved the order algorithm into the game-engine speech-order module and added pure branch
  coverage plus engine integration and replay coverage.
- Versioned the Prompt and prompt-asset selection so stored earlier Matches continue to
  reconstruct exactly.
- Updated the current product, architecture, information-synchronization, preflight, testing, and
  acceptance documents.

## Completion evidence

- `pnpm check` passed with 83 tests across 25 files, including type checking, lint, formatting,
  hygiene, duplication, architecture, artifact, documentation, skill, coverage, and production
  build gates.
- `pnpm test:e2e` passed all 11 Chromium scenarios.
- Real no-sheriff Match `match-board-phase2-real-6-no-s-4e513a8d0346` ended with 368 events, 49
  completed player Turns, 328 player Records, no failed tool, and a zero-issue context audit. It
  exercised a peaceful random start and two death-anchored mornings in both current-day Prompts.
- Real sheriff Match `match-board-phase2-real-6-sher-95726af57785` ended with 259 events, 41
  completed player Turns, 277 player Records, no failed tool, and a zero-issue context audit. Its
  campaign order began at Player 6 and rotated through Players 1 to 5.
- Across the two accepted Matches, incomplete Turns, error Records, error diagnostics, and
  daytime-state Prompt failures were all zero.
- Deterministic engine coverage verified both directions for a single death with the Sheriff last,
  Sheriff-anchored peaceful and multiple-death mornings, lowest-seat multiple-death anchoring
  without a Sheriff, peaceful random starts, campaign variation across Match IDs, and exact order
  restoration after replay.
