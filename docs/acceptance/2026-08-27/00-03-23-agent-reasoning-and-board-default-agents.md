# Agent reasoning and board default Agents acceptance

Evidence time: 2026-08-27 00:03:23 +08:00

## Scope

Verify model-specific ACP reasoning discovery and Profile persistence, durable Session application,
paired per-seat Agent Profile and Character board defaults, Match inheritance and overrides,
reference-safe deletion, compatibility, and rendered web behavior.

## Evidence

- `pnpm check` passed architecture, artifacts, docs, Skills, strict TypeScript, lint, formatting,
  hygiene, duplication, 172 covered tests across 44 files, and the production build. Coverage was
  87.97% lines, 84.80% statements, 88.68% functions, and 72.31% branches.
- `pnpm test:e2e` passed all 22 Chromium scenarios. The Agent scenario selected and persisted
  `mock-model` with `low`, proved one discovery request for that tool/model, reloaded the value, and
  retained ordering behavior. Board coverage saved paired Agent/Character defaults, inherited them
  into Match setup, allowed overrides, and surfaced Profile reference protection.
- `pnpm test:simulation` passed the approved corpus test, and `pnpm simulation:check` validated all
  three fixtures. Canonical simulation boards clear board-default Profile IDs.
- Real no-Prompt ACP Sessions selected `high` and returned model-specific `thought_level` choices
  from Trae CLI 0.201.6, Codex ACP 1.6.2, and Claude Agent ACP 0.70.0. Trae and Codex then completed
  real isolated structured wolf-vote actions with `high` applied.
- Claude configuration discovery and explicit `high` selection succeeded. Its subsequent model
  request was rejected by the external account with `400 This organization has been disabled`, so
  no Claude inference result is claimed.
- In-app browser acceptance verified the persisted `mock-model`/`high` Profile, six paired Agent and
  Character selectors on the six-seat board, zero native selects, no console warnings or errors,
  and no horizontal overflow at a 390-by-844 viewport.
