# AgentWolf architecture

This document is the system map. Each major runtime module owns its detailed architecture in one
child document; package-local interfaces and limitations live in package and app READMEs.

## Runtime map

```text
Web setup / spectator / developer UI
                 |
                 v
Fastify API + visibility-safe projector ------ SQLite repositories
                 |
                 +---- Match lifecycle and postgame coordination
                 +---- Action gateway and live synchronization
                 +---- ACP Session runtime ---- Agent processes
                 +---- Ruleset catalog -------- deterministic game engine
                 +---- Prompt registry -------- model context assets
                 +---- Trajectory audit ------- simulation runners
```

The deterministic engine performs no IO. The server owns composition, persistence, orchestration,
visibility filtering, and external transports. The browser consumes validated projected DTOs only.

## Package direction

```text
contracts <- game-engine
    ^             ^
    |             |
 assets          acp
    ^             ^
    +------ server ------+
              ^
              |
             web
```

- [`packages/contracts`](../packages/contracts/README.md) owns cross-boundary identifiers and schemas.
- [`packages/game-engine`](../packages/game-engine/README.md) owns deterministic rules and replay.
- [`packages/acp`](../packages/acp/README.md) owns generic ACP protocol and process primitives.
- [`packages/assets`](../packages/assets/README.md) owns Prompt and presentation assets.
- [`apps/server`](../apps/server/README.md) composes runtime modules and IO.
- [`apps/web`](../apps/web/README.md) presents server-projected state.

Architecture checks enforce this dependency direction. A lower layer never imports a higher layer to
obtain presentation, persistence, or orchestration behavior.

## Module architecture

- [Game runtime](architecture/game-runtime.md): Rulesets, plugins, phases, effects, victory, replay.
- [Prompt and player context](architecture/prompt-and-context.md): Prompt bundles, visible facts,
  Skills, and model context.
- [ACP Session runtime](architecture/acp-session-runtime.md): process lifecycle, durable Sessions,
  actions, speech, and recovery.
- [Information synchronization](architecture/information-synchronization.md): event visibility,
  delivery, barriers, playback, reconnect, and terminal state.
- [Match lifecycle](architecture/match-lifecycle.md): setup catalogs, immutable snapshots,
  persistence, restore, deletion, and postgame review.
- [Trajectory and simulation](architecture/trajectory-and-simulation.md): diagnostic capture,
  semantic audit, reviewed fixtures, and deterministic runners.
- [Web client](architecture/web-client.md): validated DTO consumption, browser state ownership,
  role-effect execution, and presentation lifecycle.

## Change routing

- Change a rule, Role extension point, phase, effect, or victory contract: read Game runtime.
- Change model-visible facts, Prompt ownership, or player Skills: read Prompt and player context.
- Change ACP launch, Session, tool, action, direct speech, or recovery: read ACP Session runtime.
- Change visibility, sequencing, parallel collection, playback, or reconnect: read Information
  synchronization.
- Change board/profile/Character snapshots, Match persistence, or postgame: read Match lifecycle.
- Change trajectory, developer mode, audit, capture, or replay corpus: read Trajectory and simulation.
- Change browser state, projection switching, motion execution, or terminal rendering: read Web client.
