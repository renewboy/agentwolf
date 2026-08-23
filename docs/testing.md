# Testing and acceptance

## Test layers

- Unit tests cover role classes, resolution priorities, role-effect catalog coverage, custom-board
  validation, phase transitions, speech sanitization, nickname uniqueness, event reduction, and
  visibility projection.
- Property tests generate legal player counts, action orders, and death chains to check deterministic replay, unique Player IDs, monotonic sequences, and terminal victory.
- Integration tests run the API with an in-memory repository and fake ACP processes. They cover
  custom-board CRUD and immutable Match snapshots, schema-one migration, one session per seat,
  cursor advancement, submitted-action status, normalized and redacted trajectories, exact Prompt
  reconstruction, uncertain-delivery recovery, MCP action authorization, sync barriers, and
  streamed speech.
- Contract tests validate REST, WebSocket, event, prompt, and action schemas against fixtures shared by server and web.
- Browser tests cover Agent Profile and custom-board management, styled listbox behavior,
  confirmation-dialog focus and deletion, Match setup, per-Match trajectory entry, seat and
  nickname labels, semantic record tags, minimap-to-Record navigation, stable player switching,
  shared-period collapse, developer detail, context-audit status, role-effect modes, rerolls, game start,
  view switching, live speech, target-grouped vote
  results, non-rotating vote collection feedback, sequence-keyed automatic playback, per-speech
  manual play and stop, playback skip and synthesis failure, fixed-height match layout, active
  waiting feedback, terminal-state motion cleanup, and missing-Match request settlement.
- Browser fixtures use a per-run name namespace and remove every created Match, Agent Profile, and custom Agent Tool during suite teardown, including after failed assertions.
- Optional live ACP smokes verify installed adapters, game-only tool visibility, bootstrap usage,
  and a real structured action with a one-turn fake Match. They never run in keyless CI.

## Required commands

```sh
pnpm typecheck
pnpm lint
pnpm test:coverage
pnpm build
pnpm check:architecture
pnpm check:artifacts
pnpm check:docs
pnpm check:skills
pnpm test:e2e
pnpm smoke:player-action -- gpt-5.6-luna --tool=trae-cli
pnpm smoke:player-action -- gpt-5.6-luna --tool=codex
```

`pnpm check` is the deterministic local and CI gate. It excludes live model calls and credentialed adapter smokes.

`pnpm install` registers Lefthook when Git uses its normal hooks directory. A managed global `core.hooksPath` is preserved; on such hosts, run `pnpm check` explicitly and rely on the required GitHub Actions jobs.

## Acceptance scenarios

1. Twelve fake agents complete a Standard match from first night through a winner with deterministic replay.
2. The first-day sheriff flow supports join, decline, withdrawal, tie speech, revote, badge loss, 1.5 vote weight, and badge transfer.
3. Every voter receives every other player's speech exactly once before its vote is accepted, and
   does not receive its own already-known speech again in an incremental Prompt.
4. God, closed-eye, and player projections return distinct allowed fields from the server.
5. Speech chunks appear live, while committed text contains no Player IDs.
6. Guard, Witch, Hunter, and Idiot interactions match the selected board policies. A Witch with an
   available antidote sees only the regular Werewolf attack target; after losing the antidote she
   receives no death target through either events or action instructions.
7. A killed or timed-out ACP process pauses the match without resending an in-flight envelope.
8. Selecting 6, 9, or 12 players filters compatible boards, produces the matching seat count, and sends each Agent the selected board policies.
9. Agent Tool selection discovers its ACP model list, and only an advertised model can be selected in the settings UI.
10. A rejected six-player Seer action pauses at the same phase, resumes with the exact ability contract, and reaches a settled inspection without replaying acknowledged context.
11. Recovery after server restart restores the event-sourced engine, starts replacement sessions with visible history, and continues the interrupted turn.
12. A paused match exposes continue and delete controls; deletion removes the match, events, and delivery ledgers.
13. A simulated uncertain ACP speech delivery replaces failed sessions once, commits the retried speech, and does not emit a transient pause event.
14. A transient spectator WebSocket closure keeps the last snapshot, refreshes over HTTP, and reconnects instead of replacing the page with an error.
15. A daytime exile with last words completes the day and enters the next night before another day speech can begin.
16. Every bootstrap prompt covers its delivery cursor, includes one detailed public rules entry for
    each role on the selected board without seat assignments, gives each Werewolf exactly its other
    teammates, and gives non-Werewolves no faction roster.
17. Death and exile keep identities hidden in running closed-eye and player projections; `match.ended` precedes one final public identity event per seat, and every terminal projection exposes all roles.
18. An ended page closes continuous presence motion and live reconnection, while a 404 Match page stops further GET and WebSocket attempts.
19. A valid structured action immediately projects `submitted` to god and actor views while remaining hidden from other player and closed-eye views.
20. Vote collection uses phase-specific copy and a pulsing signal rail without circular rotation; resolved vote cards group voter seats by target seat and preserve weighted votes and abstentions.
21. A speech stage may generate every speaker in sequence, but its following phase receives no Agent prompt until the controlling browser completes or skips the visible playback queue through the final speech sequence. Closed-eye playback does not hold private wolf-council speech.
22. A saved six-player Seer/Witch board can switch sheriff and victory policies; editing or
    deleting it does not change a Match created from an earlier revision.
23. Normal startup captures trajectory data while returning 404 for every developer route; a
    developer restart reads the same records and streams later logical updates by revision.
24. Every completed deterministic Turn has one exact Prompt, a matching delivery range and
    acknowledgement, no duplicate stream records, and a successful reconstruction audit.
25. Private Seer, Witch, Guard, and night-attack cues appear only in permitted projections; full,
    reduced, and off effect modes play each newly visible cue at most once and leave no residual
    transform.
26. Normal speech rejects the compatibility `submit_speech` tool and commits the ACP response;
    rendered speech prompts contain their versioned public-fact and phase-specific constraints.
27. Wolf council exposes no self-destruct interrupt or premature night-action contract, while
    sheriff and daytime Werewolves receive the exact self-destruct ability ID accepted by the
    engine. The following wolf attack stage accepts only `submit_vote`, explicitly forbids
    `submit_night_action`, and the bootstrap callable-ability list omits the regular attack ID.
28. Developer mode places `查看轨迹` on each Match record, routes by that Match ID, shows players by
    seat with nicknames as secondary context, fills the available viewport, and presents labeled
    semantic colors without a global developer navigation item or Match selector. Minimap nodes
    center the selected Record, and an owner change keeps the page mounted while restoring that
    owner's ledger position. Every owner is grouped by the same setup/night/sheriff/day/end game
    periods rather than player-local Turn numbers.
29. Ordered ACP text deltas preserve repeated fragments and punctuation. A projected speech
    message Record and committed event expose the same normalized canonical text, while historical
    incomplete stream Records project through the same normalization.
30. Every daytime Prompt states the current day exactly once and lists every publicly living
    nickname, seat, and Player ID while excluding eliminated players without exposing pending
    night deaths during the sheriff campaign.
31. Sheriff campaign speech uses a replay-stable random first candidate. Day speech order covers
    single-death, multiple-death, and peaceful-night anchors with or without a Sheriff, persists its
    basis and direction, and always places a living Sheriff last.
