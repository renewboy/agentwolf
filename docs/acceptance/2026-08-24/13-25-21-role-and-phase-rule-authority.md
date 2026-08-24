# Role and phase rule authority acceptance

Evidence time: 2026-08-24 13:25:21 +08:00

## Scope

Verified registered Werewolf ability-effect dispatch, phase-owned action contracts, and the
Sheriff/daytime self-destruct interrupt boundaries delivered by the role and phase authority
change.

## Evidence

- `pnpm check` passed architecture, artifact, documentation, Skill, typecheck, lint, format,
  hygiene, duplication, 125-test coverage, and production build.
- Coverage reached 89.44% lines, 86.75% statements, 91.37% functions, and 75.63% branches.
  `werewolf.ts` had complete line and function coverage; `action-validator.ts` branch coverage was
  86.48%.
- Production ability dispatch and phase-ID-independent action kinds passed unit coverage. Sheriff
  transfer and death-trigger phases exposed no self-destruct interrupt, while declared Sheriff and
  daytime contexts retained it.
- The approved simulation corpus retained identical event counts, event types, checkpoints, and
  semantic digests across every engine and orchestration variant.
- `pnpm test:e2e` passed all 18 Chromium scenarios.
