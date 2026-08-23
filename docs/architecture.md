# AgentWolf architecture

## Runtime map

```text
Web spectator and setup UI
          |
          v
Fastify API and view projector ---- SQLite event/profile repository
          |
          +---- Match orchestrator ---- Action gateway ---- Player MCP tools
          |             |
          |             +---- ACP session supervisor ---- ACP agent processes
          |
          +---- Rule engine ---- role registry / phase graph / resolution agenda
```

## Package direction

```text
contracts  <- game-engine
    ^             ^
    |             |
 assets          acp
    ^             ^
    +------ server ------+
              ^
              |
             web
```

`contracts` owns branded identifiers, API schemas, event envelopes, action schemas, and view DTOs. `game-engine` owns deterministic state transitions and cannot perform IO. `acp` owns process and protocol lifecycle but does not know game rules. `assets` owns prompts, copy, nickname words, design tokens, and CSS. `server` composes the packages, persistence, orchestration, MCP endpoint, REST, and live streams. `web` consumes projected DTOs only.

## Rules and roles

A board manifest selects a phase graph, role IDs, and policy modules. A role is a concrete class implementing role metadata plus event handlers and action providers. Rule modules register phase transitions, action validators, resolution handlers, visibility rules, and victory evaluators.

Submitted actions become immutable intents. The resolution agenda orders effects by named priority and stable sequence:

1. target mapping and redirection;
2. action prevention and ability state;
3. protection, attack, antidote, and poison effects;
4. collision policies;
5. pending deaths;
6. death prevention and replacement;
7. death triggers and chained effects;
8. badge transfer and public announcements;
9. victory evaluation after the agenda reaches quiescence.

Future roles use these extension points:

- Magician registers temporary target mappings.
- Miracle Merchant grants an ability instance with its own usage state.
- Cupid registers a relationship and a chained-death handler plus dynamic allegiance.
- Piper registers status markers and an independent victory evaluator.

## Events, visibility, and synchronization

Every event receives a match-local monotonic sequence and a visibility descriptor: public, god-only, player set, or faction. State is reduced from the event log. View projectors filter before serialization.

Each player session stores a delivery cursor. A prompt envelope contains only visible events after that cursor. The envelope is marked in-flight before `session/prompt`; the cursor advances only after a final ACP response. Failure after dispatch produces an uncertain-delivery pause with no automatic retry.

The live WebSocket accepts view changes and speech-playback controls as validated client messages. One connection may own automatic playback for a Match. Visible committed speeches continue through a sequence-ordered browser queue; the final speech in a sequential speech stage leaves the engine at an explicit action boundary until that connection reports completion or skip. The playback coordinator is runtime-only presentation state and uses the committed event sequence as its idempotency key. Hidden events never create a hold for the controlling view, and owner disconnect releases any pending boundary.

Operator recovery keeps a live ACP session when available. The uncertain attempt is abandoned at its delivered sequence so previous context is not resent, then the current action is prompted again. After process restart, the rule engine is restored from the event log and replacement ACP sessions receive one foundation containing their own role, the public board composition, the complete roster, their permitted faction knowledge, and their visible match history before incremental delivery resumes. A foundation's source history must cover its acknowledged cursor.

An uncertain ACP transport failure receives one automatic recovery attempt per player and phase. The engine remains running while failed sessions are replaced; a second failure pauses for operator action. The web client preserves its current snapshot across transient WebSocket closure, refreshes over HTTP, and reconnects with bounded backoff. Ended snapshots close the live channel and settle locally. Unknown or deleted Match IDs return 404 and enter a non-retrying unavailable state.

Speech turns deliver preceding visible speech to the active player. Vote prompts are created from one barrier snapshot after all speeches are committed, so every eligible voter receives the complete speech round before any vote is accepted. The same barrier rule applies to sheriff voting and phase transitions.

The complete phase matrix is defined in [Information synchronization](information-sync.md).

## ACP and action transport

An Agent Tool is a command, arguments, environment allowlist, initial mode, and capability hints. The settings API discovers its current models and modes from the ACP `session/new` response before an Agent Profile binds the tool to one advertised model and its connection options.

For each seat, the supervisor starts one stdio ACP process, initializes the connection, creates one session with the seat workspace and AgentWolf MCP server, applies advertised model and mode configuration, then retains the returned session ID for the match lifetime. ACP permission requests are approved only when their structured MCP server and tool identity matches one of the five AgentWolf action tools. `session/update` is the streaming source; the final `session/prompt` response closes the turn.

The MCP server is bound to one player token. It exposes speech, vote, night action, sheriff action, and skill trigger tools. The action gateway validates actor, phase, ability, target Player IDs, cardinality, and single-submission rules. Acceptance stores the action inside the current phase barrier and broadcasts a private submitted Session status. The engine appends immutable action events in seat order after every eligible ACP turn settles.
