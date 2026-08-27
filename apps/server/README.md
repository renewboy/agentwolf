# AgentWolf server

`@agentwolf/server` is the application composition root. It connects Fastify, SQLite, the
deterministic engine, Prompt assets, ACP player Sessions, MCP actions, live projections, postgame
review, trajectory, and simulation.

## Responsibilities

- REST and WebSocket route assembly and schema validation.
- Agent Tool/Profile, Character, board, settings, and Match catalogs.
- Immutable Match setup, active runtime orchestration, restore, pause, continue, and delete.
- SQLite schema and repositories for events, Session bindings, delivery, review, and developer data.
- Visibility-safe view projection and live connection coordination.
- Player-bound MCP action transport, Prompt context adaptation, and Session recovery.
- Trajectory capture/audit and simulation review/approval workflows.

Cross-package design is split across the [architecture modules](../../docs/architecture.md).

## Ownership map

- `app.ts`: HTTP and WebSocket assembly.
- `repository.ts` and focused repositories: durable SQLite access.
- `match-manager.ts`: Match creation, lookup, restore, and deletion.
- `match-runtime.ts`: live turn orchestration and engine/action boundaries.
- `projector.ts`: server-owned visibility-safe DTOs.
- `mcp.ts`: player-bound structured action transport.
- `player-runtime.ts`: one logical Session's delivery and recovery.
- `postgame-review-coordinator.ts`: review countdown, sheets, aggregation, and reflections.
- `trajectory*`: capture, service, redaction, projection, and semantic audit.
- `simulation*`: candidate capture, runners, workflow, and fixture approval.

Keep new behavior with the narrowest existing owner. Game rules stay in game-engine, generic ACP
process behavior stays in acp, schemas stay in contracts, and model/UI presentation stays in assets.

## External boundaries

Every route parses request and response schemas from contracts. SQLite JSON is parsed at repository
boundaries. Browser DTOs contain no hidden fields. Developer HTTP/WebSocket routes are registered
only in loopback developer mode.

Database changes include a forward migration and migration coverage. Runtime recovery reconstructs
the engine from events and resumes persisted Session IDs; it never invents replacement Match state.

## Verification

Use in-memory repositories and fake ACP processes for unit/integration tests unless a test is
explicitly under `tests/live`. Route fields receive integration coverage; cross-package behavior runs
through the root gates. User-visible flows additionally receive browser acceptance.
