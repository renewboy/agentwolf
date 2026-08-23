# AgentWolf repository guide

AgentWolf is a TypeScript workspace for running Werewolf matches between long-lived ACP Agent sessions. Read this file first, then open only the source that owns the area being changed.

## Required reading

- Read `artifacts_rules.md` before changing any durable document, prompt, runtime skill, tool description, UI copy, role copy, or public announcement.
- Read `docs/product.md` before changing product behavior or V1 scope.
- Read `docs/architecture.md` before changing packages, dependency direction, persistence, runtime ownership, or server/web boundaries.
- Read `docs/research/preflight.md` before changing game rules or role behavior.
- Read `docs/information-sync.md` before changing visibility, phase delivery, voting barriers, speech order, or recovery semantics.
- Read `docs/testing.md` before changing test infrastructure, coverage, fixtures, or acceptance evidence.
- Read `docs/frontend.md` before changing layout, interaction controls, motion, responsive behavior, or visual tokens.
- Read `.agents/skills/agentwolf-player/SKILL.md` before changing the player-agent workflow.

## Workspace map

- `packages/contracts`: branded IDs, API schemas, event envelopes, action schemas, Agent schemas, and view DTOs.
- `packages/game-engine`: deterministic boards, phase graph, roles, resolution, victory, replay, and visibility. It performs no IO.
- `packages/acp`: Agent tool catalog, ACP process/session lifecycle, streamed updates, and delivery ledgers.
- `packages/assets`: prompts, localized copy, narration, nickname words, design tokens, and all CSS.
- `apps/server`: Fastify routes, SQLite repositories, orchestration, MCP tools, projections, live streams, and recovery.
- `apps/web`: React application, validated API client, setup, settings, lobby, and spectator UI.
- `scripts`: architecture, artifact, documentation, skill, formatting, coverage, and CI gates.
- `.agentwolf/`: runtime-only databases, workspaces, sessions, logs, and local acceptance evidence.

## Dependency direction

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

- `contracts` and `game-engine` never import server, web, ACP, filesystem, network, or asset code.
- The server filters every view before serialization. The browser never receives hidden fields and hides them locally.
- Add an executable architecture rule whenever a dependency boundary is mechanically checkable.

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

Use focused tests while iterating. Run `pnpm check` for cross-layer changes and before handoff, then run `pnpm test:e2e` for user-visible flows.

## TypeScript and source rules

- Use ESM, strict TypeScript, branded cross-boundary IDs, Zod at wire/config/user-input boundaries, and exhaustive switches for closed unions.
- Do not interpolate shell strings for subprocess execution.
- Prompts, copy, CSS, colors, nicknames, and reusable user/model-facing text belong in `packages/assets`.
- Web components contain no inline style props, raw color literals, emoji icons, or unregistered visible copy.
- Runtime skill and secret material never enters browser bundles or durable match events.

## Runtime invariants

- Roles are concrete classes registered through the role registry. Rule modules and policies own phase flow, actions, visibility, resolution, and victory.
- Every game change is an append-only domain event, and model-visible state is reconstructable from events.
- Each seat owns one ACP process and one ACP session for the match lifetime. Delivery uses a per-player acknowledged event cursor.
- A foundation source history covers its cursor and renders every visible bootstrap fact exactly once, including private faction membership.
- One uncertain ACP transport failure per player and phase may replace failed sessions and retry from visible history. A repeated failure pauses for operator action.
- Structured actions enter through the action gateway. Natural speech streams, is sanitized, and commits through the same gateway.
- Player IDs are valid in prompts and structured actions. Public speech and last words contain nicknames or seats, never `player-N` identifiers.
- Parallel vote/action stages use one barrier snapshot and publish results only after all eligible turns settle.
- Developer trace mode remains a reserved V1 surface with no data endpoint.

## Frontend interaction rules

- Native `<select>` controls are forbidden in `apps/web`. Use the project `GameSelect` so the popup, keyboard behavior, scrolling, and focus match the game UI.
- `window.alert`, `window.confirm`, and `window.prompt` are forbidden. Destructive actions use `ConfirmDialog` with an application-styled backdrop, initial cancel focus, Escape handling, focus trapping, and focus restoration.
- Modal and listbox layers must survive scroll containers, safe areas, mobile viewports, keyboard input, and reduced-motion mode.
- The match screen stays at `100dvh`; the document does not scroll and the center feed owns its scroll range.
- Waiting states remain visibly alive without inventing progress or reasoning. Continuous motion uses transform/opacity and pauses for reduced motion.

## Test and runtime-data rules

- Add unit coverage for rules, integration coverage for protocol/projection boundaries, and browser coverage for visible interaction flows.
- Assert protocol or external state, not an Agent's self-report.
- Tests create uniquely named profiles, tools, and matches and delete them in `finally` or suite teardown. Tests never reuse, rename, or delete user-owned runtime records.
- Browser tests that run against a reusable local server must prove teardown leaves no test Profile, Tool, Match, event, or delivery ledger.
- Keep runtime data under `.agentwolf/`; never commit sessions, credentials, match logs, generated speech, screenshots, or browser recordings.
- Store secret references by environment-variable name. Never persist secret values.

## Documentation and plan lifecycle

- Durable documents describe current implemented behavior. One fact has one owning document; other documents link to it.
- Keep architecture, interface specification, operations, decisions, execution plans, incidents, acceptance evidence, and roadmaps in separate documents.
- A non-trivial implementation plan lives under `docs/plans/` while work is active.
- When every required change and acceptance check is complete, move the plan to `docs/plans/completed/<slug>.md`.
- Every completed plan contains `Goal`, `Completed work`, and `Completion evidence` and contains no pending checklist, TODO, or future scope.

## Change completion

1. Update source, assets, and owning tests together.
2. Add a mechanical invariant for every enforceable review rule.
3. Update current-state documentation for changed public behavior or boundaries.
4. Move the finished execution plan into `docs/plans/completed/`.
5. Run focused tests, `pnpm check`, and user-visible browser acceptance.
6. Record current acceptance evidence in `docs/acceptance.md` without committing `.agentwolf/` artifacts.
