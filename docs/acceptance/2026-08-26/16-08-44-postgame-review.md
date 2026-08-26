# Postgame review acceptance

Evidence time: 2026-08-26 16:08:44 +08:00

## Scope

- Added a server-owned ten-second postgame gate, immediate public reviewer sheets, equal-weight
  five-dimensional aggregation, explicit winning-player MVP eligibility, all-loser SVP eligibility,
  deterministic ties, sequential reflections, and completed/skipped terminal state.
- Retained one logical ACP Session per seat through review, with unfinished-only restart recovery
  and no game-event or simulation-fixture postgame records.
- Reused the ordinary streamed speech, canonical Player references, Match feed bubbles, automatic
  and manual speech playback, and final playback boundary for reflections.
- Added Match and lobby review states, reviewer-sheet navigation, MVP/SVP badges, accessible radar
  values, and responsive desktop/mobile presentation.

## Evidence

- `pnpm check` passed all repository gates, 44 test files, 168 tests, coverage, and production build.
- Coverage completed at 87.89% lines, 84.69% statements, 88.36% functions, and 72.29% branches.
- `pnpm simulation:check` reported all 3 approved fixtures valid.
- `pnpm test:e2e` passed all 21 Chromium scenarios. The postgame scenario observed one accepted
  sheet while five players were still rating, the complete individual radar sheet, streamed
  reflection text in the existing speech bubble, final awards, settled connection, and a 760px
  viewport contained within the screen.
- Integration coverage completed a 12-seat review, held the last reflection on the shared playback
  sequence, rejected review skip after start, deleted postgame rows through Match cascade, and
  restarted a six-seat review using every original Session ID while prompting only the missing
  reviewer.
- Real isolated Codex ACP 1.6.2 with `gpt-5.6-luna` accepted a five-target
  `submit_postgame_review` call and returned one direct reflection through 20 streamed chunks in the
  same logical Session.
- The local application loaded against a newly created schema-eight database with no browser
  console warnings or errors. Incompatible pre-change SQLite files were removed from the workspace;
  schema eight is the current direct format and no postgame migration path exists.
