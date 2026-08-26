# Awakened Hidden Wolf corrections

Evidence time: 2026-08-26 12:54:33 +08:00

## Scope

- Preserved the 10-player Mirror Hidden board and `classic-v3` Ruleset identity.
- Reused ordinary Hunter semantics for copied Hunter, masked private Role phases from unauthorized
  projections, and moved mechanical-shield configuration out of shared classic settlement.
- Removed Role-specific strategy-source rewriting and allowed wolf self or teammate attacks in the
  engine and Prompt contract.
- Removed low-level implementation details from current-state documentation.

## Evidence

- Focused verification passed 10 files and 52 tests.
- `pnpm check` passed 42 test files and 161 tests plus all repository and production-build gates.
- `pnpm test:simulation` passed; `pnpm simulation:check` reported 3 valid fixtures.
- `pnpm test:e2e` passed 20 Chromium scenarios on ports 14311 and 15174.
- Projection coverage proves copied Hunter emits the ordinary `hunter.shot` presentation and
  unauthorized viewers receive `phase-night-hidden` / `夜间行动`.
- Ruleset Catalog coverage proves a `classic-v2` snapshot resolves without the Awakened Hidden Wolf
  Role while new Matches continue to use `classic-v3`.
- `git diff --check` passed.
