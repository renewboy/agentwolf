# Vote waiting and result clarity plan

## Goal

Represent vote collection with truthful submitted, pending, synchronization, and recovery feedback, and present resolved ballots as seat-only groups that can be scanned without player names.

## Completed work

1. The action gateway broadcasts `submitted` as soon as it accepts a valid structured action. God view and the acting player's view receive that state; other projections do not receive completion order.
2. Foundation delivery uses `syncing`, and replacement-session foundation delivery drives the recovery presentation.
3. Vote collection displays `等待玩家提交投票`; pending player cards display `投票中`, accepted cards display `已提交`, and circular presence/player-ring rotation remains at rest while the signal rail pulses.
4. Resolved vote cards group voter seats under each target seat. Titles and ballot rows use seat numbers only, while weighted votes and abstentions remain explicit.
5. Unit, integration, projection, browser, architecture, artifact, documentation, lint, formatting, hygiene, duplication, coverage, and production-build gates cover the behavior.

## Completion evidence

- Match `match-board-quick-6-c5b673ee202c` recorded its first exile-vote phase at event 114 and its resolved result at event 162. The intervening events identify four acknowledged deliveries, one pending delivery, and bounded Session recovery.
- Current API projection renders `投2号：1号、5号、6号` and `投6号：2号、3号` for that result, with no nickname in its title or detail.
- `pnpm check` passes 54 scenarios across 19 test files with 88.36% line, 84.78% statement, 87.45% function, and 72.67% branch coverage.
- `pnpm test:e2e` passes seven Chromium scenarios. Vote-state sampling confirms stationary circular transforms, live signal-rail movement, submitted and pending copy, seat-only grouped rows, fixed viewport height, and internal feed scrolling.
