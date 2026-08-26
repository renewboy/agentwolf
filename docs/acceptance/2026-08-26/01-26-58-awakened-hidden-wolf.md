# Awakened Hidden Wolf

Evidence time: 2026-08-26 01:26:58 +08:00

## Scope

- Added the `role-awakened-hidden-wolf` plugin to `classic-v3` while preserving the installed
  `classic-v1` and `classic-v2` manifests for existing snapshots.
- Added isolated Werewolf team knowledge, one-time learning, same-night exact-role masking,
  copied Magic Mirror inspection, poison, mechanical shield, Hunter shot, awakened attack, and
  one-use double attack.
- Added the 10-player `board-mirror-hidden-10` preset with four Villagers, Magic Mirror Girl,
  Witch, Guard, two pack Werewolves, and one Awakened Hidden Wolf.
- Added Prompt, strategy alias, narration, role-effect, role-color, board-description, current-state
  documentation, unit, integration, projection, and browser coverage.

## Evidence

- `pnpm check` passed all architecture, artifact, documentation, Skill, typecheck, lint, format,
  hygiene, duplication, 156-test coverage, and production-build gates.
- Coverage completed at 87.96% lines, 85.17% statements, 87.78% functions, and 73.44% branches.
- `pnpm test:simulation` passed the approved simulation corpus.
- `pnpm simulation:check` reported all 3 fixtures valid.
- `pnpm test:e2e` passed all 19 Chromium scenarios.
- Focused Awakened Hidden Wolf tests passed same-night learning and masking, pack isolation and
  friendly fire, copied Hunter activation, attack awakening, same-target protection bypass, and
  mechanical-shield precedence.
- Browser acceptance verified the complete 10-player composition and multi-line board rules at
  desktop and mobile viewport widths without clipping or horizontal overflow.
