# Persistent player ACP Session acceptance

Evidence time: 2026-08-24 14:45:57 +08:00

## Scope

Verified one durable logical ACP Session per Match player, persistent Session bindings,
provider-neutral `session/resume`, current-stage continuation, and durable accepted-action
recovery.

## Evidence

- `pnpm check` passed architecture, artifact, document, Skill, strict TypeScript, Oxlint, Oxfmt,
  Knip, duplication, 130 unit/integration scenarios across 33 files, coverage, and production
  build.
- Coverage passed at 88.82% lines, 86.11% statements, 90.94% functions, and 75.13% branches.
- `pnpm test:e2e` passed all 18 Chromium scenarios. `pnpm test:simulation` and
  `pnpm simulation:check` passed the three-fixture, fourteen-variant corpus.
- Integration coverage verified same-connection continuation, recovery of only a disconnected
  player, failed-resume pause, interrupted-bootstrap continuation, server-restart resume, durable
  accepted actions, one foundation per player, stable Session IDs, and unchanged logical Session
  generation.
- Real Trae CLI 0.201.5 and Codex ACP 1.6.2 smokes each created one Session, closed the first ACP
  process, resumed the exact same ID in a second process, and submitted another accepted vote.
  Claude Agent ACP 0.70.0 advertised `session.resume` during initialization.
- The local SQLite database migrated to schema seven and exposed the player Session binding table.
  No running or paused user Match was present during migration.
