# Agent Note: Unified product coverage and modular browser tests

Status: implemented

## Problem

Aggregate coverage allows well-tested modules to hide an untested production file, and a test gate
that omits the Web client cannot enforce one repository-wide quality standard. Browser scenarios
also need explicit domain ownership and resource isolation so they remain independently selectable
and safe to run in parallel.

## Decision

Node and Web tests are projects of one Vitest configuration. The unified coverage gate measures
product runtime source under `packages/*/src`, `apps/server/src`, and `apps/web/src` and enforces 80
percent statements, branches, functions, and lines for every included file.

Coverage excludes only behavior-free package barrels, CLI and browser launchers, error declarations,
and the Web GSAP forwarding boundary. The report uses 50 and 80 percent watermarks and emits terminal,
JSON summary, and HTML output.

## Web test layer

Web tests run in jsdom with React Testing Library, user-event, and jest-dom. They own API transport,
pure presentation logic, reusable keyboard and focus interactions, hooks, page states, and component
behavior. Playwright owns real browser layout, scrolling, WebSocket proxying, speech playback
integration, and animation cleanup.

Node, Web, and E2E test sources share the repository test TypeScript configuration. Focused Web
commands are available without removing Web tests from the unified repository gate.

## E2E ownership and isolation

Playwright specifications are split by product domain. Parallel Chromium workers use unique runtime
namespaces and a shared resource fixture that deletes Matches, boards, Characters, Profiles, and
Tools in dependency order. Settings and Profile-order scenarios run in a dependent serial project so
global state never races the parallel modules.

Match DTO, speech, real-time connection, UI, and resource helpers live under `e2e/fixtures`. The E2E
server uses an in-memory database, and architecture checks enforce a 500-line limit for every
specification.

## Consequences

Strong modules cannot hide an untested production file. Frontend logic participates in the same
coverage and type gates as server and package code. Browser scenarios remain independently
selectable, while global mutations have explicit scheduling rather than file-order dependencies.

Coverage increases must come from owned behavior and boundary cases. New exclusions and coverage
ignore directives are not an accepted way to satisfy the gate.

## Alternatives considered

**Aggregate-only thresholds.** This does not make each production file accountable and permits red
or yellow files inside a passing module total.

**Playwright-driven Web source coverage.** This couples the unit gate to dev servers and source-map
collection while encouraging slow browser scenarios for local component and hook branches.

**Physical E2E splitting with shared mutable state.** Separate filenames without worker namespaces,
dependency-ordered cleanup, and serialized global mutations still preserve order dependence.
