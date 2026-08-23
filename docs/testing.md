# Testing and acceptance

## Test layers

- Unit tests cover role classes, resolution priorities, wolf no-kill and replay-stable tie
  selection, the twelve built-in Character cards and portraits, full-ability portrayal rendering,
  role-effect catalog coverage, custom-board validation, phase transitions, speech
  sanitization, nickname uniqueness, event reduction, and visibility projection.
- Property tests generate legal player counts, action orders, and death chains to check deterministic replay, unique Player IDs, monotonic sequences, and terminal victory.
- Integration tests run the API with an in-memory repository and fake ACP processes. They cover
  Character upload/copy/CRUD and reference protection, board Character defaults and Match
  overrides, repeated Characters with unique nicknames, immutable Character snapshots,
  custom-board CRUD and immutable Match snapshots, schema-one migration, Agent Profile ordering and
  migration, one session per seat, cursor advancement, submitted-action status, normalized and
  redacted trajectories, exact Prompt reconstruction, uncertain-delivery recovery, MCP action
  authorization, same-turn correction after a rejected structured action, guarded process-tree
  shutdown, parent-process loss, bounded protocol close, sync barriers, and streamed speech.
- Contract tests validate REST, WebSocket, event, prompt, and action schemas against fixtures shared by server and web.
- Simulation corpus tests re-execute approved real-Match captures through a fresh rule engine and
  the production Match runtime with deterministic fake Sessions. They check semantic event order,
  vote calculations, visibility, exact parallel actor barriers, current-engine sequential actor
  routing, Prompt reconstruction, delivery recovery, restart reconstruction, playback completion,
  skip and disconnect, and repeated-run determinism.
- Browser tests cover Agent Profile management, profile metadata layout, whole-row drag feedback,
  keyboard ordering, persisted setup defaults, Character library editing and portrait upload,
  custom-board Character defaults, Match overrides and duplicate nickname blocking, custom-board
  management, complete role-palette coverage, styled listbox behavior, confirmation-dialog focus and
  deletion, Match setup, per-Match trajectory entry, seat and nickname labels, seat model labels,
  visibility-safe role badges, cross-screen role-color consistency, semantic record tags,
  minimap-to-Record navigation, stable player switching,
  shared-period collapse, developer detail, context-audit status, role-effect modes, rerolls, game start,
  view switching, live speech, target-grouped vote results, private wolf-ballot visibility,
  non-rotating vote collection feedback, sequence-keyed automatic playback, per-speech
  manual play and stop, playback skip and synthesis failure, fixed-height match layout, active
  waiting feedback, terminal-state motion cleanup, and missing-Match request settlement.
- Browser fixtures use a per-run name namespace and remove every created Match, custom board,
  custom Character, Agent Profile, and custom Agent Tool during suite teardown, including after
  failed assertions.
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
pnpm test:simulation
pnpm simulation:check
pnpm smoke:player-action -- gpt-5.6-luna --tool=trae-cli
pnpm smoke:player-action -- gpt-5.6-luna --tool=codex
```

`pnpm check` is the deterministic local and CI gate. It excludes live model calls and credentialed adapter smokes.

The simulation corpus retains duplicate engine and full-orchestration replays for every approved
variant. Trajectory persistence skips live-delta normalization without subscribers and reads live
records by indexed Turn ID, so the default parallel coverage gate runs without a worker override.

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
7. A killed or timed-out ACP process enters bounded recovery without resending an in-flight envelope; a repeated failure pauses the Match.
8. Selecting 6, 9, or 12 players filters compatible boards, produces the matching seat count, and sends each Agent the selected board policies.
9. Agent Tool selection discovers its ACP model list, and only an advertised model can be selected in the settings UI.
10. A rejected six-player Seer action returns its rule error to the same Agent turn, accepts a corrected tool call, reaches a settled inspection, and emits no pause or resume event.
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
20. Vote collection uses phase-specific copy and a pulsing signal rail without circular rotation; resolved vote cards group voter seats by target seat and preserve weighted votes, abstentions, and wolf no-kill ballots. God and Werewolf player views receive detailed wolf ballots while closed-eye, non-Werewolf, and Witch views do not.
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
    `submit_night_action`, offers `targetPlayerId: null` as no-kill, resolves no-kill only by strict
    plurality, chooses a replay-stable player target on a highest-vote tie, and keeps the bootstrap
    callable-ability list free of the regular attack ID.
28. Developer mode places `查看轨迹` on each Match record, routes by that Match ID, shows players by
    seat with nickname, configured model, and complete color-labeled role identity as secondary
    context, fills the available viewport, and presents labeled semantic colors without a global
    developer navigation item or Match selector. Minimap nodes
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
32. Agent Profiles render their names and models on separate lines, retain a user-defined order
    across edits and restarts, and default every new-Match seat to the first ordered profile.
33. Ended and paused Matches export a sanitized, versioned simulation capture; running Matches and
    Matches with unresolved trajectory Turns reject capture without mutating the source Match.
34. A complete twelve-player capture reaches the same winner and semantic event digest through the
    engine and orchestration runners under recorded, forward, reverse, transient-delivery, restart,
    playback-complete, playback-skip, and playback-disconnect variants.
35. A repeated uncertain delivery capture replaces Sessions once and pauses on the second failure
    at the same action boundary. Re-running a fixture and seed produces identical canonical output.
36. Candidate approval strips source identifiers and full event bodies from the committed oracle;
    schema, secret, invariant, engine, orchestration, and determinism checks gate the corpus.
37. Developer-mode Match rows open a keyboard-safe simulation wizard that reviews and approves the
    same candidate through HTTP, disables ineligible Matches, blocks dismissal during work, restores
    trigger focus, and stays within desktop and mobile viewports. The trajectory page contains no
    simulation workflow controls.
38. Every Match player card shows its configured model. Role badges use the same semantic color for
    the same identity on Match and trajectory screens, while closed-eye projections retain model
    metadata and expose only the neutral `身份未公开` badge.
39. Trae player launch enables only the code-mode MCP host while retaining the five-action MCP
    allowlist and every shell, file, browser, network-search, plugin, and Agent prohibition. An
    isolated `gpt-5.6-luna` smoke submits a real vote, while a request to run `pwd` reports the tool
    unavailable and emits no call.
40. Normal Session close, a hung protocol close, development shutdown, descendant processes that
    ignore TERM, and an AgentWolf parent killed by SIGKILL all leave no guarded Agent process.
41. The complete 14-variant simulation corpus preserves its reviewed events, checkpoints, audits,
    and repeated-run determinism while default parallel `pnpm check` stays within the existing
    timeout.
42. A six-player board can assign the same Character to multiple seats. Match setup defaults both
    nicknames to the Character name, blocks creation until the nicknames are unique, permits
    per-Match Character overrides, snapshots every selected card, injects only the owning card with
    the full-ability boundary, and projects Character portraits without changing game-role secrecy.
