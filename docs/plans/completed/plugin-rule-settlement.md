# Plugin rule settlement

## Goal

Deliver a deterministic, versioned plugin ruleset runtime whose kernel contains no concrete Role
or Ability IDs, migrate the classic game to registered plugins, and add Magic Mirror Girl and White
Wolf King through the same extension contracts.

## Completed work

- Added versioned Ruleset and plugin manifests with dependency validation, configuration schemas,
  plugin locks, configuration hashes, canonical fingerprints, and schema-two board snapshots.
- Added capability authorization, plugin-contributed phase composition, schema-validated named-lane
  effect settlement, plugin event state, identity query modifiers, interactive trigger selection,
  generic interrupt handlers, and registered victory evaluation.
- Split classic flow into phase, night, wolf-team, Sheriff, day, death, terminal, compatibility,
  presentation, and role plugins. Removed `classic-rules.ts`, concrete role ownership from the
  kernel, and the engine's dedicated self-destruct path.
- Centralized server Ruleset resolution for board management, Match creation and restore, runtime
  Prompts, trajectory reconstruction, and both simulation runners.
- Added Magic Mirror Girl with a private exact-role query, non-repeat target history, plugin event
  reconstruction, narration, effect cue, role presentation, and built-in board.
- Added White Wolf King with shared wolf council and attack capabilities, a dedicated targeted
  detonation interrupt, common multi-death settlement, Hunter reaction, public elimination facts,
  narration, effect cue, role presentation, and built-in board.
- Added synthetic plugin acceptance coverage and architecture checks which reject concrete Role or
  Ability IDs in kernel code and reject a restored ruleset fingerprint mismatch.
- Updated product, architecture, information synchronization, testing, frontend, and repository
  ownership documents to describe the implemented current state.

## Completion evidence

- `pnpm check` passed architecture, artifact, documentation, Skill, typecheck, lint, format,
  hygiene, zero-duplication, 141-test coverage, and production-build gates. Coverage reached 89.39%
  lines, 86.49% statements, 90.04% functions, and 74.94% branches.
- `pnpm test:simulation` passed and `pnpm simulation:check` reported all 3 approved fixtures valid,
  preserving reviewed `classic-v1` event digests and checkpoints.
- `pnpm test:e2e` passed all 18 Chromium scenarios. Board acceptance verified the nine-role palette
  and both new built-in compositions.
- Focused plugin tests verified exact-role privacy and restore, repeated-target rejection, shared
  wolf attack authorization, White Wolf King targeted detonation, public elimination projection,
  Hunter reaction ordering, plugin event narration, and effect-cue visibility.
