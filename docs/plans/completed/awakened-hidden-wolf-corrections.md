# Awakened Hidden Wolf corrections

## Goal

Keep the 10-player Mirror Hidden board and `classic-v3`, while correcting Awakened Hidden Wolf
semantic ownership, hidden-state projection, copied Hunter presentation, source-matched strategy
content, and wolf self-attack guidance.

## Completed work

- Kept `classic-v3` as the current Ruleset because the installed Role plugin and pack-scoped wolf
  communication remain part of its ordered plugin lock and fingerprint.
- Reused the existing Hunter capability, trigger, public event, Prompt action contract, and effect
  for copied Hunter behavior.
- Added generic phase-presentation visibility so god and the acting player receive the exact
  private phase while every unauthorized view receives one generic night-action presentation.
- Changed protection settlement to an open protection ID plus blocked-damage contract. Mechanical
  shield declares its behavior in the Role, and shared classic settlement contains no Role-specific
  protection branch.
- Declared the Role plugin's Ruleset dependencies and added exact `classic-v2` snapshot resolution
  coverage.
- Removed Role-ID rewriting from strategy validation and made the mapped strategy introductions
  match their Prompt Role text verbatim.
- Allowed pack Werewolves to target themselves or teammates through both validation and the
  rendered wolf-vote Prompt.
- Removed low-level Role implementation details from current-state documentation and aligned the
  browser test with the intentionally concise 10-player board presentation.

## Completion evidence

- Focused engine, Prompt, projection, effect, compatibility, and asset coverage passed: 10 files,
  52 tests.
- `pnpm check` passed 42 test files and 161 tests, coverage, typecheck, lint, formatting, hygiene,
  duplication, documentation, architecture, assets, Skills, and production build.
- `pnpm test:simulation` passed and `pnpm simulation:check` reported all 3 fixtures valid.
- `pnpm test:e2e` passed all 20 Chromium scenarios on isolated ports, including the concise Mirror
  Hidden board and generic private-night projection.
- `git diff --check` passed.
- Acceptance record:
  `docs/acceptance/2026-08-26/12-54-33-awakened-hidden-wolf-corrections.md`.
