# Deterministic simulation testing

## Goal

Provide offline, deterministic simulation testing that turns ended or paused Matches into reviewed
fixtures and re-executes current game and orchestration code without live model calls.

## Completed work

- Added versioned capture, approved-fixture, control, variant, checkpoint, and run-report contracts.
- Added sanitized Match capture, developer download and candidate APIs, atomic local candidate
  storage, secret scanning, canonical event normalization, and CLI review and approval.
- Added a fresh-engine runner and a production Match-runtime runner with deterministic Sessions,
  completion-order variants, fault injection, playback controls, Prompt reconstruction, barrier
  checks, independent event invariants, and stable seeds.
- Added an approved complete twelve-player fixture and a repeated uncertain-delivery pause fixture,
  plus a required non-empty simulation corpus gate.
- Added Match-scoped developer controls for package download and candidate creation with inline
  feedback, normal-mode gating, browser coverage, and current-state product, architecture,
  frontend, testing, repository, and acceptance documentation.

## Completion evidence

- `pnpm test:simulation` passed two fixtures and nine variants, each repeated through both runners.
- `pnpm check` passed 78 tests across 26 files, coverage thresholds, strict TypeScript, lint,
  formatting, hygiene, zero-clone duplication, architecture, artifact, documentation, Skill, and
  production build gates.
- Coverage reached 87.35% lines, 84.16% statements, 88.55% functions, and 72.90% branches.
- `pnpm test:e2e` passed all eleven Chromium scenarios; the developer trajectory scenario
  downloaded a simulation package, added a candidate, displayed its path, and removed it during
  teardown.
