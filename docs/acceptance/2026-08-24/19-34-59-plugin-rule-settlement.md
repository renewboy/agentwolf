# Plugin rule settlement acceptance

Evidence time: 2026-08-24 19:34:59 +08:00

## Scope

Versioned plugin rule composition, capability-based ability authorization, registered settlement,
phase/event/query/trigger/interrupt/victory extension points, classic-rule migration, Magic Mirror
Girl, White Wolf King, ruleset-locked Match snapshots, presentation, replay, and browser flows.

## Evidence

- `pnpm check`: all deterministic gates passed; 37 test files and 141 tests passed. Coverage was
  89.39% lines, 86.49% statements, 90.04% functions, and 74.94% branches. Duplication reported zero
  clones and the production build completed.
- `pnpm test:simulation`: the approved simulation corpus passed.
- `pnpm simulation:check`: all 3 approved fixtures passed schema, invariant, engine,
  orchestration, restart, recovery, Prompt reconstruction, and determinism checks.
- `pnpm test:e2e`: all 18 Chromium scenarios passed. The board workflow displayed nine distinct
  role colors and verified one Magic Mirror Girl in the Magic Mirror board and one White Wolf King
  in the White Wolf King board.
- `packages/game-engine/tests/plugin-runtime.test.ts` proved that a synthetic plugin can add a Role,
  capability, action phase, custom effect, event state, query modifier, interactive trigger, and
  victory evaluator without changing kernel code.
- `packages/game-engine/tests/plugin-roles.test.ts` proved private exact-role inspection and restore,
  duplicate-target rejection, shared wolf ballot participation, targeted two-player detonation,
  public elimination state, and pre-victory Hunter reaction.
- `apps/server/tests/plugin-projection.test.ts` proved private plugin-event narration and effect cues
  remain absent from closed-eye projection and visible to the owning player and god view.
- A schema-two Match snapshot stored `ruleset-classic-v2`, every plugin lock and configuration hash,
  the canonical fingerprint, and resolved policies; a modified fingerprint was rejected.
