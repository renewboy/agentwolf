# Agent Note: Deterministic simulation corpus

Status: implemented

## Problem

Unit tests and event-log replay cannot prove that current orchestration still prompts the right
players, honors parallel barriers, recovers delivery, and reaches reviewed user-visible game
semantics from real Match decisions.

## Decision

Ended or paused Matches may produce sanitized local candidates. Review and approval create compact,
versioned fixtures containing the immutable board, player decisions, actor barriers, delivery
outcomes, semantic event oracle, and terminal checkpoints without raw Prompt or secret material.

Every approved fixture runs through two deterministic paths: a fresh game-engine runner and an
in-memory production Match-runtime runner with fake Sessions. Sequential replay asks the engine for
the current actor; parallel replay requires the complete captured barrier. Stable fixture/variant
seeds cover completion order, recovery, restart, and playback outcomes.

CLI and browser workflows call the same simulation service. Candidate approval never overwrites an
existing fixture or mutates the source Match. The current design is documented in
[Trajectory and simulation](../../../../docs/architecture/trajectory-and-simulation.md).

## Alternatives considered

**Replay the captured event log as the test.** Reapplying old events proves reducers, not that the
current engine and orchestration generate equivalent behavior.

**Use only the game-engine runner.** This misses delivery cursors, Session behavior, action barriers,
playback holds, and restart recovery.

**Commit raw production captures.** Raw identifiers, Prompts, reasoning, diagnostics, and credentials
are unnecessary for deterministic regression and unsafe as fixtures.

## Consequences

Reviewed real-Match behavior becomes a keyless regression corpus across rule and orchestration
layers. Fixture changes require explicit review and preserve a compact semantic oracle rather than a
production transcript.
