# AgentWolf repository guide

AgentWolf is a TypeScript workspace for running Werewolf matches between long-lived ACP Agent sessions. This file defines repo-wide rules; nested `AGENTS.md` files add instructions for their own subtrees.

## Instruction scope

- Before editing any file, locate and read the closest `AGENTS.md` in that file's directory or nearest ancestor, then follow its links to applicable parent instructions. Repeat this for every affected subtree; do not assume the current working directory loaded rules for a different subtree.
- Root instructions apply repo-wide. Nested instructions contain only subtree-specific additions or overrides, and the closest applicable file wins when instructions conflict.
- Every nested `AGENTS.md` links to its closest ancestor `AGENTS.md` with a relative Markdown link so the full instruction chain remains discoverable.
- After changing code, review the closest applicable `AGENTS.md` for drift in responsibilities, commands, boundaries, and conventions. Update it in the same change when durable guidance changed; leave it untouched when it remains accurate.

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

- `packages/contracts`: branded IDs, API schemas, event envelopes, action schemas, Agent and Character schemas, and view DTOs.
- `packages/game-engine`: deterministic kernel, plugin SDK, versioned rulesets, boards, phase composition, resolution, replay, and visibility. It performs no IO.
- `packages/acp`: Agent tool catalog, ACP process/session lifecycle, streamed updates, and delivery ledgers.
- `packages/assets`: prompts, localized copy, narration, Character cards and portraits, nickname words, design tokens, and all CSS.
- `apps/server`: Fastify routes, SQLite repositories, orchestration, MCP tools, projections, live streams, and recovery. See its [local instructions](apps/server/AGENTS.md).
- `apps/web`: React application, validated API client, setup, settings, lobby, and spectator UI. See its [local instructions](apps/web/AGENTS.md).
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
- The server filters every view before serialization; the browser never receives hidden fields or enforces secrecy through local hiding.
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
- Runtime skill and secret material never enters browser bundles or durable match events.

## Runtime invariants

- Roles and system rules are compile-time plugins composed by a versioned Ruleset manifest. The
  kernel contains no concrete Role or Ability IDs. Capabilities authorize shared and dynamic
  abilities; plugin registries own phases, effects, events, queries, triggers, interrupts, and
  victory.
- Every game change is an append-only domain event, and model-visible state is reconstructable from events.
- Schema-two Match board snapshots freeze ruleset and plugin versions, configuration hashes,
  fingerprint, and resolved policies. Restore rejects a mismatched installed fingerprint.
- Each seat completes `session/new` once and owns one durable ACP Session ID for the Match lifetime. ACP processes may restart, but reconnect through `session/resume` with that persisted ID. Delivery uses a per-player acknowledged event cursor.
- A foundation source history covers its cursor and renders every visible bootstrap fact exactly once, including private faction membership.
- One uncertain ACP transport failure per player and phase may continue the existing connection or resume that player's persisted Session ID. Recovery never creates another Session or disturbs another player. A repeated failure pauses for operator action.
- Structured actions enter through the action gateway. Natural speech streams, is sanitized, and commits through the same gateway.
- Player IDs are valid in prompts and structured actions. Public speech and last words contain nicknames or seats, never `player-N` identifiers.
- Parallel vote/action stages use one barrier snapshot and publish results only after all eligible turns settle.
- Character cards are public presentation metadata outside the game engine and domain events. They
  affect expression only; every player retains full reasoning quality, and nicknames remain the
  only natural-language Match identity.
- Trajectory collection is active in every mode; its HTTP and WebSocket read surfaces require loopback developer mode.

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
- Cross-layer, architectural, high-risk, or multi-milestone work requires an implementation plan under `docs/plans/` while work is active.
- Work that requires an implementation plan also requires one request-owned acceptance record. Small scoped requests and localized bug fixes that can be implemented and verified directly require neither document; report their verification in the handoff.
- When every required change and acceptance check is complete, move the plan to `docs/plans/completed/<slug>.md`.
- Every completed plan contains `Goal`, `Completed work`, and `Completion evidence` and contains no pending checklist, TODO, or future scope.

## Change completion

1. Update source, assets, and owning tests together.
2. Add a mechanical invariant for every enforceable review rule.
3. Update current-state documentation for changed public behavior or boundaries.
4. When the work required an execution plan, move the finished plan into `docs/plans/completed/`.
5. Run focused tests, `pnpm check`, and user-visible browser acceptance.
6. When the work required an implementation plan, add one immutable acceptance record at `docs/acceptance/YYYY-MM-DD/HH-MM-SS-<slug>.md` without editing earlier records or committing `.agentwolf/` artifacts.
