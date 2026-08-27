# Contracts package

`@agentwolf/contracts` is the wire and persistence vocabulary shared by the engine, assets, server,
and Web client. It contains branded identifiers, Zod schemas, and inferred TypeScript types.

## Responsibilities

- Player, Match, board, Profile, Tool, Character, plugin, and runtime identifiers.
- Structured player actions and action expectations.
- Domain event envelopes and visibility descriptors.
- REST and WebSocket request/response DTOs.
- Settings, postgame, trajectory, simulation, and Match snapshot schemas.

Every value crossing JSON, configuration, database JSON, process, or browser boundaries is parsed by
its owning schema. Same-process code consumes the inferred type after that parse.

## Boundaries

Contracts contains no rule evaluation, IO, assets, server orchestration, or browser behavior. A type
belongs here when multiple packages exchange it as a stable value; package-private state remains in
its owning package.

Identifiers remain branded across package boundaries. Open plugin identifiers use validated branded
strings; closed protocol unions use exhaustive switches in consumers.

## Change rules

- Add or change the schema before changing a server route, Web client, event payload, action, or
  durable snapshot that uses it.
- Give stored and wire changes explicit compatibility or migration handling at their owner.
- Keep schemas strict enough to reject unknown user/wire input without adding redundant validation
  inside already typed same-process calls.
- Add contract tests at producer/consumer boundaries; do not maintain a parallel field catalog in
  Markdown.

The [architecture index](../../docs/architecture.md) routes cross-package design. Exact exports are
defined by `src/index.ts` and the source schemas.
