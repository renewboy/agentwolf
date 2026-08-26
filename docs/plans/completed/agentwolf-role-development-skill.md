# AgentWolf role development Skill

## Goal

Create a project coding-agent Skill that guides implementation of one new AgentWolf Role through
the current plugin, Prompt, presentation, board, strategy, versioning, and verification contracts.

## Completed work

- Traced passive, night-action, plugin-state, death-trigger, and public-interrupt Roles through the
  engine registries, classic ruleset composition, server Ruleset Catalog, Prompt bundle registry,
  visibility-safe projection, role effects, boards, player strategy sources, and test gates.
- Added `.agents/skills/agentwolf-role-development` with a concise entry point, UI metadata, and
  focused references for engine integration, presentation integration, and verification.
- Documented rule-contract clarification, capability-based extension, event-sourced Role state,
  plugin-owned Prompts, ruleset snapshot compatibility, visibility, effects, strategy coverage,
  simulations, browser acceptance, and plan/acceptance lifecycle.
- Updated the Skill gate so project coding-agent Skills are allowed under `.agents/skills`, the two
  player-only Skills remain prohibited there, and the new Role development Skill is validated by
  the repository.

## Completion evidence

- Skill Creator `quick_validate.py` reported `Skill is valid!`.
- Skill-local Markdown link checks and current source-path checks passed. A forward scenario with a
  private durable mark, Role-owned night phase, public death reaction, and installed-board surface
  routed to plugin state, Phase registration, visibility, Prompt, strategy, effect, ruleset
  versioning, restore, projection, simulation, and browser checks.
- `pnpm check` passed architecture, artifact, documentation, Skill, strict TypeScript, lint,
  formatting, dependency hygiene, duplication, 40 test files with 150 tests, coverage, and the
  complete workspace production build.
- Coverage reached 89.61% lines, 86.57% statements, 90.71% functions, and 74.09% branches.
- `git diff --check` passed. No game runtime, Prompt runtime, simulation fixture, or browser behavior
  changed in this request.
