# Trajectory and simulation architecture

## Responsibility

This module records every ACP turn for audit, exposes secret-safe developer inspection, verifies
semantic delivery boundaries, and turns reviewed real-Match behavior into deterministic offline
regression fixtures.

Trajectory is diagnostic state outside the game event log. Simulation fixtures are compact reviewed
oracles, not copies of production databases or raw model conversations.

## Trajectory model

A trajectory Turn begins with one delivery attempt and owns its Match, player, durable Session
generation, phase, action type, acknowledged event range, attempt, timing, outcome, and context
usage. Stable Records inside it represent Prompt, reasoning, message, tool, permission, accepted
action, usage, diagnostic, lifecycle, and error data.

Stream records merge by protocol channel and ID; tool state merges by tool-call ID. Text deltas append
in protocol order without content-based deduplication. Speech records project through the same
canonical normalization used by the engine.

Before SQLite persistence, secret-key fields, credentials, ACP metadata, environment values, and
connection material are removed. Bounded content retains an explicit truncation marker. The exact
Prompt sent remains immutable.

## Read and audit surfaces

Trajectory collection is active in every startup mode. HTTP, WebSocket, configuration, and per-Match
developer actions exist only when the server starts in loopback developer mode.

A monotonic trajectory revision supports catch-up and live upserts. Reads page Turns first and load
records only for referenced Turn IDs. Persistence skips live-delta normalization when a Match has no
trajectory subscriber.

Player diagnostics combine the immutable non-secret Session launch snapshot with current delivery
and usage state. The Web inspector keeps player diagnostics and individual Record detail as separate
modes.

The audit service reconstructs the engine at each Turn's `toSequence` and checks Prompt cardinality,
visibility-safe ranges, actor/action boundaries, delivery ownership, acknowledgement, continuation,
accepted-action reconciliation, and bootstrap context budget. It never compares historical Prompt
text with current templates.

## Simulation capture

An ended or paused Match with settled trajectory Turns can produce a candidate capture. Capture reads
the immutable board, speech limit, event log, normalized Turns, accepted actions, completion order,
delivery outcomes, and relevant playback controls.

Canonicalization replaces Match, board, Profile, Session, delivery, name, time, and path identifiers.
Raw Prompts, reasoning, tool output, credentials, diagnostics, runtime paths, postgame rows, and
postgame Turns do not enter committed fixtures. Local candidate provenance retains only source Match
identity and capture time.

Candidates live under `.agentwolf/simulations/inbox` with the complete event trace for review.
Approval is non-overwriting and writes a compact versioned fixture under the server test corpus with
decisions, structural context, reviewed event order, semantic digest, and terminal checkpoints.

CLI and browser review call the same `simulation-workflow` service for loading, normalization,
validation, warning acknowledgement, and approval. Browser routes accept repository-owned candidate
IDs rather than unrestricted paths.

## Deterministic runners

The engine runner creates a fresh rule engine and resubmits captured decisions. The orchestration
runner uses in-memory persistence and deterministic fake Sessions through the production Match
runtime and Action Mailbox.

Sequential replay asks the current engine for the active actor before supplying that player's next
recorded action. Parallel replay requires the complete captured actor barrier and preserves recorded
completion order. Both runners verify the reviewed event oracle; orchestration additionally checks
Prompt boundaries, acknowledgements, recovery, restart reconstruction, and playback outcomes.

A stable fixture-and-variant seed identifies each run. Repeating a fixture and variant must produce
identical canonical output.
