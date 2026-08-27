# ACP package

`@agentwolf/acp` provides Agent-client-protocol primitives independent of Werewolf rules and Match
persistence.

## Responsibilities

- Built-in Trae, Codex, Claude, and custom Agent Tool definitions.
- ACP stdio process startup, initialization, Session creation/resume, updates, and close.
- Provider-specific game-only launch policies and sandbox capability declarations.
- Generic delivery-ledger types and uncertain-delivery errors.
- Process-group supervision and bounded shutdown integration.

The Match-level lifecycle is described in
[ACP Session runtime architecture](../../docs/architecture/acp-session-runtime.md).

## Boundaries

This package knows ACP protocol and process semantics, but not game phases, Roles, visibility,
repositories, accepted actions, or Match recovery policy. The server supplies the workspace, MCP
endpoint, selected model/configuration, durable Session ID, and delivery decisions.

Provider adapters must preserve one logical behavior: create once, resume the supplied Session ID,
stream ordered updates, and report final completion or transport failure. They may differ only in
launch/configuration mechanics advertised by that provider.

## Failure behavior

Protocol close is bounded. Process supervision escalates termination through the owning process
group. Transport uncertainty is reported to the server rather than hidden by creating another
Session or replaying history.

Tests use fake ACP processes for deterministic protocol behavior; live adapter smokes remain
credentialed and separate from keyless CI.
