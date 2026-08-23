# Acceptance evidence

Evidence date: 2026-08-24. Environment: macOS arm64, Node.js 25.7.0, pnpm 10.20.0.

This document holds the current acceptance status: the latest deterministic gates, coverage,
Chromium scenarios, simulation corpus, live ACP adapters, and player-context isolation. Dated
per-feature run narratives live under `docs/acceptance/archive/`; see the archive index at the end.

## Deterministic application checks

- 107 unit and integration scenarios across 30 test files passed, including exact bootstrap teammate knowledge, guarded ACP process trees, parent-process loss, bounded protocol close, Trae code-mode MCP isolation, game-only player launch policies, Agent Profile ordering and migration, submitted-action status, grouped and weighted vote projection, public board composition, private night visibility, final-only role publication, custom-board persistence and migration, global-setting persistence and Match snapshots, normalized trajectory capture and audit, deterministic simulation, browser review and approval, orchestration project-root validation, role-effect projection, bounded transport auto-recovery, cross-restart engine and Session recovery, speech-playback phase boundaries, deterministic day order, terminal Session projection, and 6/9/12-player board validation.
- Coverage passed at 89.13% lines, 86.24% statements, 90.83% functions, and 75.48% branches over rule, ACP, asset, and server production sources.
- Fourteen Chromium acceptance scenarios passed: custom-board create/edit/select/delete with complete role colors, Agent Profile metadata layout and ordering, global speech settings, 6/9/12-player setup, spectator model and visibility-safe role projection, Match-row simulation workflow, developer model/role trajectory inspection, right-rail and owner-heading alignment, fixed-height live match motion, sheriff-candidate and full/reduced/off semantic effects, non-rotating vote collection with submitted status, target-grouped seat-only vote cards, streamed sentence playback with committed-tail deduplication, sequence-keyed speech playback and manual controls, terminal connection settlement, missing-Match retry shutdown, and paused-match recovery plus deletion.
- Default parallel `pnpm check` completed in 20.7 seconds. TypeScript strict build, Oxlint, Oxfmt,
  Knip, zero-clone JSCPD, architecture, asset, document, and Skill gates passed.

The simulation corpus contains 3 fixtures and 14 variants. Each variant runs two engine replays and
two full orchestration replays, for 56 executions; orchestration also rebuilds and audits every
trajectory Turn. `pnpm simulation:check` completed the corpus in 8.79 seconds with identical
reviewed events, checkpoints, audits, and deterministic repeats. CPU profiling reported no
repeated full-record-read hotspot; trajectory repository code accounted for 9.7% of wall time.

## ACP process supervision

Deterministic fixtures verified normal close, a protocol close that never settles, an ACP process
with a TERM-resistant descendant, a development process group requiring KILL escalation, and an
AgentWolf parent killed by SIGKILL. Every guardian, Agent, and descendant PID disappeared within
the bounded shutdown window.

An isolated Trae 0.201.5 / `gpt-5.6-luna` Session submitted a real wolf-kill vote with 5,350 used
context tokens. Its forbidden shell probe returned `unavailable` with no tool call, Session close
completed, and the host reported zero orphaned `traecli acp serve` processes afterward.

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

## Model, role, and Trae code-mode acceptance

Read-only reconstruction of retained Match `match-board-standard-9-2a52b746dce1` found that the
three Werewolf voters were Players 5, 6, and 8. Player 6 used DeepSeek-V4-Flash and submitted
`agentwolf-player-actions/submit_vote` on both attempts. Players 5 and 8 used `gpt-5.6-luna` through
Trae and produced 143 `codex_core::tools::router` diagnostics across their four vote Turns: 140
reported `code-mode host is disabled` and three rejected an invalid `functions.exec` shape. Their
Prompts contained the correct `submit_vote` contract and legal target context. The source Match was
not resumed, deleted, or otherwise mutated during diagnosis.

The Trae player policy now explicitly enables `code_mode_host` while keeping `shell_tool`,
`unified_exec`, browser/search, file, plugin, hook, Memory, Skill, and Agent capabilities disabled.
Its enabled nested tool catalog remains the five `agentwolf-player-actions` functions. Three
consecutive isolated Trae 0.201.5 / `gpt-5.6-luna` probes submitted a real wolf-kill vote at about
5.3k used context. A follow-up request to invoke `functions.exec` for `pwd` returned `unavailable`
and emitted no tool call. The first probe after enabling the host ended without an action before
stderr capture was added to the smoke harness; subsequent probes established the working MCP
dispatch path while preserving the existing invalid-action pause for model non-compliance.

The current developer API returned configured models and god-view roles for all nine retained
seats. Browser inspection at 1280×720 rendered complete common model names on Match cards, placed
the trajectory role badge on the right side of the seat-heading row, and used purple
`rgb(189, 134, 223)` for Witch and green `rgb(114, 198, 154)` for Hunter. Left-rail name, role,
Session status, and model left-edge gaps were at most 1px, while the same right-rail fields had at
most 1px right-edge gaps. The trajectory heading role right-edge and vertical center gaps were 0px.
The Match and trajectory pages reported no warning or error.

## Acceptance archive

Dated per-feature run narratives are retained under `docs/acceptance/archive/`.

- [2026-08-23 to 2026-08-24](acceptance/archive/2026-08/23-24.md)
