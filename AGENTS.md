# AgentWolf repository guide

AgentWolf is a TypeScript workspace for running Werewolf matches between long-lived ACP Agent
sessions. This file is the repository map; detailed product and architecture facts live with their
owning documents and packages.

## Instruction scope

- Before editing a file, read the closest `AGENTS.md` and follow its parent links.
- Root rules apply repository-wide. A closer `AGENTS.md` may add or override subtree rules.
- Every nested `AGENTS.md` links to its closest ancestor, and every `AGENTS.md` stays within 200
  lines.
- Preserve unrelated worktree changes. Review the applicable instructions after editing and update
  them only when durable guidance changed.

## Reading routes

- MUST Read [artifacts_rules.md](artifacts_rules.md) before changing any durable document, prompt, runtime
  skill, tool description, UI copy, role copy, or public announcement.
- Documentation structure and prose: [documentation standard](docs/AGENTS.md).
- Product behavior and V1 scope: [product](docs/product.md).
- System map and module routing: [architecture index](docs/architecture.md).
- Game kernel, Rulesets, Roles, phases, effects, and victory:
  [game runtime](docs/architecture/game-runtime.md).
- Prompt bundles, visible model facts, and player context:
  [Prompt and context](docs/architecture/prompt-and-context.md).
- ACP processes, durable Sessions, actions, and recovery:
  [ACP Session runtime](docs/architecture/acp-session-runtime.md).
- Visibility, barriers, speech delivery, playback, and reconnect:
  [information synchronization](docs/architecture/information-synchronization.md).
- Match setup, snapshots, persistence, deletion, and postgame review:
  [Match lifecycle](docs/architecture/match-lifecycle.md).
- Trajectory capture, audit, and deterministic simulation:
  [trajectory and simulation](docs/architecture/trajectory-and-simulation.md).
- Browser ownership and projected live state: [Web client](docs/architecture/web-client.md).
- Visual and interaction direction: [frontend](docs/frontend.md).
- Test policy and commands: [testing](docs/testing.md).
- Game-rule source baseline: [game rules](docs/reference/game-rules.md).
- Playable Role work: [Role development Skill](.agents/skills/agentwolf-role-development/SKILL.md).

Read only the routes relevant to the change. Do not load every document by default.

## Workspace map

- `packages/contracts`: branded IDs, wire schemas, events, actions, settings, and view DTOs.
- `packages/game-engine`: deterministic kernel, versioned Rulesets, plugins, boards, and replay.
- `packages/acp`: ACP process, protocol, Session, stream, and transport primitives.
- `packages/assets`: model Prompt bundles, player Skills, localized copy, Characters, and styles.
- `apps/server`: Fastify, SQLite, Match orchestration, projection, MCP, recovery, and developer tools.
- `apps/web`: React setup, settings, lobby, spectator, and developer UI.
- `scripts`: repository checks, generators, development entrypoints, and CI helpers.
- `.agentwolf/`: runtime-only databases, generated Skills, workspaces, Sessions, and logs.

Package-local contracts live in each package or app README. Cross-package design lives in the
architecture module documents; do not duplicate it in both places.

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

- `contracts` and `game-engine` never import server, Web, ACP, filesystem, network, or asset code.
- The server filters every view before serialization; the browser never receives hidden fields.
- Add an executable architecture check for a mechanically enforceable dependency or privacy rule.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test:coverage
pnpm build
pnpm check
pnpm test:e2e
pnpm dev
```

Use focused tests while iterating. Run `pnpm check` for cross-layer changes and before handoff;
run `pnpm test:e2e` when visible browser behavior changes.

## Source rules

- Use ESM, strict TypeScript, branded cross-boundary IDs, Zod at wire/config/user-input boundaries,
  and exhaustive switches for closed unions.
- Do not interpolate shell strings for subprocess execution.
- Player Skill sources belong in `packages/assets/player-skills`; repository-root `.agents/skills`
  contains coding-agent Skills only.
- Runtime secrets, Skill material, and hidden game state never enter browser bundles or public events.

## Runtime invariants

- Rules and Roles are versioned plugins; the kernel contains no concrete Role or Ability branches.
- Game state is event-sourced and deterministically replayable.
- Every seat owns one durable logical ACP Session for the complete Match and postgame lifecycle.
- Structured actions enter through the action gateway; natural speech streams and commits through
  the same authoritative Match runtime.
- Parallel stages use one frozen barrier snapshot and reveal results only after eligible turns settle.
- Server projection owns secrecy; model Prompt rendering consumes already-filtered visible facts.
- Character cards affect public expression only and remain outside game rules and durable events.

The linked architecture modules own the exact contracts behind these summary invariants.

## Tests and runtime data

- Add unit coverage for rules, integration coverage for protocol/projection boundaries, and browser
  coverage for visible interaction flows.
- Assert protocol or external state, not an Agent's self-report.
- Tests create unique records and remove them in teardown; never reuse or mutate user-owned data.
- Keep runtime data under `.agentwolf/`; never commit Sessions, credentials, Match logs, generated
  speech, screenshots, or recordings.
- Store secret references by environment-variable name, never by value.

## Decisions and completion

- Major, hard-to-reverse work starts as a proposed Agent Note under `.agents/notes`; local fixes and
  ordinary feature work do not require a durable decision record.
- On delivery, rewrite a proposed Note as present-tense implemented reality. Do not retain execution
  checklists or dated test totals in durable documentation.
- Update only the document that owns a changed public fact or cross-package contract. Adding a test,
  implementation branch, Role, or screen detail does not by itself require a standing-doc edit.
- Keep generated catalogs generated, update source and owning tests together, and report concrete
  verification in the handoff.
