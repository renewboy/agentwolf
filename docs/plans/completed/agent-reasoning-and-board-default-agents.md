# Agent reasoning and board default Agents

## Goal

Let each Agent Profile optionally select a model-specific reasoning effort advertised through ACP,
and let each custom-board seat save one optional default Agent Profile together with its optional
Character. New Matches resolve explicit seat choices first, then board defaults, then the first
persisted Agent Profile.

## Completed work

- Added optional Profile reasoning effort, model-specific `thought_level` discovery, page-lifetime
  request deduplication, Profile configuration for new and resumed Sessions, and Provider-default
  behavior when no effort is selected.
- Added nullable per-seat Agent Profile defaults to custom boards and immutable board snapshots,
  with validation, reference-safe Profile deletion, simulation sanitization, and compatibility for
  persisted Profiles and boards without the new fields.
- Added server-owned Match Profile resolution in explicit, board-default, then catalog-order
  precedence, while preserving per-seat Agent and Character overrides.
- Added Agent reasoning controls, visible model/reasoning metadata, paired board-seat selectors,
  inherited new-Match assignments, localized copy, responsive styles, and current-state
  documentation.
- Extended deterministic ACP fixtures, repository/API/migration coverage, browser coverage, live
  smoke commands, and request-owned acceptance evidence.

## Completion evidence

- `pnpm check` passed 173 covered tests, every static gate, and the production build with 87.92%
  line coverage.
- `pnpm test:e2e` passed all 22 Chromium scenarios, including discovery deduplication, reasoning
  persistence, paired board defaults, Match inheritance and overrides, and deletion protection.
- `pnpm test:simulation` and `pnpm simulation:check` passed the three-fixture corpus.
- Real Trae, Codex, and Claude ACP Sessions advertised and accepted an explicit `high` configuration
  without a Prompt. Trae and Codex completed real structured actions; Claude inference remained
  unavailable because its external organization is disabled.
- Desktop and 390-by-844 in-app browser inspection showed the expected controls, no horizontal
  overflow, and no console warnings or errors.
