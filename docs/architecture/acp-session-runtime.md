# ACP Session runtime architecture

## Responsibility

This module owns Agent process startup, ACP initialization, one durable logical Session per Match
seat, model configuration, streamed updates, structured action transport, direct speech capture,
delivery acknowledgement, recovery, and bounded process shutdown.

[`packages/acp`](../../packages/acp/README.md) provides generic protocol/process primitives.
[`apps/server`](../../apps/server/README.md) binds them to a Match, player token, repository, and
action expectation.

## Boundaries

- Process lifetime and logical Session lifetime are independent.
- The server owns Match delivery cursors and accepted-action durability; an ACP provider owns its
  Session history.
- Structured actions are accepted only through the player-bound MCP action gateway.
- Natural speech comes from the ACP response stream and final response, not a normal action tool.
- A transport failure may reconnect one player only; it never replaces every Session.

## Session creation and configuration

Each seat reserves a durable binding before process launch. The supervisor starts one configured ACP
stdio process, initializes capabilities, requires `session.resume`, and calls `session/new` exactly
once with the seat workspace and player-bound MCP endpoint. The returned Session ID is persisted
before the foundation Prompt.

The immutable launch snapshot records the selected Agent Tool, command, model, optional reasoning
effort, and non-secret connection configuration. After creation or resume, the runtime applies the
Profile model and then a selected advertised reasoning value. An omitted reasoning value preserves
the provider default.

Provider launch policies isolate game Sessions from ambient configuration. Trae, Codex, Claude, and
custom ACP adapters share the logical contract while using provider-specific process arguments and
sandbox setup.

## Delivery ledger

A Prompt envelope has a visible event range and is persisted in-flight before `session/prompt`.
Stream updates build trajectory records. A final ACP response acknowledges the range. The next
delivery starts after the per-player acknowledged cursor and contains only newly visible facts.

The action gateway validates an MCP call against the active expectation before mailbox acceptance.
A valid action is durable before the tool receipt returns. A schema- or rule-invalid call returns a
failed tool result inside the same turn and leaves the expectation open for correction.

Parallel-stage actions remain sealed in the mailbox until every eligible ACP turn settles. The Match
runtime submits them to the engine in deterministic seat order.

## Direct speech

Speech capture separates clean natural response text from ACP role changes, knowledge-tool output,
and structured tool traffic. A knowledge lookup may finish before speech starts. Once clean speech
begins, later tool output cannot enter the public stream or Match event.

Visible chunks stream to the browser. The final response supplies canonical text and commits through
the same Match gateway. Known Player IDs are converted to public references; an unknown `player-N`
token rejects the speech for correction.

## Recovery

An uncertain timeout, process exit, or transport error receives one automatic attempt per player and
phase. A healthy connection continues in place; otherwise the supervisor starts another process and
calls `session/resume` with the persisted ID, current workspace, and refreshed MCP authorization.

The uncertain delivery range advances once. The same Session then receives a compact current-stage
continuation. A previously accepted pending action is consumed without another Prompt or submission.
Every other player's process, Session, and cursor remains unchanged.

A repeated failure, missing binding, unsupported resume capability, or resume failure pauses the
Match for operator action. Recovery never calls `session/new`, sends another foundation, or silently
replaces the logical Session.

Server restart reconstructs the engine from events, loads every binding, resumes the original
Session IDs, and continues from each acknowledged cursor. Postgame review keeps these same Sessions
until review completes or is skipped.

## Process supervision

On macOS and Linux, each ACP command runs in a guardian-owned process group. The guardian relays
stdio, observes the AgentWolf parent, and terminates descendants if that parent exits or dies. Normal
shutdown bounds protocol close, then escalates the process group from TERM to KILL.
