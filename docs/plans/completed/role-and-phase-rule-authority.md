# Role and phase rule authority

## Goal

Make registered role abilities the authoritative source for Werewolf attack and self-destruct
effects, and make every actionable phase declare its accepted action semantics without deriving
them from phase ID text.

## Completed work

- The regular Werewolf ballot validates its optional target through the registered kill ability.
  The selected attack target is converted into that ability's action and its damage effect enters
  the shared resolution agenda.
- Werewolf self-destruct obtains its death cause from the registered ability and settles the effect
  through the resolution agenda before the engine appends the public result.
- Every interactive phase declares a discriminated action contract containing its kind, ability or
  Sheriff-action allowlist, visibility, and permitted interrupt context. Engine turn descriptors
  carry the same interrupt IDs to server orchestration.
- Sheriff transfer and death-trigger phases expose no self-destruct interrupt. Sheriff-election and
  daytime speech or vote phases declare the interrupt explicitly.
- Unit tests prove production ability dispatch, phase-ID-independent action kinds, and interrupt
  boundaries. Architecture gates keep Werewolf damage effects in the role class and phase literals
  out of the action validator.
- Architecture, testing, and acceptance documents describe the current ownership and verified
  behavior.

## Completion evidence

- `pnpm check` passed architecture, artifact, documentation, Skill, typecheck, lint, format,
  hygiene, duplication, 125-test coverage, and production-build gates.
- Coverage reached 89.44% lines, 86.75% statements, 91.37% functions, and 75.63% branches.
  `werewolf.ts` has complete line and function coverage; `action-validator.ts` branch coverage is
  86.48%.
- The approved simulation corpus retained identical event counts, event types, checkpoints, and
  semantic digests across every engine and orchestration variant.
- `pnpm test:e2e` passed all 18 Chromium scenarios.
