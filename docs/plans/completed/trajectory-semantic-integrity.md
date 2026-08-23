# Trajectory semantic integrity

## Goal

Keep private night information aligned with role state, make every player bootstrap self-contained,
group developer records by the shared game timeline, and preserve exact speech across streaming,
commit, and later delivery.

## Completed work

- Limited the regular Werewolf attack event to living Werewolves and a living Witch whose
  antidote remains available. Witch action instructions independently suppress every death target
  after the antidote is consumed while retaining poison.
- Added one detailed public rule entry for every role on the selected board to every foundation
  Prompt. Each registered role declares its public-rules asset, and the architecture gate rejects
  missing or non-string entries.
- Removed the regular attack from the Werewolf callable ability list. Wolf council remains natural
  speech, and the following attack stage uses `submit_vote` while explicitly forbidding
  `submit_night_action`.
- Derived `开局`, numbered nights, `上警`, numbered days, and end-state trajectory groups from
  event-sequence boundaries and replaced player-local Turn headings in the ledger.
- Appended ACP text chunks in protocol order without substring deduplication. The trajectory
  projection uses engine speech normalization for the final message Record, including older
  incomplete captures.
- Omitted a player's own committed speech from later incremental Prompts while retaining it in
  replacement foundations and delivery cursor accounting.
- Preserved stored Prompt reconstruction across contract versions and accepted both shapes of the
  version-12 wolf-vote Prompt captured while its optional constraint slot was introduced.
- Updated current product, architecture, information-synchronization, testing, and acceptance
  documents.

## Completion evidence

- `pnpm check` passed with 75 tests across 24 files, type checking, lint, formatting, hygiene,
  duplication, architecture, artifact, documentation, skill, coverage, and production build gates.
- `pnpm test:e2e` passed all 11 Chromium scenarios.
- Real no-sheriff Match `match-board-phase2-real-6-no-s-d6f0b8874e89` ended on day three with 282
  events, 39 completed player Turns, 255 player Records, and a zero-issue context audit.
- Real sheriff Match `match-board-phase2-real-6-sher-68d5cfbb9b3b` ended on day two with 248 events,
  40 completed player Turns, 280 player Records, and a zero-issue context audit.
- Across the two accepted Matches, failed tools, error Records, error diagnostics, duplicate Record
  IDs, incorrect Prompt cardinality, public-role-primer failures, own-speech reinjections, and
  streamed/committed speech mismatches were all zero.
- The no-sheriff Witch received the first regular attack while her antidote was available and was
  excluded from the next two attack events after using it. Her second-night Prompt skipped the
  hidden target event and contained no target Player ID.
- Both trajectory pages opened from their Match records, rendered shared game-period headings,
  reported `上下文审计通过`, filled the browser viewport, and kept document scroll at zero.
