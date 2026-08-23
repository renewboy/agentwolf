# Simulation review project-root fix

## Goal

Make browser-triggered simulation review use the configured AgentWolf project root so orchestration replay behaves identically from the workspace root and the server package directory.

## Completed work

- Made the project root a required orchestration simulation input and updated workflow, CLI, corpus, and focused-test callers.
- Used the configured project root when preparing deterministic player workspaces.
- Preserved aggregate runtime initialization details in review failures.
- Added focused coverage for invalid project-root diagnostics.
- Revalidated the latest captured simulation through the package-directory CLI, developer HTTP route, and browser dialog.

## Completion evidence

- `simulation-ended-fdcbb2961d962824` passed with 35 Turns, 180 events, deterministic engine and orchestration results, runner agreement, and no failures or warnings from both `apps/server` and the developer HTTP route.
- The browser dialog displayed all four checks as passed and enabled approval without writing the fixture.
- Ten focused simulation tests passed.
- `pnpm check` passed 80 tests across 26 files, coverage, build, lint, formatting, architecture, artifact, document, and Skill gates.
