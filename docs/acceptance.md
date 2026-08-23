# Acceptance evidence

Evidence date: 2026-08-24. Environment: macOS arm64, Node.js 25.7.0, pnpm 10.20.0.

This document holds the current acceptance status: the latest deterministic gates, coverage,
Chromium scenarios, simulation corpus, live ACP adapters, and player-context isolation. Dated
per-feature run narratives live under `docs/acceptance/archive/`; see the archive index at the end.

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

## Acceptance archive

Dated per-feature run narratives are retained under `docs/acceptance/archive/`.

- [2026-08-23 to 2026-08-24](acceptance/archive/2026-08/23-24.md)
