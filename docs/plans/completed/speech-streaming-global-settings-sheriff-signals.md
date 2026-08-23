# Streaming speech, global settings, and sheriff signals

## Goal

Provide low-latency streamed speech playback, one persistent global speech-length preference snapshotted into each match, explicit sheriff-candidate state, and semantic sheriff badge effects without changing werewolf night-decision rules.

## Completed work

- Streamed complete sentences enter the browser speech queue immediately; the committed event adds only the remaining tail and retains sequence-keyed phase pacing.
- A persistent global speech-character preference defaults to 300, is edited from the global settings page, and is copied into each new Match setup snapshot.
- Prompt contract 15 adds the snapshotted preference to every speech Prompt as guidance without truncation or gateway validation.
- Standing sheriff candidates project to an icon-plus-label player-card marker during election phases.
- Sheriff election and transfer events project role-neutral semantic cues through the shared GSAP effect catalog and its full, reduced, and off modes.
- Contracts, migration, API, persistence, copy, styles, current-state documentation, deterministic coverage, and browser coverage were updated together.

## Completion evidence

- `pnpm check` passed with 86 tests across 25 files and the full architecture, artifact, document, skill, type, lint, format, hygiene, duplication, coverage, and production-build gates.
- `pnpm test:e2e` passed all 13 Chromium scenarios, including global settings, streamed-sentence tail deduplication, sheriff-candidate state, and sheriff election/transfer effects.
- Real Match `match-board-phase2-real-6-no-s-8adb5b3161f8` completed without a sheriff on day two; its 33 player Turns passed trajectory audit with zero issues.
- Real Match `match-board-phase2-real-6-sher-8e8a85dcd42a` completed the sheriff flow and ended on day three; its 70 player Turns passed trajectory audit with zero issues.
- Both Match snapshots stored 300. All 39 speech Prompts carried the length guidance, and all 21 day-speech Prompts carried the current day and complete publicly living roster.
- Across 136 visible prior-speech deliveries, omitted text, duplicate text, and own-speech reinjection were all zero. Both Matches had zero failed Turns, error Records, and error diagnostics.
