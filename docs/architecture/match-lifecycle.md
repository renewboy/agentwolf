# Match lifecycle architecture

## Responsibility

This module owns the transition from mutable setup catalogs to one immutable Match, durable Match
records, runtime creation and restore, pause/continue/delete operations, terminal result, and
postgame review.

The server composes contracts, game engine, assets, ACP Sessions, SQLite repositories, and live
projection. Game rules remain in the engine; setup presentation remains outside domain events.

## Catalogs and setup

Agent Tools describe an ACP command, arguments, environment-variable allowlist, initial mode, and
capability hints. Agent Profiles bind one Tool to a selected advertised model, optional reasoning
effort, and non-secret connection options. Profiles have one explicit persisted order.

The board catalog combines read-only built-in boards with SQLite custom boards. A custom board owns
Role counts, sheriff and victory policies, and nullable per-seat Agent Profile and Character defaults.
Referenced Profiles or Characters cannot be deleted.

The Character catalog combines asset-backed built-ins with editable SQLite cards and managed local
portrait files. Characters control public presentation and expression only; they never change game
Role, capabilities, reasoning quality, victory, or event state.

Match creation resolves seat values in this order:

1. explicit Match request;
2. board seat default;
3. first ordered Agent Profile, or no Character.

Nicknames remain editable Match identity and must be unique after trimming. Reusing one Profile or
Character across seats is valid.

## Immutable setup snapshot

Creation stores the selected board as a schema-two snapshot containing its Ruleset lock and
fingerprint, resolved policies, Role composition, revision, Agent Profile defaults, Character
defaults, and immutable per-seat Character cards. It also snapshots the global speech-length
preference.

Later catalog edits do not change an existing Match. The domain event log contains no mutable catalog
reference and no Character card data. Uploaded portrait asset IDs remain stable for historical
snapshots.

## Runtime and persistence

`MatchManager` resolves setup, creates or restores the deterministic engine, and owns active Match
runtimes. `match-runtime` coordinates engine expectations, ACP player turns, action barriers, speech
playback boundaries, live snapshots, and terminal handoff.

SQLite stores Match metadata, immutable setup, append-only events, delivery ledgers, Session
bindings, accepted actions, review state, and developer records in their owning repositories. A
server restart rebuilds engine state from events and resumes durable player Sessions.

A paused Match retains its event state and exposes continue and delete actions. Continue resumes the
same phase and Sessions. Delete closes the runtime, removes all database-owned Match records, and
removes only that Match's player workspace under the configured data directory.

## Postgame review

Postgame review is server orchestration outside the deterministic game event log. The victory
registry returns explicit winning Player IDs; review freezes that set for MVP eligibility and uses
its complement for SVP without concrete Role or faction branches.

For a review-enabled Match, terminal orchestration creates a ten-second countdown before the first
ended snapshot. A spectator may start immediately or skip during countdown; expiry starts review
automatically, and a started review cannot be skipped.

Every seat keeps its original logical ACP Session and submits one immutable sheet containing MVP and
SVP nominees plus five integer ratings for every other player. A sheet is durable before its tool
receipt and projects to the browser immediately, but it never enters another reviewer's Prompt.

After every sheet exists, the aggregate computes arithmetic means and resolves awards by vote count,
exact score total, then a Match-stable draw. Raw sheets and aggregate output remain separate durable
records.

Reflections run sequentially through the shared direct-speech and playback path. Review recovery
resumes only unfinished work on original Session IDs. Repeated transport failure pauses review;
completed or skipped review closes the Sessions and completes the Match lifecycle.

Postgame records remain separate from `match_events`. Simulation capture excludes review rows and
postgame trajectory turns so reviewed game-event fixtures retain `match.ended` as their terminal
oracle.
