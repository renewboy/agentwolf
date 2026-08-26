# Postgame public-history catch-up acceptance

Evidence time: 2026-08-26 20:15:40 +08:00

## Scope

- Deliver every public Match event after each player's regular acknowledged cursor before that
  player's first postgame rating turn.
- Preserve public visibility, own-speech deduplication, frozen terminal facts, the regular cursor,
  same-Session continuation, postgame trajectory audit, and the live countdown transition.

## Evidence

- Match `match-board-standard-9-946208734f16` ended at sequence 603. Read-only SQLite inspection
  measured cursors 343–567; players 1, 4, and 8 were missing 12, 11, and 11 public speeches.
- Focused tests passed 25/25 across ContextRenderer, postgame Prompt assets, Match orchestration,
  cursor preservation, trajectory range audit, and restart continuation.
- `pnpm check`: 44 test files and 169 tests passed with all static gates and production build.
- `pnpm test:e2e`: 22/22 Chromium scenarios passed.
- `pnpm simulation:check`: 3/3 fixtures passed.
- Real ACP smoke: Codex ACP 1.6.2, `gpt-5.6-luna`, Session
  `01a03dfe-e8cd-7052-99f6-579e2804bfdc`; structured review accepted and reflection streamed in 25
  chunks.
