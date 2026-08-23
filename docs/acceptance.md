# Acceptance evidence

Evidence date: 2026-08-24. Environment: macOS arm64, Node.js 25.7.0, pnpm 10.20.0.

## Deterministic application checks

- 102 unit and integration scenarios across 28 test files passed, including exact bootstrap teammate knowledge, game-only player launch policies, Agent Profile ordering and migration, submitted-action status, grouped and weighted vote projection, public board composition, private night visibility, final-only role publication, custom-board persistence and migration, global-setting persistence and Match snapshots, normalized trajectory capture and audit, deterministic simulation, browser review and approval, orchestration project-root validation, role-effect projection, bounded transport auto-recovery, cross-restart engine and Session recovery, speech-playback phase boundaries, deterministic day order, terminal Session projection, and 6/9/12-player board validation.
- Coverage passed at 88.90% lines, 85.95% statements, 90.50% functions, and 75.42% branches over rule, ACP, asset, and server production sources.
- Fourteen Chromium acceptance scenarios passed: custom-board create/edit/select/delete, Agent Profile metadata layout and ordering, global speech settings, 6/9/12-player setup, spectator projections, Match-row simulation workflow, developer trajectory inspection, fixed-height live match motion, sheriff-candidate and full/reduced/off semantic effects, non-rotating vote collection with submitted status, target-grouped seat-only vote cards, streamed sentence playback with committed-tail deduplication, sequence-keyed speech playback and manual controls, terminal connection settlement, missing-Match retry shutdown, and paused-match recovery plus deletion.
- TypeScript strict build, Oxlint, Oxfmt, Knip, zero-clone JSCPD, architecture, asset, document, and Skill gates passed.

## Deterministic simulation corpus

The approved corpus contains two ended Matches with 125/35 recorded Agent Turns and 506/180
canonical domain events, plus a paused six-player Match with two consecutive uncertain deliveries
at the first wolf-council action boundary. The complete fixture runs recorded, forward and reverse
parallel completion order, transient delivery, engine restart reconstruction, playback completion,
playback skip, and playback disconnect variants.

Each of the fourteen fixture variants ran twice through a fresh rule engine and twice through the
production Match runtime with in-memory persistence and deterministic fake Sessions. All 56 runs
produced identical reviewed event digests and checkpoints. Orchestration runs also passed exact
Prompt reconstruction, delivery acknowledgement, full parallel actor-snapshot, visibility, vote
total, terminal reveal, and bounded recovery checks.

Developer-route integration returned 404 outside developer mode, rejected unsettled sources,
reviewed both runners, required warning acknowledgement, approved without overwriting an existing
fixture, and left the source Match unchanged. Chromium completed preparation, validation, warning
confirmation, approval, and completion from the Match row while the trajectory page exposed no
simulation controls.

Schema-one compatibility was exercised with `simulation-ended-6feafc84a08f2b49`, a 35-Turn,
180-event candidate whose stored `action.submitted` payloads retained the source Match ID. Review
normalized those nested actions to the fixture Match ID without rewriting the candidate; engine and
orchestration replay, repeated-run determinism, warnings, and secret checks all passed.

Candidate `simulation-ended-fdcbb2961d962824` exercised developer-server review from the
`apps/server` package working directory. The configured project root supplied the player runtime
Skill to both orchestration runs; package-directory CLI review and the running developer HTTP route
both returned 35 Turns, 180 events, four passing replay checks, runner agreement, and no failure,
warning, or secret warning. An invalid project-root test exposed the runtime initialization cause
directly instead of presenting only the resulting checkpoint difference.

## Live ACP adapters

| Agent tool                   | Session                                                                          | Prompt turn                                                             |
| ---------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Trae CLI 0.201.5, native ACP | `initialize`, `session/new`, 19 advertised models, close passed                  | streamed speech and accepted `submit_vote`, `submit_night_action` tools |
| Codex ACP 1.6.2              | `initialize`, `session/new`, model `gpt-5.6-sol`, mode `read-only`, close passed | streamed `准备就绪`, `end_turn`                                         |
| Claude Agent ACP 0.70.0      | `initialize`, `session/new`, model `sonnet`, close passed                        | blocked by provider response `400 This organization has been disabled`  |

The Claude result confirms the adapter and Session lifecycle while identifying the current external account blocker. The runtime pauses on this failure and does not resend the prompt.

The host has a managed global `core.hooksPath`. AgentWolf preserved that setting and skipped local Lefthook installation. `pnpm check` and GitHub Actions executed the same required gates directly; ordinary clones without a managed hook path install the committed Lefthook configuration during `pnpm install`.

## Player context isolation

The Trae 0.201.5 game-only probe used Doubao-Seed-2.1-Turbo, exposed exactly the five
`mcp__agentwolf_player_actions__*` functions, submitted a real wolf-kill vote, and reported 2,035
tokens on its first turn. The same probe without the player launch policy reported 32,663 tokens.
The isolation removes ambient Memory, the global Skill catalog, plugins, hooks, repository
development instructions, model coding instructions, and 18 general file/shell/browser/sub-agent
tools.

The Codex ACP 1.6.2 probe used `gpt-5.6-luna`, submitted the same real MCP vote, and reported 5,401
tokens. A follow-up explicitly requesting `functions.exec` returned `I can’t run shell commands.`
and emitted no tool call. Claude ACP receives an empty built-in tool list, no user/project/local
setting sources, and a compact AgentWolf system contract; deterministic coverage verifies that
session metadata while the configured Claude account remains externally disabled.

A retained browser-visible Match used six real isolated Trae Sessions:

| Match ID                                      | Result                | Events | Player Turns | Game tool records |
| --------------------------------------------- | --------------------- | -----: | -----------: | ----------------: |
| `match-board-phase2-real-6-no-s-bdb87ae0b60d` | Werewolves, day three |    369 |           53 |                25 |

All six foundation Turns used Prompt contract 16 and reported between 2,578 and 2,604 tokens, a
maximum reduction of about 92.6% from the prior roughly 35k bootstrap. All Sessions remained at
generation one. The Match completed in the browser and its final audit covered all 53 player Turns
with zero issues, zero error Records, and zero non-game tool Records. It paused once when the Seer
model selected itself, then the existing operator recovery re-prompted the same Session and the
Match completed; this was a rejected game target, not a context or transport failure.

Prompt contract 16 enforces a 12,000-token bootstrap budget in the trajectory audit. Deterministic
coverage verifies the version boundary and exact budget, so a future Agent or adapter that restores
ambient context makes the audit fail visibly.

## Visual checks

The match stage stayed exactly equal to the viewport at 3456×1760, 1440×900, 1024×768, and 390×844. The document remained at `scrollY = 0`; the center feed retained its own scroll range, and the mobile player HUD replaced both side rosters below 900px.

A delayed six-player Mock ACP match exposed `reconnecting`, `starting`, `streaming`, and `thinking` in the browser. The visible thinking ring changed transform across a 350ms sample, the center presence stage named the live state, and the browser reported no page or console errors. A 9.72-second browser recording captured startup, streaming, thinking, and paused feedback. Closed-eye projection hid every private seat runtime status while the selected player view retained only its own private status.

The application listbox rendered through its Portal with the dark game-control surface, constrained internal scrolling, selected-state mark, and keyboard navigation. The destructive confirmation layer covered the application, focused cancel first, closed on Escape, restored trigger focus, and completed deletion without browser-native prompts. Suite teardown left zero test Matches, zero test Agent Profiles, and zero custom test Agent Tools in the reusable local server.

The live Agent settings page rendered every profile name and model on separate lines, made every row
draggable, and exposed a grab cursor across each row. The live new-Match page assigned the persisted
first profile to all 12 seat selectors and reported no browser warning or error. Isolated Chromium
coverage started a drag from the right side of a profile row, observed the lifted source and target
insertion line, completed the reorder, repeated it with Arrow/Home keys, reloaded the page, verified
the persisted order, and then verified all 12 setup defaults before deleting the test profile.

The simulation dialog retained the current ink, graphite, amber, and crimson visual language at
desktop and 390×844 mobile sizes. Its mobile bounds were `x=8`, `y=8`, `374×828` inside a 390×844
viewport, document width remained 390, the body scrolled independently, and browser warning/error
logs were empty. Busy work blocked Escape dismissal; cancellation and completion restored focus to
the originating Match-row action. Browser review of `simulation-ended-fdcbb2961d962824` displayed
35 Turns, 180 events, all four checks as passed, and an enabled approval action; the review was
cancelled without writing a fixture or changing the source Match.

## Speech playback pacing

Engine coverage held a final day speech at its explicit action boundary and restored that boundary into the exile-vote phase after a pause. Server integration generated both six-player Werewolf council speeches while retaining `phase-night-wolf-council`; no wolf-vote prompt existed until the exact final speech sequence was completed. A wrong sequence produced `speech-playback-invalid-resolution`, a second controller produced `speech-playback-controller-busy`, and a closed-eye controller advanced through private wolf speech without a playback hold.

Chromium playback coverage used two committed events with identical text and observed two separate utterances. Skipping the first event sent no phase-resolution message, completing the final event sent its exact sequence and changed the visible phase to daytime voting, and a synthesis error resolved the final sequence as skipped. Each committed speech exposed manual play and stop; manual stop emitted no game-progress message, automatic playback exposed only skip, and history controls stayed disabled while the automatic queue was active.

An isolated production build ran against an in-memory database at 1280×720. The real browser exposed the connection-owned audio toggle and per-speech play controls, rendered both Werewolf speeches, advanced from council to wolf attack after browser speech completion, and reported no warning or error. The isolated Match, Profile, Tool, and workspace were separate from user runtime data.

## Six-player context integrity

A real six-player Trae ACP match completed with GPT-5.4 and Gemini 3.1 Pro player Sessions. Its append-only log contained 229 contiguous domain events, 32 prompt deliveries and acknowledgements, 13 accepted structured action calls, and 26 submitted actions.

All six foundation prompts contained the exact public composition and complete roster. Player 1 received only Player 5 as a Werewolf teammate; Player 5 received only Player 1; the Hunter, Seer, and both Villagers received no wolf roster. Only the Seer received the inspection result, only the living Werewolves received the selected attack target, all structured calls used the AgentWolf action server, and committed speech contained no Player IDs. The redacted raw ACP stream contained no credential value.

The Hunter received the `ability-hunter-shot` death-skill contract and explicitly submitted `option: pass` with a null target. The engine recorded the ability use and no `hunter.shot`, confirming a player decision rather than an omitted trigger. `match.ended` was event 223; the six public final identities were events 224 through 229. No identity event occurred while the Match was running.

The production-entry terminal page exposed all six identities and six `已结束` Session labels. Its presence state was `ended`, connection state was `settled`, all six player-ring transforms remained stationary across two samples, document height equaled viewport height, page scroll stayed at zero, and the browser emitted no warning or error. The audit Match, Profiles, Tool, and all browser-test records were removed after verification.

## Phase-two browser and trajectory acceptance

Two retained browser-visible Matches used the saved six-player Seer/Witch boards and six real Trae
ACP Sessions backed by Doubao-Seed-2.1-Turbo:

| Mode       | Match ID                                      | Result             | Events | Player Turns | Tool calls |
| ---------- | --------------------------------------------- | ------------------ | -----: | -----------: | ---------: |
| No sheriff | `match-board-phase2-real-6-no-s-fa7680aa3e23` | Village, day three |    297 |           41 |         19 |
| Sheriff    | `match-board-phase2-real-6-sher-9583f8d865e2` | Wolves, day two    |    297 |           45 |         24 |

Both pages reached `对局结束` and `对局记录已完整同步` in the in-app browser. All 86 player
Turns completed, every structured tool record completed, both context audits returned no issue,
every Turn had exactly one Prompt, and no duplicate trajectory Record ID existed. Neither Match
recorded `submit_speech`, a failed tool, an error Record, or an error diagnostic. The browser
reported no warning or error for either page.

The stored Prompt contract preserved the exact visible event range for every Turn. Sheriff
campaign Prompts contained the pre-announcement privacy rule and no death announcement; public
speech Prompts fixed announced deaths, living state, votes, and phase results as shared table
facts. The current wolf-council Prompt delivered the discussion-only contract, omitted the
self-destruct interrupt, and deferred its target to the structured attack vote. Sheriff and public
daytime Werewolves received the formal `ability-werewolf-self-destruct` ID. The compatibility
speech tool remained unused, so streamed and committed speech shared the ACP response source.

Each real Match retained 20 Trae stderr warning diagnostics for provider Skill-budget,
submission-inbox, or shell-snapshot startup notices. They were inspected in the trajectory panel;
no warning represented a failed delivery, rejected game action, missing context, or browser error.

Each developer-mode Match record exposed `查看轨迹` and opened only that Match. The page rendered
players by seat with explicit nickname context, semantic Prompt/thought/speech/tool/action tags,
collapsible shared game periods, a four-lane clickable Record minimap, a viewport-filling
virtualized ledger, and a full detail inspector, and displayed `上下文审计通过`. Owner switching kept the page at
`scrollY = 0`, retained the full-height shell during loading, and restored per-owner ledger scroll.
Normal startup retained the same trajectory records while
returning 404 for developer reads. The custom-board browser flow saved, edited,
selected, started, and deleted a Seer/Witch board without changing built-ins or an existing Match
snapshot. Role-effect browser coverage observed sequence-keyed cues in full mode and verified the
reduced and off modes without residual transforms.

## Trajectory semantic integrity acceptance

Two retained browser-visible six-player Matches used real Trae ACP Sessions after the shared game
period and Prompt-integrity changes:

| Mode       | Match ID                                      | Result            | Events | Player Turns | Player Records |
| ---------- | --------------------------------------------- | ----------------- | -----: | -----------: | -------------: |
| No sheriff | `match-board-phase2-real-6-no-s-d6f0b8874e89` | Wolves, day three |    282 |           39 |            255 |
| Sheriff    | `match-board-phase2-real-6-sher-68d5cfbb9b3b` | Village, day two  |    248 |           40 |            280 |

Both Matches reached `对局结束` and `对局记录已完整同步` in the browser. Their final
context audits covered all 79 player Turns and reported no issue. Every Turn completed with one
Prompt; duplicate Record IDs, failed tools, error Records, error diagnostics, role-primer
failures, own-speech reinjections, and streamed/committed speech mismatches were all zero.

Every player foundation contained exactly the four roles on the selected board—Villager,
Werewolf, Seer, and Witch—with faction, timing, target, usage, and policy details and no seat
assignment inside the public role-primer section. Werewolf foundations exposed self-destruct as a
callable ability and omitted the regular attack ability ID. The wolf attack stages completed with
`submit_vote`; the explicit night-action prohibition is version-gated and reconstructs earlier
stored Prompts exactly.

In the no-sheriff Match, Player 1 was the Witch and used the antidote on night one. Event 48 exposed
the regular attack target to Player 1 and the two living Werewolves. Events 182 and 268 excluded
Player 1 after the antidote was consumed, and the second-night Witch Prompt skipped the hidden
attack sequence while stating that no death target information was available. The Witch retained
the poison action. The sheriff Match completed signup, campaign speech, withdrawal, sheriff vote,
badge resolution, daytime play, and a second night.

The trajectory pages grouped calls under `开局`, `第1夜`, `上警`, and numbered days instead of
player-local Turn headings. Both pages filled the 720-pixel browser viewport with document
`scrollY = 0`, and each Match record remained the only entry point to its own trajectory. The final
Chromium suite passed all 11 scenarios.

## Day state and speech-order acceptance

Two retained browser-visible six-player Matches used real Trae ACP Sessions with Prompt contract
14:

| Mode       | Match ID                                      | Result           | Events | Player Turns | Player Records |
| ---------- | --------------------------------------------- | ---------------- | -----: | -----------: | -------------: |
| No sheriff | `match-board-phase2-real-6-no-s-4e513a8d0346` | Wolves, day four |    368 |           49 |            328 |
| Sheriff    | `match-board-phase2-real-6-sher-95726af57785` | Wolves, day one  |    259 |           41 |            277 |

Both Matches ended with a zero-issue trajectory audit. Every player Turn completed; failed tools,
error Records, error diagnostics, and daytime-state Prompt failures were all zero. Every daytime
Prompt contained exactly one current-day statement plus the complete publicly living
nickname-seat-Player-ID roster.

The no-sheriff Match exercised both random and death-anchored mornings. Its peaceful first morning
started at Player 5 and proceeded counterclockwise `5 → 4 → 3 → 2 → 1 → 6`.
Later single-death mornings used Player 6 and Player 2 as their respective anchors and began from
the first living neighbor in the persisted counterclockwise direction. A separate real
no-sheriff Match exercised the opposite direction: after Player 2 died, the order was
`1 → 6 → 5 → 4 → 3`.

The sheriff Match placed all six candidates into the persisted campaign order
`6 → 1 → 2 → 3 → 4 → 5`, confirming a random first candidate followed by seat-order
rotation. All players remained original candidates, so no player was eligible to cast the sheriff
vote and the badge correctly became lost; daytime order then followed the no-sheriff fallback.
Deterministic engine coverage separately verified every living-Sheriff branch: single death uses
dead-left/dead-right, peaceful and multiple-death mornings use Sheriff-left/Sheriff-right, and the
Sheriff is appended as the final summary speaker in both directions. Multiple deaths without a
Sheriff use the lowest-seat death as anchor. Replay restored the emitted order exactly.

## Global speech and sheriff-signal acceptance

Two retained browser-visible six-player Matches used real Trae ACP Sessions with Prompt contract
15 and a global speech preference of 300 characters:

| Mode       | Match ID                                      | Result                | Events | Player Turns | Player Records |
| ---------- | --------------------------------------------- | --------------------- | -----: | -----------: | -------------: |
| No sheriff | `match-board-phase2-real-6-no-s-8adb5b3161f8` | Village, day two      |    236 |           33 |            225 |
| Sheriff    | `match-board-phase2-real-6-sher-8e8a85dcd42a` | Werewolves, day three |    463 |           70 |            460 |

Both Match setup snapshots stored `speechCharacterLimit: 300`. All 39 speech Prompts contained the
300-character guidance. All 21 day and runoff speech Prompts contained the current day and complete
publicly living nickname-seat-Player-ID roster; all six sheriff campaign Prompts also contained the
length guidance. The audits covered 103 player Turns and reported zero issues. Every player Turn
completed, with zero failed Turns, error Records, and error diagnostics.
Each Match retained 27 Trae warning diagnostics for unknown provider submission IDs or shell
snapshot timing; none represented a failed delivery, rejected action, or context-audit issue.

Across 136 visible prior-speech deliveries, exact speech text appeared once: omitted speeches,
duplicated speeches, and reinjection of a player's own prior committed speech were all zero. The
no-sheriff Match exercised a single-death neighbor anchor and reached a settled terminal browser
state. The sheriff Match exercised signup, six campaign speeches, withdrawal, badge resolution,
daytime speech, exile runoff, and three nights before reaching a settled terminal state. Its six
standing candidates displayed an icon plus the `上警` label during the election and no candidate
marker after resolution.

Chromium speech synthesis coverage received `第一句。` before the speech committed, then received
only `第二句` from the committed tail. The full `第一句。第二句` text was never queued, and the final
event sequence resolved only after the tail completed. Dynamic sheriff cues displayed
`sheriff-elected` and `sheriff-transferred` through the shared GSAP adapter, targeted the correct
player cards, cleaned up after completion, respected reduced mode, and drew nothing in off mode.

## Vote collection and result presentation

Match `match-board-quick-6-c5b673ee202c` entered its first exile vote at event 114. Four initial deliveries acknowledged by event 124; the remaining delivery entered bounded Session recovery, and the resolved ballots committed at event 162. The live-state contract now distinguishes context synchronization, active vote submission, accepted submission, and Session recovery.

A structured action acceptance emitted `submitted` before the ACP final response in integration coverage. Chromium sampling reported `data-presence-state="awaiting-actions"`, `已提交` for an accepted voter, `投票中` for a pending voter, stable orb and player-ring transforms, and a changing signal-rail transform/opacity sample.

Current API projection of the same Match renders its first result as `投票结算：2号以3票获得最高票。`, followed by `投2号：1号、5号、6号` and `投6号：2号、3号`. The second result renders `投5号：1号、6号` and `投6号：5号`. Neither title nor ballot row contains a player nickname.

## Structured action rejection acceptance

The authenticated MCP integration called `submit_night_action` with a Witch poison action whose
semantic validator returned `Poison has already been used`. The tool response carried an error
flag and the rule message, no action entered the mailbox, and a corrected pass using the same
player token and open expectation was accepted.

The six-player orchestration integration submitted an unavailable Guard ability during the Seer
turn, received the phase rule rejection, and submitted the required Seer inspection inside the
same ACP Prompt. The inspection settled with no `match.paused` or `match.resumed` event. Engine
coverage also verified that semantic validation leaves the event log and state snapshot unchanged.

`pnpm check` passed all architecture, artifact, documentation, skill, type, lint, format, hygiene,
duplication, coverage, and build gates with 28 test files and 102 tests. Chromium E2E passed all 14
scenarios.
