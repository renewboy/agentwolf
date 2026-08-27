# Agent Note: Durable player ACP Sessions

Status: implemented

## Problem

Treating an Agent process as the player Session causes timeouts and server restarts to lose provider
history, create duplicate foundations, replay acknowledged facts, and disturb players whose
connections were healthy.

## Decision

Each Match seat calls `session/new` once and persists the returned logical Session ID with its launch
snapshot, bootstrap state, acknowledged event cursor, and accepted structured action. A process may
restart, but it reconnects through `session/resume` using that exact ID, current player workspace,
and refreshed MCP authorization.

One uncertain delivery per player and phase may continue the healthy connection or resume that
player's Session. The delivered range advances once, and the Session receives a compact current-stage
continuation. A durable accepted action is reconciled without another Prompt or submission. Repeated
failure or failed resume pauses the Match.

Postgame review retains the same seat Sessions until completion or skip. The exact lifecycle is
defined in [ACP Session runtime](../../../../docs/architecture/acp-session-runtime.md).

## Alternatives considered

**Create replacement Sessions after transport failure.** This loses provider history, duplicates
foundations, and violates one player/one Session identity.

**Replay complete visible history into a new Session.** AgentWolf already owns event delivery cursors;
full replay duplicates known facts and cannot reconstruct provider-local reasoning state.

**Restart every player together.** A player-local transport failure must not change healthy players'
processes, cursors, or action state.

## Consequences

Logical Session identity survives process and server lifetime. Recovery depends on provider resume
support and fails closed when it is unavailable. Session bindings and accepted actions are operational
durable state rather than diagnostics.
