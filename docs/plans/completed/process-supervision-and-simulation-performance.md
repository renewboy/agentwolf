# ACP process supervision and simulation performance

## Goal

Guarantee that every ACP process tree is reclaimed after normal shutdown, development restart, or
parent-process failure on macOS and Linux, and remove redundant trajectory reads from the approved
simulation corpus.

## Completed work

1. Every ACP command runs under a lightweight POSIX guardian process group. A dedicated stdin relay
   detects parent loss, and bounded TERM/KILL escalation covers the Agent and its descendants.
2. ACP protocol close has a one-second deadline. Server SIGINT, SIGTERM, and SIGHUP shutdown is
   idempotent, and the development supervisor terminates complete server and Web process groups.
3. Deterministic fixtures cover normal close, a hung protocol close, TERM-resistant descendants,
   development KILL escalation, and an AgentWolf parent killed by SIGKILL.
4. Trajectory persistence skips delta normalization without live subscribers. Live deltas and
   trajectory pages query only their Turn records through the indexed Match-and-Turn lookup.
5. Database schema five adds the trajectory Turn index with forward migration coverage.
6. Product, architecture, testing, and acceptance documents describe the current runtime and
   performance behavior.

## Completion evidence

- An isolated Trae 0.201.5 / `gpt-5.6-luna` Session submitted a real wolf-kill vote, rejected a
  forbidden shell probe, closed normally, and left zero orphaned `traecli acp serve` processes.
- Parent-SIGKILL, descendant, hung-close, development-supervisor, migration, trajectory delta, and
  pagination tests pass without touching user-owned processes.
- The unchanged 3-fixture, 14-variant, 56-run simulation corpus completed in 8.79 seconds, down from
  roughly 85 seconds. Post-change CPU profiling no longer contains the repeated full-record-read
  hotspot; trajectory repository code accounts for 9.7% of wall time.
- Default parallel `pnpm check` completed in 20.7 seconds with 30 test files, 107 tests, coverage,
  and production build passing. `pnpm test:simulation` completed in 8.24 seconds and
  `pnpm test:e2e` passed all 14 Chromium scenarios.
