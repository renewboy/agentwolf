# Testing and acceptance

Tests prove external behavior and architecture boundaries. They do not substitute Agent self-report,
and this document does not maintain a feature-by-feature coverage inventory.

## Test layers

- The Vitest `node` project owns pure rules, schemas, rendering, normalization, catalogs, ACP
  processes, repositories, services, and protocol integration.
- The Vitest `web` project runs in jsdom with React Testing Library, user-event, and jest-dom. It
  owns browser API clients, pure presentation logic, reusable interactions, hooks, page states, and
  component behavior.
- Property tests own broad deterministic invariants such as legal player counts, event monotonicity,
  replay, and death/action ordering.
- Integration tests own REST/WebSocket contracts, SQLite repositories and migrations, Match runtime,
  ACP protocol fakes, projection, delivery, recovery, postgame, trajectory, and simulation services.
- Contract tests parse shared fixtures at producer and consumer boundaries.
- Simulation corpus tests replay reviewed real-Match decisions through both the game engine and
  production orchestration with deterministic fake Sessions.
- Browser tests own visible workflows, keyboard/focus behavior, responsive containment, live
  reconnect, speech playback, and motion cleanup.
- Optional live smokes own installed ACP adapter behavior, real structured actions, local Skill
  access, and sandbox rejection. They do not run in keyless CI.

Detailed scenarios belong in descriptively named tests and fixtures beside their implementation.

## Commands

```sh
pnpm typecheck
pnpm typecheck:tests
pnpm lint
pnpm test:web
pnpm test:web:coverage
pnpm test:coverage
pnpm build
pnpm check
pnpm test:e2e
pnpm test:simulation
pnpm simulation:check
```

`pnpm check` is the deterministic repository gate: architecture, artifacts, documentation, Skills,
types, lint, formatting, dependency hygiene, duplication, unit/integration coverage, and production
build. It excludes credentialed model calls.

Use focused Vitest or Playwright targets while iterating. Run the complete repository gate for
cross-layer changes and `pnpm test:e2e` for user-visible browser behavior. Run live smokes only when
provider behavior is in scope and credentials are available.

## Coverage contract

`pnpm test:coverage` runs the Node and Web Vitest projects together. Coverage includes product
runtime source under `packages/*/src`, `apps/server/src`, and `apps/web/src`. Repository scripts stay
under their dedicated static and unit checks.

Every included file must reach at least 80 percent statements, branches, functions, and lines. The
report uses 50 and 80 percent watermarks and emits terminal, JSON summary, and HTML output. The only
coverage exclusions are behavior-free package barrels, CLI and browser launchers, error declarations,
and the Web GSAP forwarding boundary. Do not add exclusions, ignore comments, or unreachable fallback
tests to satisfy the threshold.

## Browser suite isolation

Playwright specifications are grouped by product domain and may run independently. Parallel Chromium
workers create Tool, Profile, Character, board, and Match records inside a worker-specific namespace
and remove them in dependency order during teardown. Settings and Profile-order scenarios run in the
dependent `chromium-configuration` project so global mutations do not race parallel scenarios.

The browser server uses an in-memory E2E database. Shared Match DTO, speech, real-time connection,
resource, and cleanup helpers live under `e2e/fixtures`. Architecture checks reject any E2E
specification over 500 lines.

## Test data

- Tests create uniquely named Agent Tools, Profiles, Characters, boards, Matches, and candidates.
- Reusable-server browser tests delete every created record in teardown, including after assertions
  fail, and verify no test event or delivery ledger remains.
- Tests never reuse, rename, delete, or reorder user-owned runtime records.
- Runtime databases, Sessions, generated speech, screenshots, videos, and browser traces remain under
  ignored `.agentwolf/` or test-output directories.
- Approved simulation fixtures contain sanitized structural decisions and reviewed semantic oracles,
  never credentials, raw Prompts, reasoning, tool output, runtime paths, or source Match identity.

## Assertion policy

- Assert the authoritative event, schema, database row, protocol message, projected DTO, rendered UI,
  or process state.
- A test must fail when the owned behavior breaks; avoid assertions against duplicated implementation
  details or another test's summary.
- Visibility tests exercise god, actor, unrelated-player, faction, and closed-eye projections at the
  server boundary before browser presentation.
- Parallel tests freeze one actor barrier and prove no completion-order leak. Recovery tests prove the
  same Session ID and accepted-action reconciliation.
- Model- or user-visible prose changes inspect the actual rendered Prompt or browser artifact rather
  than checking only source-file presence.

## Acceptance evidence

Concrete commands and observed results are reported in the request handoff or CI. Durable Agent Notes
may name stable verification contracts, but the repository does not store per-request completion
plans, dated test totals, or duplicate acceptance summaries.
