# Postgame public-history catch-up

## Goal

Before a player's first postgame rating turn, bring that player's durable ACP Session to the same
public Match knowledge boundary as every other player. The catch-up covers every public event the
Session has not acknowledged, including speeches across multiple later days, while preserving
private-event isolation, normal Prompt rendering, same-Session recovery, and the separate postgame
delivery ledger.

## Completed work

- Each first rating Prompt uses that seat's persisted regular `acknowledgedSequence` as its source
  boundary and the frozen Match terminal sequence as its destination.
- `ContextRenderer` projects the complete public event range with the closed-eye visibility
  contract and renders it through the existing Ruleset Prompt registry. Actor-aware speech
  templates omit the reviewer's own known speech; faction, actor-private, and god-only events stay
  excluded without status, Role, day, or elimination branches.
- The per-Session public history precedes one common terminal section containing the winning
  faction, winning players, final Role roster, candidate pools, and rating contract. Submitted
  reviews and reflections never enter another player's rating Prompt.
- Postgame auxiliary envelopes carry the real event-range start. Trajectory Turns persist the
  catch-up range and public visible-event sequences, and trajectory audit verifies them against
  public visibility independently of the Prompt text.
- The regular game delivery cursor remains unchanged by postgame delivery. Review retry and server
  restart use the compact same-Session continuation and do not replay the history; accepted
  submissions remain final.
- Review-enabled Matches suppress every terminal live snapshot until the countdown row exists, so
  the first `ended` snapshot contains the visible countdown and the same connection receives its
  automatic transition.

## Completion evidence

- Read-only inspection of Match `match-board-standard-9-946208734f16` found terminal sequence 603
  and regular cursors from 343 through 567. Players 1, 4, and 8 were missing 12, 11, and 11 public
  speeches respectively, establishing the real multi-day catch-up range.
- Focused ContextRenderer, Prompt, Match orchestration, recovery, cursor, trajectory, and visibility
  tests passed 25/25. They cover different early and late cursors, exact public event sequences,
  other-player speech inclusion, own-speech omission, private-event exclusion, unchanged regular
  cursors, identical terminal facts, and continuation-only restart.
- `pnpm check` passed all repository gates, 44 test files, 169 tests, coverage, and production build.
- `pnpm test:e2e` passed 22 Chromium scenarios, including live running-to-countdown-to-collecting
  transition without refresh.
- `pnpm simulation:check` reported all three approved fixtures valid with unchanged game semantics.
- The isolated Codex ACP 1.6.2 smoke on `gpt-5.6-luna` completed Session
  `01a03dfe-e8cd-7052-99f6-579e2804bfdc`, submitted the structured review, and streamed the direct
  reflection in 25 chunks.
