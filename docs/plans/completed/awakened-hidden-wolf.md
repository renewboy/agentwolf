# Awakened Hidden Wolf

## Goal

Add Awakened Hidden Wolf as a complete versioned Role plugin and define the 10-player Mirror
Hidden preset with four Villagers, Magic Mirror Girl, Witch, Guard, two pack Werewolves, and one
Awakened Hidden Wolf.

## Completed work

- Added `classic-v3` as the current Ruleset and retained exact `classic-v1` and `classic-v2`
  plugin manifests for immutable snapshot restore.
- Separated faction affiliation, pack knowledge, private pack communication, and attack
  authorization. Pack rosters and wolf-phase events exclude Awakened Hidden Wolf, while ordinary
  Werewolves can attack it.
- Added one-time delayed learning with private true-Role disclosure and same-night Magic Mirror
  masking.
- Added copied Magic Mirror inspection, one-use poison and protection, copied Hunter behavior,
  awakened nightly attack, and one-use double attack.
- Added `board-mirror-hidden-10`, the localized multi-line rule description, Role badge color,
  semantic effect cues, private event narration, and complete player Prompt contracts.
- Kept `robotwolf.md` and `psychic.md` at their source paths. Their first skill-description
  sentences identify “机械狼，也叫觉醒隐狼” and “通灵师，也叫魔镜少女”; product Prompt
  content uses only the product Role names.
- Updated product, architecture, information synchronization, research, testing, frontend, and
  repository guidance to describe the implemented current state.
- Added engine, visibility, projection, Prompt, API, singleton-board, role-effect, and real-browser
  coverage.

## Completion evidence

- `pnpm check` passed all architecture, artifact, documentation, Skill, typecheck, lint, format,
  hygiene, duplication, 156-test coverage, and production-build gates.
- Coverage completed at 87.96% lines, 85.17% statements, 87.78% functions, and 73.44% branches.
- `pnpm test:simulation` passed.
- `pnpm simulation:check` reported all 3 fixtures valid.
- `pnpm test:e2e` passed all 19 Chromium scenarios.
- Browser acceptance verified the 10-player composition and complete board rules at desktop and
  mobile widths without clipping or horizontal overflow.
- Acceptance record:
  `docs/acceptance/2026-08-26/01-26-58-awakened-hidden-wolf.md`.
